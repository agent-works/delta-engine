/**
 * Simplified Session Management Types (v1.5)
 *
 * Command-based execution model (no PTY)
 */

import { z } from 'zod';

// ============================================================================
// Session Metadata
// ============================================================================

export const SessionMetadataSchema = z.object({
  session_id: z.string(),
  command: z.string(),
  created_at: z.string(), // ISO 8601
  last_executed_at: z.string().optional(), // ISO 8601
  status: z.enum(['active', 'terminated']),
  work_dir: z.string(),
  execution_count: z.number().default(0),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// ============================================================================
// Execution Result
// ============================================================================

export const ExecutionResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number(),
  execution_time_ms: z.number(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ============================================================================
// Session State (Internal)
// ============================================================================

export const SessionStateSchema = z.object({
  work_dir: z.string(),
  env_vars: z.record(z.string()),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

// ============================================================================
// CLI API Types (JSON responses)
// ============================================================================

export const StartResultSchema = z.object({
  session_id: z.string(),
  command: z.string(),
  work_dir: z.string(),
  status: z.literal('active'),
});

export type StartResult = z.infer<typeof StartResultSchema>;

export const ExecResultSchema = ExecutionResultSchema;
export type ExecResult = ExecutionResult;

export const EndResultSchema = z.object({
  status: z.literal('terminated'),
  session_id: z.string(),
});

export type EndResult = z.infer<typeof EndResultSchema>;

export const ListSessionInfoSchema = z.object({
  session_id: z.string(),
  command: z.string(),
  status: z.enum(['active', 'terminated']),
  created_at: z.string(),
  last_executed_at: z.string().optional(),
  execution_count: z.number(),
});

export type ListSessionInfo = z.infer<typeof ListSessionInfoSchema>;

// ============================================================================
// Manager Configuration
// ============================================================================

export const SessionManagerConfigSchema = z.object({
  sessions_dir: z.string(),
});

export type SessionManagerConfig = z.infer<typeof SessionManagerConfigSchema>;
