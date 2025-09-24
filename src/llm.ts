import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessage,
  ChatCompletionCreateParams,
} from 'openai/resources/chat/index.js';
import { EngineContext, LLMConfig } from './types.js';
import { convertToolsToOpenAISchema } from './tool_schema.js';

/**
 * Error thrown when OpenAI API key is not configured
 */
export class APIKeyError extends Error {
  constructor() {
    super('OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.');
    this.name = 'APIKeyError';
  }
}

/**
 * LLM Adapter for interacting with OpenAI API
 * Handles chat completions with tool calling support
 */
export class LLMAdapter {
  private client: OpenAI;

  /**
   * Initialize the LLM adapter
   * @throws APIKeyError if OPENAI_API_KEY environment variable is not set
   */
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new APIKeyError();
    }

    // Initialize OpenAI client with optional custom base URL
    const clientConfig: any = {
      apiKey,
    };

    // Support custom API URL (e.g., for proxies or alternative endpoints)
    if (process.env.OPENAI_API_URL) {
      clientConfig.baseURL = process.env.OPENAI_API_URL;
      console.log(`Using custom OpenAI API URL: ${process.env.OPENAI_API_URL}`);
    }

    this.client = new OpenAI(clientConfig);
  }

  /**
   * Call the LLM with the given context and message history
   * @param context - Engine context containing configuration and system prompt
   * @param history - Message history to send to the LLM
   * @returns The LLM's response message
   */
  async call(
    context: EngineContext,
    history: ChatCompletionMessageParam[]
  ): Promise<ChatCompletionMessage> {
    try {
      // Convert tool definitions to OpenAI schema
      const tools = convertToolsToOpenAISchema(context.config.tools);

      // Build messages array with system prompt
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: context.systemPrompt,
        },
        ...history,
      ];

      // Build request parameters
      const requestParams: ChatCompletionCreateParams = {
        model: context.config.llm.model,
        messages,
        temperature: context.config.llm.temperature,
        ...(context.config.llm.max_tokens && {
          max_tokens: context.config.llm.max_tokens,
        }),
        ...(context.config.llm.top_p !== undefined && {
          top_p: context.config.llm.top_p,
        }),
        ...(context.config.llm.frequency_penalty !== undefined && {
          frequency_penalty: context.config.llm.frequency_penalty,
        }),
        ...(context.config.llm.presence_penalty !== undefined && {
          presence_penalty: context.config.llm.presence_penalty,
        }),
      };

      // Add tools if available
      if (tools.length > 0) {
        requestParams.tools = tools;
        // Use 'auto' to let the model decide when to use tools
        requestParams.tool_choice = 'auto';
      }

      // Make the API call
      const completion = await this.client.chat.completions.create(requestParams);

      // Extract and return the first message
      const message = completion.choices[0]?.message;

      if (!message) {
        throw new Error('No response message received from OpenAI API');
      }

      return message;
    } catch (error) {
      // Handle specific OpenAI errors
      if (error instanceof OpenAI.APIError) {
        throw new Error(
          `OpenAI API error: ${error.message} (Status: ${error.status}, Type: ${error.type})`
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Call the LLM with a single user message
   * @param context - Engine context
   * @param userMessage - User message content
   * @returns The LLM's response message
   */
  async callWithUserMessage(
    context: EngineContext,
    userMessage: string
  ): Promise<ChatCompletionMessage> {
    const history: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: userMessage,
      },
    ];

    return this.call(context, history);
  }

  /**
   * Continue a conversation with tool results
   * @param context - Engine context
   * @param history - Previous message history
   * @param toolCallId - ID of the tool call
   * @param toolName - Name of the tool that was called
   * @param toolResult - Result from tool execution
   * @returns The LLM's response message
   */
  async continueWithToolResult(
    context: EngineContext,
    history: ChatCompletionMessageParam[],
    toolCallId: string,
    _toolName: string,
    toolResult: string
  ): Promise<ChatCompletionMessage> {
    // Add tool result message to history
    const updatedHistory: ChatCompletionMessageParam[] = [
      ...history,
      {
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCallId,
      },
    ];

    return this.call(context, updatedHistory);
  }

  /**
   * Check if the LLM is properly configured
   * @returns True if configured, false otherwise
   */
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Get the configured model name
   * @param config - LLM configuration
   * @returns Model name
   */
  static getModelName(config: LLMConfig): string {
    return config.model;
  }

  /**
   * Validate LLM configuration
   * @param config - LLM configuration to validate
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: LLMConfig): void {
    if (!config.model) {
      throw new Error('LLM model is required');
    }

    if (config.temperature < 0 || config.temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }

    if (config.top_p !== undefined && (config.top_p < 0 || config.top_p > 1)) {
      throw new Error('top_p must be between 0 and 1');
    }

    if (
      config.frequency_penalty !== undefined &&
      (config.frequency_penalty < -2 || config.frequency_penalty > 2)
    ) {
      throw new Error('frequency_penalty must be between -2 and 2');
    }

    if (
      config.presence_penalty !== undefined &&
      (config.presence_penalty < -2 || config.presence_penalty > 2)
    ) {
      throw new Error('presence_penalty must be between -2 and 2');
    }
  }
}

/**
 * Parse tool calls from an LLM response message
 * @param message - LLM response message
 * @returns Array of parsed tool calls with name and arguments
 */
export function parseToolCalls(message: ChatCompletionMessage): Array<{
  id: string;
  name: string;
  arguments: Record<string, any>;
}> {
  if (!message.tool_calls) {
    return [];
  }

  return message.tool_calls.map(toolCall => {
    try {
      // Handle cases where arguments are undefined, null, or empty string
      // Some LLMs (like Claude) may return undefined for tools with no parameters
      const argsString = toolCall.function.arguments;
      const args = !argsString || argsString === 'undefined' || argsString === 'null' || argsString === ''
        ? {} // Default to empty object for no parameters
        : JSON.parse(argsString);

      return {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: args,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse tool call arguments for ${toolCall.function.name}: ${error}`
      );
    }
  });
}

/**
 * Check if a message contains tool calls
 * @param message - LLM response message
 * @returns True if message contains tool calls
 */
export function hasToolCalls(message: ChatCompletionMessage): boolean {
  return !!message.tool_calls && message.tool_calls.length > 0;
}

/**
 * Format a tool result for display
 * @param toolName - Name of the tool
 * @param result - Tool execution result
 * @returns Formatted result string
 */
export function formatToolResult(_toolName: string, result: any): string {
  if (typeof result === 'string') {
    return result;
  }

  return JSON.stringify(result, null, 2);
}