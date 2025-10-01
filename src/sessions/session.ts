import * as pty from 'node-pty';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SessionMetadata, ReadOptions } from './types.js';
import { loadMetadata, updateMetadata } from './storage.js';

/**
 * Maximum in-memory buffer size (1MB)
 */
const MAX_BUFFER_SIZE = 1024 * 1024;

/**
 * Session class
 * Manages a single PTY-based interactive process session
 */
export class Session {
  private outputBuffer: string = '';
  private outputLog: fs.FileHandle | null = null;
  private inputLog: fs.FileHandle | null = null;

  private constructor(
    private sessionId: string,
    private sessionDir: string,
    private ptyProcess: pty.IPty,
    private metadata: SessionMetadata
  ) {
    // Set up output buffering and logging
    this.setupOutputHandling();
  }

  /**
   * Create a new session by starting a PTY process
   */
  static async create(
    sessionId: string,
    sessionDir: string,
    command: string[],
    sessionsDir: string
  ): Promise<Session> {
    const [cmd, ...args] = command;

    if (!cmd) {
      throw new Error('Command cannot be empty');
    }

    // Start PTY process
    const ptyProcess = pty.spawn(cmd, args, {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string },
    });

    const metadata: SessionMetadata = {
      session_id: sessionId,
      command,
      pid: ptyProcess.pid,
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      status: 'running',
      sessions_dir: sessionsDir,
    };

    const session = new Session(sessionId, sessionDir, ptyProcess, metadata);

    // Initialize log files
    await session.initializeLogs();

    return session;
  }

  /**
   * Restore a session from existing metadata
   * Note: This doesn't restart the process, just reconnects to existing PTY
   * (Not fully implemented - for future enhancement)
   */
  static async restore(sessionDir: string): Promise<Session | null> {
    const metadata = await loadMetadata(sessionDir);

    // Check if process is still alive
    if (!Session.isProcessAlive(metadata.pid)) {
      // Process is dead, update metadata and return null
      await updateMetadata(sessionDir, { status: 'dead' });
      return null;
    }

    // TODO: Reconnect to existing PTY
    // This is complex and not critical for v1.4
    // For now, we create new sessions each time
    throw new Error('Session restoration not yet implemented');
  }

  /**
   * Set up output handling (buffering and logging)
   */
  private setupOutputHandling(): void {
    this.ptyProcess.onData((data: string) => {
      // Add to buffer
      this.outputBuffer += data;

      // Limit buffer size
      if (this.outputBuffer.length > MAX_BUFFER_SIZE) {
        this.outputBuffer = this.outputBuffer.slice(-MAX_BUFFER_SIZE);
      }

      // Write to log file (async, don't wait)
      if (this.outputLog) {
        this.outputLog.write(Buffer.from(data, 'utf-8')).catch((err: Error) => {
          console.error(`Failed to write to output log: ${err.message}`);
        });
      }
    });

    // Handle process exit
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${this.sessionId} exited with code ${exitCode}, signal ${signal}`);
      this.metadata.status = 'dead';
      // Update metadata on disk
      updateMetadata(this.sessionDir, { status: 'dead' }).catch((err) => {
        console.error(`Failed to update metadata on exit: ${err.message}`);
      });
      // Close log files
      this.closeLogs();
    });
  }

  /**
   * Initialize log files
   */
  private async initializeLogs(): Promise<void> {
    try {
      const outputLogPath = path.join(this.sessionDir, 'output.log');
      const inputLogPath = path.join(this.sessionDir, 'input.log');

      this.outputLog = await fs.open(outputLogPath, 'a');
      this.inputLog = await fs.open(inputLogPath, 'a');
    } catch (error) {
      console.error(`Failed to initialize logs: ${(error as Error).message}`);
    }
  }

  /**
   * Close log files
   */
  private async closeLogs(): Promise<void> {
    try {
      if (this.outputLog) {
        await this.outputLog.close();
        this.outputLog = null;
      }
      if (this.inputLog) {
        await this.inputLog.close();
        this.inputLog = null;
      }
    } catch (error) {
      console.error(`Failed to close logs: ${(error as Error).message}`);
    }
  }

  /**
   * Write input to the session
   */
  write(input: string): void {
    this.ptyProcess.write(input);

    // Log input (async, don't wait)
    if (this.inputLog) {
      this.inputLog.write(Buffer.from(input, 'utf-8')).catch((err: Error) => {
        console.error(`Failed to write to input log: ${err.message}`);
      });
    }

    // Update last accessed time
    this.metadata.last_accessed_at = new Date().toISOString();
    updateMetadata(this.sessionDir, {
      last_accessed_at: this.metadata.last_accessed_at,
    }).catch((err) => {
      console.error(`Failed to update last_accessed_at: ${err.message}`);
    });
  }

  /**
   * Read output and clear buffer
   */
  read(): string {
    const output = this.outputBuffer;
    this.outputBuffer = '';

    // Update last accessed time
    this.metadata.last_accessed_at = new Date().toISOString();
    updateMetadata(this.sessionDir, {
      last_accessed_at: this.metadata.last_accessed_at,
    }).catch((err) => {
      console.error(`Failed to update last_accessed_at: ${err.message}`);
    });

    return output;
  }

  /**
   * Read output without clearing buffer (peek)
   */
  peek(): string {
    return this.outputBuffer;
  }

  /**
   * Read output with timeout
   * Waits for up to `timeoutMs` milliseconds for new output
   */
  async readWithTimeout(timeoutMs: number, options?: ReadOptions): Promise<string> {
    const startLength = this.outputBuffer.length;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Check if we have new output
        if (this.outputBuffer.length > startLength) {
          clearInterval(checkInterval);
          let output = this.outputBuffer.slice(startLength);
          this.outputBuffer = '';

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
          let output = this.outputBuffer.slice(startLength);
          this.outputBuffer = '';

          // Apply line limit if specified
          if (options?.lines) {
            const lines = output.split('\n');
            output = lines.slice(-options.lines).join('\n');
          }

          resolve(output);
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * Stream output continuously (for --follow mode)
   */
  async *streamOutput(): AsyncGenerator<string> {
    while (true) {
      if (this.outputBuffer.length > 0) {
        const output = this.outputBuffer;
        this.outputBuffer = '';
        yield output;
      }
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop if process is dead
      if (!this.isAlive()) {
        break;
      }
    }
  }

  /**
   * Check if the process is alive
   */
  isAlive(): boolean {
    return Session.isProcessAlive(this.metadata.pid);
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
   * Get process ID
   */
  getPid(): number {
    return this.metadata.pid;
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadata {
    return { ...this.metadata };
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
   * Sends SIGTERM, waits, then sends SIGKILL if needed
   */
  async terminate(): Promise<void> {
    if (!this.isAlive()) {
      // Already dead
      await this.closeLogs();
      return;
    }

    // Send SIGTERM
    this.ptyProcess.kill('SIGTERM');

    // Wait up to 5 seconds for graceful shutdown
    const maxWait = 5000;
    const startTime = Date.now();

    while (this.isAlive() && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // If still alive, force kill
    if (this.isAlive()) {
      this.ptyProcess.kill('SIGKILL');
      // Wait a bit for kill to take effect
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Close logs
    await this.closeLogs();

    // Update metadata
    this.metadata.status = 'dead';
    await updateMetadata(this.sessionDir, { status: 'dead' });
  }
}
