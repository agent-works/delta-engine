import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';
import type { Journal } from '../journal.js';
import {
  ContextManifest,
  ContextManifestSchema,
  ContextSource,
} from './types.js';
import { processFileSource } from './sources/file-source.js';
import { processComputedFileSource } from './sources/computed-source.js';
import { processJournalSource } from './sources/journal-source.js';

/**
 * ContextBuilder - Core of v1.6 Context Composition Layer
 *
 * Responsibilities:
 * 1. Load context.yaml (required in v1.9.1+)
 * 2. Process sources in order (file, computed_file, journal)
 * 3. Assemble final context messages for LLM
 *
 * Design principle: The engine doesn't understand context, it just collects it.
 */
export class ContextBuilder {
  constructor(
    private agentHome: string,
    private cwd: string,
    private runId: string,
    private journal: Journal
  ) {}

  /**
   * Build LLM context messages from manifest
   *
   * This is the main entry point. Workflow:
   * 1. Load manifest (context.yaml or default)
   * 2. Process each source in order
   * 3. Wrap content with source identification
   * 4. Assemble into ChatCompletionMessageParam array
   *
   * @returns Array of messages ready for LLM
   */
  async build(): Promise<ChatCompletionMessageParam[]> {
    const manifest = await this.loadManifest();
    const messages: ChatCompletionMessageParam[] = [];

    for (const source of manifest.sources) {
      try {
        const content = await this.processSource(source);
        if (content) {
          // Journal source returns message array, not string
          if (source.type === 'journal') {
            // Journal source returns ChatCompletionMessageParam[]
            // Directly append to messages (no wrapping needed)
            messages.push(...(content as ChatCompletionMessageParam[]));
          } else {
            // file/computed_file sources return string content
            // Wrap with source identification header
            const wrappedContent = this.wrapContent(source, content as string);
            messages.push({
              role: 'system',
              content: wrappedContent,
            });
          }
        }
      } catch (err: any) {
        // Handle on_missing behavior
        if (this.shouldSkip(source, err)) {
          // Silently skip (e.g., DELTA.md doesn't exist)
          continue;
        }
        // Re-throw error if not skippable
        throw err;
      }
    }

    return messages;
  }

  /**
   * Load context.yaml (required in v1.9.1+)
   *
   * @returns Parsed and validated context manifest
   * @throws Error if context.yaml is missing or malformed
   */
  async loadManifest(): Promise<ContextManifest> {
    const manifestPath = path.join(this.agentHome, 'context.yaml');

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const parsed = yaml.load(content);

      // Validate with Zod schema
      return ContextManifestSchema.parse(parsed);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // context.yaml is missing - provide helpful error message
        throw new Error(
          `context.yaml not found in ${this.agentHome}\n\n` +
          `Delta Engine requires an explicit context.yaml file to define how\n` +
          `the agent's attention window is constructed.\n\n` +
          `Quick fix - Create context.yaml with default content:\n\n` +
          `sources:\n` +
          `  - type: file\n` +
          `    id: system_prompt\n` +
          `    path: '\${AGENT_HOME}/system_prompt.md'\n` +
          `  - type: file\n` +
          `    id: workspace_guide\n` +
          `    path: '\${CWD}/DELTA.md'\n` +
          `    on_missing: skip\n` +
          `  - type: journal\n` +
          `    id: conversation_history\n\n` +
          `For more information, see:\n` +
          `docs/architecture/v1.9-unified-agent-structure.md#9-addendum-contextyaml-status-upgrade-v191`
        );
      }

      // context.yaml exists but is invalid
      throw new Error(`Failed to parse context.yaml: ${err.message}`);
    }
  }

  /**
   * Process a single source (delegate to type-specific processors)
   *
   * Uses discriminated union to narrow types automatically.
   *
   * @param source - Source configuration
   * @returns Generated content (string for file/computed_file, message array for journal)
   */
  private async processSource(
    source: ContextSource
  ): Promise<string | ChatCompletionMessageParam[] | null> {
    switch (source.type) {
      case 'file':
        return processFileSource(source, this.agentHome, this.cwd);

      case 'computed_file':
        return processComputedFileSource(source, this.agentHome, this.cwd, this.runId);

      case 'journal':
        return processJournalSource(source, this.journal);
    }
  }

  /**
   * Wrap content with source identification header
   *
   * This makes the context structure visible to the LLM and helps with debugging.
   *
   * Example output:
   * ```
   * # Context Block: system_prompt
   *
   * You are a helpful assistant...
   * ```
   *
   * @param source - Source configuration
   * @param content - Generated content
   * @returns Wrapped content with header
   */
  private wrapContent(source: ContextSource, content: string): string {
    const id = source.id || source.type;
    return `# Context Block: ${id}\n\n${content}`;
  }

  /**
   * Check if error should be skipped based on on_missing field
   *
   * Only file-not-found errors (ENOENT) are skippable, and only when
   * source.on_missing === 'skip'.
   *
   * @param source - Source configuration
   * @param err - Error object
   * @returns true if error should be silently skipped
   */
  private shouldSkip(source: ContextSource, err: any): boolean {
    // Check if source has on_missing field
    if ('on_missing' in source && source.on_missing === 'skip') {
      // Only skip file-not-found errors
      return err.code === 'ENOENT' || err.message?.includes('not found');
    }
    return false;
  }
}
