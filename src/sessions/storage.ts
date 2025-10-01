import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  SessionMetadata,
  SessionMetadataSchema,
  SessionIndex,
  SessionIndexSchema,
} from './types.js';

/**
 * Save session metadata to disk
 */
export async function saveMetadata(
  sessionDir: string,
  metadata: SessionMetadata
): Promise<void> {
  await fs.mkdir(sessionDir, { recursive: true });

  // Save metadata.json
  const metadataPath = path.join(sessionDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

  // Save pid file (for quick checks)
  const pidPath = path.join(sessionDir, 'pid');
  await fs.writeFile(pidPath, metadata.pid.toString(), 'utf-8');
}

/**
 * Load session metadata from disk
 * @throws {Error} if metadata file doesn't exist or is invalid
 */
export async function loadMetadata(sessionDir: string): Promise<SessionMetadata> {
  const metadataPath = path.join(sessionDir, 'metadata.json');

  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    const data = JSON.parse(content);
    return SessionMetadataSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Session metadata not found: ${sessionDir}`);
    }
    throw new Error(`Failed to load session metadata: ${(error as Error).message}`);
  }
}

/**
 * Update session metadata (partial update)
 */
export async function updateMetadata(
  sessionDir: string,
  updates: Partial<SessionMetadata>
): Promise<void> {
  const metadata = await loadMetadata(sessionDir);
  const updated = { ...metadata, ...updates };
  await saveMetadata(sessionDir, updated);
}

/**
 * Load PID from pid file (faster than loading full metadata)
 */
export async function loadPid(sessionDir: string): Promise<number> {
  const pidPath = path.join(sessionDir, 'pid');
  try {
    const content = await fs.readFile(pidPath, 'utf-8');
    return parseInt(content.trim(), 10);
  } catch (error) {
    throw new Error(`Failed to load PID: ${(error as Error).message}`);
  }
}

/**
 * Save session index
 */
export async function saveIndex(
  sessionsDir: string,
  index: SessionIndex
): Promise<void> {
  const indexPath = path.join(sessionsDir, 'index.json');
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Load session index
 * Returns empty index if file doesn't exist
 */
export async function loadIndex(sessionsDir: string): Promise<SessionIndex> {
  const indexPath = path.join(sessionsDir, 'index.json');

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const data = JSON.parse(content);
    return SessionIndexSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return empty index if file doesn't exist
      return { sessions: [] };
    }
    throw new Error(`Failed to load session index: ${(error as Error).message}`);
  }
}

/**
 * Add session to index
 */
export async function addToIndex(
  sessionsDir: string,
  sessionInfo: {
    session_id: string;
    command: string;
    status: 'running' | 'dead';
    created_at: string;
  }
): Promise<void> {
  const index = await loadIndex(sessionsDir);

  // Check if session already exists
  const existingIndex = index.sessions.findIndex((s) => s.session_id === sessionInfo.session_id);

  if (existingIndex >= 0) {
    // Update existing entry
    index.sessions[existingIndex] = sessionInfo;
  } else {
    // Add new entry
    index.sessions.push(sessionInfo);
  }

  await saveIndex(sessionsDir, index);
}

/**
 * Remove session from index
 */
export async function removeFromIndex(
  sessionsDir: string,
  sessionId: string
): Promise<void> {
  const index = await loadIndex(sessionsDir);
  index.sessions = index.sessions.filter((s) => s.session_id !== sessionId);
  await saveIndex(sessionsDir, index);
}

/**
 * Update index entry (e.g., change status)
 */
export async function updateIndexEntry(
  sessionsDir: string,
  sessionId: string,
  updates: Partial<{
    command: string;
    status: 'running' | 'dead';
    created_at: string;
  }>
): Promise<void> {
  const index = await loadIndex(sessionsDir);
  const entryIndex = index.sessions.findIndex((s) => s.session_id === sessionId);

  if (entryIndex >= 0) {
    const currentEntry = index.sessions[entryIndex]!;
    index.sessions[entryIndex] = {
      session_id: currentEntry.session_id,
      command: updates.command !== undefined ? updates.command : currentEntry.command,
      status: updates.status !== undefined ? updates.status : currentEntry.status,
      created_at: updates.created_at !== undefined ? updates.created_at : currentEntry.created_at,
    };
    await saveIndex(sessionsDir, index);
  }
}

/**
 * List all session directories
 */
export async function listSessionDirs(sessionsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('sess_'))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Check if session directory exists
 */
export async function sessionExists(sessionsDir: string, sessionId: string): Promise<boolean> {
  const sessionDir = path.join(sessionsDir, sessionId);
  try {
    const stat = await fs.stat(sessionDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Remove session directory
 */
export async function removeSessionDir(sessionsDir: string, sessionId: string): Promise<void> {
  const sessionDir = path.join(sessionsDir, sessionId);
  await fs.rm(sessionDir, { recursive: true, force: true });
}
