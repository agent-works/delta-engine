import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { EngineContext } from './types.js';
import { loadAndValidateAgent } from './config.js';

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
 * Generate a short UUID (first 8 characters)
 * @returns Short UUID string
 */
function generateShortUuid(): string {
  return uuidv4().substring(0, 8);
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
  workDirInput?: string
): Promise<EngineContext> {
  // Generate run ID
  const runId = uuidv4();

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

  // Determine work directory
  let workDir: string;
  if (workDirInput) {
    // Use provided work directory (convert to absolute)
    workDir = toAbsolutePath(workDirInput);
  } else {
    // Generate default work directory: <agentPath>/work_runs/YYYYMMDD_HHmmss_<uuid_short>
    const timestamp = formatTimestamp();
    const shortUuid = generateShortUuid();
    const runDirName = `${timestamp}_${shortUuid}`;
    workDir = path.join(agentPath, 'work_runs', runDirName);
  }

  // Ensure work directory exists
  await ensureDirectory(workDir);

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

  // Create metadata.json in work directory
  const metadata = {
    runId,
    agentPath,
    initialTask: task,
    startTime: new Date().toISOString(),
    workDir,
    agentName: config.name,
    agentVersion: config.version,
  };

  const metadataPath = path.join(workDir, 'metadata.json');
  try {
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  } catch (error) {
    throw new Error(
      `Failed to write metadata.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Build and return EngineContext
  const context: EngineContext = {
    runId,
    agentPath,
    workDir,
    config,
    systemPrompt,
    initialTask: task,
  };

  return context;
}

/**
 * Load an existing context from a work directory
 * @param workDir - Path to the work directory containing metadata.json
 * @returns Engine context
 */
export async function loadExistingContext(workDir: string): Promise<EngineContext> {
  const metadataPath = path.join(workDir, 'metadata.json');

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Validate required metadata fields
    if (!metadata.runId || !metadata.agentPath || !metadata.initialTask) {
      throw new Error('Invalid metadata.json: missing required fields');
    }

    // Load agent configuration
    const { config, systemPrompt } = await loadAndValidateAgent(metadata.agentPath);

    return {
      runId: metadata.runId,
      agentPath: metadata.agentPath,
      workDir: toAbsolutePath(workDir),
      config,
      systemPrompt,
      initialTask: metadata.initialTask,
    };
  } catch (error) {
    throw new Error(
      `Failed to load existing context: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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