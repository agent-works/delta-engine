/**
 * v1.7: delta tool expand command
 *
 * Expands simplified tool syntax (exec:, shell:) to full internal representation.
 * This provides transparency into how syntax sugar is transformed.
 *
 * Usage: delta tool expand <config-path>
 *
 * @see docs/architecture/v1.7-tool-simplification.md Section 6
 */

import { promises as fs } from 'node:fs';
import yaml from 'yaml';
import { ToolExpander, ToolExpansionError } from '../tool-expander.js';
import { detectToolConfigMode } from '../types.js';

/**
 * Handle the `delta tool expand` command
 *
 * Reads a config.yaml file and expands all v1.7 simplified syntax to full format.
 * Outputs expanded configuration to stdout in YAML format.
 *
 * @param configPath - Path to config.yaml file
 */
export async function handleToolExpandCommand(configPath: string): Promise<void> {
  try {
    // Read config file
    const configContent = await fs.readFile(configPath, 'utf-8');
    const rawConfig = yaml.parse(configContent);

    if (!rawConfig || typeof rawConfig !== 'object') {
      console.error('[ERROR] Invalid config.yaml: file is empty or not a valid YAML object');
      process.exit(1);
    }

    if (!('tools' in rawConfig) || !Array.isArray((rawConfig as any).tools)) {
      console.error('[ERROR] No tools array found in config.yaml');
      process.exit(1);
    }

    const config = rawConfig as { tools: unknown[] };
    const expander = new ToolExpander();

    let expansionCount = 0;
    let legacyCount = 0;
    const errors: string[] = [];

    // Expand all tools
    const expandedTools = config.tools.map((tool: unknown, idx: number) => {
      const mode = detectToolConfigMode(tool);

      if (mode === 'invalid') {
        errors.push(
          `Tool at index ${idx}: Invalid configuration - must have exec:, shell:, or command: field`
        );
        return tool; // Keep as-is for error reporting
      }

      if (mode === 'exec' || mode === 'shell') {
        try {
          const expanded = expander.expand(tool as any);
          expansionCount++;

          // Add comment about original syntax
          return {
            ...expanded,
            '# v1.7 expanded from': mode === 'exec'
              ? `exec: "${(tool as any).exec}"`
              : `shell: "${(tool as any).shell}"`,
          };
        } catch (error) {
          if (error instanceof ToolExpansionError) {
            const toolName = (tool as any)?.name || `tool at index ${idx}`;
            errors.push(
              `Tool '${toolName}': ${error.message}` +
              (error.hint ? `\n  Hint: ${error.hint}` : '')
            );
          } else {
            errors.push(`Tool at index ${idx}: ${error instanceof Error ? error.message : String(error)}`);
          }
          return tool; // Keep original for error reporting
        }
      }

      // mode === 'legacy'
      legacyCount++;
      return tool;
    });

    // Print errors if any
    if (errors.length > 0) {
      console.error('\n[ERROR] Tool expansion failed:\n');
      errors.forEach(err => console.error('  ' + err));
      console.error('');
      process.exit(1);
    }

    // Build expanded config
    const expandedConfig = {
      ...config,
      tools: expandedTools,
    };

    // Print summary
    console.error('# ============================================');
    console.error('# Delta Engine v1.7: Expanded Configuration');
    console.error('# ============================================');
    console.error('#');
    console.error(`# Original file: ${configPath}`);
    console.error(`# Tools expanded: ${expansionCount}`);
    console.error(`# Legacy tools (unchanged): ${legacyCount}`);
    console.error(`# Total tools: ${config.tools.length}`);
    console.error('#');
    console.error('# Syntax sugar (exec:, shell:) has been converted to');
    console.error('# internal ToolDefinition format (command: + parameters:).');
    console.error('#');
    console.error('# This output shows exactly how the engine will execute');
    console.error('# your tools at runtime.');
    console.error('# ============================================\n');

    // Output expanded YAML
    console.log(yaml.stringify(expandedConfig, {
      indent: 2,
      lineWidth: 0, // Disable line wrapping
      minContentWidth: 0,
    }));

  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`[ERROR] Config file not found: ${configPath}`);
      console.error('[HINT] Provide a valid path to config.yaml');
      process.exit(1);
    }

    if (error instanceof Error && error.message.includes('Failed to parse')) {
      console.error(`[ERROR] ${error.message}`);
      console.error('[HINT] Check YAML syntax in config file');
      process.exit(1);
    }

    console.error('[ERROR] Unexpected error:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}
