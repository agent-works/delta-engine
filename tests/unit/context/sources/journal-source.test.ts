import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';
import { processJournalSource } from '../../../../src/context/sources/journal-source.js';
import { Journal } from '../../../../src/journal.js';
import type { JournalSource } from '../../../../src/context/types.js';

describe('processJournalSource', () => {
  let testDir: string;
  let workDir: string;
  let runId: string;
  let journal: Journal;

  beforeEach(async () => {
    // Create unique test directories for each test
    testDir = path.join('/tmp', `test-journal-source-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    workDir = path.join(testDir, 'workspace');
    runId = `test-run-${Date.now()}`;

    await fs.mkdir(workDir, { recursive: true });

    // Create fresh journal instance for each test
    journal = new Journal(workDir, runId);
    await journal.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await journal.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return ChatCompletionMessageParam[] (not string)', async () => {
    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    // Critical: Result must be an array, not a string
    expect(Array.isArray(result)).toBe(true);
  });

  it('should reconstruct USER_MESSAGE events as user messages', async () => {
    // Log a USER_MESSAGE event (e.g., initial task)
    await journal.logUserMessage('Create 5 test files');

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('user');
    expect(result[0]?.content).toBe('Create 5 test files');
  });

  it('should reconstruct THOUGHT events as assistant messages', async () => {
    // Log a THOUGHT event
    await journal.logThought('Test thinking', 'invoc-001', [
      {
        id: 'call-001',
        type: 'function',
        function: {
          name: 'test_tool',
          arguments: '{"param":"value"}',
        },
      },
    ]);

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('assistant');
    expect(result[0]?.content).toBe('Test thinking');
    expect((result[0] as any).tool_calls).toHaveLength(1);
    expect((result[0] as any).tool_calls[0].id).toBe('call-001');
  });

  it('should reconstruct ACTION_RESULT events as tool messages', async () => {
    // Log a THOUGHT and ACTION_RESULT
    await journal.logThought('Test thinking', 'invoc-001', [
      {
        id: 'call-001',
        type: 'function',
        function: {
          name: 'test_tool',
          arguments: '{"param":"value"}',
        },
      },
    ]);

    await journal.logActionRequest('call-001', 'test_tool', { param: 'value' }, 'test_tool value');
    await journal.logActionResult('call-001', 'SUCCESS', 'Tool output', 'call-001');

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    expect(result).toHaveLength(2);

    // First: assistant message
    expect(result[0]?.role).toBe('assistant');

    // Second: tool message
    expect(result[1]?.role).toBe('tool');
    expect(result[1]?.content).toBe('Tool output');
    expect((result[1] as any).tool_call_id).toBe('call-001');
  });

  it('should skip SYSTEM_MESSAGE and other event types', async () => {
    // Log various event types
    await journal.logSystemMessage('INFO', 'System info message');
    await journal.logThought('Test thinking', 'invoc-001', undefined);

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    // Should only have THOUGHT (1 message), not SYSTEM_MESSAGE
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('assistant');
  });

  it('should limit to recent N iterations when max_iterations specified', async () => {
    // Log 5 iterations (5 THOUGHT events)
    for (let i = 1; i <= 5; i++) {
      await journal.logThought(`Thinking ${i}`, `invoc-00${i}`, undefined);
    }

    const source: JournalSource = {
      type: 'journal',
      max_iterations: 3, // Only last 3 iterations
    };

    const result = await processJournalSource(source, journal);

    // Should have 3 messages (iterations 3, 4, 5)
    expect(result).toHaveLength(3);
    expect(result[0]?.content).toBe('Thinking 3');
    expect(result[1]?.content).toBe('Thinking 4');
    expect(result[2]?.content).toBe('Thinking 5');
  });

  it('should return all events when max_iterations > total iterations', async () => {
    // Log 2 iterations
    await journal.logThought('Thinking 1', 'invoc-001', undefined);
    await journal.logThought('Thinking 2', 'invoc-002', undefined);

    const source: JournalSource = {
      type: 'journal',
      max_iterations: 10, // More than available
    };

    const result = await processJournalSource(source, journal);

    // Should return all 2 messages
    expect(result).toHaveLength(2);
  });

  it('should handle empty journal gracefully', async () => {
    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    // Should return empty array, not throw
    expect(result).toHaveLength(0);
  });

  it('should handle THOUGHT without tool_calls', async () => {
    await journal.logThought('Just thinking, no tools', 'invoc-001', undefined);

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('assistant');
    expect(result[0]?.content).toBe('Just thinking, no tools');
    expect((result[0] as any).tool_calls).toBeUndefined();
  });

  it('should reconstruct conversation with multiple iterations correctly', async () => {
    // Iteration 1
    await journal.logThought('Think 1', 'invoc-001', [
      {
        id: 'call-001',
        type: 'function',
        function: { name: 'tool1', arguments: '{}' },
      },
    ]);
    await journal.logActionRequest('call-001', 'tool1', {}, 'tool1');
    await journal.logActionResult('call-001', 'SUCCESS', 'Result 1', 'call-001');

    // Iteration 2
    await journal.logThought('Think 2', 'invoc-002', [
      {
        id: 'call-002',
        type: 'function',
        function: { name: 'tool2', arguments: '{}' },
      },
    ]);
    await journal.logActionRequest('call-002', 'tool2', {}, 'tool2');
    await journal.logActionResult('call-002', 'SUCCESS', 'Result 2', 'call-002');

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    // Should have 4 messages: assistant, tool, assistant, tool
    expect(result).toHaveLength(4);
    expect(result[0]?.role).toBe('assistant');
    expect(result[1]?.role).toBe('tool');
    expect(result[2]?.role).toBe('assistant');
    expect(result[3]?.role).toBe('tool');
  });

  it('should reconstruct complete conversation with user message first', async () => {
    // Initial user message
    await journal.logUserMessage('Create 3 files');

    // Agent responds with 3 iterations
    for (let i = 1; i <= 3; i++) {
      await journal.logThought(`Creating file${i}`, `invoc-00${i}`, [
        {
          id: `call-00${i}`,
          type: 'function',
          function: { name: 'write_file', arguments: '{}' },
        },
      ]);
      await journal.logActionRequest(`call-00${i}`, 'write_file', {}, 'write_file');
      await journal.logActionResult(`call-00${i}`, 'SUCCESS', `File ${i} created`, `call-00${i}`);
    }

    const source: JournalSource = {
      type: 'journal',
    };

    const result = await processJournalSource(source, journal);

    // Should have: user, assistant, tool, assistant, tool, assistant, tool (7 messages)
    expect(result).toHaveLength(7);
    expect(result[0]?.role).toBe('user');
    expect(result[0]?.content).toBe('Create 3 files');
    expect(result[1]?.role).toBe('assistant');
    expect(result[2]?.role).toBe('tool');
    expect(result[3]?.role).toBe('assistant');
    expect(result[4]?.role).toBe('tool');
    expect(result[5]?.role).toBe('assistant');
    expect(result[6]?.role).toBe('tool');
  });
});
