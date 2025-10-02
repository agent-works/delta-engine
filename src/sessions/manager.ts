/**
 * Session Manager - High-level session lifecycle management
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SessionMetadata,
  SessionManagerConfig,
  ExecutionResult,
  ListSessionInfo,
} from './types.js';
import { SessionStorage } from './storage.js';
import { CommandExecutor } from './executor.js';

/**
 * Session manager for creating, executing, and terminating sessions
 */
export class SessionManager {
  private storage: SessionStorage;

  constructor(config: SessionManagerConfig) {
    this.storage = new SessionStorage(config.sessions_dir);
  }

  /**
   * Create a new session
   * @param command Shell command (default: 'bash')
   * @returns Session ID
   */
  async createSession(command: string = 'bash'): Promise<string> {
    const sessionId = this.generateSessionId();
    const workDir = process.cwd();

    // Create session directory
    await this.storage.createSessionDir(sessionId);

    // Create metadata
    const metadata: SessionMetadata = {
      session_id: sessionId,
      command,
      created_at: new Date().toISOString(),
      status: 'active',
      work_dir: workDir,
      execution_count: 0,
    };

    await this.storage.saveMetadata(metadata);

    return sessionId;
  }

  /**
   * Get session metadata
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    return await this.storage.loadMetadata(sessionId);
  }

  /**
   * Execute command in session
   */
  async executeCommand(sessionId: string, command: string): Promise<ExecutionResult> {
    // Validate session exists
    const metadata = await this.storage.loadMetadata(sessionId);
    if (!metadata) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (metadata.status === 'terminated') {
      throw new Error(`Session ${sessionId} is terminated`);
    }

    // Execute command
    const sessionDir = this.storage.getSessionDir(sessionId);
    const executor = new CommandExecutor(sessionId, sessionDir);
    const result = await executor.execute(command);

    // Update metadata (execution count + last executed time)
    metadata.execution_count += 1;
    metadata.last_executed_at = new Date().toISOString();
    await this.storage.saveMetadata(metadata);

    return result;
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const metadata = await this.storage.loadMetadata(sessionId);
    if (!metadata) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update status to terminated
    metadata.status = 'terminated';
    await this.storage.saveMetadata(metadata);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<ListSessionInfo[]> {
    const sessionIds = await this.storage.listSessionIds();

    const sessions: ListSessionInfo[] = [];
    for (const sessionId of sessionIds) {
      const metadata = await this.storage.loadMetadata(sessionId);
      if (metadata) {
        sessions.push({
          session_id: metadata.session_id,
          command: metadata.command,
          status: metadata.status,
          created_at: metadata.created_at,
          last_executed_at: metadata.last_executed_at,
          execution_count: metadata.execution_count,
        });
      }
    }

    return sessions;
  }

  /**
   * Cleanup terminated sessions
   * @returns Array of cleaned session IDs
   */
  async cleanup(): Promise<string[]> {
    const sessionIds = await this.storage.listSessionIds();
    const cleaned: string[] = [];

    for (const sessionId of sessionIds) {
      const metadata = await this.storage.loadMetadata(sessionId);

      // Delete if terminated or metadata corrupt
      if (!metadata || metadata.status === 'terminated') {
        await this.storage.deleteSession(sessionId);
        cleaned.push(sessionId);
      }
    }

    return cleaned;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const uuid = uuidv4();
    const shortId = uuid.split('-')[0]; // Use first segment for brevity
    return `sess_${shortId}`;
  }
}
