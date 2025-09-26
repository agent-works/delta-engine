import { z } from 'zod';

// ============================================
// Enums
// ============================================

export enum InjectionType {
  Argument = 'argument',
  Stdin = 'stdin',
  Option = 'option',
}

export enum TraceEventType {
  ENGINE_START = 'ENGINE_START',
  ENGINE_END = 'ENGINE_END',
  LLM_REQUEST = 'LLM_REQUEST',
  LLM_RESPONSE = 'LLM_RESPONSE',
  TOOL_EXECUTION_START = 'TOOL_EXECUTION_START',
  TOOL_EXECUTION_END = 'TOOL_EXECUTION_END',
  ERROR = 'ERROR',
}

// ============================================
// Tool Parameter Schemas and Types
// ============================================

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.literal('string'), // MVP only supports string
  inject_as: z.nativeEnum(InjectionType),
  option_name: z.string().optional(),
}).refine(
  (data) => {
    // When inject_as is 'option', option_name must be provided
    if (data.inject_as === InjectionType.Option) {
      return data.option_name !== undefined && data.option_name.length > 0;
    }
    return true;
  },
  {
    message: "option_name is required when inject_as is 'option'",
  }
);

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

// ============================================
// Tool Definition Schemas and Types
// ============================================

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  command: z.array(z.string()).min(1),
  parameters: z.array(ToolParameterSchema),
}).refine(
  (data) => {
    // Ensure at most one parameter has inject_as='stdin'
    const stdinParams = data.parameters.filter(
      p => p.inject_as === InjectionType.Stdin
    );
    return stdinParams.length <= 1;
  },
  {
    message: "At most one parameter can have inject_as='stdin'",
  }
);

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ============================================
// LLM Configuration Schemas and Types
// ============================================

export const LLMConfigSchema = z.object({
  model: z.string().default('gpt-4-turbo-preview'),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ============================================
// Lifecycle Hooks Schemas and Types (v1.1)
// ============================================

export const HookDefinitionSchema = z.object({
  command: z.array(z.string()).min(1),
  timeout_ms: z.number().positive().optional(),
  description: z.string().optional(),
});

export type HookDefinition = z.infer<typeof HookDefinitionSchema>;

export const LifecycleHooksSchema = z.object({
  pre_llm_req: HookDefinitionSchema.optional(),
  post_llm_resp: HookDefinitionSchema.optional(),
  pre_tool_exec: HookDefinitionSchema.optional(),
  post_tool_exec: HookDefinitionSchema.optional(),
  on_error: HookDefinitionSchema.optional(),
}).optional();

export type LifecycleHooks = z.infer<typeof LifecycleHooksSchema>;

// ============================================
// Agent Configuration Schemas and Types
// ============================================

export const AgentConfigSchema = z.object({
  name: z.string(),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  llm: LLMConfigSchema,
  tools: z.array(ToolDefinitionSchema),
  lifecycle_hooks: LifecycleHooksSchema.optional(), // v1.1: Added lifecycle hooks
  max_iterations: z.number().positive().default(10),
  timeout_seconds: z.number().positive().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================
// Runtime Context Types
// ============================================

export interface EngineContext {
  runId: string;
  agentPath: string;      // Agent project absolute path
  workDir: string;        // Run work directory absolute path (CWD)
  deltaDir: string;       // v1.1: .delta directory path (control plane)
  config: AgentConfig;
  systemPrompt: string;
  initialTask: string;
  // v1.1: Stateless core - no in-memory conversation history
  currentStep: number;    // Current step in the T-A-O loop (for journal sequencing)
}

// ============================================
// Tool Execution Result Types
// ============================================

export interface ToolExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean; // exitCode === 0
}

// ============================================
// Trace Event Types
// ============================================

export interface BaseTraceEvent {
  timestamp: string; // ISO 8601 format
  runId: string;
  type: TraceEventType;
}

export interface EngineStartEvent extends BaseTraceEvent {
  type: TraceEventType.ENGINE_START;
  agentPath: string;
  workDir: string;
  task: string;
}

export interface EngineEndEvent extends BaseTraceEvent {
  type: TraceEventType.ENGINE_END;
  success: boolean;
  iterations: number;
}

export interface LLMRequestEvent extends BaseTraceEvent {
  type: TraceEventType.LLM_REQUEST;
  messages: Array<{
    role: string;
    content: string;
  }>;
  tools?: Array<{
    name: string;
    description?: string;
  }>;
}

export interface LLMResponseEvent extends BaseTraceEvent {
  type: TraceEventType.LLM_RESPONSE;
  content?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  finish_reason: string;
}

export interface ToolExecutionStartEvent extends BaseTraceEvent {
  type: TraceEventType.TOOL_EXECUTION_START;
  toolName: string;
  command: string[];
  parameters: Record<string, any>;
}

export interface ToolExecutionEndEvent extends BaseTraceEvent {
  type: TraceEventType.TOOL_EXECUTION_END;
  toolName: string;
  result: ToolExecutionResult;
}

export interface ErrorEvent extends BaseTraceEvent {
  type: TraceEventType.ERROR;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  context?: string;
}

export type TraceEvent =
  | EngineStartEvent
  | EngineEndEvent
  | LLMRequestEvent
  | LLMResponseEvent
  | ToolExecutionStartEvent
  | ToolExecutionEndEvent
  | ErrorEvent;

// ============================================
// CLI Options Types
// ============================================

export interface CLIOptions {
  agent: string;
  task: string;
  workDir?: string;
  verbose?: boolean;
  debug?: boolean;
}

// ============================================
// Tool Function Schema for OpenAI
// ============================================

export interface ToolFunctionSchema {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
      }>;
      required: string[];
    };
  };
}

// ============================================
// Utility function to convert ToolDefinition to OpenAI schema
// ============================================

export function toolDefinitionToOpenAISchema(tool: ToolDefinition): ToolFunctionSchema {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type,
    };
    required.push(param.name);
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}