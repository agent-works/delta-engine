import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  TraceEventType,
  TraceEvent,
  EngineStartEvent,
  EngineEndEvent,
  LLMRequestEvent,
  LLMResponseEvent,
  ToolExecutionStartEvent,
  ToolExecutionEndEvent,
  ErrorEvent,
  ToolExecutionResult,
} from './types.js';

/**
 * Tracer class for logging events to trace.jsonl file
 * Provides observability for Delta Engine execution
 */
export class Tracer {
  private readonly traceFilePath: string;
  private readonly runId: string;
  private writePromise: Promise<void> = Promise.resolve();

  /**
   * Initialize the tracer
   * @param workDir - Working directory where trace.jsonl will be created
   * @param runId - Unique identifier for this run
   */
  constructor(workDir: string, runId: string) {
    this.traceFilePath = path.join(workDir, 'trace.jsonl');
    this.runId = runId;
  }

  /**
   * Log an event to the trace file
   * @param type - Type of the event
   * @param iteration - Current iteration number (-1 for non-iteration events)
   * @param data - Additional event data
   */
  async logEvent(
    type: TraceEventType,
    iteration: number,
    data: Record<string, any>
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    // Build the base event
    const baseEvent = {
      timestamp,
      runId: this.runId,
      type,
      iteration: iteration >= 0 ? iteration : undefined,
    };

    // Merge with specific event data
    const event = {
      ...baseEvent,
      ...data,
    };

    // Serialize to JSON and append newline for JSON Lines format
    const line = JSON.stringify(event) + '\n';

    // Chain write operations to ensure sequential writes
    this.writePromise = this.writePromise.then(async () => {
      try {
        await fs.appendFile(this.traceFilePath, line, 'utf-8');
      } catch (error) {
        // Log error to console but don't throw to avoid disrupting execution
        console.error(`Failed to write trace event: ${error}`);
      }
    });

    return this.writePromise;
  }

  /**
   * Log engine start event
   * @param agentPath - Path to the agent directory
   * @param workDir - Working directory for this run
   * @param task - Initial task description
   */
  async logEngineStart(
    agentPath: string,
    workDir: string,
    task: string
  ): Promise<void> {
    const event: Omit<EngineStartEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.ENGINE_START,
      agentPath,
      workDir,
      task,
    };

    return this.logEvent(TraceEventType.ENGINE_START, -1, event);
  }

  /**
   * Log engine end event
   * @param success - Whether the engine completed successfully
   * @param iterations - Total number of iterations completed
   */
  async logEngineEnd(success: boolean, iterations: number): Promise<void> {
    const event: Omit<EngineEndEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.ENGINE_END,
      success,
      iterations,
    };

    return this.logEvent(TraceEventType.ENGINE_END, -1, event);
  }

  /**
   * Log LLM request event
   * @param iteration - Current iteration number
   * @param messages - Messages being sent to the LLM
   * @param tools - Tool definitions being sent (optional)
   */
  async logLLMRequest(
    iteration: number,
    messages: Array<{ role: string; content: string }>,
    tools?: Array<{ name: string; description?: string }>
  ): Promise<void> {
    const event: Omit<LLMRequestEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.LLM_REQUEST,
      messages,
      tools,
    };

    return this.logEvent(TraceEventType.LLM_REQUEST, iteration, event);
  }

  /**
   * Log LLM response event
   * @param iteration - Current iteration number
   * @param content - Response content (optional)
   * @param toolCalls - Tool calls made by the LLM (optional)
   * @param finishReason - Reason for completion
   */
  async logLLMResponse(
    iteration: number,
    content?: string,
    toolCalls?: Array<{ id: string; name: string; arguments: string }>,
    finishReason: string = 'stop'
  ): Promise<void> {
    const event: Omit<LLMResponseEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.LLM_RESPONSE,
      content,
      tool_calls: toolCalls,
      finish_reason: finishReason,
    };

    return this.logEvent(TraceEventType.LLM_RESPONSE, iteration, event);
  }

  /**
   * Log tool execution start event
   * @param iteration - Current iteration number
   * @param toolName - Name of the tool being executed
   * @param command - Command array being executed
   * @param parameters - Parameters passed to the tool
   */
  async logToolExecutionStart(
    iteration: number,
    toolName: string,
    command: string[],
    parameters: Record<string, any>
  ): Promise<void> {
    const event: Omit<ToolExecutionStartEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.TOOL_EXECUTION_START,
      toolName,
      command,
      parameters,
    };

    return this.logEvent(TraceEventType.TOOL_EXECUTION_START, iteration, event);
  }

  /**
   * Log tool execution end event
   * @param iteration - Current iteration number
   * @param toolName - Name of the tool that was executed
   * @param result - Execution result
   */
  async logToolExecutionEnd(
    iteration: number,
    toolName: string,
    result: ToolExecutionResult
  ): Promise<void> {
    const event: Omit<ToolExecutionEndEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.TOOL_EXECUTION_END,
      toolName,
      result,
    };

    return this.logEvent(TraceEventType.TOOL_EXECUTION_END, iteration, event);
  }

  /**
   * Log error event
   * @param error - Error object or message
   * @param context - Additional context about where the error occurred
   * @param iteration - Current iteration number (optional)
   */
  async logError(
    error: Error | string,
    context?: string,
    iteration?: number
  ): Promise<void> {
    const errorObj = typeof error === 'string'
      ? { message: error }
      : {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        };

    const event: Omit<ErrorEvent, 'timestamp' | 'runId'> = {
      type: TraceEventType.ERROR,
      error: errorObj,
      context,
    };

    return this.logEvent(TraceEventType.ERROR, iteration ?? -1, event);
  }

  /**
   * Wait for all pending writes to complete
   * Useful for ensuring all events are written before process exit
   */
  async flush(): Promise<void> {
    return this.writePromise;
  }

  /**
   * Read and parse the trace file
   * @returns Array of parsed trace events
   */
  async readTrace(): Promise<TraceEvent[]> {
    try {
      const content = await fs.readFile(this.traceFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.map(line => JSON.parse(line) as TraceEvent);
    } catch (error) {
      // Return empty array if file doesn't exist yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get the path to the trace file
   * @returns Absolute path to trace.jsonl
   */
  getTraceFilePath(): string {
    return this.traceFilePath;
  }

  /**
   * Create a summary of events in the trace
   * @returns Summary statistics
   */
  async getTraceSummary(): Promise<{
    totalEvents: number;
    iterations: number;
    toolCalls: number;
    llmRequests: number;
    errors: number;
    startTime?: string;
    endTime?: string;
    duration?: number;
  }> {
    const events = await this.readTrace();

    const summary = {
      totalEvents: events.length,
      iterations: 0,
      toolCalls: 0,
      llmRequests: 0,
      errors: 0,
      startTime: undefined as string | undefined,
      endTime: undefined as string | undefined,
      duration: undefined as number | undefined,
    };

    for (const event of events) {
      switch (event.type) {
        case TraceEventType.ENGINE_START:
          summary.startTime = event.timestamp;
          break;
        case TraceEventType.ENGINE_END:
          summary.endTime = event.timestamp;
          summary.iterations = (event as EngineEndEvent).iterations;
          break;
        case TraceEventType.LLM_REQUEST:
          summary.llmRequests++;
          break;
        case TraceEventType.TOOL_EXECUTION_START:
          summary.toolCalls++;
          break;
        case TraceEventType.ERROR:
          summary.errors++;
          break;
      }
    }

    // Calculate duration if we have both start and end times
    if (summary.startTime && summary.endTime) {
      const start = new Date(summary.startTime).getTime();
      const end = new Date(summary.endTime).getTime();
      summary.duration = (end - start) / 1000; // Duration in seconds
    }

    return summary;
  }

  /**
   * Format a trace event for human-readable display
   * @param event - Trace event to format
   * @returns Formatted string
   */
  static formatEvent(event: TraceEvent): string {
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    const iteration = 'iteration' in event && event.iteration !== undefined
      ? `[Iter ${event.iteration}]`
      : '';

    switch (event.type) {
      case TraceEventType.ENGINE_START:
        const startEvent = event as EngineStartEvent;
        return `${timestamp} ${iteration} ENGINE START: ${startEvent.task}`;

      case TraceEventType.ENGINE_END:
        const endEvent = event as EngineEndEvent;
        return `${timestamp} ${iteration} ENGINE END: ${endEvent.success ? 'SUCCESS' : 'FAILED'} (${endEvent.iterations} iterations)`;

      case TraceEventType.LLM_REQUEST:
        const reqEvent = event as LLMRequestEvent;
        return `${timestamp} ${iteration} LLM REQUEST: ${reqEvent.messages.length} messages`;

      case TraceEventType.LLM_RESPONSE:
        const respEvent = event as LLMResponseEvent;
        const hasTools = respEvent.tool_calls && respEvent.tool_calls.length > 0;
        return `${timestamp} ${iteration} LLM RESPONSE: ${hasTools ? `${respEvent.tool_calls!.length} tool calls` : 'text response'}`;

      case TraceEventType.TOOL_EXECUTION_START:
        const toolStartEvent = event as ToolExecutionStartEvent;
        return `${timestamp} ${iteration} TOOL START: ${toolStartEvent.toolName} - ${toolStartEvent.command.join(' ')}`;

      case TraceEventType.TOOL_EXECUTION_END:
        const toolEndEvent = event as ToolExecutionEndEvent;
        return `${timestamp} ${iteration} TOOL END: ${toolEndEvent.toolName} - ${toolEndEvent.result.success ? 'SUCCESS' : 'FAILED'}`;

      case TraceEventType.ERROR:
        const errorEvent = event as ErrorEvent;
        return `${timestamp} ${iteration} ERROR: ${errorEvent.error.message}${errorEvent.context ? ` (${errorEvent.context})` : ''}`;

      default:
        return `${timestamp} ${iteration} ${(event as any).type}`;
    }
  }

  /**
   * Print a formatted trace to console
   */
  async printTrace(): Promise<void> {
    const events = await this.readTrace();
    const summary = await this.getTraceSummary();

    console.log('\n===== TRACE LOG =====');
    for (const event of events) {
      console.log(Tracer.formatEvent(event));
    }

    console.log('\n===== SUMMARY =====');
    console.log(`Total Events: ${summary.totalEvents}`);
    console.log(`Iterations: ${summary.iterations}`);
    console.log(`LLM Requests: ${summary.llmRequests}`);
    console.log(`Tool Calls: ${summary.toolCalls}`);
    console.log(`Errors: ${summary.errors}`);
    if (summary.duration !== undefined) {
      console.log(`Duration: ${summary.duration.toFixed(2)}s`);
    }
    console.log('==================\n');
  }
}

/**
 * Create a tracer instance
 * @param workDir - Working directory
 * @param runId - Run identifier
 * @returns Tracer instance
 */
export function createTracer(workDir: string, runId: string): Tracer {
  return new Tracer(workDir, runId);
}