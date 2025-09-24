import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';
import { EngineContext } from './types.js';
import { LLMAdapter, parseToolCalls, hasToolCalls } from './llm.js';
import { Tracer } from './tracer.js';
import { executeTool } from './executor.js';

/**
 * Maximum number of iterations to prevent infinite loops
 */
const MAX_ITERATIONS = 30;

/**
 * Core engine that orchestrates the Think-Act-Observe loop
 */
export class Engine {
  private readonly context: EngineContext;
  private readonly llm: LLMAdapter;
  private readonly tracer: Tracer;

  /**
   * Initialize the engine with context
   * @param context - Engine context containing configuration and paths
   */
  constructor(context: EngineContext) {
    this.context = context;
    this.llm = new LLMAdapter();
    this.tracer = new Tracer(context.workDir, context.runId);
  }

  /**
   * Run the main engine loop
   * @returns Final response from the agent
   */
  async run(): Promise<string> {
    // Log engine start
    await this.tracer.logEngineStart(
      this.context.agentPath,
      this.context.workDir,
      this.context.initialTask
    );

    // Initialize conversation history with the initial task
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: this.context.initialTask,
      },
    ];

    let iteration = 0;
    let finalResponse = '';

    try {
      // Main loop
      while (iteration < MAX_ITERATIONS) {
        iteration++;

        console.log(`\n[Iteration ${iteration}/${MAX_ITERATIONS}]`);

        // ============================================
        // THINK: Call LLM with current conversation
        // ============================================
        console.log('🤔 Thinking...');

        // Log LLM request
        const messagesToLog = messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

        const toolsToLog = this.context.config.tools.map(t => ({
          name: t.name,
          description: `Executes: ${t.command.join(' ')}`,
        }));

        await this.tracer.logLLMRequest(iteration, messagesToLog, toolsToLog);

        // Call LLM
        const response = await this.llm.call(this.context, messages);

        // Log LLM response
        const toolCalls = response.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }));

        await this.tracer.logLLMResponse(
          iteration,
          response.content || undefined,
          toolCalls,
          response.refusal ? 'refusal' : 'stop'
        );

        // ============================================
        // PARSE: Add assistant response to history
        // ============================================
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls,
        } as ChatCompletionMessageParam);

        // ============================================
        // CHECK TERMINATION: No tool calls means done
        // ============================================
        if (!hasToolCalls(response)) {
          console.log('✅ Agent completed task (no tool calls)');
          finalResponse = response.content || 'Task completed successfully.';
          break;
        }

        // ============================================
        // ACT: Execute tool calls
        // ============================================
        console.log(`🛠️  Executing ${response.tool_calls!.length} tool call(s)...`);

        const parsedToolCalls = parseToolCalls(response);

        for (const toolCall of parsedToolCalls) {
          console.log(`  → Executing: ${toolCall.name}`);

          // Find tool definition
          const toolDef = this.context.config.tools.find(
            t => t.name === toolCall.name
          );

          if (!toolDef) {
            const errorMsg = `Tool not found: ${toolCall.name}`;
            console.error(`  ❌ ${errorMsg}`);

            // Log error and add to conversation
            await this.tracer.logError(errorMsg, 'Tool execution', iteration);

            messages.push({
              role: 'tool',
              content: `Error: ${errorMsg}`,
              tool_call_id: toolCall.id,
            });
            continue;
          }

          try {
            // Log tool execution start
            await this.tracer.logToolExecutionStart(
              iteration,
              toolCall.name,
              toolDef.command,
              toolCall.arguments
            );

            // Execute the tool
            const result = await executeTool(
              this.context,
              toolDef,
              toolCall.arguments
            );

            // Log tool execution end
            await this.tracer.logToolExecutionEnd(
              iteration,
              toolCall.name,
              result
            );

            // ============================================
            // OBSERVE: Format and add result to history
            // ============================================
            const formattedResult = this.formatToolResult(result);

            messages.push({
              role: 'tool',
              content: formattedResult,
              tool_call_id: toolCall.id,
            });

            if (result.success) {
              console.log(`  ✓ Success (exit code: ${result.exitCode})`);
            } else {
              console.log(`  ✗ Failed (exit code: ${result.exitCode})`);
            }

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ Tool execution error: ${errorMsg}`);

            // Log error
            await this.tracer.logError(
              error instanceof Error ? error : errorMsg,
              `Tool execution: ${toolCall.name}`,
              iteration
            );

            // Add error to conversation
            messages.push({
              role: 'tool',
              content: `Error executing tool: ${errorMsg}`,
              tool_call_id: toolCall.id,
            });
          }
        }
      }

      // Check if we hit max iterations
      if (iteration >= MAX_ITERATIONS && !finalResponse) {
        finalResponse = 'Maximum iterations reached. Task may be incomplete.';
        console.warn(`⚠️  Maximum iterations (${MAX_ITERATIONS}) reached`);
      }

      // Log engine end
      await this.tracer.logEngineEnd(true, iteration);

    } catch (error) {
      // Log fatal error
      await this.tracer.logError(
        error instanceof Error ? error : String(error),
        'Engine execution',
        iteration
      );

      // Log engine end with failure
      await this.tracer.logEngineEnd(false, iteration);

      throw error;
    } finally {
      // Ensure all logs are written
      await this.tracer.flush();
    }

    return finalResponse;
  }

  /**
   * Format tool execution result for LLM consumption
   * @param result - Tool execution result
   * @returns Formatted string
   */
  private formatToolResult(result: {
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
  }): string {
    const lines: string[] = [];

    // Add stdout if present
    if (result.stdout) {
      lines.push('=== STDOUT ===');
      lines.push(result.stdout);
    }

    // Add stderr if present
    if (result.stderr) {
      lines.push('=== STDERR ===');
      lines.push(result.stderr);
    }

    // Add exit status
    lines.push(`=== EXIT CODE: ${result.exitCode} ===`);

    // If there's no output, indicate that
    if (!result.stdout && !result.stderr) {
      lines.push('(Command executed with no output)');
    }

    return lines.join('\n');
  }

  /**
   * Get the tracer instance for external access
   * @returns Tracer instance
   */
  getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Get the conversation history (for debugging)
   * @returns Current message history
   */
  getMessageHistory(): ChatCompletionMessageParam[] {
    // This would need to be stored as instance variable if needed
    return [];
  }
}

/**
 * Create and run an engine instance
 * @param context - Engine context
 * @returns Final response from the agent
 */
export async function runEngine(context: EngineContext): Promise<string> {
  const engine = new Engine(context);
  return engine.run();
}