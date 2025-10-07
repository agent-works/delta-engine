import { promises as fs } from 'node:fs';
import type { FileSource } from '../types.js';

/**
 * File Source Processor
 *
 * Reads static file content and injects into context.
 * Supports path variable expansion: ${AGENT_HOME}, ${CWD}
 */

/**
 * Expand path template variables
 *
 * Supported variables:
 * - ${AGENT_HOME}: Absolute path to agent project directory
 * - ${CWD}: Absolute path to current working directory (workspace)
 *
 * @param pathTemplate - Path string potentially containing variables
 * @param agentHome - Agent project directory
 * @param cwd - Current working directory
 * @returns Expanded absolute path
 */
function expandPath(pathTemplate: string, agentHome: string, cwd: string): string {
  return pathTemplate
    .replace(/\$\{AGENT_HOME\}/g, agentHome)
    .replace(/\$\{CWD\}/g, cwd);
}

/**
 * Process file source: read content from file
 *
 * @param source - File source configuration
 * @param agentHome - Agent project directory
 * @param cwd - Current working directory
 * @returns File content as string
 * @throws Error if file not found and on_missing='error'
 */
export async function processFileSource(
  source: FileSource,
  agentHome: string,
  cwd: string
): Promise<string> {
  const expandedPath = expandPath(source.path, agentHome, cwd);

  try {
    return await fs.readFile(expandedPath, 'utf-8');
  } catch (err: any) {
    // Re-throw with clearer error message
    if (err.code === 'ENOENT') {
      throw new Error(`File not found: ${expandedPath} (source: ${source.id || 'file'})`);
    }
    throw new Error(`Failed to read file ${expandedPath}: ${err.message}`);
  }
}
