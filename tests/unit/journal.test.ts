import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { Journal, createJournal } from '../../src/journal.js';
import { JournalEventType, RunStatus } from '../../src/journal-types.js';

/**
 * Critical Invariant Tests for Journal
 *
 * These tests protect against AI breaking data integrity:
 * 1. Sequential writes MUST be preserved (no data loss)
 * 2. Sequence numbers MUST auto-increment (order guarantee)
 * 3. Concurrent writes MUST be safe (no corruption)
 * 4. Resume MUST preserve history (stateless recovery)
 * 5. Corrupted lines MUST be detected (fail-safe)
 *
 * Everything else is implementation detail.
 */
describe('Journal - Critical Invariants', () => {
  let tempDir: string;
  let runId: string;
  let runDir: string;
  let journal: Journal;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `delta-journal-test-${uuidv4()}`);
    runId = `test-run-${uuidv4().substring(0, 8)}`;
    runDir = path.join(tempDir, runId);

    await fs.mkdir(runDir, { recursive: true });

    journal = createJournal(runId, runDir);
  });

  afterEach(async () => {
    try {
      await journal.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Data Integrity Invariants', () => {
    test('MUST auto-increment sequence numbers to preserve order', async () => {
      // This is CRITICAL - ensures events are never out of order
      await journal.initialize();

      await journal.logSystemMessage('INFO', 'Message 1');
      await journal.logSystemMessage('INFO', 'Message 2');
      await journal.logSystemMessage('INFO', 'Message 3');

      const events = await journal.readJournal();

      // CRITICAL: Sequence numbers must be strictly sequential
      expect(events[0].seq).toBe(1);
      expect(events[1].seq).toBe(2);
      expect(events[2].seq).toBe(3);
    });

    test('MUST maintain sequential writes even with concurrent operations', async () => {
      // This is CRITICAL - prevents data corruption under concurrency
      await journal.initialize();

      // Fire off multiple writes concurrently (AI often does this)
      await Promise.all([
        journal.logSystemMessage('INFO', 'Concurrent 1'),
        journal.logSystemMessage('INFO', 'Concurrent 2'),
        journal.logSystemMessage('INFO', 'Concurrent 3'),
        journal.logSystemMessage('INFO', 'Concurrent 4'),
        journal.logSystemMessage('INFO', 'Concurrent 5'),
      ]);

      const events = await journal.readJournal();

      // CRITICAL: All events must be present
      expect(events.length).toBe(5);

      // CRITICAL: Sequence numbers must be sequential (no gaps, no duplicates)
      for (let i = 0; i < 5; i++) {
        expect(events[i].seq).toBe(i + 1);
      }
    });

    test('MUST resume sequence number from existing journal for stateless recovery', async () => {
      // This is CRITICAL - enables stateless architecture
      await journal.initialize();

      // Write some events
      await journal.logRunStart('Test task', '/path/to/agent');
      await journal.logSystemMessage('INFO', 'Message 1');
      await journal.logSystemMessage('INFO', 'Message 2');

      // Close and reopen (simulates process restart)
      await journal.close();

      const journal2 = createJournal(runId, runDir);
      await journal2.initialize();

      // CRITICAL: Must resume from correct sequence
      expect((journal2 as any).sequenceNumber).toBe(3);

      // CRITICAL: Next event must continue sequence
      await journal2.logSystemMessage('INFO', 'After resume');
      const events = await journal2.readJournal();

      expect(events[events.length - 1].seq).toBe(4);

      await journal2.close();
    });

    test('MUST detect corrupted journal lines to prevent silent failures', async () => {
      // This is CRITICAL - corrupted data must not be silently ignored
      await journal.initialize();

      await journal.logSystemMessage('INFO', 'Valid message');

      // Manually append corrupted line (simulates disk corruption, partial write, etc.)
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.appendFile(journalPath, 'invalid json line\n', 'utf-8');

      // CRITICAL: Must throw error, not silently continue
      await expect(journal.readJournal()).rejects.toThrow();
    });

    test('MUST update metadata status correctly for run tracking', async () => {
      // This is CRITICAL - run status must be accurate for recovery
      await journal.initialize();
      await journal.initializeMetadata('/agent/path', 'Test task');

      // Initial status
      let metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.RUNNING);

      // Mark as completed
      await journal.logRunEnd('COMPLETED');
      metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.COMPLETED);

      // Test other critical statuses
      await journal.updateMetadata({ status: RunStatus.INTERRUPTED });
      metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.INTERRUPTED);
    });

    test('MUST increment iterations correctly for max_iterations enforcement', async () => {
      // This is CRITICAL - prevents infinite loops
      await journal.initialize();
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.incrementIterations();
      let metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(1);

      await journal.incrementIterations();
      metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(2);

      await journal.incrementIterations();
      metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(3);
    });

    test('MUST preserve all events when reading journal', async () => {
      // This is CRITICAL - no data loss
      await journal.initialize();
      await journal.initializeMetadata('/agent', 'Task');

      await journal.logRunStart('Task', '/agent');
      await journal.logThought('Thinking', 'inv-1', undefined);
      await journal.logSystemMessage('INFO', 'Message');
      await journal.logRunEnd('COMPLETED');

      const events = await journal.readJournal();

      // CRITICAL: All events must be present
      expect(events.length).toBe(4);
      expect(events[0].type).toBe(JournalEventType.RUN_START);
      expect(events[1].type).toBe(JournalEventType.THOUGHT);
      expect(events[2].type).toBe(JournalEventType.SYSTEM_MESSAGE);
      expect(events[3].type).toBe(JournalEventType.RUN_END);
    });

    test('MUST handle file system errors gracefully', async () => {
      // This is CRITICAL - file errors should not cause silent failures
      await journal.initialize();

      // Make journal path read-only to cause write error
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '', 'utf-8');
      await fs.chmod(journalPath, 0o444); // Read-only

      // CRITICAL: Must throw clear error, not fail silently
      await expect(journal.logSystemMessage('INFO', 'Test')).rejects.toThrow(/Failed to write journal event/);

      // Restore permissions for cleanup
      await fs.chmod(journalPath, 0o644);
    });
  });
});