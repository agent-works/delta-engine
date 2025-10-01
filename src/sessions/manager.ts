import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Session } from './session.js';
import {
  SessionConfig,
  SessionNotFoundError,
  ListSessionInfo,
} from './types.js';
import {
  saveMetadata,
  loadMetadata,
  updateMetadata,
  addToIndex,
  removeFromIndex,
  updateIndexEntry,
  listSessionDirs,
  sessionExists,
  removeSessionDir,
} from './storage.js';

/**
 * SessionManager
 * High-level API for managing multiple sessions
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor(private config: SessionConfig) {}

  /**
   * Create a new session
   * @returns session_id
   */
  async createSession(command: string[]): Promise<string> {
    const sessionId = `sess_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const sessionDir = path.join(this.config.sessions_dir, sessionId);

    // Create session
    const session = await Session.create(
      sessionId,
      sessionDir,
      command,
      this.config.sessions_dir
    );

    // Save metadata
    await saveMetadata(sessionDir, session.getMetadata());

    // Add to index
    await addToIndex(this.config.sessions_dir, {
      session_id: sessionId,
      command: command.join(' '),
      status: 'running',
      created_at: session.getMetadata().created_at,
    });

    // Store in memory
    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Get a session by ID
   * Returns null if session doesn't exist or is dead
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Check in-memory cache first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;

      // Verify session is still alive
      if (!session.isAlive()) {
        // Process died, update status
        await updateMetadata(
          path.join(this.config.sessions_dir, sessionId),
          { status: 'dead' }
        );
        await updateIndexEntry(this.config.sessions_dir, sessionId, { status: 'dead' });
        this.sessions.delete(sessionId);
        return null;
      }

      return session;
    }

    // Check if session exists on disk
    const sessionDir = path.join(this.config.sessions_dir, sessionId);
    const exists = await sessionExists(this.config.sessions_dir, sessionId);

    if (!exists) {
      return null;
    }

    // Load metadata
    const metadata = await loadMetadata(sessionDir);

    // Check if process is alive
    if (!Session.isProcessAlive(metadata.pid)) {
      // Process is dead
      await updateMetadata(sessionDir, { status: 'dead' });
      await updateIndexEntry(this.config.sessions_dir, sessionId, { status: 'dead' });
      return null;
    }

    // TODO: Restore session from metadata
    // For now, we don't support reconnecting to existing PTY
    // Sessions are only accessible during the same process lifetime
    return null;
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<ListSessionInfo[]> {
    const sessionDirs = await listSessionDirs(this.config.sessions_dir);
    const sessions: ListSessionInfo[] = [];

    for (const sessionId of sessionDirs) {
      try {
        const sessionDir = path.join(this.config.sessions_dir, sessionId);
        const metadata = await loadMetadata(sessionDir);

        // Check if process is still alive
        const alive = Session.isProcessAlive(metadata.pid);

        // Update status if changed
        if (alive && metadata.status === 'dead') {
          metadata.status = 'running';
          await updateMetadata(sessionDir, { status: 'running' });
          await updateIndexEntry(this.config.sessions_dir, sessionId, { status: 'running' });
        } else if (!alive && metadata.status === 'running') {
          metadata.status = 'dead';
          await updateMetadata(sessionDir, { status: 'dead' });
          await updateIndexEntry(this.config.sessions_dir, sessionId, { status: 'dead' });
        }

        sessions.push({
          session_id: metadata.session_id,
          command: metadata.command.join(' '),
          status: metadata.status,
          pid: metadata.pid,
          created_at: metadata.created_at,
          last_accessed_at: metadata.last_accessed_at,
        });
      } catch (error) {
        // Skip sessions with invalid metadata
        console.error(`Failed to load session ${sessionId}: ${(error as Error).message}`);
      }
    }

    return sessions;
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    // Check if session exists
    const exists = await sessionExists(this.config.sessions_dir, sessionId);
    if (!exists) {
      throw new SessionNotFoundError(sessionId);
    }

    // Get session from memory
    let session = this.sessions.get(sessionId);

    if (session) {
      // Terminate the process
      await session.terminate();
      this.sessions.delete(sessionId);
    } else {
      // Session not in memory, check if process is alive
      const sessionDir = path.join(this.config.sessions_dir, sessionId);
      const metadata = await loadMetadata(sessionDir);

      if (Session.isProcessAlive(metadata.pid)) {
        // Process is still alive, kill it
        try {
          process.kill(metadata.pid, 'SIGTERM');

          // Wait up to 5 seconds
          const maxWait = 5000;
          const startTime = Date.now();

          while (Session.isProcessAlive(metadata.pid) && Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Force kill if still alive
          if (Session.isProcessAlive(metadata.pid)) {
            process.kill(metadata.pid, 'SIGKILL');
          }
        } catch (error) {
          // Process might already be dead
          console.error(`Failed to kill process ${metadata.pid}: ${(error as Error).message}`);
        }

        // Update metadata
        await updateMetadata(sessionDir, { status: 'dead' });
      }
    }

    // Remove from index and delete directory
    await removeFromIndex(this.config.sessions_dir, sessionId);
    await removeSessionDir(this.config.sessions_dir, sessionId);
  }

  /**
   * Cleanup dead sessions
   * Removes directories for sessions whose processes are no longer running
   * @returns Array of cleaned session IDs
   */
  async cleanup(): Promise<string[]> {
    const sessionDirs = await listSessionDirs(this.config.sessions_dir);
    const cleaned: string[] = [];

    for (const sessionId of sessionDirs) {
      try {
        const sessionDir = path.join(this.config.sessions_dir, sessionId);
        const metadata = await loadMetadata(sessionDir);

        // Check if process is dead
        if (!Session.isProcessAlive(metadata.pid)) {
          // Remove session
          await removeFromIndex(this.config.sessions_dir, sessionId);
          await removeSessionDir(this.config.sessions_dir, sessionId);
          this.sessions.delete(sessionId);
          cleaned.push(sessionId);
        }
      } catch (error) {
        // If we can't load metadata, consider it dead and clean it up
        console.error(`Failed to check session ${sessionId}, cleaning up: ${(error as Error).message}`);
        await removeFromIndex(this.config.sessions_dir, sessionId);
        await removeSessionDir(this.config.sessions_dir, sessionId);
        this.sessions.delete(sessionId);
        cleaned.push(sessionId);
      }
    }

    return cleaned;
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<{
    session_id: string;
    status: 'running' | 'dead';
    pid: number;
    alive: boolean;
    uptime_seconds: number;
    command: string[];
  }> {
    const exists = await sessionExists(this.config.sessions_dir, sessionId);
    if (!exists) {
      throw new SessionNotFoundError(sessionId);
    }

    const sessionDir = path.join(this.config.sessions_dir, sessionId);
    const metadata = await loadMetadata(sessionDir);
    const alive = Session.isProcessAlive(metadata.pid);

    // Update status if changed
    if (alive !== (metadata.status === 'running')) {
      const newStatus = alive ? 'running' : 'dead';
      await updateMetadata(sessionDir, { status: newStatus });
      await updateIndexEntry(this.config.sessions_dir, sessionId, { status: newStatus });
      metadata.status = newStatus;
    }

    // Calculate uptime
    const createdAt = new Date(metadata.created_at).getTime();
    const now = Date.now();
    const uptimeSeconds = Math.floor((now - createdAt) / 1000);

    return {
      session_id: sessionId,
      status: metadata.status,
      pid: metadata.pid,
      alive,
      uptime_seconds: uptimeSeconds,
      command: metadata.command,
    };
  }
}
