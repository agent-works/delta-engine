/**
 * v1.7 Tool Expander Module
 *
 * Converts simplified syntax (exec:, shell:) to internal ToolDefinition format.
 * This module implements the core expansion logic for Delta Engine v1.7's
 * tool configuration simplification feature.
 *
 * Security: This module is security-critical. All expansions must preserve
 * the safety guarantees of the underlying execution model.
 *
 * @see docs/architecture/v1.7-tool-simplification.md
 * @see docs/architecture/v1.7-implementation-plan.md
 */

import { parse as shellParse } from 'shell-quote';
import {
  ExecToolConfig,
  ShellToolConfig,
  ToolDefinition,
  ToolParameter,
  InjectionType,
} from './types.js';

// ============================================
// Core Types
// ============================================

/**
 * Represents a placeholder extracted from a template string
 * Example: ${param:raw} → { name: 'param', position: 0, isRaw: true, fullMatch: '${param:raw}' }
 */
export interface Placeholder {
  name: string;        // Parameter name (e.g., "param")
  position: number;    // 0-indexed position in template
  isRaw: boolean;      // true if ${param:raw}, false if ${param}
  fullMatch: string;   // Full matched string for replacement
}

/**
 * Inferred parameter from template (before merging with explicit params)
 */
interface InferredParameter {
  name: string;
  type: 'string';
  inject_as: InjectionType;
  position?: number;
  description?: string;
}

/**
 * Custom error type for tool expansion failures
 */
export class ToolExpansionError extends Error {
  constructor(
    message: string,
    public hint?: string,
    public toolName?: string
  ) {
    super(message);
    this.name = 'ToolExpansionError';
  }
}

// ============================================
// Phase 2.1: Placeholder Parser
// ============================================

/**
 * Extract all ${param} and ${param:raw} placeholders from a template string
 *
 * @param template - Template string (e.g., "grep ${pattern} ${file}")
 * @returns Array of Placeholder objects in order of appearance
 *
 * @example
 * extractPlaceholders('docker run ${flags:raw} ${image}')
 * // Returns: [
 * //   { name: 'flags', position: 0, isRaw: true, fullMatch: '${flags:raw}' },
 * //   { name: 'image', position: 1, isRaw: false, fullMatch: '${image}' }
 * // ]
 */
export function extractPlaceholders(template: string): Placeholder[] {
  const regex = /\$\{(\w+)(:raw)?\}/g;
  const placeholders: Placeholder[] = [];
  let match;
  let position = 0;

  while ((match = regex.exec(template)) !== null) {
    if (!match[1]) {
      throw new ToolExpansionError(
        `Invalid placeholder syntax in template: ${match[0]}`,
        'Placeholders must be in format ${param} or ${param:raw}'
      );
    }

    placeholders.push({
      name: match[1],              // Capture group 1: parameter name
      position: position++,
      isRaw: match[2] === ':raw',  // Capture group 2: :raw modifier
      fullMatch: match[0],         // Full matched string
    });
  }

  return placeholders;
}

// ============================================
// Phase 2.2: Exec Mode Expander
// ============================================

/**
 * Validate that exec: template doesn't contain shell metacharacters
 *
 * exec: mode is designed for direct execution (execvp), not shell interpretation.
 * Any shell metacharacters indicate a configuration error or security risk.
 *
 * @throws ToolExpansionError if dangerous characters found
 */
function validateExecSafety(template: string): void {
  const dangerousPatterns = [
    { pattern: '|', name: 'pipe' },
    { pattern: '>', name: 'output redirection' },
    { pattern: '<', name: 'input redirection' },
    { pattern: '&', name: 'background execution' },
    { pattern: ';', name: 'command separator' },
    { pattern: '&&', name: 'logical AND' },
    { pattern: '||', name: 'logical OR' },
    { pattern: '`', name: 'command substitution' },
    { pattern: '$(', name: 'command substitution' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (template.includes(pattern)) {
      throw new ToolExpansionError(
        `Shell metacharacter '${pattern}' (${name}) not allowed in exec: mode`,
        `Use shell: mode if you need ${name}, or remove '${pattern}' for safe direct execution`
      );
    }
  }

  // Check for :raw modifier (only allowed in shell: mode)
  if (template.includes(':raw')) {
    throw new ToolExpansionError(
      ':raw modifier not allowed in exec: mode',
      'The :raw modifier is only supported in shell: mode for expert use'
    );
  }
}

/**
 * Tokenize exec: template using shell-like lexical parsing
 *
 * This properly handles quoted strings, escapes, and whitespace.
 * Uses shell-quote library for correctness.
 *
 * IMPORTANT: We must protect ${...} placeholders from shell-quote's variable expansion
 * by temporarily replacing them with markers, then restoring after tokenization.
 *
 * @example
 * tokenizeExecTemplate('ls -F ${dir}')
 * // Returns: ['ls', '-F', '${dir}']
 *
 * tokenizeExecTemplate('grep "hello world" ${file}')
 * // Returns: ['grep', 'hello world', '${file}']
 */
function tokenizeExecTemplate(template: string): string[] {
  // Step 1: Temporarily replace ${...} placeholders with unique markers
  // This prevents shell-quote from interpreting them as shell variables
  const placeholderMap = new Map<string, string>();
  let markerIndex = 0;

  const templateWithMarkers = template.replace(/\$\{(\w+)(:raw)?\}/g, (match) => {
    const marker = `__PLACEHOLDER_${markerIndex}__`;
    placeholderMap.set(marker, match);
    markerIndex++;
    return marker;
  });

  // Step 2: Tokenize using shell-quote
  const parsed = shellParse(templateWithMarkers);

  // Step 3: Convert tokens and restore placeholders
  return parsed.map(token => {
    if (typeof token === 'string') {
      // Restore any placeholders in this token
      return token.replace(/__PLACEHOLDER_\d+__/g, (marker) => {
        return placeholderMap.get(marker) || marker;
      });
    } else if (typeof token === 'object' && 'pattern' in token) {
      // Handle glob patterns (keep as-is)
      const pattern = token.pattern as string;
      // Restore placeholders in glob patterns too
      return pattern.replace(/__PLACEHOLDER_\d+__/g, (marker) => {
        return placeholderMap.get(marker) || marker;
      });
    } else {
      // Unexpected token type
      throw new ToolExpansionError(
        `Unexpected token type in template: ${JSON.stringify(token)}`,
        'Template may contain unsupported shell syntax'
      );
    }
  }).filter(token => token !== ''); // Remove empty strings
}

/**
 * Separate static command parts from dynamic placeholders
 *
 * @param tokens - Tokenized template
 * @returns Object with commandTokens (static parts) and placeholders
 */
function separateStaticAndDynamic(tokens: string[]): {
  commandTokens: string[];
  placeholders: Placeholder[];
} {
  const commandTokens: string[] = [];
  const allPlaceholders: Placeholder[] = [];
  let globalPosition = 0; // Track position across all tokens

  tokens.forEach((token) => {
    const placeholders = extractPlaceholders(token);

    if (placeholders.length === 0) {
      // Static token (no placeholders)
      commandTokens.push(token);
    } else if (placeholders.length === 1 && placeholders[0]?.fullMatch === token) {
      // Entire token is a placeholder - will be replaced with parameter
      commandTokens.push(token); // Keep placeholder in command for now
      // Override position with global position counter
      placeholders[0].position = globalPosition++;
      allPlaceholders.push(...placeholders);
    } else {
      // Token contains mixed static and dynamic parts
      throw new ToolExpansionError(
        `Mixed static/dynamic token not supported: "${token}"`,
        'Each token should be either fully static or a single placeholder'
      );
    }
  });

  return { commandTokens, placeholders: allPlaceholders };
}

/**
 * Expand exec: mode configuration to internal ToolDefinition
 *
 * exec: mode uses direct execution (execvp) for maximum safety.
 * No shell involvement means no shell injection vulnerabilities.
 *
 * @param config - Exec mode configuration
 * @returns Expanded ToolDefinition
 *
 * @example
 * expandExecMode({ name: 'list', exec: 'ls -F ${directory}' })
 * // Returns: {
 * //   name: 'list',
 * //   command: ['ls', '-F'],  // Static parts
 * //   parameters: [{ name: 'directory', inject_as: 'argument', position: 0 }],
 * //   __meta: { syntax: 'exec', original_template: 'ls -F ${directory}' }
 * // }
 */
export function expandExecMode(config: ExecToolConfig): ToolDefinition {
  // Step 1: Validate no shell metacharacters
  validateExecSafety(config.exec);

  // Step 2: Tokenize template
  const tokens = tokenizeExecTemplate(config.exec);

  // Step 3: Separate static and dynamic parts
  const { commandTokens, placeholders } = separateStaticAndDynamic(tokens);

  // Step 4: Infer parameters from placeholders
  const inferredParams: InferredParameter[] = placeholders.map((ph) => ({
    name: ph.name,
    type: 'string' as const,
    inject_as: InjectionType.Argument,
    position: ph.position, // Use position from placeholder (set in separateStaticAndDynamic)
  }));

  // Step 5: Handle stdin parameter
  if (config.stdin) {
    const stdinParamIdx = inferredParams.findIndex(p => p.name === config.stdin);

    if (stdinParamIdx >= 0) {
      // stdin parameter is in template - change its injection mode
      const stdinParam = inferredParams[stdinParamIdx];
      if (stdinParam) {
        stdinParam.inject_as = InjectionType.Stdin;
        delete stdinParam.position; // stdin has no position
      }
    } else {
      // stdin parameter not in template - add it
      inferredParams.push({
        name: config.stdin,
        type: 'string',
        inject_as: InjectionType.Stdin,
      });
    }
  }

  // Step 6: Merge with explicit parameters
  const finalParams = mergeParameters(inferredParams, config.parameters);

  // Step 7: Build final command array (remove placeholders and empty strings)
  const finalCommand = commandTokens.filter(token => token !== '' && !token.startsWith('${'));

  return {
    name: config.name,
    command: finalCommand,
    parameters: finalParams,
    __meta: {
      syntax: 'exec',
      original_template: config.exec,
    },
  };
}

// ============================================
// Phase 2.3: Shell Mode Expander
// ============================================

/**
 * Expand shell: mode configuration to internal ToolDefinition
 *
 * shell: mode uses `sh -c "script" -- arg1 arg2` pattern for safe parameterization.
 * Parameters are passed via argv array (NOT string interpolation), preventing injection.
 *
 * Security: See Section 4.2.1 of v1.7 spec for security proof.
 *
 * @param config - Shell mode configuration
 * @returns Expanded ToolDefinition
 *
 * @example
 * expandShellMode({ name: 'count', shell: 'cat ${file} | wc -l' })
 * // Returns: {
 * //   name: 'count',
 * //   command: ['sh', '-c', 'cat "$1" | wc -l', '--'],
 * //   parameters: [{ name: 'file', inject_as: 'argument', position: 0 }],
 * //   __meta: { syntax: 'shell', original_template: 'cat ${file} | wc -l' }
 * // }
 *
 * expandShellMode({ name: 'docker', shell: 'docker run ${flags:raw} ${image}' })
 * // Returns: {
 * //   command: ['sh', '-c', 'docker run $1 "$2"', '--'],
 * //   parameters: [
 * //     { name: 'flags', inject_as: 'argument', position: 0 },  // :raw → unquoted
 * //     { name: 'image', inject_as: 'argument', position: 1 }   // normal → quoted
 * //   ]
 * // }
 */
export function expandShellMode(config: ShellToolConfig): ToolDefinition {
  // Step 1: Extract placeholders
  const placeholders = extractPlaceholders(config.shell);

  // Step 2: Replace placeholders with positional parameters
  let script = config.shell;

  placeholders.forEach((ph, idx) => {
    // Use positional parameter $1, $2, ...
    const positional = idx + 1;

    // Apply quoting unless :raw modifier is used
    const replacement = ph.isRaw ? `$${positional}` : `"$${positional}"`;

    // Replace first occurrence of this placeholder
    script = script.replace(ph.fullMatch, replacement);
  });

  // Step 3: Build command array with sh -c --
  const command = ['sh', '-c', script, '--'];

  // Step 4: Infer parameters
  const inferredParams: InferredParameter[] = placeholders.map((ph, idx) => ({
    name: ph.name,
    type: 'string' as const,
    inject_as: InjectionType.Argument,
    position: idx,
  }));

  // Step 5: Handle stdin (similar to exec mode)
  if (config.stdin) {
    const stdinParamIdx = inferredParams.findIndex(p => p.name === config.stdin);

    if (stdinParamIdx >= 0) {
      const stdinParam = inferredParams[stdinParamIdx];
      if (stdinParam) {
        stdinParam.inject_as = InjectionType.Stdin;
        delete stdinParam.position;
      }
    } else {
      inferredParams.push({
        name: config.stdin,
        type: 'string',
        inject_as: InjectionType.Stdin,
      });
    }
  }

  // Step 6: Merge with explicit parameters
  const finalParams = mergeParameters(inferredParams, config.parameters);

  return {
    name: config.name,
    command,
    parameters: finalParams,
    __meta: {
      syntax: 'shell',
      original_template: config.shell,
    },
  };
}

// ============================================
// Phase 2.4: Parameter Merging Logic
// ============================================

/**
 * Merge inferred parameters with explicit parameter declarations
 *
 * Implements 3-step algorithm from spec Section 3.7.1:
 * 1. Inference: Extract parameters from template
 * 2. Merge/Override: Apply explicit parameter metadata
 * 3. Consistency Validation: Ensure no conflicts
 *
 * @param inferred - Parameters inferred from template placeholders
 * @param explicit - Explicit parameter declarations from config (optional)
 * @returns Final merged parameters
 *
 * @throws ToolExpansionError if parameter not found or injection conflict
 */
function mergeParameters(
  inferred: InferredParameter[],
  explicit: ToolParameter[] | undefined
): ToolParameter[] {
  // If no explicit parameters, return inferred as-is
  if (!explicit || explicit.length === 0) {
    return inferred as ToolParameter[];
  }

  // Step 1: Create map of inferred parameters
  const merged = new Map<string, ToolParameter>();

  for (const param of inferred) {
    merged.set(param.name, param as ToolParameter);
  }

  // Step 2: Merge explicit parameters
  for (const explicitParam of explicit) {
    const inferredParam = merged.get(explicitParam.name);

    if (!inferredParam) {
      // Error: Parameter not found in template
      const availableParams = Array.from(merged.keys()).join(', ');
      throw new ToolExpansionError(
        `Parameter '${explicitParam.name}' declared but not found in template`,
        `Available parameters in template: ${availableParams || '(none)'}`
      );
    }

    // Step 3: Validate structural consistency (inject_as cannot be overridden)
    if (explicitParam.inject_as !== inferredParam.inject_as) {
      throw new ToolExpansionError(
        `Cannot override inject_as for parameter '${explicitParam.name}'`,
        `Template defines inject_as='${inferredParam.inject_as}', ` +
        `but explicit config specifies '${explicitParam.inject_as}'. ` +
        `Structural contract is determined by template syntax.`
      );
    }

    // Merge metadata fields (description, etc.)
    // Explicit declarations can ONLY add metadata, not change structure
    merged.set(explicitParam.name, {
      ...inferredParam,
      description: explicitParam.description || inferredParam.description,
      // Future: Add support for default values, validation rules, etc.
    });
  }

  // Return merged parameters
  return Array.from(merged.values());
}

// ============================================
// Main Expander Class
// ============================================

/**
 * Main ToolExpander orchestrates syntax expansion
 *
 * Used by config loader to convert v1.7 simplified syntax to internal format.
 */
export class ToolExpander {
  /**
   * Expand a tool configuration to internal ToolDefinition
   *
   * @param config - Raw tool configuration (exec, shell, or legacy)
   * @returns Expanded ToolDefinition
   */
  expand(config: ExecToolConfig | ShellToolConfig): ToolDefinition {
    if ('exec' in config) {
      return expandExecMode(config);
    } else if ('shell' in config) {
      return expandShellMode(config);
    } else {
      throw new ToolExpansionError(
        'Invalid tool configuration: must have exec: or shell: field',
        'Check config.yaml syntax'
      );
    }
  }
}
