import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HookDefinition } from './types.js';
import {
  HookInputContext,
  HookControlOutput,
  HookExecutionMeta
} from './journal-types.js';
import { Journal } from './journal.js';

/**
 * Hook Executor - Implements the File-Based IPC protocol for lifecycle hooks
 * According to v1.1 spec Section 6.4
 */
export class HookExecutor {
  private readonly journal: Journal;
  private readonly workDir: string;
  private readonly runId: string;
  private readonly runtimeIoDir: string;
  private stepCounter: number = 0;

  constructor(journal: Journal, workDir: string, runId: string) {
    this.journal = journal;
    this.workDir = workDir;
    this.runId = runId;
    this.runtimeIoDir = path.join(
      workDir,
      '.delta',
      'runs',
      runId,
      'runtime_io'
    );
  }

  /**
   * Execute a lifecycle hook according to the protocol (Section 6.4.2)
   * @param hookName - Name of the hook (e.g., 'pre_llm_req')
   * @param hookDef - Hook definition from config
   * @param payload - Data to pass to the hook
   * @param agentPath - Path to agent directory for ${AGENT_HOME} substitution
   * @returns Hook execution result
   */
  async executeHook(
    hookName: string,
    hookDef: HookDefinition,
    payload: any,
    agentPath: string
  ): Promise<{
    success: boolean;
    output?: any;
    control?: HookControlOutput;
    error?: string;
    ioPathRef: string;
  }> {
    this.stepCounter++;

    // Create hook invocation directory name
    const hookDirName = `${String(this.stepCounter).padStart(3, '0')}_${hookName}`;
    const hookPath = path.join(this.runtimeIoDir, 'hooks', hookDirName);
    const ioPathRef = `runtime_io/hooks/${hookDirName}/`;

    try {
      // ============================================
      // 1. PREPARE: Create directory structure and write input
      // ============================================
      const inputDir = path.join(hookPath, 'input');
      const outputDir = path.join(hookPath, 'output');
      const executionMetaDir = path.join(hookPath, 'execution_meta');

      await fs.mkdir(inputDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });
      await fs.mkdir(executionMetaDir, { recursive: true });

      // Write input context
      const context: HookInputContext = {
        hook_name: hookName,
        step_index: this.stepCounter,
        run_id: this.runId,
        timestamp: new Date().toISOString(),
      };

      await fs.writeFile(
        path.join(inputDir, 'context.json'),
        JSON.stringify(context, null, 2),
        'utf-8'
      );

      // Write payload based on type
      if (payload !== undefined) {
        const payloadFile = typeof payload === 'string'
          ? 'payload.dat'
          : hookName === 'pre_llm_req'
            ? 'proposed_payload.json'
            : 'payload.json';

        const payloadContent = typeof payload === 'string'
          ? payload
          : JSON.stringify(payload, null, 2);

        await fs.writeFile(
          path.join(inputDir, payloadFile),
          payloadContent,
          'utf-8'
        );
      }

      // ============================================
      // 2. EXECUTE: Run the external command
      // ============================================

      // Substitute ${AGENT_HOME} in command
      const command = hookDef.command.map(part =>
        part.replace(/\$\{AGENT_HOME\}/g, agentPath)
      );

      const startTime = Date.now();

      // Execute with proper environment and CWD
      const result = await this.runCommand(
        command,
        {
          cwd: this.workDir, // CWD must be workspace root (Section 6.4.2)
          env: {
            ...process.env,
            DELTA_RUN_ID: this.runId,
            DELTA_HOOK_IO_PATH: hookPath, // Absolute path to invocation directory
          },
          timeout: hookDef.timeout_ms,
        }
      );

      const duration = Date.now() - startTime;

      // ============================================
      // 3. CAPTURE: Save execution metadata
      // ============================================
      const executionMeta: HookExecutionMeta = {
        command: command.join(' '),
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        duration_ms: duration,
      };

      await this.saveExecutionMeta(executionMetaDir, executionMeta);

      // ============================================
      // 4. INGEST: Read output if successful
      // ============================================
      let output: any = undefined;
      let control: HookControlOutput | undefined = undefined;

      if (result.exitCode === 0) {
        // Try to read output files
        try {
          // Check for payload override (for pre_llm_req hook)
          const finalPayloadPath = path.join(outputDir, 'final_payload.json');
          if (await this.fileExists(finalPayloadPath)) {
            const content = await fs.readFile(finalPayloadPath, 'utf-8');
            output = JSON.parse(content);
          } else {
            // Try generic payload override
            const payloadOverridePath = path.join(outputDir, 'payload_override.dat');
            if (await this.fileExists(payloadOverridePath)) {
              output = await fs.readFile(payloadOverridePath, 'utf-8');
            }
          }

          // Try to read control output
          const controlPath = path.join(outputDir, 'control.json');
          if (await this.fileExists(controlPath)) {
            const content = await fs.readFile(controlPath, 'utf-8');
            control = JSON.parse(content) as HookControlOutput;
          }
        } catch (error) {
          console.warn(`Warning: Failed to read hook output: ${error}`);
        }
      }

      // ============================================
      // 5. AUDIT: Log hook execution
      // ============================================
      await this.journal.logHookExecution(
        hookName,
        result.exitCode === 0 ? 'SUCCESS' : 'FAILED',
        ioPathRef
      );

      return {
        success: result.exitCode === 0,
        output,
        control,
        ioPathRef,
      };

    } catch (error) {
      // Log failure audit event
      await this.journal.logHookExecution(
        hookName,
        'FAILED',
        ioPathRef
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ioPathRef,
      };
    }
  }

  /**
   * Run a command with timeout support
   */
  private async runCommand(
    command: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeout?: number;
    }
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command;

      if (!cmd) {
        resolve({
          stdout: '',
          stderr: 'No command provided',
          exitCode: 1,
        });
        return;
      }

      const child = spawn(cmd, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set timeout if specified
      let timeoutHandle: NodeJS.Timeout | null = null;
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          // Force kill after grace period
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // Ignore if process already dead
            }
          }, 1000);
        }, options.timeout);
      }

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? -1 : (code ?? 1),
        });
      });

      child.on('error', (error: Error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        resolve({
          stdout,
          stderr: stderr + `\nCommand execution error: ${error.message}`,
          exitCode: 1,
        });
      });
    });
  }

  /**
   * Save execution metadata to files
   */
  private async saveExecutionMeta(
    dir: string,
    meta: HookExecutionMeta
  ): Promise<void> {
    await Promise.all([
      fs.writeFile(path.join(dir, 'command.txt'), meta.command, 'utf-8'),
      fs.writeFile(path.join(dir, 'stdout.log'), meta.stdout, 'utf-8'),
      fs.writeFile(path.join(dir, 'stderr.log'), meta.stderr, 'utf-8'),
      fs.writeFile(path.join(dir, 'exit_code.txt'), String(meta.exit_code), 'utf-8'),
      fs.writeFile(path.join(dir, 'duration_ms.txt'), String(meta.duration_ms), 'utf-8'),
    ]);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute pre_llm_req hook specifically
   * This hook can modify the LLM request payload
   */
  async executePreLLMReqHook(
    hookDef: HookDefinition,
    proposedPayload: any,
    agentPath: string
  ): Promise<{
    success: boolean;
    finalPayload?: any;
    error?: string;
  }> {
    const result = await this.executeHook(
      'pre_llm_req',
      hookDef,
      proposedPayload,
      agentPath
    );

    return {
      success: result.success,
      finalPayload: result.output || proposedPayload,
      error: result.error,
    };
  }

  /**
   * Execute post_llm_resp hook
   * This hook receives the LLM response
   */
  async executePostLLMRespHook(
    hookDef: HookDefinition,
    response: any,
    agentPath: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await this.executeHook(
      'post_llm_resp',
      hookDef,
      response,
      agentPath
    );

    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Execute pre_tool_exec hook
   * This hook can intercept tool execution
   */
  async executePreToolExecHook(
    hookDef: HookDefinition,
    toolInfo: {
      tool_name: string;
      tool_args: Record<string, any>;
      resolved_command: string;
    },
    agentPath: string
  ): Promise<{
    success: boolean;
    control?: HookControlOutput;
    error?: string;
  }> {
    const result = await this.executeHook(
      'pre_tool_exec',
      hookDef,
      toolInfo,
      agentPath
    );

    return {
      success: result.success,
      control: result.control,
      error: result.error,
    };
  }

  /**
   * Execute post_tool_exec hook
   * This hook receives tool execution results
   */
  async executePostToolExecHook(
    hookDef: HookDefinition,
    executionResult: {
      tool_name: string;
      exit_code: number;
      stdout: string;
      stderr: string;
    },
    agentPath: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await this.executeHook(
      'post_tool_exec',
      hookDef,
      executionResult,
      agentPath
    );

    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Execute on_error hook
   * This hook is called when an error occurs
   */
  async executeOnErrorHook(
    hookDef: HookDefinition,
    errorInfo: {
      error_type: string;
      message: string;
      context?: any;
    },
    agentPath: string
  ): Promise<{
    success: boolean;
    control?: HookControlOutput;
    error?: string;
  }> {
    const result = await this.executeHook(
      'on_error',
      hookDef,
      errorInfo,
      agentPath
    );

    return {
      success: result.success,
      control: result.control,
      error: result.error,
    };
  }
}

/**
 * Create a HookExecutor instance
 */
export function createHookExecutor(
  journal: Journal,
  workDir: string,
  runId: string
): HookExecutor {
  return new HookExecutor(journal, workDir, runId);
}