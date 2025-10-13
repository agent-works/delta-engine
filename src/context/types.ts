import { z } from 'zod';

/**
 * Context Source Type Definitions for v1.6 Context Composition Layer
 *
 * This module defines the schema for context.yaml configuration files.
 * See docs/architecture/v1.6-context-composition.md for design rationale.
 */

// ============================================================================
// File Source
// ============================================================================

/**
 * Static file source - directly injects file content into context
 *
 * Example:
 * - type: file
 *   path: "${AGENT_HOME}/system_prompt.md"
 */
export const FileSourceSchema = z.object({
  type: z.literal('file'),
  id: z.string().optional(),
  path: z.string(),
  on_missing: z.enum(['error', 'skip']).default('error'),
});

export type FileSource = z.infer<typeof FileSourceSchema>;

// ============================================================================
// Computed File Source
// ============================================================================

/**
 * Dynamic content source - executes external command to generate context
 *
 * Example:
 * - type: computed_file
 *   generator:
 *     command: ["python3", "tools/summarize.py"]
 *     timeout_ms: 30000
 *   output_path: "${CWD}/.delta/context_artifacts/summary.md"
 *
 * This is the key mechanism for memory folding and dynamic context generation.
 */
export const ComputedFileSourceSchema = z.object({
  type: z.literal('computed_file'),
  id: z.string().optional(),
  generator: z.object({
    command: z.array(z.string()).min(1, 'Generator command must have at least one element'),
    timeout_ms: z.number().positive().default(30000),
  }),
  output_path: z.string(),
  on_missing: z.enum(['error', 'skip']).default('error'),
});

export type ComputedFileSource = z.infer<typeof ComputedFileSourceSchema>;

// ============================================================================
// Journal Source
// ============================================================================

/**
 * Conversation history source - reconstructs conversation from journal.jsonl
 *
 * This is the original conversation rebuilding logic from v1.5, now configurable.
 * Returns ChatCompletionMessageParam[] (assistant/tool messages), not wrapped text.
 *
 * Example:
 * - type: journal
 *   max_iterations: 15  # Last 15 reasoning cycles (optional)
 */
export const JournalSourceSchema = z.object({
  type: z.literal('journal'),
  id: z.string().optional(),
  max_iterations: z.number().positive().optional(),
});

export type JournalSource = z.infer<typeof JournalSourceSchema>;

// ============================================================================
// Union Type (Discriminated Union)
// ============================================================================

/**
 * Discriminated union of all source types
 * TypeScript will automatically narrow types based on the 'type' field
 */
export const ContextSourceSchema = z.discriminatedUnion('type', [
  FileSourceSchema,
  ComputedFileSourceSchema,
  JournalSourceSchema,
]);

export type ContextSource = z.infer<typeof ContextSourceSchema>;

// ============================================================================
// Context Manifest
// ============================================================================

/**
 * Root schema for context.yaml files
 *
 * Example:
 * sources:
 *   - type: file
 *     path: "${AGENT_HOME}/system_prompt.md"
 *   - type: computed_file
 *     generator:
 *       command: ["python3", "tools/summarize.py"]
 *     output_path: "${CWD}/.delta/context_artifacts/summary.md"
 *   - type: journal
 *     max_turns: 15
 */
export const ContextManifestSchema = z.object({
  sources: z.array(ContextSourceSchema).min(1, 'Context manifest must have at least one source'),
});

export type ContextManifest = z.infer<typeof ContextManifestSchema>;
