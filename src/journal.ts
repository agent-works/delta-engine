import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  JournalEvent,
  JournalEventType,
  DeltaRunMetadata,
  RunStatus,
  LLMInvocationRequest,
  LLMInvocationResponse,
  LLMInvocationMetadata,
  ToolExecutionRecord,
  HookInputContext,
  HookControlOutput,
  HookExecutionMeta,
} from './journal-types.js';

/**
 * Journal service for managing execution logs according to v1.1 spec
 * Implements the "Journal vs Log" distinction (Section 5.4.1)
 * - journal.jsonl: Authoritative execution log (T-A-O loop)
 * - engine.log: Raw engine process stdout/stderr
 */
export class Journal {
  private readonly runId: string;
  private readonly runDir: string;
  private readonly journalPath: string;
  private readonly metadataPath: string;
  private readonly engineLogPath: string;
  private readonly runtimeIoDir: string;

  private sequenceNumber: number = 0;
  private writePromise: Promise<void> = Promise.resolve();
  private engineLogStream: fs.FileHandle | null = null;

  /**
   * Initialize the Journal service
   * @param runId - Unique run identifier
   * @param runDir - .delta/runs/<RUN_ID>/ directory path
   */
  constructor(runId: string, runDir: string) {
    this.runId = runId;
    this.runDir = runDir;

    // Setup paths according to v1.1 spec (Section 5.4)
    this.journalPath = path.join(runDir, 'execution', 'journal.jsonl');
    this.metadataPath = path.join(runDir, 'execution', 'metadata.json');
    this.engineLogPath = path.join(runDir, 'execution', 'engine.log');
    this.runtimeIoDir = path.join(runDir, 'runtime_io');
  }

  /**
   * Initialize the run directory structure and load existing sequence number
   */
  async initialize(): Promise<void> {
    // Create directory structure according to Section 5.4
    await fs.mkdir(path.join(this.runDir, 'execution'), { recursive: true });
    await fs.mkdir(path.join(this.runDir, 'configuration'), { recursive: true });
    await fs.mkdir(path.join(this.runtimeIoDir, 'hooks'), { recursive: true });
    await fs.mkdir(path.join(this.runtimeIoDir, 'invocations'), { recursive: true });
    await fs.mkdir(path.join(this.runtimeIoDir, 'tool_executions'), { recursive: true });

    // Load existing sequence number if journal exists
    try {
      const events = await this.readJournal();
      if (events.length > 0) {
        // Resume from the last sequence number
        const lastEvent = events[events.length - 1];
        if (lastEvent) {
          this.sequenceNumber = lastEvent.seq;
        }
      }
    } catch (error) {
      // Journal doesn't exist yet, start from 0
    }

    // Open engine log file for streaming
    // Close existing stream if it exists to prevent FileHandle leaks
    if (this.engineLogStream) {
      await this.engineLogStream.close();
    }
    this.engineLogStream = await fs.open(this.engineLogPath, 'a');
  }


  /**
   * Write a journal event with automatic sequencing and timestamping
   * @param type - Event type
   * @param payload - Event payload
   */
  private async writeEvent(type: JournalEventType, payload: any): Promise<void> {
    this.sequenceNumber++;

    const event: JournalEvent = {
      seq: this.sequenceNumber,
      timestamp: new Date().toISOString(),
      type,
      payload,
    } as JournalEvent;

    const line = JSON.stringify(event) + '\n';

    // Chain write operations to ensure sequential writes
    this.writePromise = this.writePromise.then(async () => {
      try {
        await fs.appendFile(this.journalPath, line, 'utf-8');
      } catch (error) {
        // Critical error - journal is the source of truth
        throw new Error(`Failed to write journal event: ${error}`);
      }
    });

    return this.writePromise;
  }

  /**
   * Initialize metadata.json for the run
   * @param agentRef - Path to agent project
   * @param task - Initial task description
   */
  async initializeMetadata(agentRef: string, task: string): Promise<void> {
    const metadata: DeltaRunMetadata = {
      run_id: this.runId,
      start_time: new Date().toISOString(),
      agent_ref: agentRef,
      task: task,
      status: RunStatus.RUNNING,
      iterations_completed: 0,
    };

    await fs.writeFile(
      this.metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  /**
   * Update metadata.json
   * @param updates - Partial metadata updates
   */
  async updateMetadata(updates: Partial<DeltaRunMetadata>): Promise<void> {
    const current = await this.readMetadata();
    const updated = { ...current, ...updates };

    await fs.writeFile(
      this.metadataPath,
      JSON.stringify(updated, null, 2),
      'utf-8'
    );
  }

  /**
   * Read current metadata
   */
  async readMetadata(): Promise<DeltaRunMetadata> {
    const content = await fs.readFile(this.metadataPath, 'utf-8');
    return JSON.parse(content) as DeltaRunMetadata;
  }

  // ============================================
  // Journal Event Writers (Section 7.2)
  // ============================================

  /**
   * Log RUN_START event
   */
  async logRunStart(task: string, agentRef: string): Promise<void> {
    await this.writeEvent(JournalEventType.RUN_START, {
      run_id: this.runId,
      task,
      agent_ref: agentRef,
    });
  }

  /**
   * Log RUN_END event
   */
  async logRunEnd(status: 'COMPLETED' | 'FAILED' | 'INTERRUPTED'): Promise<void> {
    await this.writeEvent(JournalEventType.RUN_END, { status });

    // Update metadata with the correct RunStatus enum value
    const statusEnum = status === 'COMPLETED' ? RunStatus.COMPLETED :
                       status === 'FAILED' ? RunStatus.FAILED :
                       RunStatus.INTERRUPTED;
    await this.updateMetadata({
      status: statusEnum,
      end_time: new Date().toISOString(),
    });
  }

  /**
   * Log THOUGHT event with LLM invocation reference
   */
  async logThought(
    content: string,
    llmInvocationId: string,
    toolCalls?: any[]
  ): Promise<void> {
    await this.writeEvent(JournalEventType.THOUGHT, {
      content,
      llm_invocation_ref: llmInvocationId,
      tool_calls: toolCalls,
    });
  }

  /**
   * Log ACTION_REQUEST event
   */
  async logActionRequest(
    actionId: string,  // Use the original tool_call_id from LLM
    toolName: string,
    toolArgs: Record<string, any>,
    resolvedCommand: string
  ): Promise<string> {
    await this.writeEvent(JournalEventType.ACTION_REQUEST, {
      action_id: actionId,
      tool_name: toolName,
      tool_args: toolArgs,
      resolved_command: resolvedCommand,
    });

    return actionId;
  }

  /**
   * Log ACTION_RESULT event with observation content
   */
  async logActionResult(
    actionId: string,
    status: 'SUCCESS' | 'FAILED' | 'ERROR',
    observationContent: string,
    executionRef: string
  ): Promise<void> {
    await this.writeEvent(JournalEventType.ACTION_RESULT, {
      action_id: actionId,
      status,
      observation_content: observationContent,
      execution_ref: executionRef,
    });
  }

  /**
   * Log SYSTEM_MESSAGE event
   */
  async logSystemMessage(
    level: 'INFO' | 'WARN' | 'ERROR',
    content: string
  ): Promise<void> {
    await this.writeEvent(JournalEventType.SYSTEM_MESSAGE, {
      level,
      content,
    });
  }

  /**
   * Log HOOK_EXECUTION_AUDIT event
   */
  async logHookExecution(
    hookName: string,
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
    ioPathRef: string
  ): Promise<void> {
    await this.writeEvent(JournalEventType.HOOK_EXECUTION_AUDIT, {
      hook_name: hookName,
      status,
      io_path_ref: ioPathRef,
    });
  }

  // ============================================
  // Runtime I/O Storage (Section 6)
  // ============================================

  /**
   * Save LLM invocation details
   */
  async saveLLMInvocation(
    invocationId: string,
    request: LLMInvocationRequest,
    response: LLMInvocationResponse,
    metadata: LLMInvocationMetadata
  ): Promise<void> {
    const invocationDir = path.join(this.runtimeIoDir, 'invocations', invocationId);
    await fs.mkdir(invocationDir, { recursive: true });

    await Promise.all([
      fs.writeFile(
        path.join(invocationDir, 'request.json'),
        JSON.stringify(request, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(invocationDir, 'response.json'),
        JSON.stringify(response, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(invocationDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      ),
    ]);
  }

  /**
   * Save tool execution details
   */
  async saveToolExecution(
    actionId: string,
    record: ToolExecutionRecord
  ): Promise<void> {
    const executionDir = path.join(this.runtimeIoDir, 'tool_executions', actionId);
    await fs.mkdir(executionDir, { recursive: true });

    await Promise.all([
      fs.writeFile(
        path.join(executionDir, 'command.txt'),
        record.command,
        'utf-8'
      ),
      fs.writeFile(
        path.join(executionDir, 'stdout.log'),
        record.stdout,
        'utf-8'
      ),
      fs.writeFile(
        path.join(executionDir, 'stderr.log'),
        record.stderr,
        'utf-8'
      ),
      fs.writeFile(
        path.join(executionDir, 'exit_code.txt'),
        record.exit_code.toString(),
        'utf-8'
      ),
      fs.writeFile(
        path.join(executionDir, 'duration_ms.txt'),
        record.duration_ms.toString(),
        'utf-8'
      ),
    ]);
  }

  /**
   * Setup hook invocation directory
   */
  async setupHookInvocation(
    stepIndex: number,
    hookName: string,
    context: HookInputContext,
    payload?: any
  ): Promise<string> {
    const hookDir = `${String(stepIndex).padStart(3, '0')}_${hookName}`;
    const hookPath = path.join(this.runtimeIoDir, 'hooks', hookDir);

    await fs.mkdir(path.join(hookPath, 'input'), { recursive: true });
    await fs.mkdir(path.join(hookPath, 'output'), { recursive: true });
    await fs.mkdir(path.join(hookPath, 'execution_meta'), { recursive: true });

    // Write input context
    await fs.writeFile(
      path.join(hookPath, 'input', 'context.json'),
      JSON.stringify(context, null, 2),
      'utf-8'
    );

    // Write payload if provided
    if (payload !== undefined) {
      const payloadFile = typeof payload === 'string'
        ? 'payload.dat'
        : 'payload.json';

      const payloadContent = typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, null, 2);

      await fs.writeFile(
        path.join(hookPath, 'input', payloadFile),
        payloadContent,
        'utf-8'
      );
    }

    return hookPath;
  }

  /**
   * Save hook execution metadata
   */
  async saveHookExecutionMeta(
    hookPath: string,
    meta: HookExecutionMeta
  ): Promise<void> {
    const metaDir = path.join(hookPath, 'execution_meta');

    await Promise.all([
      fs.writeFile(
        path.join(metaDir, 'command.txt'),
        meta.command,
        'utf-8'
      ),
      fs.writeFile(
        path.join(metaDir, 'stdout.log'),
        meta.stdout,
        'utf-8'
      ),
      fs.writeFile(
        path.join(metaDir, 'stderr.log'),
        meta.stderr,
        'utf-8'
      ),
      fs.writeFile(
        path.join(metaDir, 'exit_code.txt'),
        meta.exit_code.toString(),
        'utf-8'
      ),
      fs.writeFile(
        path.join(metaDir, 'duration_ms.txt'),
        meta.duration_ms.toString(),
        'utf-8'
      ),
    ]);
  }

  /**
   * Read hook output
   */
  async readHookOutput(hookPath: string): Promise<{
    payload?: any;
    control?: HookControlOutput;
  }> {
    const outputDir = path.join(hookPath, 'output');
    const result: { payload?: any; control?: HookControlOutput } = {};

    // Try to read payload override
    for (const filename of ['payload_override.dat', 'final_payload.json']) {
      const filePath = path.join(outputDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        result.payload = filename.endsWith('.json') ? JSON.parse(content) : content;
        break;
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    // Try to read control output
    try {
      const controlPath = path.join(outputDir, 'control.json');
      const content = await fs.readFile(controlPath, 'utf-8');
      result.control = JSON.parse(content) as HookControlOutput;
    } catch (error) {
      // File doesn't exist, that's ok
    }

    return result;
  }

  // ============================================
  // Engine Log Management (Section 5.4.1)
  // ============================================

  /**
   * Write to engine log (for internal engine diagnostics)
   */
  async writeEngineLog(message: string): Promise<void> {
    if (this.engineLogStream) {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      await this.engineLogStream.appendFile(logLine, 'utf-8');
    }
  }

  // ============================================
  // Journal Reading (for context reconstruction)
  // ============================================

  /**
   * Read all journal events
   */
  async readJournal(): Promise<JournalEvent[]> {
    try {
      const content = await fs.readFile(this.journalPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.map(line => JSON.parse(line) as JournalEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read journal events of specific type
   */
  async readEventsByType<T extends JournalEvent>(
    type: JournalEventType
  ): Promise<T[]> {
    const events = await this.readJournal();
    return events.filter(e => e.type === type) as T[];
  }

  /**
   * Update iterations completed in metadata
   */
  async incrementIterations(): Promise<void> {
    const metadata = await this.readMetadata();
    await this.updateMetadata({
      iterations_completed: metadata.iterations_completed + 1,
    });
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    await this.writePromise;
    if (this.engineLogStream) {
      await this.engineLogStream.close();
      this.engineLogStream = null;
    }
  }

  /**
   * Wait for all pending writes to complete
   */
  async flush(): Promise<void> {
    return this.writePromise;
  }
}

/**
 * Create a Journal instance
 */
export function createJournal(runId: string, runDir: string): Journal {
  return new Journal(runId, runDir);
}