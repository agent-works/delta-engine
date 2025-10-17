import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EngineContext } from './types.js';
import { loadConfigWithCompat } from './config.js';
import { createJournal } from './journal.js';
import { DeltaRunMetadata, RunStatus } from './journal-types.js';
import {
  generateNextWorkspaceId,
  promptUserForWorkspace,
  saveLastUsedWorkspace,
} from './workspace-manager.js';
import { loadEnvFiles } from './env-loader.js';

const execFileAsync = promisify(execFile);

/**
 * Format current timestamp as YYYYMMDD_HHmmss
 * @returns Formatted timestamp string
 */
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Generate a short UUID (first 6 characters)
 * @returns Short UUID string
 */
function generateShortUuid(): string {
  return uuidv4().substring(0, 6);
}

/**
 * Generate run ID according to v1.1 spec: <YYYYMMDD_HHMMSS>_<ShortUUID>
 * @returns Run ID string
 */
function generateRunId(): string {
  const timestamp = formatTimestamp();
  const shortUuid = generateShortUuid();
  return `${timestamp}_${shortUuid}`;
}


/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath - Path to the directory
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Resolve a path to an absolute path
 * @param inputPath - Input path (relative or absolute)
 * @returns Absolute path
 */
function toAbsolutePath(inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);
}

/**
 * Initialize the engine context for a new run
 * @param agentPathInput - Path to the agent directory (can be relative or absolute)
 * @param task - Initial task description
 * @param workDirInput - Optional work directory path (can be relative or absolute)
 * @param isInteractive - Enable interactive mode for ask_human tool
 * @param maxIterations - Override max iterations from config
 * @param explicitWorkDir - True if workDirInput was explicitly provided by user
 * @param skipPrompt - True to skip workspace selection prompt (auto-create new)
 * @param clientRunId - v1.10: Optional client-generated run ID for deterministic tracking
 * @returns Initialized engine context
 */
export async function initializeContext(
  agentPathInput: string,
  task: string,
  workDirInput?: string,
  isInteractive?: boolean,
  maxIterations?: number,
  explicitWorkDir: boolean = false,
  skipPrompt: boolean = false,
  clientRunId?: string
): Promise<EngineContext> {
  // v1.10: Use client-provided run ID if given, otherwise generate one
  const runId = clientRunId || generateRunId();

  // Convert agent path to absolute path
  const agentPath = toAbsolutePath(agentPathInput);

  // Validate agent path exists and is a directory
  try {
    const stats = await fs.stat(agentPath);
    if (!stats.isDirectory()) {
      throw new Error(`Agent path is not a directory: ${agentPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Agent path does not exist: ${agentPath}`);
    }
    throw error;
  }

  // Determine work directory (CWD in v1.1 terminology)
  let workDir: string;
  let workspaceName: string | null = null; // Track for saving to .last_workspace

  if (workDirInput) {
    // User provided explicit work directory
    workDir = toAbsolutePath(workDirInput);

    // Check if it exists
    try {
      await fs.access(workDir);
    } catch {
      // Directory doesn't exist - create it
      await ensureDirectory(workDir);
      if (explicitWorkDir) {
        console.error(`[INFO] Created work directory: ${workDir}`);
      }
    }
  } else {
    // No work directory specified - use workspace selection logic
    const workRunsDir = path.join(agentPath, 'workspaces');
    await ensureDirectory(workRunsDir);

    if (skipPrompt) {
      // Auto-create new workspace (silent mode with -y flag)
      workspaceName = await generateNextWorkspaceId(workRunsDir);
      console.error(`[INFO] Auto-creating new workspace: ${workspaceName}`);
    } else {
      // Interactive workspace selection
      workspaceName = await promptUserForWorkspace(workRunsDir);
    }

    workDir = path.join(workRunsDir, workspaceName);

    // Ensure workspace directory exists
    await ensureDirectory(workDir);

    // Save as last used workspace
    await saveLastUsedWorkspace(workRunsDir, workspaceName);
  }

  // v1.3: Create .delta control plane directory structure (simplified)
  const deltaDir = path.join(workDir, '.delta');
  const runDir = path.join(deltaDir, runId);

  await ensureDirectory(deltaDir);
  await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.2\n', 'utf-8');

  // v1.10: Uniqueness check moved to CLI (src/cli.ts) for fail-fast behavior
  // CLI checks uniqueness BEFORE attempting resume, preventing bypass via resume logic

  // Load environment variables in cascading order (workspace > agent > project root)
  const loadedEnvFiles = loadEnvFiles(workDir, agentPath, process.cwd());

  // Load and validate agent configuration (v1.9: supports agent.yaml + imports)
  const { config, systemPrompt } = await loadConfigWithCompat(agentPath);

  // Override max_iterations if provided via CLI
  if (maxIterations !== undefined) {
    config.max_iterations = maxIterations;
  }

  // v1.3: Initialize Journal and run directory structure
  const journal = createJournal(runId, runDir);
  await journal.initialize();
  await journal.initializeMetadata(agentPath, task);

  // v1.10: LATEST file removed (no longer needed in frontierless workspace model)

  // Build and return EngineContext with shared journal instance
  const context: EngineContext = {
    runId,
    agentPath,
    workDir,
    deltaDir,  // v1.1: Added control plane directory
    config,
    systemPrompt,
    initialTask: task,
    currentStep: 0,  // v1.1: Track current step for journal sequencing
    journal,  // Include the shared journal instance to prevent duplicate FileHandles
    isInteractive,  // v1.2: Interactive mode flag
    loadedEnvFiles,  // v1.8: List of loaded .env files for logging
  };

  return context;
}

/**
 * Load an existing context from a work directory
 * @param workDir - Path to the work directory containing metadata.json
 * @param runId - Optional explicit run ID to load (v1.10+)
 * @returns Engine context
 */
export async function loadExistingContext(workDir: string, runId?: string): Promise<EngineContext> {
  // v1.3: Check for .delta directory
  const deltaDir = path.join(workDir, '.delta');

  try {
    const schemaVersion = await fs.readFile(path.join(deltaDir, 'VERSION'), 'utf-8');
    if (!schemaVersion.trim().startsWith('1.')) {
      throw new Error(`Unsupported schema version: ${schemaVersion.trim()}`);
    }
  } catch (error) {
    throw new Error(`Invalid or missing .delta directory: ${error}`);
  }

  // v1.10: Use explicit runId if provided, otherwise find the most recent run
  let targetRunId: string;

  if (runId) {
    // Use explicit run ID
    targetRunId = runId;
  } else {
    // Find the most recent run by scanning directory (no LATEST file)
    const runs = await fs.readdir(deltaDir);
    const validRuns = runs.filter(r => r !== 'VERSION' && !r.startsWith('.')).sort();

    if (validRuns.length === 0) {
      throw new Error('No runs found in .delta/');
    }

    const lastRun = validRuns[validRuns.length - 1];
    if (!lastRun) {
      throw new Error('No valid run found');
    }

    targetRunId = lastRun;
  }

  const runDir = path.join(deltaDir, targetRunId);

  // Load metadata from the run
  const metadataPath = path.join(runDir, 'metadata.json');

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Validate required metadata fields
    if (!metadata.run_id || !metadata.agent_ref || !metadata.task) {
      throw new Error('Invalid metadata.json: missing required fields');
    }

    // Load agent configuration (v1.9: supports agent.yaml + imports)
    const { config, systemPrompt } = await loadConfigWithCompat(metadata.agent_ref);

    // Count existing journal events to determine current step
    const journal = createJournal(metadata.run_id, runDir);
    const events = await journal.readJournal();
    const currentStep = events.length;

    return {
      runId: metadata.run_id,
      agentPath: metadata.agent_ref,
      workDir: toAbsolutePath(workDir),
      deltaDir,
      config,
      systemPrompt,
      initialTask: metadata.task,
      currentStep,
      journal,  // Include the journal instance to prevent duplicate FileHandles
    };
  } catch (error) {
    throw new Error(
      `Failed to load existing context: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * v1.10: Check if a resumable run exists in the work directory
 * Scans all runs and returns the most recent resumable one
 *
 * @param workDir - Path to the work directory
 * @returns The run directory path if resumable, null otherwise
 */
export async function checkForResumableRun(workDir: string): Promise<string | null> {
  const deltaDir = path.join(workDir, '.delta');

  try {
    // Check if .delta directory exists
    await fs.access(deltaDir);

    // v1.10: Scan all run directories (no LATEST file)
    const runs = await fs.readdir(deltaDir);
    const validRuns = runs.filter(r => r !== 'VERSION' && !r.startsWith('.')).sort();

    if (validRuns.length === 0) {
      return null;
    }

    // Check runs in reverse order (most recent first)
    for (let i = validRuns.length - 1; i >= 0; i--) {
      const runId = validRuns[i];
      if (!runId) continue;

      const runDir = path.join(deltaDir, runId);
      const metadataPath = path.join(runDir, 'metadata.json');

      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata: DeltaRunMetadata = JSON.parse(metadataContent);

        // Check if status is resumable
        if (metadata.status === RunStatus.WAITING_FOR_INPUT ||
            metadata.status === RunStatus.INTERRUPTED) {
          return runDir;
        }
      } catch {
        // Metadata doesn't exist or is invalid, skip this run
        continue;
      }
    }

    return null;
  } catch {
    // .delta directory doesn't exist
    return null;
  }
}

/**
 * v1.10: Check for any existing run in the work directory (not limited to resumable states)
 * Used by `delta continue` command to support continuing COMPLETED/FAILED runs
 * Returns the most recent run regardless of status
 *
 * @param workDir - The work directory to check
 * @returns Object with runDir and status, or null if no run exists
 */
export async function checkForAnyRun(workDir: string): Promise<{ runDir: string; status: RunStatus } | null> {
  const deltaDir = path.join(workDir, '.delta');

  try {
    // Check if .delta directory exists
    await fs.access(deltaDir);

    // v1.10: Scan all run directories (no LATEST file)
    const runs = await fs.readdir(deltaDir);
    const validRuns = runs.filter(r => r !== 'VERSION' && !r.startsWith('.')).sort();

    if (validRuns.length === 0) {
      return null;
    }

    // Get the most recent run
    const latestRunId = validRuns[validRuns.length - 1];
    if (!latestRunId) {
      return null;
    }

    const runDir = path.join(deltaDir, latestRunId);

    // Read metadata to check status
    const metadataPath = path.join(runDir, 'metadata.json');
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: DeltaRunMetadata = JSON.parse(metadataContent);

      // Return run info for ANY status (not limited to resumable)
      return { runDir, status: metadata.status };
    } catch {
      // Metadata doesn't exist or is invalid
      return null;
    }
  } catch {
    // .delta directory doesn't exist
    return null;
  }
}

/**
 * v1.10 Blocker 2 Fix: Check for a specific run by run ID (explicit continuation)
 * This function supports Frontierless Workspace by requiring explicit run ID specification
 * Used by `delta continue --run-id` command to target specific runs
 *
 * @param workDir - The work directory to check
 * @param runId - The specific run ID to look for
 * @returns Object with runDir and status, or null if run doesn't exist
 */
export async function checkForSpecificRun(
  workDir: string,
  runId: string
): Promise<{ runDir: string; status: RunStatus } | null> {
  const deltaDir = path.join(workDir, '.delta');
  const runDir = path.join(deltaDir, runId);

  try {
    // Check if the specific run directory exists
    await fs.access(runDir);

    // Read metadata to get status
    const metadataPath = path.join(runDir, 'metadata.json');
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: DeltaRunMetadata = JSON.parse(metadataContent);

      // Return run info
      return { runDir, status: metadata.status };
    } catch {
      // Metadata doesn't exist or is invalid
      return null;
    }
  } catch {
    // Run directory doesn't exist
    return null;
  }
}

/**
 * v1.10: Resume an existing run from a work directory
 * @param workDir - Path to the work directory
 * @param runDir - Path to the run directory to resume
 * @param isInteractive - Enable interactive mode
 * @param userMessage - Optional user message to append
 * @param force - Force resume (skip cross-host process check)
 * @returns Engine context for the resumed run
 */
export async function resumeContext(
  workDir: string,
  runDir: string,
  isInteractive?: boolean,
  userMessage?: string,
  force?: boolean
): Promise<EngineContext> {
  const deltaDir = path.join(workDir, '.delta');

  // Load metadata from the run (v1.3: directly in run root)
  const metadataPath = path.join(runDir, 'metadata.json');
  const metadataContent = await fs.readFile(metadataPath, 'utf-8');
  let metadata: DeltaRunMetadata = JSON.parse(metadataContent);

  // v1.10: Janitor check if run is RUNNING
  if (metadata.status === RunStatus.RUNNING) {
    const { janitorCheck, applyJanitorCleanup } = await import('./janitor.js');
    const janitorResult = await janitorCheck(metadata, force || false);

    if (janitorResult.cleaned) {
      console.error(`[Janitor] Cleaned up orphaned run: ${janitorResult.reason}`);
      metadata = applyJanitorCleanup(metadata);

      // Persist cleaned metadata
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
  }

  // Load agent configuration (v1.9: supports agent.yaml + imports)
  const { config, systemPrompt } = await loadConfigWithCompat(metadata.agent_ref);

  // Create journal instance for the existing run
  const journal = createJournal(metadata.run_id, runDir);
  await journal.initialize();

  // v1.8: Append user message if provided (for delta continue)
  if (userMessage) {
    await journal.logUserMessage(userMessage);
  }

  // Update status to RUNNING since we're resuming
  await journal.updateMetadata({
    status: RunStatus.RUNNING
  });

  // v1.10: LATEST file removed (no longer needed in frontierless workspace model)

  // Count existing journal events to determine current step
  const events = await journal.readJournal();
  const currentStep = events.length;

  return {
    runId: metadata.run_id,
    agentPath: metadata.agent_ref,
    workDir: toAbsolutePath(workDir),
    deltaDir,
    config,
    systemPrompt,
    initialTask: metadata.task,
    currentStep,
    journal,
    isInteractive,
  };
}

/**
 * Clean up a work directory (delete it and all contents)
 * @param workDir - Path to the work directory to clean up
 */
export async function cleanupWorkDirectory(workDir: string): Promise<void> {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch (error) {
    throw new Error(
      `Failed to cleanup work directory: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Clean up all active sessions in a workspace
 * This should be called when a delta run completes (successfully or with failure)
 * to prevent session resource leaks.
 *
 * @param workDir - Path to the work directory containing .sessions/
 * @returns Number of sessions cleaned up
 */
export async function cleanupWorkspaceSessions(workDir: string): Promise<number> {
  const sessionsDir = path.join(workDir, '.sessions');

  try {
    // Check if .sessions directory exists
    try {
      await fs.access(sessionsDir);
    } catch {
      // No .sessions directory, nothing to clean up
      return 0;
    }

    // Get list of sessions using delta-sessions CLI
    const { stdout } = await execFileAsync('delta-sessions', [
      'list',
      '--sessions-dir',
      sessionsDir,
    ]);

    // Parse session list (JSON array)
    const sessions: Array<{ session_id: string; status: string }> = JSON.parse(stdout);

    if (sessions.length === 0) {
      return 0;
    }

    // Terminate each session
    let cleanedCount = 0;
    for (const session of sessions) {
      try {
        await execFileAsync('delta-sessions', [
          'end',
          session.session_id,
          '--sessions-dir',
          sessionsDir,
        ]);
        cleanedCount++;
      } catch (error) {
        // Log error but continue with other sessions
        console.error(
          `[WARN] Failed to terminate session ${session.session_id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return cleanedCount;
  } catch (error) {
    // If we can't list or clean up sessions, log warning but don't throw
    // This shouldn't break the main flow
    console.error(
      `[WARN] Failed to cleanup workspace sessions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}