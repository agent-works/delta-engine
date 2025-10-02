import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SessionMetadata } from './types.js';
import { SessionMetadataSchema } from './types.js';

/**
 * Save session metadata to disk
 */
export async function saveMetadata(
  sessionDir: string,
  metadata: SessionMetadata
): Promise<void> {
  const metadataPath = path.join(sessionDir, 'metadata.json');

  // Ensure session directory exists
  await fs.mkdir(sessionDir, { recursive: true });

  // Write metadata
  await fs.writeFile(
    metadataPath,
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
}

/**
 * Load session metadata from disk
 */
export async function loadMetadata(sessionDir: string): Promise<SessionMetadata> {
  const metadataPath = path.join(sessionDir, 'metadata.json');

  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(data);

    // Validate with Zod schema
    return SessionMetadataSchema.parse(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Metadata not found: ${sessionDir}`);
    }
    throw err;
  }
}

/**
 * Update session metadata (partial update)
 */
export async function updateMetadata(
  sessionDir: string,
  updates: Partial<SessionMetadata>
): Promise<void> {
  // Load current metadata
  const metadata = await loadMetadata(sessionDir);

  // Apply updates
  const updated = { ...metadata, ...updates };

  // Save back
  await saveMetadata(sessionDir, updated);
}

/**
 * List all session directories in sessions_dir
 */
export async function listSessionDirs(sessionsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('sess_'))
      .map((entry) => entry.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Sessions dir doesn't exist yet
      return [];
    }
    throw err;
  }
}

/**
 * Check if a session exists
 */
export async function sessionExists(
  sessionsDir: string,
  sessionId: string
): Promise<boolean> {
  const sessionDir = path.join(sessionsDir, sessionId);

  try {
    const stats = await fs.stat(sessionDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Remove a session directory and all its contents
 */
export async function removeSessionDir(
  sessionsDir: string,
  sessionId: string
): Promise<void> {
  const sessionDir = path.join(sessionsDir, sessionId);

  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore if directory doesn't exist
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
