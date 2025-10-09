import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { createJournal } from '../../src/journal.js';

/**
 * Tests for journal format validation
 *
 * Purpose: Prevent data corruption from external tools (e.g., VSCode JSONL viewer plugins)
 * that may convert journal.jsonl to JSON array format or rename the file.
 *
 * Real-world incident: 2025-10-09
 * - VSCode JSONL viewer plugin converted journal.jsonl → journal.json (JSON array)
 * - File was corrupted, making state reconstruction impossible
 * - See: .story/traps/journal-format-corruption.md
 */
describe('Journal Format Validation', () => {
  let tempDir: string;
  let runId: string;
  let runDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `delta-journal-validation-test-${uuidv4()}`);
    runId = `test-run-${uuidv4().substring(0, 8)}`;
    runDir = path.join(tempDir, runId);
    await fs.mkdir(runDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Filename Validation', () => {
    test('should accept correct filename "journal.jsonl"', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '{"seq":1,"type":"RUN_START","timestamp":"2025-01-01T00:00:00.000Z","payload":{}}\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });

    test('should reject wrong filename "journal.json"', async () => {
      const journal = createJournal(runId, runDir);
      // Hack: modify private journalPath for testing
      (journal as any).journalPath = path.join(runDir, 'journal.json');

      await expect(journal.initialize()).rejects.toThrow(/FATAL.*journal\.jsonl/);
      await expect(journal.initialize()).rejects.toThrow(/VSCode plugin/);
    });

    test('should reject other filenames like "journal.log"', async () => {
      const journal = createJournal(runId, runDir);
      (journal as any).journalPath = path.join(runDir, 'journal.log');

      await expect(journal.initialize()).rejects.toThrow(/FATAL.*journal\.jsonl/);
    });
  });

  describe('Format Validation - JSON Array Detection', () => {
    test('should reject JSON array format (starts with "[")', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      // Write corrupted JSON array format
      await fs.writeFile(journalPath, '[\n  {"seq":1,"type":"RUN_START"}\n]\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(/FATAL.*JSON array format/);
      await expect(journal.initialize()).rejects.toThrow(/starts with '\['/);
    });

    test('should accept valid JSONL format (starts with "{")', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '{"seq":1,"type":"RUN_START","timestamp":"2025-01-01T00:00:00.000Z","payload":{}}\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });

    test('should accept multiple JSONL lines', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(
        journalPath,
        '{"seq":1,"type":"RUN_START","timestamp":"2025-01-01T00:00:00.000Z","payload":{}}\n' +
        '{"seq":2,"type":"USER_MESSAGE","timestamp":"2025-01-01T00:00:01.000Z","payload":{"content":"test"}}\n',
        'utf-8'
      );

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });
  });

  describe('Format Validation - Pretty-Printed JSON Detection', () => {
    test('should reject pretty-printed JSON with indentation', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      // Write pretty-printed format (what JSON formatters might create)
      await fs.writeFile(
        journalPath,
        '{\n  "seq": 1,\n  "type": "RUN_START"\n}\n',
        'utf-8'
      );

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(/FATAL.*pretty-printed JSON/);
      await expect(journal.initialize()).rejects.toThrow(/JSON formatter/);
    });

    test('should accept compact single-line JSON', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '{"seq":1,"type":"RUN_START"}\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should accept empty journal file (new run)', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });

    test('should accept non-existent journal file (new run)', async () => {
      // Don't create the file
      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).resolves.not.toThrow();
    });

    test('should provide helpful error message with file path', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '[\n{"seq":1}\n]\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(journalPath);
    });

    test('should mention VSCode JSONL viewer as possible cause', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '[]\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(/VSCode JSONL viewer/);
    });

    test('should suggest solution (restore or delete)', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '[]\n', 'utf-8');

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(/Restore from backup or delete/);
    });
  });

  describe('Real-World Corruption Scenarios', () => {
    test('should detect format created by VSCode JSONL viewer', async () => {
      const journalPath = path.join(runDir, 'journal.jsonl');
      // This is the actual format created by VSCode JSONL viewer plugin
      await fs.writeFile(
        journalPath,
        '[\n' +
        '  {\n' +
        '    "seq": 1,\n' +
        '    "timestamp": "2025-10-09T12:06:31.003Z",\n' +
        '    "type": "RUN_START",\n' +
        '    "payload": {\n' +
        '      "run_id": "test"\n' +
        '    }\n' +
        '  }\n' +
        ']\n',
        'utf-8'
      );

      const journal = createJournal(runId, runDir);
      await expect(journal.initialize()).rejects.toThrow(/FATAL/);
    });

    test('should detect renamed file (journal.json instead of journal.jsonl)', async () => {
      const journal = createJournal(runId, runDir);
      (journal as any).journalPath = path.join(runDir, 'journal.json');
      await fs.writeFile(path.join(runDir, 'journal.json'), '{"seq":1}\n', 'utf-8');

      await expect(journal.initialize()).rejects.toThrow(/FATAL.*journal\.jsonl/);
    });
  });
});
