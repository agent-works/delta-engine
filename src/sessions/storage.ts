/**
 * Session Storage - Metadata and state persistence
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SessionMetadata, SessionState } from './types.js';
import { SessionMetadataSchema, SessionStateSchema } from './types.js';

/**
 * Session storage operations
 */
export class SessionStorage {
  constructor(private sessionsDir: string) {}

  /**
   * Get session directory path
   */
  getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * Get metadata file path
   */
  private getMetadataPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'metadata.json');
  }

  /**
   * Get state file path
   */
  private getStatePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'state.json');
  }

  /**
   * Create session directory structure
   */
  async createSessionDir(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
  }

  /**
   * Check if session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      await fs.access(this.getMetadataPath(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save session metadata
   */
  async saveMetadata(metadata: SessionMetadata): Promise<void> {
    const metadataPath = this.getMetadataPath(metadata.session_id);
    const content = JSON.stringify(metadata, null, 2);
    await fs.writeFile(metadataPath, content, 'utf-8');
  }

  /**
   * Load session metadata
   */
  async loadMetadata(sessionId: string): Promise<SessionMetadata | null> {
    try {
      const metadataPath = this.getMetadataPath(sessionId);
      const content = await fs.readFile(metadataPath, 'utf-8');
      const data = JSON.parse(content);
      return SessionMetadataSchema.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save session state (working directory + environment)
   */
  async saveState(sessionId: string, state: SessionState): Promise<void> {
    const statePath = this.getStatePath(sessionId);
    const content = JSON.stringify(state, null, 2);
    await fs.writeFile(statePath, content, 'utf-8');
  }

  /**
   * Load session state
   */
  async loadState(sessionId: string): Promise<SessionState | null> {
    try {
      const statePath = this.getStatePath(sessionId);
      const content = await fs.readFile(statePath, 'utf-8');
      const data = JSON.parse(content);
      return SessionStateSchema.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete session directory
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors (session may already be deleted)
    }
  }

  /**
   * List all session IDs
   */
  async listSessionIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('sess_'))
        .map((entry) => entry.name);
    } catch (error) {
      // Sessions directory doesn't exist yet
      return [];
    }
  }

  /**
   * Append to execution history log (optional, for debugging)
   */
  async appendHistory(
    sessionId: string,
    entry: { timestamp: string; command: string; exit_code: number }
  ): Promise<void> {
    const historyPath = path.join(this.getSessionDir(sessionId), 'history.log');
    const line = JSON.stringify(entry) + '\n';
    try {
      await fs.appendFile(historyPath, line, 'utf-8');
    } catch {
      // Ignore errors (history is optional)
    }
  }
}
