/**
 * Context Composition Layer (v1.6)
 *
 * Public API for the context management system.
 * See docs/architecture/v1.6-context-composition.md for design details.
 */

// Main builder class
export { ContextBuilder } from './builder.js';

// Type definitions (types and runtime values separated for ES modules)
export type {
  ContextManifest,
  ContextSource,
  FileSource,
  ComputedFileSource,
  JournalSource,
} from './types.js';

export {
  ContextManifestSchema,
  ContextSourceSchema,
  FileSourceSchema,
  ComputedFileSourceSchema,
  JournalSourceSchema,
} from './types.js';

// Source processors (exported for testing)
export { processFileSource } from './sources/file-source.js';
export { processComputedFileSource } from './sources/computed-source.js';
export { processJournalSource } from './sources/journal-source.js';
