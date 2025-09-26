import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { AgentConfig, AgentConfigSchema } from './types.js';
import { z } from 'zod';

/**
 * Load and validate agent configuration from the specified agent path
 * @param agentPath - Absolute path to the agent directory
 * @returns Validated agent configuration and system prompt
 * @throws Error if files don't exist or validation fails
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
    throw new Error(`config.yaml not found or not readable at: ${configPath}`);
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