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
  description: z.string().optional(), // v1.7: Optional parameter description for LLM
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
// Tool Configuration Schemas (v1.7 Simplified Syntax)
// ============================================

/**
 * v1.7: Exec mode - Direct execution without shell (safest)
 * Example: exec: "ls -F ${directory}"
 */
export const ExecToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  exec: z.string(), // Template string with ${param} placeholders
  stdin: z.string().optional(), // Optional stdin parameter name
  parameters: z.array(ToolParameterSchema).optional(), // Explicit parameter metadata (override/supplement)
});

export type ExecToolConfig = z.infer<typeof ExecToolConfigSchema>;

/**
 * v1.7: Shell mode - Shell-interpreted execution for pipes/redirects
 * Example: shell: "cat ${file} | wc -l"
 * Supports ${param:raw} for unquoted expansion (expert feature)
 */
export const ShellToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  shell: z.string(), // Template with ${param} or ${param:raw}
  stdin: z.string().optional(),
  parameters: z.array(ToolParameterSchema).optional(),
});

export type ShellToolConfig = z.infer<typeof ShellToolConfigSchema>;

/**
 * v1.0-v1.6: Legacy full configuration (explicit command array)
 * Remains fully supported for backward compatibility
 */
export const LegacyToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  command: z.array(z.string()).min(1),
  parameters: z.array(ToolParameterSchema),
});

export type LegacyToolConfig = z.infer<typeof LegacyToolConfigSchema>;

/**
 * Union type for all tool configuration formats
 * Note: Discrimination happens via detectToolConfigMode() helper
 */
export type ToolConfig = ExecToolConfig | ShellToolConfig | LegacyToolConfig;

// ============================================
// Tool Definition Schemas and Types
// ============================================

/**
 * Internal representation of a tool (post-expansion)
 * All v1.7 syntax sugar is converted to this format
 */
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  command: z.array(z.string()).min(1),
  parameters: z.array(ToolParameterSchema),
  // v1.7: Optional metadata for debugging and transparency
  __meta: z.object({
    syntax: z.enum(['legacy', 'exec', 'shell']).optional(),
    original_template: z.string().optional(),
  }).optional(),
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

/**
 * v1.7: Detect which configuration mode a raw tool config uses
 * Used during config loading to route to appropriate expansion logic
 *
 * @param rawConfig - Unvalidated tool configuration object
 * @returns 'exec' | 'shell' | 'legacy' | 'invalid'
 */
export function detectToolConfigMode(rawConfig: unknown): 'exec' | 'shell' | 'legacy' | 'invalid' {
  if (typeof rawConfig !== 'object' || rawConfig === null) {
    return 'invalid';
  }

  const config = rawConfig as Record<string, unknown>;

  const hasExec = 'exec' in config && typeof config.exec === 'string';
  const hasShell = 'shell' in config && typeof config.shell === 'string';
  const hasCommand = 'command' in config && Array.isArray(config.command);

  // Count how many mode indicators are present
  const modeCount = [hasExec, hasShell, hasCommand].filter(Boolean).length;

  // Validate mutual exclusivity
  if (modeCount === 0) {
    return 'invalid'; // No mode specified
  }
  if (modeCount > 1) {
    return 'invalid'; // Multiple modes specified (mutually exclusive)
  }

  // Determine mode
  if (hasExec) return 'exec';
  if (hasShell) return 'shell';
  return 'legacy';
}

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

// v1.9: Dedicated schema for hooks.yaml file
// This is the same structure as LifecycleHooksSchema but not optional at root level
export const HooksConfigSchema = z.object({
  pre_llm_req: HookDefinitionSchema.optional(),
  post_llm_resp: HookDefinitionSchema.optional(),
  pre_tool_exec: HookDefinitionSchema.optional(),
  post_tool_exec: HookDefinitionSchema.optional(),
  on_error: HookDefinitionSchema.optional(),
  on_run_end: HookDefinitionSchema.optional(), // v1.9: Added on_run_end hook
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// ============================================
// Agent Configuration Schemas and Types
// ============================================

export const AgentConfigSchema = z.object({
  name: z.string(),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  imports: z.array(z.string()).optional(), // v1.9: Import tool definitions from external files
  llm: LLMConfigSchema,
  tools: z.array(ToolDefinitionSchema),
  lifecycle_hooks: LifecycleHooksSchema.optional(), // v1.1: Added lifecycle hooks (deprecated in v1.9, use hooks.yaml)
  max_iterations: z.number().positive().default(30), // Per CLAUDE.md: DEFAULT_MAX_ITERATIONS = 30
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
  journal: import('./journal.js').Journal; // Shared journal instance to prevent FileHandle leaks
  isInteractive?: boolean; // v1.2: Interactive mode flag for ask_human
  loadedEnvFiles?: string[]; // v1.8: List of loaded .env file paths (for logging)
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

// ============================================
// v1.10: Output Format and RunResult Types
// ============================================

/**
 * v1.10: Output format enum for --format flag
 */
export enum OutputFormat {
  Text = 'text',    // Human-readable summary (default)
  Json = 'json',    // Structured JSON (RunResult v2.0)
  Raw = 'raw',      // Pure data for Unix pipes
}

/**
 * v1.10: RunResult v2.0 Schema - Structured output contract
 * Used for --format json mode
 */
export const RunResultSchema = z.object({
  schema_version: z.literal('2.0'),
  run_id: z.string(),
  status: z.enum(['COMPLETED', 'FAILED', 'WAITING_FOR_INPUT', 'INTERRUPTED']),

  // Conditional fields (mutually exclusive based on status)
  result: z.union([z.string(), z.record(z.any())]).optional(),
  error: z.object({
    type: z.string(),
    message: z.string(),
    details: z.string().optional(),
  }).optional(),
  interaction: z.object({
    prompt: z.string(),
    input_type: z.enum(['text', 'password', 'confirmation']),
    sensitive: z.boolean(),
  }).optional(),

  metrics: z.object({
    iterations: z.number(),
    duration_ms: z.number(),
    start_time: z.string(),
    end_time: z.string(),
    usage: z.object({
      total_cost_usd: z.number(),
      input_tokens: z.number(),
      output_tokens: z.number(),
      model_usage: z.record(z.any()),
    }),
  }),

  metadata: z.object({
    agent_name: z.string(),
    workspace_path: z.string(),
  }),
});

export type RunResult = z.infer<typeof RunResultSchema>;

// ============================================
// v1.10: Enhanced CLI Options Types
// ============================================

/**
 * v1.10: Options for 'delta run' command
 */
export interface RunCommandOptions {
  agent: string;
  message: string;
  workDir?: string;
  maxIterations?: number;
  verbose?: boolean;
  interactive?: boolean;
  yes?: boolean;
  runId?: string;        // [New v1.10] Client-generated run ID
  format?: OutputFormat; // [New v1.10] Output format
}

/**
 * v1.10: Options for 'delta continue' command
 */
export interface ContinueCommandOptions {
  workDir: string;
  runId: string;         // [Changed v1.10] Now required
  message?: string;
  verbose?: boolean;
  interactive?: boolean;
  force?: boolean;       // [New v1.10] Force continue (skip cross-host check)
  format?: OutputFormat; // [New v1.10] Output format
}

/**
 * v1.10: Options for 'delta list-runs' command
 */
export interface ListRunsOptions {
  workDir?: string;
  resumable?: boolean;     // Filter to only resumable runs
  status?: string;         // Filter by specific status
  first?: boolean;         // Return only the most recent run
  format?: OutputFormat;   // Output format (text or json)
}