import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';
import type { JournalSource } from '../types.js';
import type { Journal } from '../../journal.js';
import type { JournalEvent, ThoughtEvent, ActionResultEvent, UserMessageEvent } from '../../journal-types.js';

/**
 * Journal Source Processor
 *
 * Reconstructs conversation from journal.jsonl as OpenAI-format messages.
 * This is the original conversation rebuilding logic from v1.5, now extracted
 * as a configurable context source.
 */

/**
 * Limit events to recent N iterations
 *
 * An iteration = 1 THOUGHT event + associated ACTION_RESULT events.
 * We count THOUGHT events as iteration boundaries.
 *
 * @param events - All journal events
 * @param maxIterations - Maximum number of iterations to include
 * @returns Events for the last N iterations
 */
function limitToRecentIterations(
  events: JournalEvent[],
  maxIterations: number
): JournalEvent[] {
  // Find all THOUGHT event indices
  const thoughtIndices: number[] = [];
  events.forEach((event, index) => {
    if (event.type === 'THOUGHT') {
      thoughtIndices.push(index);
    }
  });

  // If fewer than maxIterations thoughts, return all events
  if (thoughtIndices.length <= maxIterations) {
    return events;
  }

  // Take events from the (N-maxIterations)th THOUGHT onwards
  const startIndex = thoughtIndices[thoughtIndices.length - maxIterations];
  return events.slice(startIndex!);
}

/**
 * Process journal source: reconstruct conversation as OpenAI messages
 *
 * Workflow:
 * 1. Read all events from journal
 * 2. Apply max_iterations limit if specified
 * 3. Convert THOUGHT events to assistant messages (with tool_calls)
 * 4. Convert ACTION_RESULT events to tool messages
 *
 * @param source - Journal source configuration
 * @param journal - Journal instance
 * @returns Array of OpenAI-format messages (assistant/tool roles)
 */
export async function processJournalSource(
  source: JournalSource,
  journal: Journal
): Promise<ChatCompletionMessageParam[]> {
  // Read all events
  const allEvents = await journal.readJournal();

  // Apply max_iterations limit if specified
  const limitedEvents = source.max_iterations
    ? limitToRecentIterations(allEvents, source.max_iterations)
    : allEvents;

  // Reconstruct as OpenAI-format messages
  const messages: ChatCompletionMessageParam[] = [];

  for (const event of limitedEvents) {
    if (event.type === 'USER_MESSAGE') {
      const userMessageEvent = event as UserMessageEvent;
      messages.push({
        role: 'user',
        content: userMessageEvent.payload.content,
      });
    } else if (event.type === 'THOUGHT') {
      const thoughtEvent = event as ThoughtEvent;
      messages.push({
        role: 'assistant',
        content: thoughtEvent.payload.content || null,
        tool_calls: thoughtEvent.payload.tool_calls,
      } as ChatCompletionMessageParam);
    } else if (event.type === 'ACTION_RESULT') {
      const actionResult = event as ActionResultEvent;
      messages.push({
        role: 'tool',
        content: actionResult.payload.observation_content,
        tool_call_id: actionResult.payload.action_id,
      });
    }
    // Skip other event types (RUN_START, RUN_END, SYSTEM_MESSAGE, etc.)
  }

  return messages;
}
