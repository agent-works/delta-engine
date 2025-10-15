import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Find the project root directory by searching upward for a .git directory
 * @param startDir - Directory to start searching from
 * @returns Path to project root, or null if not found
 */
export function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    // Check if current directory contains .git
    const gitPath = path.join(current, '.git');
    if (existsSync(gitPath)) {
      return current;
    }

    // Move up one directory
    current = path.dirname(current);
  }

  return null;
}

/**
 * Load .env files in cascading order (local overrides global)
 * Priority: workspace/.env > agent/.env > project root/.env > process.env
 *
 * Uses dotenv with override: false, so earlier loaded files take precedence
 *
 * @param workDir - Workspace directory path
 * @param agentPath - Agent directory path
 * @param cwd - Current working directory (for project root search)
 * @returns Array of successfully loaded .env file paths
 */
export function loadEnvFiles(
  workDir: string,
  agentPath: string,
  cwd: string
): string[] {
  const loadedFiles: string[] = [];

  // Collect potential .env file paths (from most local to most global)
  const envFilePaths: string[] = [
    path.join(workDir, '.env'),           // Workspace (most local)
    path.join(agentPath, '.env'),         // Agent directory
  ];

  // Add project root .env if found
  const projectRoot = findProjectRoot(cwd);
  if (projectRoot) {
    envFilePaths.push(path.join(projectRoot, '.env'));
  }

  // Load each .env file that exists
  // Load from most local to most global, with override: false
  // This ensures local values take precedence
  for (const envPath of envFilePaths) {
    if (existsSync(envPath)) {
      try {
        // override: false means existing env vars won't be overwritten
        // Since we load from local to global, local values are set first
        // quiet: true disables dotenv's stdout logging (v1.10 I/O separation)
        dotenv.config({ path: envPath, override: false, quiet: true });
        loadedFiles.push(envPath);
      } catch (error) {
        // Log error but continue loading other files
        console.warn(
          `[WARN] Failed to load ${envPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  return loadedFiles;
}
