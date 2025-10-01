import { z } from 'zod';

/**
 * Session status enumeration
 */
export type SessionStatus = 'running' | 'dead';

/**
 * Session metadata schema
 * Contains all information needed to manage and reconnect to a session
 */
export const SessionMetadataSchema = z.object({
  session_id: z.string(),
  command: z.array(z.string()),
  pid: z.number().int().positive(),
  created_at: z.string(),
  last_accessed_at: z.string(),
  status: z.enum(['running', 'dead']),
  sessions_dir: z.string(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Session index schema
 * Stores a registry of all sessions in a sessions directory
 */
export const SessionIndexSchema = z.object({
  sessions: z.array(
    z.object({
      session_id: z.string(),
      command: z.string(),
      status: z.enum(['running', 'dead']),
      created_at: z.string(),
    })
  ),
  last_cleanup_at: z.string().optional(),
});

export type SessionIndex = z.infer<typeof SessionIndexSchema>;

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

export class InvalidKeyError extends Error {
  constructor(keyName: string) {
    super(`Invalid key name: ${keyName}`);
    this.name = 'InvalidKeyError';
  }
}
