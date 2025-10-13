import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import {
  AgentConfig,
  AgentConfigSchema,
  detectToolConfigMode,
  HooksConfigSchema,
  ToolDefinition,
  LifecycleHooks
} from './types.js';
import { z } from 'zod';
import { ToolExpander, ToolExpansionError } from './tool-expander.js';

// ============================================
// v1.9: Helper Interfaces
// ============================================

interface ImportContext {
  agentHome: string;
  visited: Set<string>;
}

interface FullConfig {
  config: AgentConfig;
  systemPrompt: string;
  hooks: LifecycleHooks | null;
}

// ============================================
// v1.9: File Utilities
// ============================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// v1.9: Configuration Loading Functions
// ============================================

/**
 * v1.9: Locate the main agent configuration file
 * Prioritizes agent.yaml over config.yaml for backward compatibility
 */
async function locateAgentConfig(agentHome: string): Promise<string> {
  const agentYaml = path.join(agentHome, 'agent.yaml');
  const configYaml = path.join(agentHome, 'config.yaml');

  const hasAgent = await fileExists(agentYaml);
  const hasConfig = await fileExists(configYaml);

  if (hasAgent && hasConfig) {
    console.warn('[WARNING] Both agent.yaml and config.yaml found. Using agent.yaml.');
    console.warn('[ACTION] Please remove config.yaml to avoid confusion.');
    return agentYaml;
  }

  if (hasAgent) {
    return agentYaml;
  }

  if (hasConfig) {
    console.warn('[DEPRECATION] config.yaml is deprecated. Please rename to agent.yaml.');
    console.warn('[MIGRATION] Run: mv config.yaml agent.yaml');
    return configYaml;
  }

  // v1.8.1: Provide helpful hint when using current directory as agent path
  if (agentHome === path.resolve('.') || agentHome === process.cwd()) {
    throw new Error(
      `No agent configuration found in current directory.\n` +
      `\n` +
      `Hint: Either:\n` +
      `  1. Run 'delta init' to create a new agent here, or\n` +
      `  2. Use --agent <path> to specify an existing agent directory`
    );
  }

  throw new Error(
    `No agent configuration found in ${agentHome}\n` +
    `Expected agent.yaml or config.yaml`
  );
}

/**
 * v1.9: Validate import path for security
 * Prevents path traversal and ensures path is within agent directory
 */
function validateImportPath(importPath: string, agentHome: string): string {
  // Prohibit path traversal and absolute paths
  if (importPath.includes('../') || importPath.startsWith('/')) {
    throw new Error(
      `Invalid import path: ${importPath}\n` +
      `Paths must be relative and cannot traverse parent directories.`
    );
  }

  // Resolve to absolute path
  const absPath = path.resolve(agentHome, importPath);

  // Must be within AGENT_HOME
  const normalizedAgentHome = path.normalize(agentHome);
  const normalizedAbsPath = path.normalize(absPath);

  if (!normalizedAbsPath.startsWith(normalizedAgentHome)) {
    throw new Error(
      `Import path outside agent directory:\n` +
      `  Import: ${importPath}\n` +
      `  Resolved to: ${absPath}\n` +
      `  Agent home: ${agentHome}`
    );
  }

  return absPath;
}

/**
 * v1.9: Merge tool definitions with Last Write Wins strategy
 * Later tools override earlier tools with the same name
 */
function mergeTools(tools: ToolDefinition[]): ToolDefinition[] {
  const toolMap = new Map<string, ToolDefinition>();

  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  return Array.from(toolMap.values());
}

/**
 * v1.9: Load configuration with imports (recursive)
 * Supports circular dependency detection
 */
async function loadWithImports(
  configPath: string,
  ctx: ImportContext
): Promise<{ config: AgentConfig; allTools: ToolDefinition[] }> {
  // Circular dependency detection
  const absPath = path.resolve(configPath);
  if (ctx.visited.has(absPath)) {
    throw new Error(`Circular import detected: ${configPath}`);
  }
  ctx.visited.add(absPath);

  // Load and parse YAML
  let rawConfig: unknown;
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    rawConfig = yaml.parse(configContent);
  } catch (error) {
    throw new Error(
      `Failed to parse ${path.basename(configPath)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Collect all tools (from imports + local)
  let allTools: ToolDefinition[] = [];

  // Process imports recursively
  if (typeof rawConfig === 'object' && rawConfig !== null && 'imports' in rawConfig) {
    const imports = (rawConfig as any).imports;
    if (Array.isArray(imports)) {
      for (const importPath of imports) {
        if (typeof importPath !== 'string') {
          throw new Error(`Invalid import path (must be string): ${JSON.stringify(importPath)}`);
        }

        const validatedPath = validateImportPath(importPath, ctx.agentHome);

        // Check if import file exists
        if (!(await fileExists(validatedPath))) {
          throw new Error(`Import file not found: ${importPath}\n  Resolved to: ${validatedPath}`);
        }

        // Recursive load
        const imported = await loadWithImports(validatedPath, ctx);
        allTools.push(...imported.allTools);
      }
    }
  }

  // Expand local tools (v1.7 syntax support)
  if (typeof rawConfig === 'object' && rawConfig !== null && 'tools' in rawConfig) {
    const config = rawConfig as { tools?: unknown[] };

    if (Array.isArray(config.tools)) {
      const expander = new ToolExpander();

      const expandedTools = config.tools.map((tool: unknown, idx: number): ToolDefinition => {
        const mode = detectToolConfigMode(tool);

        if (mode === 'invalid') {
          throw new Error(
            `Invalid tool configuration at index ${idx} in ${path.basename(configPath)}: ` +
            `must have exactly one of: exec:, shell:, or command: field`
          );
        }

        if (mode === 'exec' || mode === 'shell') {
          // Expand v1.7 simplified syntax
          try {
            return expander.expand(tool as any);
          } catch (error) {
            if (error instanceof ToolExpansionError) {
              const toolName = (tool as any)?.name || `tool at index ${idx}`;
              throw new Error(
                `Failed to expand tool '${toolName}' in ${path.basename(configPath)}:\n` +
                `  ${error.message}\n` +
                (error.hint ? `  Hint: ${error.hint}\n` : '')
              );
            }
            throw error;
          }
        }

        // mode === 'legacy': Return as ToolDefinition
        return tool as ToolDefinition;
      });

      allTools.push(...expandedTools);
    }
  }

  // Parse the full config (will be validated later)
  const configObject = rawConfig as any;

  return {
    config: configObject,
    allTools
  };
}

/**
 * v1.9: Load hooks from hooks.yaml (convention-based loading)
 */
async function loadHooks(agentHome: string): Promise<LifecycleHooks | null> {
  const hooksYaml = path.join(agentHome, 'hooks.yaml');

  if (!(await fileExists(hooksYaml))) {
    return null;
  }

  try {
    const content = await fs.readFile(hooksYaml, 'utf-8');
    const rawHooks = yaml.parse(content);
    return HooksConfigSchema.parse(rawHooks);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors
        .map(err => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new Error(`hooks.yaml validation failed:\n${formattedErrors}`);
    }
    throw new Error(
      `Failed to load hooks.yaml: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * v1.9: Load configuration with full v1.9 support
 * Handles imports, hooks.yaml, and backward compatibility
 */
async function loadConfigWithCompat(agentHome: string): Promise<FullConfig> {
  // 1. Locate main config file (agent.yaml or config.yaml)
  const mainConfigPath = await locateAgentConfig(agentHome);

  // 2. Load config with imports (recursive)
  const { config: rawConfig, allTools } = await loadWithImports(
    mainConfigPath,
    { agentHome, visited: new Set() }
  );

  // 3. Merge all tools (imports + local) with Last Write Wins
  const mergedTools = mergeTools(allTools);

  // 4. Construct final config object
  const finalConfigObject = {
    ...rawConfig,
    tools: mergedTools
  };

  // 5. Validate final configuration
  let validatedConfig: AgentConfig;
  try {
    validatedConfig = AgentConfigSchema.parse(finalConfigObject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors
        .map(err => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new Error(
        `Configuration validation failed:\n${formattedErrors}\n\n` +
        `Raw validation error: ${JSON.stringify(error.errors, null, 2)}`
      );
    }
    throw error;
  }

  // 6. Load hooks.yaml (priority 1)
  let hooks = await loadHooks(agentHome);

  // 7. Compatibility: Fall back to lifecycle_hooks in main config
  if (!hooks && validatedConfig.lifecycle_hooks) {
    console.warn(
      '[DEPRECATION] lifecycle_hooks in agent.yaml/config.yaml is deprecated.\n' +
      '[MIGRATION] Move hooks to hooks.yaml:\n' +
      '  1. Create hooks.yaml in agent directory\n' +
      '  2. Move lifecycle_hooks content to hooks.yaml\n' +
      '  3. Remove lifecycle_hooks from main config\n'
    );
    hooks = validatedConfig.lifecycle_hooks || null;
  }

  // 8. Load system prompt
  const systemPromptPathMd = path.join(agentHome, 'system_prompt.md');
  const systemPromptPathTxt = path.join(agentHome, 'system_prompt.txt');
  let systemPromptPath: string;

  if (await fileExists(systemPromptPathMd)) {
    systemPromptPath = systemPromptPathMd;
  } else if (await fileExists(systemPromptPathTxt)) {
    systemPromptPath = systemPromptPathTxt;
  } else {
    throw new Error(`system_prompt.md or system_prompt.txt not found in: ${agentHome}`);
  }

  let systemPrompt: string;
  try {
    systemPrompt = await fs.readFile(systemPromptPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read ${path.basename(systemPromptPath)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!systemPrompt || systemPrompt.trim().length === 0) {
    throw new Error(`${path.basename(systemPromptPath)} is empty`);
  }

  return {
    config: validatedConfig,
    systemPrompt: systemPrompt.trim(),
    hooks
  };
}

// ============================================
// v1.8 and Earlier: Legacy Function (Maintained for Compatibility)
// ============================================

/**
 * Load and validate agent configuration from the specified agent path
 * @param agentPath - Absolute path to the agent directory
 * @returns Validated agent configuration and system prompt
 * @throws Error if files don't exist or validation fails
 * @deprecated v1.9: Use loadConfigWithCompat() for full v1.9 support
 */
export async function loadAndValidateAgent(
  agentPath: string
): Promise<{ config: AgentConfig; systemPrompt: string }> {
  // Validate that agentPath is an absolute path
  if (!path.isAbsolute(agentPath)) {
    throw new Error(`Agent path must be absolute, got: ${agentPath}`);
  }

  // Define expected file paths
  const configPath = path.join(agentPath, 'config.yaml');

  // Support both .md and .txt extensions for system prompt (prefer .md)
  const systemPromptPathMd = path.join(agentPath, 'system_prompt.md');
  const systemPromptPathTxt = path.join(agentPath, 'system_prompt.txt');
  let systemPromptPath: string;

  // Check if required files exist
  try {
    await fs.access(configPath, fs.constants.R_OK);
  } catch (error) {
    // v1.8.1: Provide helpful hint when using current directory as agent path
    if (agentPath === path.resolve('.') || agentPath === process.cwd()) {
      throw new Error(
        `No config.yaml found in current directory.\n` +
        `\n` +
        `Hint: Either:\n` +
        `  1. Run 'delta init' to create a new agent here, or\n` +
        `  2. Use --agent <path> to specify an existing agent directory`
      );
    } else {
      throw new Error(`config.yaml not found or not readable at: ${configPath}`);
    }
  }

  // Check for system prompt file (prefer .md over .txt)
  try {
    await fs.access(systemPromptPathMd, fs.constants.R_OK);
    systemPromptPath = systemPromptPathMd;
  } catch {
    try {
      await fs.access(systemPromptPathTxt, fs.constants.R_OK);
      systemPromptPath = systemPromptPathTxt;
    } catch (error) {
      throw new Error(`system_prompt.md or system_prompt.txt not found or not readable at: ${agentPath}`);
    }
  }

  // Load and parse config.yaml
  let rawConfig: unknown;
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    rawConfig = yaml.parse(configContent);
  } catch (error) {
    throw new Error(
      `Failed to parse config.yaml: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // v1.7: Expand simplified tool syntax (exec:, shell:) before validation
  if (typeof rawConfig === 'object' && rawConfig !== null && 'tools' in rawConfig) {
    const config = rawConfig as { tools?: unknown[] };

    if (Array.isArray(config.tools)) {
      const expander = new ToolExpander();

      config.tools = config.tools.map((tool: unknown, idx: number) => {
        const mode = detectToolConfigMode(tool);

        if (mode === 'invalid') {
          throw new Error(
            `Invalid tool configuration at index ${idx}: ` +
            `must have exactly one of: exec:, shell:, or command: field`
          );
        }

        if (mode === 'exec' || mode === 'shell') {
          // Expand v1.7 simplified syntax to internal format
          try {
            return expander.expand(tool as any);
          } catch (error) {
            if (error instanceof ToolExpansionError) {
              const toolName = (tool as any)?.name || `tool at index ${idx}`;
              throw new Error(
                `Failed to expand tool '${toolName}':\n` +
                `  ${error.message}\n` +
                (error.hint ? `  Hint: ${error.hint}\n` : '')
              );
            }
            throw error;
          }
        }

        // mode === 'legacy': Keep as-is
        return tool;
      });
    }
  }

  // Validate configuration using Zod schema
  let config: AgentConfig;
  try {
    config = AgentConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format Zod errors for better readability
      const formattedErrors = error.errors
        .map(err => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new Error(
        `Configuration validation failed:\n${formattedErrors}\n\n` +
        `Raw validation error: ${JSON.stringify(error.errors, null, 2)}`
      );
    }
    throw error;
  }

  // Load system prompt
  let systemPrompt: string;
  const promptFileName = path.basename(systemPromptPath);
  try {
    systemPrompt = await fs.readFile(systemPromptPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read ${promptFileName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate system prompt is not empty
  if (!systemPrompt || systemPrompt.trim().length === 0) {
    throw new Error(`${promptFileName} is empty`);
  }

  return {
    config,
    systemPrompt: systemPrompt.trim(),
  };
}

/**
 * Validate a single tool definition for additional business rules
 * @param tool - Tool definition to validate
 * @throws Error if validation fails
 */
export function validateToolDefinition(tool: unknown): void {
  try {
    const parsed = AgentConfigSchema.shape.tools.element.parse(tool);

    // Additional validation: check for duplicate parameter names
    const paramNames = new Set<string>();
    for (const param of parsed.parameters) {
      if (paramNames.has(param.name)) {
        throw new Error(`Duplicate parameter name: ${param.name}`);
      }
      paramNames.add(param.name);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Tool validation failed: ${error.message}`);
    }
    throw error;
  }
}

// ============================================
// v1.9: Export New Functions and Types
// ============================================

/**
 * v1.9: Load configuration with full v1.9 support
 * This is the primary configuration loading function for v1.9+
 * @param agentHome - Absolute path to the agent directory
 * @returns Full configuration including config, system prompt, and hooks
 * @throws Error if files don't exist or validation fails
 */
export { loadConfigWithCompat };

/**
 * v1.9: Full configuration type including hooks
 */
export type { FullConfig };