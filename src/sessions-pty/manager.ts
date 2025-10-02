import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Session } from './session.js';
import {
  SessionConfig,
  SessionNotFoundError,
  ListSessionInfo,
} from './types.js';
import {
  loadMetadata,
  updateMetadata,
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
      command
    );

    // Store in memory
    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Get a session by ID
   * Returns null if session doesn't exist or holder is dead
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Check in-memory cache first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;

      // Verify session is still alive
      if (!await session.isAlive()) {
        // Holder died, update status
        const sessionDir = path.join(this.config.sessions_dir, sessionId);
        await updateMetadata(sessionDir, { status: 'dead' });
        this.sessions.delete(sessionId);
        return null;
      }

      return session;
    }

    // Check if session exists on disk
    const exists = await sessionExists(this.config.sessions_dir, sessionId);

    if (!exists) {
      return null;
    }

    // Load session from disk and reconnect via socket
    const sessionDir = path.join(this.config.sessions_dir, sessionId);
    const metadata = await loadMetadata(sessionDir);

    // Check if holder is alive
    if (!Session.isProcessAlive(metadata.holder_pid)) {
      // Holder is dead, update status
      await updateMetadata(sessionDir, { status: 'dead' });
      return null;
    }

    // Reconnect to session via socket - use /tmp path (same as create)
    const socketPath = `/tmp/delta-sock-${sessionId}.sock`;
    const session = await Session.reconnect(sessionId, sessionDir, socketPath, metadata);

    // Cache in memory
    this.sessions.set(sessionId, session);

    return session;
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

        // Check if holder is still alive
        const alive = Session.isProcessAlive(metadata.holder_pid);

        // Update status if changed
        if (alive && metadata.status === 'dead') {
          metadata.status = 'running';
          await updateMetadata(sessionDir, { status: 'running' });
        } else if (!alive && metadata.status === 'running') {
          metadata.status = 'dead';
          await updateMetadata(sessionDir, { status: 'dead' });
        }

        sessions.push({
          session_id: metadata.session_id,
          command: metadata.command.join(' '),
          status: metadata.status,
          pid: metadata.pid,
          holder_pid: metadata.holder_pid,
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
      // Terminate the session
      await session.terminate();
      this.sessions.delete(sessionId);
    } else {
      // Session not in memory, try to kill holder directly
      const sessionDir = path.join(this.config.sessions_dir, sessionId);
      const metadata = await loadMetadata(sessionDir);

      if (Session.isProcessAlive(metadata.holder_pid)) {
        // Holder is still alive, kill it
        try {
          process.kill(metadata.holder_pid, 'SIGTERM');

          // Wait up to 2 seconds
          const maxWait = 2000;
          const startTime = Date.now();

          while (Session.isProcessAlive(metadata.holder_pid) && Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Force kill if still alive
          if (Session.isProcessAlive(metadata.holder_pid)) {
            process.kill(metadata.holder_pid, 'SIGKILL');
          }
        } catch (error) {
          // Process might already be dead
          console.error(`Failed to kill holder ${metadata.holder_pid}: ${(error as Error).message}`);
        }

        // Update metadata
        await updateMetadata(sessionDir, { status: 'dead' });
      }
    }

    // Remove session directory
    await removeSessionDir(this.config.sessions_dir, sessionId);
  }

  /**
   * Cleanup dead sessions
   * Removes directories for sessions whose holders are no longer running
   * @returns Array of cleaned session IDs
   */
  async cleanup(): Promise<string[]> {
    const sessionDirs = await listSessionDirs(this.config.sessions_dir);
    const cleaned: string[] = [];

    for (const sessionId of sessionDirs) {
      try {
        const sessionDir = path.join(this.config.sessions_dir, sessionId);
        const metadata = await loadMetadata(sessionDir);

        // Check if holder is dead
        if (!Session.isProcessAlive(metadata.holder_pid)) {
          // Remove session
          await removeSessionDir(this.config.sessions_dir, sessionId);
          this.sessions.delete(sessionId);
          cleaned.push(sessionId);
        }
      } catch (error) {
        // If we can't load metadata, consider it dead and clean it up
        console.error(`Failed to check session ${sessionId}, cleaning up: ${(error as Error).message}`);
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
    holder_pid: number;
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
    const alive = Session.isProcessAlive(metadata.holder_pid);

    // Update status if changed
    if (alive !== (metadata.status === 'running')) {
      const newStatus = alive ? 'running' : 'dead';
      await updateMetadata(sessionDir, { status: newStatus });
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
      holder_pid: metadata.holder_pid,
      alive,
      uptime_seconds: uptimeSeconds,
      command: metadata.command,
    };
  }
}
