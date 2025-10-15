import os from 'node:os';
import { DeltaRunMetadata, RunStatus } from './journal-types.js';

/**
 * v1.10: Janitor mechanism result
 */
export interface JanitorResult {
  wasRunning: boolean;
  cleaned: boolean;
  reason?: string;
}

/**
 * Check if a process is alive using signal 0
 * @param pid - Process ID to check
 * @returns true if process is alive, false otherwise
 */
async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0); // Signal 0 checks existence without killing
    return true;
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      return false; // Process does not exist
    }
    // Other errors (e.g., EPERM - permission denied) indicate process exists
    return true;
  }
}

/**
 * Get process name from PID (Unix-like systems)
 * @param pid - Process ID
 * @returns Process name or empty string if unavailable
 */
async function getProcessName(pid: number): Promise<string> {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const { execSync } = await import('node:child_process');
      const result = execSync(`ps -p ${pid} -o comm=`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
      });
      return result.trim();
    } catch {
      return '';
    }
  }
  // Windows or other platforms - skip process name check
  return 'unknown';
}

/**
 * v1.10: Janitor mechanism - Clean up orphaned RUNNING runs
 *
 * This function implements the safe recovery mechanism for runs that are
 * stuck in RUNNING status due to process crashes (e.g., kill -9).
 *
 * Safety Guarantees:
 * 1. Cross-host detection - Refuses to clean runs from different hosts without --force
 * 2. PID liveness check - Verifies process is dead before cleaning
 * 3. PID reuse protection - Checks process name to prevent false positives
 *
 * @param metadata - Run metadata to check
 * @param force - Skip cross-host check (user explicitly confirmed)
 * @returns JanitorResult indicating if cleanup was performed
 * @throws Error if run is still active or cross-host without force
 */
export async function janitorCheck(
  metadata: DeltaRunMetadata,
  force: boolean = false
): Promise<JanitorResult> {
  // Step 0: Quick return if not RUNNING
  if (metadata.status !== RunStatus.RUNNING) {
    return { wasRunning: false, cleaned: false };
  }

  // Step 1: Cross-host detection
  const currentHostname = os.hostname();
  if (metadata.hostname !== currentHostname && !force) {
    throw new Error(
      `Run ${metadata.run_id} was started on host '${metadata.hostname}'. ` +
      `Cannot verify process status from host '${currentHostname}'.\n` +
      `If you're sure the original process is dead, use --force.`
    );
  }

  // Step 2: PID liveness check
  const isAlive = await isProcessAlive(metadata.pid);

  if (!isAlive) {
    // Process is dead, safe to clean up
    return {
      wasRunning: true,
      cleaned: true,
      reason: `Process ${metadata.pid} no longer exists`
    };
  }

  // Step 3: Process name verification (prevent PID reuse false positive)
  const processName = await getProcessName(metadata.pid);
  if (processName && !processName.includes('node') && !processName.includes('delta')) {
    // PID was reused by a different process
    return {
      wasRunning: true,
      cleaned: true,
      reason: `PID ${metadata.pid} reused by different process (${processName})`
    };
  }

  // Process is still alive and matches expected name
  throw new Error(
    `Run ${metadata.run_id} is still active (PID ${metadata.pid}).\n` +
    `Cannot continue while original process is running.`
  );
}

/**
 * Apply Janitor cleanup to metadata
 * Transitions RUNNING → INTERRUPTED
 *
 * @param metadata - Metadata to clean
 * @returns Updated metadata with INTERRUPTED status
 */
export function applyJanitorCleanup(metadata: DeltaRunMetadata): DeltaRunMetadata {
  return {
    ...metadata,
    status: RunStatus.INTERRUPTED,
  };
}
