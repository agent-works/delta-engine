import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SessionMetadata, ReadOptions } from './types.js';
import { updateMetadata } from './storage.js';

/**
 * Session class
 * Manages a single interactive process session via GNU screen
 *
 * Note: v1.4.1 switched from node-pty to screen to fix session persistence.
 * Screen daemon holds the PTY Master FDs, allowing sessions to survive
 * CLI process exits.
 */
export class Session {
  private outputLog: fs.FileHandle | null = null;
  private inputLog: fs.FileHandle | null = null;

  private constructor(
    _sessionId: string,
    private sessionDir: string,
    private screenSessionName: string,
    private metadata: SessionMetadata
  ) {}

  /**
   * Create a new session by starting a process in screen
   */
  static async create(
    sessionId: string,
    sessionDir: string,
    command: string[],
    sessionsDir: string
  ): Promise<Session> {
    if (command.length === 0) {
      throw new Error('Command cannot be empty');
    }

    // Ensure session directory exists
    await fs.mkdir(sessionDir, { recursive: true });

    // Use session ID as screen session name
    const screenSessionName = sessionId;

    // Prepare screen log file
    const screenLogFile = path.join(sessionDir, 'screenlog.txt');

    // Start process in detached screen session with logging enabled
    // -d: detached mode (don't attach to current terminal)
    // -m: force creation of new session
    // -L: enable logging
    // -Logfile: specify log file path
    // -S: session name
    const screenArgs = [
      '-dmLS',
      screenSessionName,
      '-Logfile',
      screenLogFile,
      ...command
    ];

    try {
      await execa('screen', screenArgs);
    } catch (error) {
      throw new Error(`Failed to start screen session: ${(error as Error).message}`);
    }

    // Get the PID of the started process
    // We need to extract it from screen -ls output
    const pid = await Session.getScreenSessionPid(screenSessionName);

    if (!pid) {
      throw new Error('Failed to get PID from screen session');
    }

    const metadata: SessionMetadata = {
      session_id: sessionId,
      command,
      pid,
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      status: 'running',
      sessions_dir: sessionsDir,
    };

    const session = new Session(sessionId, sessionDir, screenSessionName, metadata);

    // Initialize log files
    await session.initializeLogs();

    return session;
  }

  /**
   * Get PID of a screen session
   */
  private static async getScreenSessionPid(sessionName: string): Promise<number | null> {
    try {
      // screen -ls returns non-zero and writes to stderr even on success
      const result = await execa('screen', ['-ls', sessionName], { reject: false });
      const output = result.stdout + result.stderr;

      // Output format: "12345.session_name	(...)"
      // Extract the PID (number before the dot)
      const match = output.match(/(\d+)\.\S+/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    } catch (error) {
      console.error(`Failed to get screen PID: ${(error as Error).message}`);
    }
    return null;
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
   * Uses screen's "stuff" command to send input
   */
  async write(input: string): Promise<void> {
    try {
      // screen -S <name> -X stuff "<input>"
      await execa('screen', ['-S', this.screenSessionName, '-X', 'stuff', input]);

      // Log input
      if (this.inputLog) {
        await this.inputLog.write(Buffer.from(input, 'utf-8')).catch((err: Error) => {
          console.error(`Failed to write to input log: ${err.message}`);
        });
      }

      // Update last accessed time
      this.metadata.last_accessed_at = new Date().toISOString();
      await updateMetadata(this.sessionDir, {
        last_accessed_at: this.metadata.last_accessed_at,
      }).catch((err) => {
        console.error(`Failed to update last_accessed_at: ${err.message}`);
      });
    } catch (error) {
      throw new Error(`Failed to write to screen session: ${(error as Error).message}`);
    }
  }

  /**
   * Read output from the session
   * Reads from screen's log file instead of using hardcopy
   */
  async read(): Promise<string> {
    const screenLogFile = path.join(this.sessionDir, 'screenlog.txt');

    try {
      // Read the log file
      let output = '';
      try {
        output = await fs.readFile(screenLogFile, 'utf-8');
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          // Log file doesn't exist yet
          return '';
        }
        throw error;
      }

      // Log output
      if (this.outputLog && output) {
        await this.outputLog.write(Buffer.from(output, 'utf-8')).catch((err: Error) => {
          console.error(`Failed to write to output log: ${err.message}`);
        });
      }

      // Update last accessed time
      this.metadata.last_accessed_at = new Date().toISOString();
      await updateMetadata(this.sessionDir, {
        last_accessed_at: this.metadata.last_accessed_at,
      }).catch((err) => {
        console.error(`Failed to update last_accessed_at: ${err.message}`);
      });

      return output;
    } catch (error) {
      throw new Error(`Failed to read from screen session: ${(error as Error).message}`);
    }
  }

  /**
   * Read output without clearing (peek)
   * Note: With screen, read doesn't clear anyway, so this is the same as read()
   */
  async peek(): Promise<string> {
    return this.read();
  }

  /**
   * Read output with timeout
   * Waits for up to `timeoutMs` milliseconds, polling for output
   */
  async readWithTimeout(timeoutMs: number, options?: ReadOptions): Promise<string> {
    const startTime = Date.now();
    let lastOutput = '';

    // Poll every 200ms
    while (Date.now() - startTime < timeoutMs) {
      const output = await this.read();

      // If output changed, wait a bit more for it to stabilize
      if (output !== lastOutput) {
        lastOutput = output;
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      // Output stable, return it
      if (output) {
        // Apply line limit if specified
        if (options?.lines) {
          const lines = output.split('\n');
          return lines.slice(-options.lines).join('\n');
        }
        return output;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Timeout reached, return whatever we have
    const output = await this.read();
    if (options?.lines) {
      const lines = output.split('\n');
      return lines.slice(-options.lines).join('\n');
    }
    return output;
  }

  /**
   * Stream output continuously (for --follow mode)
   * Note: With screen's hardcopy, this is approximate
   */
  async *streamOutput(): AsyncGenerator<string> {
    let lastOutput = '';

    while (this.isAlive()) {
      const output = await this.read();

      // Only yield if output changed
      if (output !== lastOutput) {
        yield output.slice(lastOutput.length); // Only new content
        lastOutput = output;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Check if the session is alive
   * Checks both the process and screen session existence
   */
  isAlive(): boolean {
    // First check if process exists
    if (!Session.isProcessAlive(this.metadata.pid)) {
      return false;
    }

    // Also verify screen session exists
    try {
      const { stdout } = require('child_process').execSync(`screen -ls ${this.screenSessionName}`, {
        encoding: 'utf-8'
      });
      return stdout.includes(this.screenSessionName);
    } catch {
      // screen -ls returns non-zero if no matching session
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
   * Sends quit command to screen, which terminates the process
   */
  async terminate(): Promise<void> {
    if (!this.isAlive()) {
      // Already dead
      await this.closeLogs();
      return;
    }

    try {
      // screen -S <name> -X quit
      await execa('screen', ['-S', this.screenSessionName, '-X', 'quit']);

      // Wait a bit for process to die
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      // May fail if session already dead
      console.error(`Failed to quit screen session: ${(error as Error).message}`);
    }

    // If process still alive, force kill
    if (this.isAlive()) {
      try {
        process.kill(this.metadata.pid, 'SIGKILL');
      } catch {
        // Ignore errors
      }
    }

    // Close logs
    await this.closeLogs();

    // Update metadata
    this.metadata.status = 'dead';
    await updateMetadata(this.sessionDir, { status: 'dead' });
  }

  /**
   * Check if screen is available on the system
   */
  static async checkScreenAvailable(): Promise<void> {
    try {
      await execa('which', ['screen']);
    } catch {
      throw new Error(
        'GNU screen is not installed. Session management requires screen.\n\n' +
          'Installation instructions:\n' +
          '  macOS:          brew install screen\n' +
          '  Ubuntu/Debian:  sudo apt install screen\n' +
          '  Fedora/RHEL:    sudo yum install screen\n\n' +
          'Verify installation with: which screen'
      );
    }
  }
}
