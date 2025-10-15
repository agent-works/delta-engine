import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DeltaRunMetadata, RunStatus } from '../journal-types.js';
import { ListRunsOptions } from '../types.js';

/**
 * v1.10: Run information structure
 */
export interface RunInfo {
  run_id: string;
  status: RunStatus;
  start_time: string;
  end_time?: string;
  task: string;
  iterations_completed: number;
}

/**
 * v1.10: List runs from .delta directory with filtering and sorting
 *
 * @param deltaDir - Path to .delta directory
 * @param options - Filtering options (status, resumable, first)
 * @returns Array of RunInfo objects, sorted by start_time (most recent first)
 */
export async function listRuns(
  deltaDir: string,
  options: { status?: string; resumable?: boolean; first?: boolean } = {}
): Promise<RunInfo[]> {
  // Scan all run directories
  const runs = await fs.readdir(deltaDir);
  const validRuns = runs.filter(r => r !== 'VERSION' && !r.startsWith('.')).sort();

  if (validRuns.length === 0) {
    return [];
  }

  // Load metadata for each run
  const runInfoList: RunInfo[] = [];

  for (const runId of validRuns) {
    const metadataPath = path.join(deltaDir, runId, 'metadata.json');

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: DeltaRunMetadata = JSON.parse(metadataContent);

      // Apply filters
      if (options.status && metadata.status !== options.status) {
        continue;
      }

      if (options.resumable) {
        const isResumable = metadata.status === RunStatus.WAITING_FOR_INPUT ||
                           metadata.status === RunStatus.INTERRUPTED;
        if (!isResumable) {
          continue;
        }
      }

      runInfoList.push({
        run_id: metadata.run_id,
        status: metadata.status,
        start_time: metadata.start_time,
        end_time: metadata.end_time,
        task: metadata.task,
        iterations_completed: metadata.iterations_completed,
      });
    } catch {
      // Skip invalid metadata files
      continue;
    }
  }

  // Sort by start_time (most recent first)
  runInfoList.sort((a, b) => {
    return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
  });

  // Apply --first filter (return only most recent)
  if (options.first && runInfoList.length > 0) {
    return runInfoList.slice(0, 1);
  }

  return runInfoList;
}

/**
 * v1.10: Format run list as string
 *
 * @param runs - Array of RunInfo objects
 * @param format - Output format (text, json, raw)
 * @returns Formatted string output
 */
export function formatRunList(runs: RunInfo[], format: 'text' | 'json' | 'raw' = 'text'): string {
  // Handle empty results
  if (runs.length === 0) {
    if (format === 'json') {
      return JSON.stringify([], null, 2);
    } else if (format === 'raw') {
      return ''; // No output for empty results in raw mode
    } else {
      return '[INFO] No runs found';
    }
  }

  // Format based on requested format
  if (format === 'json') {
    return JSON.stringify(runs, null, 2);
  } else if (format === 'raw') {
    // Raw format: output only run IDs (for scripting)
    return runs.map(run => run.run_id).join('\n');
  } else {
    // Text format (human-readable)
    const lines: string[] = [];
    lines.push('─'.repeat(80));
    lines.push(`Found ${runs.length} run(s)`);
    lines.push('─'.repeat(80));

    for (const run of runs) {
      lines.push(`\nRun ID: ${run.run_id}`);
      lines.push(`Status: ${run.status}`);
      lines.push(`Start Time: ${new Date(run.start_time).toLocaleString()}`);
      if (run.end_time) {
        lines.push(`End Time: ${new Date(run.end_time).toLocaleString()}`);
      }
      lines.push(`Iterations: ${run.iterations_completed}`);
      lines.push(`Task: ${run.task.substring(0, 60)}${run.task.length > 60 ? '...' : ''}`);
      lines.push('─'.repeat(80));
    }

    return lines.join('\n');
  }
}

/**
 * v1.10: Handle the list-runs command
 * Provides programmatic access to run history for automation and orchestration
 *
 * @param options - List runs command options
 */
export async function handleListRunsCommand(options: ListRunsOptions): Promise<void> {
  try {
    // Determine work directory (default to current directory)
    const workDir = options.workDir || process.cwd();
    const deltaDir = path.join(workDir, '.delta');

    // Check if .delta directory exists
    try {
      await fs.access(deltaDir);
    } catch {
      console.error('[ERROR] No .delta directory found in work directory');
      process.exit(1);
    }

    // List runs with filtering
    const runs = await listRuns(deltaDir, {
      status: options.status,
      resumable: options.resumable,
      first: options.first,
    });

    // Format and output
    const format = (options.format || 'text') as 'text' | 'json' | 'raw';
    const output = formatRunList(runs, format);

    if (output) {
      console.log(output);
    }
  } catch (error) {
    console.error('[ERROR] Failed to list runs');

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }

    process.exit(1);
  }
}
