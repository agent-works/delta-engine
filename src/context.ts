import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { EngineContext } from './types.js';
import { loadAndValidateAgent } from './config.js';
import { createJournal } from './journal.js';
import { DeltaRunMetadata, RunStatus } from './journal-types.js';

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
 * Generate workspace ID with prefix: workspace_<YYYYMMDD_HHMMSS>_<ShortUUID>
 * @returns Workspace ID string
 */
function generateWorkspaceId(): string {
  const timestamp = formatTimestamp();
  const shortUuid = generateShortUuid();
  return `workspace_${timestamp}_${shortUuid}`;
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
 * @returns Initialized engine context
 */
export async function initializeContext(
  agentPathInput: string,
  task: string,
  workDirInput?: string,
  isInteractive?: boolean
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
  if (workDirInput) {
    // Use provided work directory (convert to absolute)
    workDir = toAbsolutePath(workDirInput);
  } else {
    // Default: Create a workspace directory under $AGENT_HOME/work_runs/
    // Each workspace has a unique ID to distinguish it from run IDs
    const workRunsDir = path.join(agentPath, 'work_runs');
    await ensureDirectory(workRunsDir);
    const workspaceId = generateWorkspaceId();
    workDir = path.join(workRunsDir, workspaceId);
  }

  // Ensure work directory exists
  await ensureDirectory(workDir);

  // v1.1: Create .delta control plane directory structure
  const deltaDir = path.join(workDir, '.delta');
  const runDir = path.join(deltaDir, 'runs', runId);

  await ensureDirectory(deltaDir);
  await fs.writeFile(path.join(deltaDir, 'schema_version.txt'), '1.1\n', 'utf-8');
  await ensureDirectory(path.join(deltaDir, 'runs'));

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

  // v1.1: Initialize Journal and run directory structure
  const journal = createJournal(runId, runDir);
  await journal.initialize();
  await journal.initializeMetadata(agentPath, task);

  // v1.1: Copy configuration snapshot
  const configDir = path.join(runDir, 'configuration');
  await ensureDirectory(configDir);

  await fs.copyFile(
    path.join(agentPath, 'config.yaml'),
    path.join(configDir, 'resolved_config.yaml')
  );

  // Copy system prompt (support both .md and .txt)
  const systemPromptMd = path.join(agentPath, 'system_prompt.md');
  const systemPromptTxt = path.join(agentPath, 'system_prompt.txt');

  try {
    await fs.access(systemPromptMd);
    await fs.copyFile(
      systemPromptMd,
      path.join(configDir, 'system_prompt.md')
    );
  } catch {
    // Fallback to .txt if .md doesn't exist
    await fs.copyFile(
      systemPromptTxt,
      path.join(configDir, 'system_prompt.txt')
    );
  }

  // Create LATEST file containing the run ID
  const latestFile = path.join(deltaDir, 'runs', 'LATEST');
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
  // v1.1: Check for .delta directory
  const deltaDir = path.join(workDir, '.delta');

  try {
    const schemaVersion = await fs.readFile(path.join(deltaDir, 'schema_version.txt'), 'utf-8');
    if (!schemaVersion.trim().startsWith('1.1')) {
      throw new Error(`Unsupported schema version: ${schemaVersion.trim()}`);
    }
  } catch (error) {
    throw new Error(`Invalid or missing .delta directory: ${error}`);
  }

  // Find the latest run
  const latestFile = path.join(deltaDir, 'runs', 'LATEST');
  let runId: string;
  let runDir: string;

  try {
    // Try to read the LATEST file
    runId = await fs.readFile(latestFile, 'utf-8');
    runId = runId.trim();

    if (!runId) {
      throw new Error('LATEST file is empty');
    }

    runDir = path.join(deltaDir, 'runs', runId);
  } catch {
    // No LATEST file or it's empty, find the most recent run
    const runsDir = path.join(deltaDir, 'runs');
    const runs = await fs.readdir(runsDir);
    const validRuns = runs.filter(r => r !== 'LATEST').sort();

    if (validRuns.length === 0) {
      throw new Error('No runs found in .delta/runs/');
    }

    const lastRun = validRuns[validRuns.length - 1];
    if (!lastRun) {
      throw new Error('No valid run found');
    }

    runId = lastRun;
    runDir = path.join(runsDir, lastRun);
  }

  // Load metadata from the run
  const metadataPath = path.join(runDir, 'execution', 'metadata.json');

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
    const latestFile = path.join(deltaDir, 'runs', 'LATEST');
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
    const runDir = path.join(deltaDir, 'runs', runId);

    // Read metadata to check status
    const metadataPath = path.join(runDir, 'execution', 'metadata.json');
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