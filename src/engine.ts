import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { EngineContext } from './types.js';
import { LLMAdapter, parseToolCalls, hasToolCalls } from './llm.js';
import { Journal } from './journal.js';
import { executeTool } from './executor.js';
import { HookExecutor, createHookExecutor } from './hook-executor.js';
import {
  isAskHumanTool,
  handleAskHumanAsync,
  checkForInteractionResponse,
  type AskHumanParams
} from './ask-human.js';
import {
  ThoughtEvent,
  ActionResultEvent,
  LLMInvocationRequest,
  LLMInvocationResponse,
  LLMInvocationMetadata,
  ToolExecutionRecord,
} from './journal-types.js';

/**
 * Default maximum number of iterations to prevent infinite loops
 * Can be overridden via config.yaml or --max-iterations CLI option
 */
const DEFAULT_MAX_ITERATIONS = 30;

/**
 * Core engine that orchestrates the Think-Act-Observe loop
 * v1.1: Implements stateless core - rebuilds context from journal on each iteration
 */
export class Engine {
  private readonly context: EngineContext;
  private readonly llm: LLMAdapter;
  private readonly journal: Journal;
  private readonly hookExecutor: HookExecutor;

  /**
   * Initialize the engine with context containing shared journal instance
   * @param context - Engine context containing configuration, paths, and shared journal
   */
  constructor(context: EngineContext) {
    this.context = context;
    this.llm = new LLMAdapter();

    // v1.1: Use shared journal instance from context instead of creating new one
    this.journal = context.journal;

    // v1.1: Setup hook executor
    this.hookExecutor = createHookExecutor(
      this.journal,
      context.workDir,
      context.runId
    );
  }

  /**
   * Initialize the journal (must be called before run)
   */
  async initialize(): Promise<void> {
    await this.journal.initialize();
  }

  /**
   * Rebuild conversation history from journal (v1.1 stateless core)
   * @returns Messages array for LLM
   */
  private async rebuildConversationFromJournal(): Promise<ChatCompletionMessageParam[]> {
    const events = await this.journal.readJournal();
    const messages: ChatCompletionMessageParam[] = [];

    // Add initial user task
    messages.push({
      role: 'user',
      content: this.context.initialTask,
    });

    // Process events to rebuild conversation
    for (const event of events) {
      switch (event.type) {
        case 'THOUGHT': {
          const thoughtEvent = event as ThoughtEvent;

          // Add assistant message with original tool_calls from LLM
          messages.push({
            role: 'assistant',
            content: thoughtEvent.payload.content || null,
            tool_calls: thoughtEvent.payload.tool_calls,
          } as ChatCompletionMessageParam);
          break;
        }

        case 'ACTION_RESULT': {
          const actionResult = event as ActionResultEvent;
          // Add tool response
          messages.push({
            role: 'tool',
            content: actionResult.payload.observation_content,
            tool_call_id: actionResult.payload.action_id,
          });
          break;
        }

        case 'SYSTEM_MESSAGE': {
          // System messages can be added to context if needed
          // For now, we'll skip them in conversation reconstruction
          break;
        }
      }
    }

    return messages;
  }

  /**
   * Check and handle pending ask_human response
   * @returns true if we should continue, false if we need to pause again
   */
  private async handlePendingAskHuman(): Promise<boolean> {
    // Find the last ask_human action request that doesn't have a result
    const events = await this.journal.readJournal();
    let pendingActionId: string | null = null;
    let pendingPrompt: string = '';

    for (const event of events) {
      if (event.type === 'ACTION_REQUEST' && (event as any).payload.tool_name === 'ask_human') {
        pendingActionId = (event as any).payload.action_id;
        pendingPrompt = (event as any).payload.tool_args?.prompt || 'Waiting for input';
      } else if (event.type === 'ACTION_RESULT' && (event as any).payload.action_id === pendingActionId) {
        pendingActionId = null;
        pendingPrompt = '';
      }
    }

    // If there's no pending ask_human, we can continue
    if (!pendingActionId) {
      return true;
    }

    // Check if there's a response
    const pendingResponse = await checkForInteractionResponse(this.context.workDir);

    if (pendingResponse !== null) {
      console.log('📨 Found user response, processing...');

      // Log the action result for ask_human
      await this.journal.logActionResult(
        pendingActionId,
        'SUCCESS',
        pendingResponse,
        pendingActionId
      );

      // Save a fake execution record for consistency
      await this.journal.saveToolExecution(pendingActionId, {
        command: 'ask_human',
        stdout: pendingResponse,
        stderr: '',
        exit_code: 0,
        duration_ms: 0,
      });

      // Continue execution
      return true;
    } else {
      // No response yet, we need to pause again
      console.log('\n' + '─'.repeat(60));
      console.log('🔔 Agent is still waiting for your input.');
      console.log('─'.repeat(60));
      console.log(`\nPrompt: ${pendingPrompt}\n`);
      console.log('Action required:');
      console.log(`1. Provide your response in: ${path.join(this.context.workDir, '.delta', 'interaction', 'response.txt')}`);
      console.log(`2. Run 'delta run --work-dir ${this.context.workDir}' to continue.`);
      console.log('─'.repeat(60) + '\n');

      // Exit with code 101 to signal pause
      process.exit(101);
    }
  }

  /**
   * Run the main engine loop
   * @returns Final response from the agent
   */
  async run(): Promise<string> {
    // Only log RUN_START if this is a new run (not resuming)
    // Check if we already have events in the journal
    const existingEvents = await this.journal.readJournal();
    const isNewRun = existingEvents.length === 0 ||
                     !existingEvents.some(e => e.type === 'RUN_START');

    if (isNewRun) {
      await this.journal.logRunStart(this.context.initialTask, this.context.agentPath);
    }
    await this.journal.writeEngineLog(`Engine started: ${this.context.runId}`);

    let iteration = 0;
    let finalResponse = '';

    // Get max iterations from config, fallback to default
    const maxIterations = this.context.config.max_iterations || DEFAULT_MAX_ITERATIONS;

    try {
      // Main loop
      while (iteration < maxIterations) {
        iteration++;
        this.context.currentStep++;

        console.log(`\n[Iteration ${iteration}/${maxIterations}]`);
        await this.journal.writeEngineLog(`Starting iteration ${iteration}`);

        // Check if we're resuming with a pending ask_human
        // This must happen BEFORE rebuilding conversation to ensure ACTION_RESULT is recorded
        const canContinue = await this.handlePendingAskHuman();
        if (!canContinue) {
          // This shouldn't happen as handlePendingAskHuman exits the process
          // but TypeScript needs this for type safety
          break;
        }

        // ============================================
        // STATELESS CORE: Rebuild context from journal
        // ============================================
        const messages = await this.rebuildConversationFromJournal();

        // ============================================
        // THINK: Call LLM with current conversation
        // ============================================
        console.log('🤔 Thinking...');

        // Prepare baseline LLM request (P_base)
        // Include system prompt at the beginning
        const baselineRequest: LLMInvocationRequest = {
          messages: [
            {
              role: 'system' as const,
              content: this.context.systemPrompt,
            },
            ...messages.map(m => ({
              role: m.role as 'system' | 'user' | 'assistant' | 'tool',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              tool_call_id: (m as any).tool_call_id,
              tool_calls: (m as any).tool_calls,
            })),
          ],
          model: this.context.config.llm.model,
          temperature: this.context.config.llm.temperature,
          max_tokens: this.context.config.llm.max_tokens,
          tools: [
            // Include configured tools
            ...this.context.config.tools.map(t => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: `Executes: ${t.command.join(' ')}`,
                parameters: {
                  type: 'object' as const,
                  properties: t.parameters.reduce((acc, p) => ({
                    ...acc,
                    [p.name]: { type: p.type },
                  }), {}),
                  required: t.parameters.map(p => p.name),
                },
              },
            })),
            // Include built-in ask_human tool
            {
              type: 'function' as const,
              function: {
                name: 'ask_human',
                description: 'Ask the human user for input or clarification',
                parameters: {
                  type: 'object' as const,
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'The question or prompt to show the user',
                    },
                    input_type: {
                      type: 'string',
                      description: 'Type of input expected: text, password, confirmation',
                      enum: ['text', 'password', 'confirmation'],
                    },
                    sensitive: {
                      type: 'boolean',
                      description: 'Whether the input is sensitive and should be hidden',
                    },
                  },
                  required: ['prompt'],
                },
              },
            },
          ],
        };

        // ============================================
        // HOOK: Execute pre_llm_req hook if configured
        // ============================================
        let finalRequest = baselineRequest;

        if (this.context.config.lifecycle_hooks?.pre_llm_req) {
          try {
            const hookResult = await this.hookExecutor.executePreLLMReqHook(
              this.context.config.lifecycle_hooks.pre_llm_req,
              baselineRequest,
              this.context.agentPath
            );

            if (hookResult.success && hookResult.finalPayload) {
              // Use the modified payload (P_final)
              finalRequest = hookResult.finalPayload as LLMInvocationRequest;
              await this.journal.writeEngineLog('pre_llm_req hook succeeded, using modified payload');
            } else if (!hookResult.success) {
              // Hook failed, log warning and use baseline
              const errorMsg = `pre_llm_req hook failed: ${hookResult.error || 'Unknown error'}`;
              await this.journal.logSystemMessage('WARN', errorMsg);
              await this.journal.writeEngineLog(errorMsg);
              console.warn(`⚠️  ${errorMsg}`);
            }
          } catch (error) {
            // Unexpected error, log and continue with baseline
            const errorMsg = `pre_llm_req hook error: ${error instanceof Error ? error.message : String(error)}`;
            await this.journal.logSystemMessage('ERROR', errorMsg);
            await this.journal.writeEngineLog(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }

        // Save LLM invocation ID for reference
        const invocationId = uuidv4();
        const startTime = Date.now();

        // Call LLM with final request (either P_final or P_base)
        // IMPORTANT: Use the finalRequest which may have been modified by the hook
        const response = await this.llm.callWithRequest(finalRequest);

        // Calculate duration and token usage
        const duration = Date.now() - startTime;

        // Create LLM response object
        const llmResponse: LLMInvocationResponse = {
          id: invocationId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: this.context.config.llm.model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: response.content || undefined,
              tool_calls: response.tool_calls,
            },
            finish_reason: response.refusal ? 'refusal' : 'stop',
          }],
          usage: {
            prompt_tokens: 0, // Would need to track from actual API response
            completion_tokens: 0,
            total_tokens: 0,
          },
        };

        // Save LLM invocation details
        const llmMetadata: LLMInvocationMetadata = {
          model_id: this.context.config.llm.model,
          duration_ms: duration,
          token_usage: {
            prompt: 0,
            completion: 0,
            total: 0,
          },
          status: 'SUCCESS',
        };

        // CRITICAL: Save the finalRequest (not baselineRequest) to runtime_io
        // This ensures runtime_io/invocations/<ID>/request.json contains the actual payload sent to LLM
        await this.journal.saveLLMInvocation(
          invocationId,
          finalRequest,  // Use finalRequest, not a variable that doesn't exist
          llmResponse,
          llmMetadata
        );

        // Log thought event with tool calls
        await this.journal.logThought(
          response.content || '',
          invocationId,
          response.tool_calls  // Pass the original tool_calls from LLM
        );

        // ============================================
        // HOOK: Execute post_llm_resp hook if configured
        // ============================================
        if (this.context.config.lifecycle_hooks?.post_llm_resp) {
          try {
            const hookResult = await this.hookExecutor.executePostLLMRespHook(
              this.context.config.lifecycle_hooks.post_llm_resp,
              llmResponse,
              this.context.agentPath
            );

            if (!hookResult.success) {
              // Hook failed, log warning but continue
              const errorMsg = `post_llm_resp hook failed: ${hookResult.error || 'Unknown error'}`;
              await this.journal.logSystemMessage('WARN', errorMsg);
              await this.journal.writeEngineLog(errorMsg);
              console.warn(`⚠️  ${errorMsg}`);
            }
          } catch (error) {
            // Unexpected error, log but continue
            const errorMsg = `post_llm_resp hook error: ${error instanceof Error ? error.message : String(error)}`;
            await this.journal.logSystemMessage('ERROR', errorMsg);
            await this.journal.writeEngineLog(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }

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

          // Check if this is the built-in ask_human tool
          if (isAskHumanTool(toolCall.name)) {
            // Handle ask_human tool specially
            const params: AskHumanParams = {
              prompt: toolCall.arguments.prompt || '',
              input_type: toolCall.arguments.input_type,
              sensitive: toolCall.arguments.sensitive === 'true' || toolCall.arguments.sensitive === true,
            };

            // Log action request for ask_human
            await this.journal.logActionRequest(
              toolCall.id,
              'ask_human',
              toolCall.arguments,
              'ask_human ' + params.prompt
            );

            // Check if we're in interactive mode (-i flag)
            const isInteractive = this.context.isInteractive || false;

            if (!isInteractive) {
              // Async mode: Create request and pause
              await handleAskHumanAsync(this.context, params);

              // Log that we're pausing
              await this.journal.logSystemMessage('INFO', 'Agent pausing for human input');

              // Exit with code 101 to signal pause
              process.exit(101);
            } else {
              // Interactive mode: Get input directly
              const { handleAskHumanInteractive } = await import('./ask-human.js');
              const response = await handleAskHumanInteractive(params);

              // Log action result immediately
              await this.journal.logActionResult(
                toolCall.id,
                'SUCCESS',
                response,
                toolCall.id
              );

              // Save a fake execution record for consistency
              await this.journal.saveToolExecution(toolCall.id, {
                command: 'ask_human',
                stdout: response,
                stderr: '',
                exit_code: 0,
                duration_ms: 0,
              });
            }
            continue;
          }

          // Find tool definition
          const toolDef = this.context.config.tools.find(
            t => t.name === toolCall.name
          );

          if (!toolDef) {
            const errorMsg = `Tool not found: ${toolCall.name}`;
            console.error(`  ❌ ${errorMsg}`);

            // Log system message for error
            await this.journal.logSystemMessage('ERROR', errorMsg);

            // Log action result as error
            await this.journal.logActionResult(
              toolCall.id,
              'ERROR',
              `Error: ${errorMsg}`,
              ''
            );
            continue;
          }

          try {
            // Log action request
            const resolvedCommand = [
              ...toolDef.command,
              ...Object.values(toolCall.arguments),
            ].join(' ');

            // Use the original tool_call_id from LLM response
            const actionId = await this.journal.logActionRequest(
              toolCall.id,  // Pass the original tool_call_id
              toolCall.name,
              toolCall.arguments,
              resolvedCommand
            );

            // ============================================
            // HOOK: Execute pre_tool_exec hook if configured
            // ============================================
            let skipTool = false;
            if (this.context.config.lifecycle_hooks?.pre_tool_exec) {
              try {
                const hookResult = await this.hookExecutor.executePreToolExecHook(
                  this.context.config.lifecycle_hooks.pre_tool_exec,
                  {
                    tool_name: toolCall.name,
                    tool_args: toolCall.arguments,
                    resolved_command: resolvedCommand,
                  },
                  this.context.agentPath
                );

                if (!hookResult.success) {
                  console.warn(`⚠️  pre_tool_exec hook failed: ${hookResult.error}`);
                } else if (hookResult.control?.skip) {
                  // Hook requested to skip tool execution
                  skipTool = true;
                  console.log(`  ⏭️  Tool execution skipped by pre_tool_exec hook`);
                }
              } catch (error) {
                console.error(`❌ pre_tool_exec hook error: ${error}`);
              }
            }

            let result: any;
            let duration = 0;

            if (!skipTool) {
              // Execute the tool
              const startTime = Date.now();
              result = await executeTool(
                this.context,
                toolDef,
                toolCall.arguments
              );
              duration = Date.now() - startTime;
            } else {
              // Create a mock result for skipped tool
              result = {
                stdout: 'Tool execution skipped by pre_tool_exec hook',
                stderr: '',
                exitCode: 0,
                success: true,
              };
            }

            // Save tool execution details
            const executionRecord: ToolExecutionRecord = {
              command: resolvedCommand,
              stdout: result.stdout,
              stderr: result.stderr,
              exit_code: result.exitCode,
              duration_ms: duration,
            };

            await this.journal.saveToolExecution(actionId, executionRecord);

            // Format observation for LLM
            const observation = this.formatToolResult(result);

            // Log action result
            await this.journal.logActionResult(
              actionId,
              result.success ? 'SUCCESS' : 'FAILED',
              observation,
              actionId // execution_ref points to the tool_executions directory
            );

            if (result.success) {
              console.log(`  ✓ Success (exit code: ${result.exitCode})`);
            } else {
              console.log(`  ✗ Failed (exit code: ${result.exitCode})`);
            }

            // ============================================
            // HOOK: Execute post_tool_exec hook if configured
            // ============================================
            if (this.context.config.lifecycle_hooks?.post_tool_exec && !skipTool) {
              try {
                const hookResult = await this.hookExecutor.executePostToolExecHook(
                  this.context.config.lifecycle_hooks.post_tool_exec,
                  {
                    tool_name: toolCall.name,
                    exit_code: result.exitCode,
                    stdout: result.stdout,
                    stderr: result.stderr,
                  },
                  this.context.agentPath
                );

                if (!hookResult.success) {
                  console.warn(`⚠️  post_tool_exec hook failed: ${hookResult.error}`);
                }
              } catch (error) {
                console.error(`❌ post_tool_exec hook error: ${error}`);
              }
            }

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ Tool execution error: ${errorMsg}`);

            // Log system message for error
            await this.journal.logSystemMessage(
              'ERROR',
              `Tool execution error: ${errorMsg}`
            );

            // Log action result as error
            await this.journal.logActionResult(
              toolCall.id,
              'ERROR',
              `Error executing tool: ${errorMsg}`,
              ''
            );

            // ============================================
            // HOOK: Execute on_error hook if configured
            // ============================================
            if (this.context.config.lifecycle_hooks?.on_error) {
              try {
                const hookResult = await this.hookExecutor.executeOnErrorHook(
                  this.context.config.lifecycle_hooks.on_error,
                  {
                    error_type: 'TOOL_EXECUTION_ERROR',
                    message: errorMsg,
                    context: {
                      tool_name: toolCall.name,
                      tool_args: toolCall.arguments,
                    },
                  },
                  this.context.agentPath
                );

                if (!hookResult.success) {
                  console.warn(`⚠️  on_error hook failed: ${hookResult.error}`);
                }
              } catch (hookError) {
                console.error(`❌ on_error hook error: ${hookError}`);
              }
            }
          }
        }

        // Update iterations in metadata
        await this.journal.incrementIterations();
      }

      // Check if we hit max iterations
      if (iteration >= maxIterations && !finalResponse) {
        finalResponse = 'Maximum iterations reached. Task may be incomplete.';
        console.warn(`⚠️  Maximum iterations (${maxIterations}) reached`);
        await this.journal.logSystemMessage(
          'WARN',
          `Maximum iterations (${maxIterations}) reached`
        );
      }

      // Log engine end
      await this.journal.logRunEnd('COMPLETED');
      await this.journal.writeEngineLog(`Engine completed successfully after ${iteration} iterations`);

    } catch (error) {
      // Log fatal error
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.journal.logSystemMessage('ERROR', `Fatal error: ${errorMsg}`);
      await this.journal.writeEngineLog(`Engine failed with error: ${errorMsg}`);

      // ============================================
      // HOOK: Execute on_error hook for fatal errors
      // ============================================
      if (this.context.config.lifecycle_hooks?.on_error) {
        try {
          await this.hookExecutor.executeOnErrorHook(
            this.context.config.lifecycle_hooks.on_error,
            {
              error_type: 'FATAL_ERROR',
              message: errorMsg,
              context: {
                iteration,
                run_id: this.context.runId,
              },
            },
            this.context.agentPath
          );
        } catch (hookError) {
          // Log but don't throw - we're already in error handling
          await this.journal.writeEngineLog(`on_error hook failed: ${hookError}`);
        }
      }

      // Log engine end with failure
      await this.journal.logRunEnd('FAILED');

      throw error;
    } finally {
      // Ensure all logs are written
      await this.journal.flush();
      await this.journal.close();
    }

    return finalResponse;
  }

  /**
   * Format tool execution result for LLM consumption
   * @param result - Tool execution result
   * @returns Formatted string (may be truncated for large outputs)
   */
  private formatToolResult(result: {
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
  }): string {
    const MAX_OUTPUT_LENGTH = 5000; // Limit observation to 5KB for LLM context
    const lines: string[] = [];

    // Add stdout if present (truncate if too long)
    if (result.stdout) {
      lines.push('=== STDOUT ===');
      if (result.stdout.length > MAX_OUTPUT_LENGTH) {
        lines.push(result.stdout.substring(0, MAX_OUTPUT_LENGTH));
        lines.push(`\n[Output truncated - ${result.stdout.length} total characters]`);
      } else {
        lines.push(result.stdout);
      }
    }

    // Add stderr if present (truncate if too long)
    if (result.stderr) {
      lines.push('=== STDERR ===');
      if (result.stderr.length > MAX_OUTPUT_LENGTH) {
        lines.push(result.stderr.substring(0, MAX_OUTPUT_LENGTH));
        lines.push(`\n[Error output truncated - ${result.stderr.length} total characters]`);
      } else {
        lines.push(result.stderr);
      }
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
   * Get the journal instance for external access
   * @returns Journal instance
   */
  getJournal(): Journal {
    return this.journal;
  }
}

/**
 * Create and run an engine instance
 * @param context - Engine context
 * @returns Final response from the agent
 */
export async function runEngine(context: EngineContext): Promise<string> {
  const engine = new Engine(context);
  await engine.initialize();
  return engine.run();
}