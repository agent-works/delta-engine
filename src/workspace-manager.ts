import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Pattern for workspace IDs: W001, W002, etc.
 */
const WORKSPACE_ID_PATTERN = /^W(\d{3})$/;
const LAST_WORKSPACE_FILE = '.last_workspace';

/**
 * Workspace info structure
 */
export interface WorkspaceInfo {
  name: string;
  path: string;
  isLegacy: boolean; // true if using old workspace_* format
}

/**
 * List all existing workspaces in the work_runs directory
 * @param workRunsDir - Path to the work_runs directory
 * @returns Array of workspace information
 */
export async function listExistingWorkspaces(workRunsDir: string): Promise<WorkspaceInfo[]> {
  try {
    await fs.access(workRunsDir);
  } catch {
    // Directory doesn't exist yet
    return [];
  }

  try {
    const entries = await fs.readdir(workRunsDir, { withFileTypes: true });
    const workspaces: WorkspaceInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const isLegacy = entry.name.startsWith('workspace_');
        workspaces.push({
          name: entry.name,
          path: path.join(workRunsDir, entry.name),
          isLegacy,
        });
      }
    }

    // Sort: W-format first (by number), then legacy
    workspaces.sort((a, b) => {
      const aMatch = a.name.match(WORKSPACE_ID_PATTERN);
      const bMatch = b.name.match(WORKSPACE_ID_PATTERN);

      if (aMatch && bMatch && aMatch[1] && bMatch[1]) {
        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
      }
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.name.localeCompare(b.name);
    });

    return workspaces;
  } catch (error) {
    throw new Error(
      `Failed to list workspaces: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate the next available workspace ID (W001, W002, etc.)
 * @param workRunsDir - Path to the work_runs directory
 * @returns Next workspace ID
 */
export async function generateNextWorkspaceId(workRunsDir: string): Promise<string> {
  const workspaces = await listExistingWorkspaces(workRunsDir);

  // Find the highest W-format number
  let maxNum = 0;
  for (const ws of workspaces) {
    const match = ws.name.match(WORKSPACE_ID_PATTERN);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  // Return next number
  const nextNum = maxNum + 1;
  return `W${String(nextNum).padStart(3, '0')}`;
}

/**
 * Load the last used workspace name from .last_workspace file
 * @param workRunsDir - Path to the work_runs directory
 * @returns Last workspace name, or null if not found
 */
export async function loadLastUsedWorkspace(workRunsDir: string): Promise<string | null> {
  const lastWorkspaceFile = path.join(workRunsDir, LAST_WORKSPACE_FILE);

  try {
    const content = await fs.readFile(lastWorkspaceFile, 'utf-8');
    const workspaceName = content.trim();

    // Verify the workspace still exists
    const workspacePath = path.join(workRunsDir, workspaceName);
    try {
      const stats = await fs.stat(workspacePath);
      if (stats.isDirectory()) {
        return workspaceName;
      }
    } catch {
      // Workspace no longer exists, ignore
    }

    return null;
  } catch {
    // File doesn't exist or couldn't be read
    return null;
  }
}

/**
 * Save the last used workspace name to .last_workspace file
 * @param workRunsDir - Path to the work_runs directory
 * @param workspaceName - Workspace name to save
 */
export async function saveLastUsedWorkspace(
  workRunsDir: string,
  workspaceName: string
): Promise<void> {
  const lastWorkspaceFile = path.join(workRunsDir, LAST_WORKSPACE_FILE);

  try {
    // Ensure work_runs directory exists
    await fs.mkdir(workRunsDir, { recursive: true });
    await fs.writeFile(lastWorkspaceFile, workspaceName, 'utf-8');
  } catch (error) {
    // Don't fail if we can't write the file - it's not critical
    console.warn(
      `[WARN] Could not save last workspace preference: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Prompt user to select a workspace interactively
 * @param workRunsDir - Path to the work_runs directory
 * @returns Selected workspace name (could be existing or new)
 */
export async function promptUserForWorkspace(workRunsDir: string): Promise<string> {
  const workspaces = await listExistingWorkspaces(workRunsDir);
  const lastUsed = await loadLastUsedWorkspace(workRunsDir);
  const nextId = await generateNextWorkspaceId(workRunsDir);

  console.log('\n' + '─'.repeat(60));
  console.log('📁 Work Directory Selection');
  console.log('─'.repeat(60));

  if (workspaces.length === 0) {
    console.log('\nNo existing workspaces found.');
    console.log(`Creating new workspace: ${nextId}`);
    console.log('─'.repeat(60) + '\n');
    return nextId;
  }

  console.log('\nExisting workspaces:');
  workspaces.forEach((ws, idx) => {
    const prefix = ws.name === lastUsed ? '▸' : ' ';
    const suffix = ws.name === lastUsed ? ' (last used)' : '';
    console.log(`${prefix} [${idx + 1}] ${ws.name}${suffix}`);
  });

  console.log(`\nOptions:`);
  console.log(`  • Enter workspace number to select (1-${workspaces.length})`);
  console.log(`  • Press Enter to use ${lastUsed ? `"${lastUsed}" (last used)` : `new workspace "${nextId}"`}`);
  console.log(`  • Enter 'n' or 'new' to create a new workspace`);
  console.log(`  • Enter custom name (e.g., "my-workspace") to create with that name`);
  console.log('─'.repeat(60));

  const rl = readline.createInterface({ input, output });

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question('\nYour choice: ', (ans) => {
        resolve(ans.trim());
      });
    });

    // Empty answer - use default
    if (!answer) {
      return lastUsed || nextId;
    }

    // 'n' or 'new' - create new with auto ID
    if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'new') {
      console.log(`Creating new workspace: ${nextId}`);
      return nextId;
    }

    // Check if it's a number (selecting existing workspace)
    const selectedIdx = parseInt(answer, 10);
    if (!isNaN(selectedIdx) && selectedIdx >= 1 && selectedIdx <= workspaces.length) {
      const selected = workspaces[selectedIdx - 1];
      if (selected) {
        console.log(`Selected existing workspace: ${selected.name}`);
        return selected.name;
      }
    }

    // Otherwise, treat as custom name
    const customName = answer;
    console.log(`Creating new workspace: ${customName}`);
    return customName;

  } finally {
    rl.close();
    console.log('─'.repeat(60) + '\n');
  }
}

/**
 * Create a new workspace directory
 * @param workRunsDir - Path to the work_runs directory
 * @param workspaceName - Name of the workspace to create
 * @returns Absolute path to the created workspace
 */
export async function createWorkspace(
  workRunsDir: string,
  workspaceName: string
): Promise<string> {
  const workspacePath = path.join(workRunsDir, workspaceName);

  try {
    await fs.mkdir(workspacePath, { recursive: true });
    return workspacePath;
  } catch (error) {
    throw new Error(
      `Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
