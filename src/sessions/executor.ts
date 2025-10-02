/**
 * Command Executor - Execute commands in session context
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ExecutionResult, SessionState } from './types.js';
import { SessionStorage } from './storage.js';

/**
 * Command executor for a specific session
 */
export class CommandExecutor {
  private storage: SessionStorage;

  constructor(
    private sessionId: string,
    private sessionDir: string
  ) {
    const sessionsDir = path.dirname(sessionDir);
    this.storage = new SessionStorage(sessionsDir);
  }

  /**
   * Execute a command in the session context
   */
  async execute(command: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Load current session state and metadata
    const state = await this.loadSessionState();
    const metadata = await this.storage.loadMetadata(this.sessionId);

    if (!metadata) {
      throw new Error(`Session ${this.sessionId} metadata not found`);
    }

    // Create wrapper script that:
    // 1. Loads session environment
    // 2. Changes to session working directory
    // 3. Executes user command
    // 4. Saves new state (CWD + env vars)
    const wrapperScript = this.buildWrapperScript(command, state, metadata.command);

    // Execute wrapper script
    const result = await this.executeScript(wrapperScript, state);

    // Load updated state after execution
    await this.saveExecutionState();

    const executionTime = Date.now() - startTime;

    // Record to history (optional, for debugging)
    await this.storage.appendHistory(this.sessionId, {
      timestamp: new Date().toISOString(),
      command,
      exit_code: result.exit_code,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exit_code,
      execution_time_ms: executionTime,
    };
  }

  /**
   * Load session state (working directory + environment)
   */
  private async loadSessionState(): Promise<SessionState> {
    const state = await this.storage.loadState(this.sessionId);

    if (state) {
      return state;
    }

    // Initialize default state (first execution)
    const metadata = await this.storage.loadMetadata(this.sessionId);
    const workDir = metadata?.work_dir || process.cwd();

    const defaultState: SessionState = {
      work_dir: workDir,
      env_vars: { ...process.env } as Record<string, string>,
    };

    await this.storage.saveState(this.sessionId, defaultState);
    return defaultState;
  }

  /**
   * Build wrapper script that executes command in session context
   */
  private buildWrapperScript(command: string, state: SessionState, sessionCommand: string): string {
    const envExports = Object.entries(state.env_vars)
      .map(([key, value]) => `export ${this.escapeShellVar(key)}=${this.escapeShellValue(value)}`)
      .join('\n');

    // Wrapper script:
    // 1. Set environment variables
    // 2. Change to working directory
    // 3. Execute user command via heredoc piped to session's shell/interpreter
    // 4. Capture exit code
    // 5. Save new working directory to temp file
    const tempCwdFile = path.join(this.sessionDir, '.last_cwd');

    return `#!/bin/bash
set +e  # Don't exit on command failure

# Restore session environment
${envExports}

# Change to session working directory
cd "${state.work_dir}" 2>/dev/null || cd "$HOME"

# Execute user command via heredoc piped to session command
${sessionCommand} << 'DELTA_CMD_EOF'
${command}
DELTA_CMD_EOF
EXIT_CODE=$?

# Save current working directory
pwd > "${tempCwdFile}"

exit $EXIT_CODE
`;
  }

  /**
   * Execute wrapper script
   */
  private executeScript(
    script: string,
    state: SessionState
  ): Promise<{ stdout: string; stderr: string; exit_code: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', script], {
        cwd: state.work_dir,
        env: state.env_vars,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exit_code: code ?? 0,
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Save execution state after command runs
   */
  private async saveExecutionState(): Promise<void> {
    // Read new working directory from temp file
    const tempCwdFile = path.join(this.sessionDir, '.last_cwd');
    let newWorkDir: string;

    try {
      newWorkDir = (await fs.readFile(tempCwdFile, 'utf-8')).trim();
    } catch {
      // If temp file not found, keep current working directory
      const currentState = await this.storage.loadState(this.sessionId);
      newWorkDir = currentState?.work_dir || process.cwd();
    }

    // Update session state
    const currentState = await this.storage.loadState(this.sessionId);
    if (currentState) {
      currentState.work_dir = newWorkDir;
      // Note: Environment variables are inherited from shell, not captured here
      // In v1.6+, we could parse `export -p` output to capture env changes
      await this.storage.saveState(this.sessionId, currentState);
    }
  }

  /**
   * Escape shell variable name
   */
  private escapeShellVar(name: string): string {
    // Only allow alphanumeric and underscore
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Escape shell value for safe interpolation
   */
  private escapeShellValue(value: string): string {
    // Use single quotes and escape any single quotes in value
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
