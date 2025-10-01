import { z } from 'zod';

/**
 * Session status enumeration
 */
export type SessionStatus = 'running' | 'dead';

/**
 * Session metadata schema
 * Contains all information needed to manage a session
 */
export const SessionMetadataSchema = z.object({
  session_id: z.string(),
  command: z.array(z.string()),
  pid: z.number().int().positive(), // PTY process PID
  holder_pid: z.number().int().positive(), // Holder process PID
  created_at: z.string(),
  last_accessed_at: z.string(),
  status: z.enum(['running', 'dead']),
  exit_code: z.number().int().optional(), // PTY exit code when dead
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Session configuration
 */
export interface SessionConfig {
  sessions_dir: string;
}

/**
 * Session read options
 */
export interface ReadOptions {
  timeout?: number; // Milliseconds to wait for output (0 = immediate)
  lines?: number;   // Return only last N lines
}

/**
 * Socket protocol types
 */
export type SocketRequest =
  | { type: 'write'; data: string }
  | { type: 'read' }
  | { type: 'peek' }
  | { type: 'shutdown' };

export type SocketResponse =
  | { status: 'ok'; bytes?: number; output?: string }
  | { status: 'error'; message: string };

/**
 * CLI command result types
 */
export interface StartResult {
  session_id: string;
  status: 'running';
  pid: number;
  command: string[];
}

export interface WriteResult {
  status: 'sent';
  bytes: number;
  session_id: string;
}

export interface WriteKeyResult {
  status: 'sent';
  key: string;
  session_id: string;
}

export interface EndResult {
  status: 'terminated';
  session_id: string;
}

export interface StatusResult {
  session_id: string;
  status: SessionStatus;
  pid: number;
  holder_pid: number;
  alive: boolean;
  uptime_seconds: number;
  command: string[];
}

export interface CleanupResult {
  cleaned: string[];
  remaining: string[];
}

export interface ListSessionInfo {
  session_id: string;
  command: string;
  status: SessionStatus;
  pid: number;
  holder_pid: number;
  created_at: string;
  last_accessed_at: string;
}

/**
 * Error types for better error handling
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionDeadError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is dead`);
    this.name = 'SessionDeadError';
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} already exists`);
    this.name = 'SessionAlreadyExistsError';
  }
}
