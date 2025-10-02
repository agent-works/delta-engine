import { spawn } from 'child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SessionMetadata, ReadOptions } from './types.js';
import { loadMetadata } from './storage.js';
import {
  sendSocketRequest,
  cleanupStaleSocket,
} from './socket-utils.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Session class
 * Manages a single PTY-based interactive process session via Unix Socket
 */
export class Session {
  private constructor(
    private sessionId: string,
    private sessionDir: string,
    private socketPath: string,
    private metadata: SessionMetadata
  ) {}

  /**
   * Reconnect to an existing session
   * Used by SessionManager to reconnect to sessions from other processes
   */
  static async reconnect(
    sessionId: string,
    sessionDir: string,
    socketPath: string,
    metadata: SessionMetadata
  ): Promise<Session> {
    return new Session(sessionId, sessionDir, socketPath, metadata);
  }

  /**
   * Create a new session by spawning a detached holder process
   */
  static async create(
    sessionId: string,
    sessionDir: string,
    command: string[]
  ): Promise<Session> {
    const [cmd] = command;

    if (!cmd) {
      throw new Error('Command cannot be empty');
    }

    // Create session directory
    await fs.mkdir(sessionDir, { recursive: true });

    // Socket path - use /tmp to avoid Unix socket path length limit (104 bytes on macOS)
    const socketPath = `/tmp/delta-sock-${sessionId}.sock`;

    // Clean up stale socket if it exists
    await cleanupStaleSocket(socketPath);

    // Path to holder script
    const holderPath = path.join(__dirname, 'holder.js');

    // Spawn detached holder process
    const holderArgs = [
      sessionId,
      sessionDir,
      JSON.stringify(command),
    ];

    const holder = spawn('node', [holderPath, ...holderArgs], {
      detached: true,
      stdio: 'ignore', // Fully detach from parent
    });

    // Unref so parent can exit
    holder.unref();

    // Wait for socket to be created (max 3 seconds)
    const maxWait = 3000;
    const startTime = Date.now();

    while (!await Session.socketExists(socketPath)) {
      if (Date.now() - startTime > maxWait) {
        throw new Error('Timeout waiting for session to start');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Load metadata
    const metadata = await loadMetadata(sessionDir);

    return new Session(sessionId, sessionDir, socketPath, metadata);
  }

  /**
   * Check if socket file exists
   */
  private static async socketExists(socketPath: string): Promise<boolean> {
    try {
      await fs.access(socketPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write input to the session
   */
  async write(input: string): Promise<void> {
    const response = await sendSocketRequest(
      this.socketPath,
      { type: 'write', data: input }
    );

    if (response.status === 'error') {
      throw new Error(response.message);
    }
  }

  /**
   * Read output from the session (destructive - clears buffer)
   */
  async read(): Promise<string> {
    const response = await sendSocketRequest(
      this.socketPath,
      { type: 'read' }
    );

    if (response.status === 'error') {
      throw new Error(response.message);
    }

    return response.output || '';
  }

  /**
   * Peek at output without clearing buffer (non-destructive)
   */
  async peek(): Promise<string> {
    const response = await sendSocketRequest(
      this.socketPath,
      { type: 'peek' }
    );

    if (response.status === 'error') {
      throw new Error(response.message);
    }

    return response.output || '';
  }

  /**
   * Read output with timeout
   * Waits for up to `timeoutMs` milliseconds for new output
   */
  async readWithTimeout(timeoutMs: number, options?: ReadOptions): Promise<string> {
    const startLength = (await this.peek()).length;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;
          const currentOutput = await this.peek();

          // Check if we have new output
          if (currentOutput.length > startLength) {
            clearInterval(checkInterval);
            let output = await this.read();

            // Apply line limit if specified
            if (options?.lines) {
              const lines = output.split('\n');
              output = lines.slice(-options.lines).join('\n');
            }

            resolve(output);
          }

          // Check timeout
          if (elapsed >= timeoutMs) {
            clearInterval(checkInterval);
            let output = await this.read();

            // Apply line limit if specified
            if (options?.lines) {
              const lines = output.split('\n');
              output = lines.slice(-options.lines).join('\n');
            }

            resolve(output);
          }
        } catch (err) {
          clearInterval(checkInterval);
          reject(err);
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * Stream output continuously (for --follow mode)
   * Uses polling-based approach
   */
  async *streamOutput(): AsyncGenerator<string> {
    while (true) {
      const output = await this.peek();

      if (output.length > 0) {
        const chunk = await this.read();
        yield chunk;
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop if holder is dead
      if (!await this.isAlive()) {
        break;
      }
    }
  }

  /**
   * Check if the holder process is alive
   */
  async isAlive(): Promise<boolean> {
    // Reload metadata to get current holder_pid
    try {
      const metadata = await loadMetadata(this.sessionDir);
      return Session.isProcessAlive(metadata.holder_pid);
    } catch {
      return false;
    }
  }

  /**
   * Static method to check if a PID is alive
   */
  static isProcessAlive(pid: number): boolean {
    try {
      // Signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadata {
    return { ...this.metadata };
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get session uptime in seconds
   */
  getUptimeSeconds(): number {
    const createdAt = new Date(this.metadata.created_at).getTime();
    const now = Date.now();
    return Math.floor((now - createdAt) / 1000);
  }

  /**
   * Terminate the session
   * Sends shutdown command to holder
   */
  async terminate(): Promise<void> {
    if (!await this.isAlive()) {
      // Already dead, just clean up socket
      await cleanupStaleSocket(this.socketPath);
      return;
    }

    try {
      // Send shutdown command
      await sendSocketRequest(
        this.socketPath,
        { type: 'shutdown' },
        2000 // 2 second timeout
      );
    } catch {
      // If shutdown fails, try force kill
      const metadata = await loadMetadata(this.sessionDir);
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
      } catch {
        // Process already dead
      }
    }

    // Clean up socket
    await cleanupStaleSocket(this.socketPath);
  }
}
