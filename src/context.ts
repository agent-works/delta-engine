import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { EngineContext } from './types.js';
import { loadAndValidateAgent } from './config.js';
import { createJournal } from './journal.js';
import { DeltaRunMetadata, RunStatus } from './journal-types.js';
import {
  generateNextWorkspaceId,
  promptUserForWorkspace,
  saveLastUsedWorkspace,
} from './workspace-manager.js';

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
 * @returns Initialized engine context
 */
export async function initializeContext(
  agentPathInput: string,
  task: string,
  workDirInput?: string,
  isInteractive?: boolean,
  maxIterations?: number,
  explicitWorkDir: boolean = false,
  skipPrompt: boolean = false
): Promise<EngineContext> {
  // Generate run ID according to v1.1 spec
  const runId = generateRunId();

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
        console.log(`[INFO] Created work directory: ${workDir}`);
      }
    }
  } else {
    // No work directory specified - use workspace selection logic
    const workRunsDir = path.join(agentPath, 'workspaces');
    await ensureDirectory(workRunsDir);

    if (skipPrompt) {
      // Auto-create new workspace (silent mode with -y flag)
      workspaceName = await generateNextWorkspaceId(workRunsDir);
      console.log(`[INFO] Auto-creating new workspace: ${workspaceName}`);
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

  // Try to load .env file from agent directory if it exists
  const agentEnvPath = path.join(agentPath, '.env');
  try {
    await fs.access(agentEnvPath, fs.constants.R_OK);
    dotenv.config({ path: agentEnvPath });
    console.log(`Loaded environment variables from ${agentEnvPath}`);
  } catch {
    // .env file doesn't exist in agent directory, which is fine
  }

  // Load and validate agent configuration
  const { config, systemPrompt } = await loadAndValidateAgent(agentPath);

  // Override max_iterations if provided via CLI
  if (maxIterations !== undefined) {
    config.max_iterations = maxIterations;
  }

  // v1.3: Initialize Journal and run directory structure
  const journal = createJournal(runId, runDir);
  await journal.initialize();
  await journal.initializeMetadata(agentPath, task);

  // Create LATEST file containing the run ID
  const latestFile = path.join(deltaDir, 'LATEST');
  await fs.writeFile(latestFile, runId, 'utf-8');

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
  };

  return context;
}

/**
 * Load an existing context from a work directory
 * @param workDir - Path to the work directory containing metadata.json
 * @returns Engine context
 */
export async function loadExistingContext(workDir: string): Promise<EngineContext> {
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

  // Find the latest run
  const latestFile = path.join(deltaDir, 'LATEST');
  let runId: string;
  let runDir: string;

  try {
    // Try to read the LATEST file
    runId = await fs.readFile(latestFile, 'utf-8');
    runId = runId.trim();

    if (!runId) {
      throw new Error('LATEST file is empty');
    }

    runDir = path.join(deltaDir, runId);
  } catch {
    // No LATEST file or it's empty, find the most recent run
    const runs = await fs.readdir(deltaDir);
    const validRuns = runs.filter(r => r !== 'LATEST' && r !== 'VERSION' && !r.startsWith('.')).sort();

    if (validRuns.length === 0) {
      throw new Error('No runs found in .delta/');
    }

    const lastRun = validRuns[validRuns.length - 1];
    if (!lastRun) {
      throw new Error('No valid run found');
    }

    runId = lastRun;
    runDir = path.join(deltaDir, lastRun);
  }

  // Load metadata from the run
  const metadataPath = path.join(runDir, 'metadata.json');

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Validate required metadata fields
    if (!metadata.run_id || !metadata.agent_ref || !metadata.task) {
      throw new Error('Invalid metadata.json: missing required fields');
    }

    // Load agent configuration
    const { config, systemPrompt } = await loadAndValidateAgent(metadata.agent_ref);

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
 * Check if a resumable run exists in the work directory
 * @param workDir - Path to the work directory
 * @returns The run directory path if resumable, null otherwise
 */
export async function checkForResumableRun(workDir: string): Promise<string | null> {
  const deltaDir = path.join(workDir, '.delta');

  try {
    // Check if .delta directory exists
    await fs.access(deltaDir);

    // Check for LATEST file
    const latestFile = path.join(deltaDir, 'LATEST');
    let runId: string;

    try {
      // Read the run ID from LATEST file
      runId = await fs.readFile(latestFile, 'utf-8');
      runId = runId.trim();

      if (!runId) {
        return null;
      }
    } catch {
      // No LATEST file exists
      return null;
    }

    // Construct the run directory path
    const runDir = path.join(deltaDir, runId);

    // Read metadata to check status
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
      // Metadata doesn't exist or is invalid
      return null;
    }

    return null;
  } catch {
    // .delta directory doesn't exist
    return null;
  }
}

/**
 * Resume an existing run from a work directory
 * @param workDir - Path to the work directory
 * @param runDir - Path to the run directory to resume
 * @returns Engine context for the resumed run
 */
export async function resumeContext(workDir: string, runDir: string, isInteractive?: boolean): Promise<EngineContext> {
  const deltaDir = path.join(workDir, '.delta');

  // Load metadata from the run
  const metadataPath = path.join(runDir, 'execution', 'metadata.json');
  const metadataContent = await fs.readFile(metadataPath, 'utf-8');
  const metadata: DeltaRunMetadata = JSON.parse(metadataContent);

  // Load agent configuration
  const { config, systemPrompt } = await loadAndValidateAgent(metadata.agent_ref);

  // Create journal instance for the existing run
  const journal = createJournal(metadata.run_id, runDir);
  await journal.initialize();

  // Update status to RUNNING since we're resuming
  await journal.updateMetadata({
    status: RunStatus.RUNNING
  });

  // Update LATEST file to point to this run
  const latestFile = path.join(deltaDir, 'runs', 'LATEST');
  await fs.writeFile(latestFile, metadata.run_id, 'utf-8');

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