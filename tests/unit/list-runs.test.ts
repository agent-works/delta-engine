/**
 * Unit Tests: list-runs.ts
 *
 * Tests for v1.10 list-runs command functionality
 * Coverage: listRuns(), formatRunList(), filtering, sorting
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { listRuns, formatRunList, RunInfo } from '../../src/commands/list-runs.js';
import { RunStatus } from '../../src/journal-types.js';

describe('list-runs.ts', () => {
  let tempDir: string;
  let deltaDir: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(os.tmpdir(), `list-runs-test-${uuidv4()}`);
    deltaDir = path.join(tempDir, '.delta');
    await fs.mkdir(deltaDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('listRuns()', () => {
    it('should return empty array for empty workspace', async () => {
      // No runs created
      const runs = await listRuns(deltaDir);
      expect(runs).toEqual([]);
    });

    it('should return all runs when no filters applied', async () => {
      // Create 5 runs with different statuses
      await createTestRun(deltaDir, 'run-1', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');
      await createTestRun(deltaDir, 'run-2', RunStatus.RUNNING, '2025-01-01T11:00:00Z');
      await createTestRun(deltaDir, 'run-3', RunStatus.INTERRUPTED, '2025-01-01T12:00:00Z');
      await createTestRun(deltaDir, 'run-4', RunStatus.FAILED, '2025-01-01T13:00:00Z');
      await createTestRun(deltaDir, 'run-5', RunStatus.WAITING_FOR_INPUT, '2025-01-01T14:00:00Z');

      const runs = await listRuns(deltaDir);
      expect(runs).toHaveLength(5);
    });

    it('should filter by status', async () => {
      // Create runs with mixed statuses
      await createTestRun(deltaDir, 'run-1', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');
      await createTestRun(deltaDir, 'run-2', RunStatus.COMPLETED, '2025-01-01T11:00:00Z');
      await createTestRun(deltaDir, 'run-3', RunStatus.FAILED, '2025-01-01T12:00:00Z');

      const runs = await listRuns(deltaDir, { status: RunStatus.COMPLETED });
      expect(runs).toHaveLength(2);
      expect(runs.every(r => r.status === RunStatus.COMPLETED)).toBe(true);
    });

    it('should filter resumable runs (INTERRUPTED and WAITING_FOR_INPUT only)', async () => {
      // Create runs with different statuses
      await createTestRun(deltaDir, 'run-1', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');
      await createTestRun(deltaDir, 'run-2', RunStatus.RUNNING, '2025-01-01T11:00:00Z');
      await createTestRun(deltaDir, 'run-3', RunStatus.INTERRUPTED, '2025-01-01T12:00:00Z');
      await createTestRun(deltaDir, 'run-4', RunStatus.FAILED, '2025-01-01T13:00:00Z');
      await createTestRun(deltaDir, 'run-5', RunStatus.WAITING_FOR_INPUT, '2025-01-01T14:00:00Z');

      const runs = await listRuns(deltaDir, { resumable: true });

      // Only INTERRUPTED and WAITING_FOR_INPUT should be returned
      expect(runs).toHaveLength(2);
      expect(runs.some(r => r.status === RunStatus.INTERRUPTED)).toBe(true);
      expect(runs.some(r => r.status === RunStatus.WAITING_FOR_INPUT)).toBe(true);
      expect(runs.every(r =>
        r.status === RunStatus.INTERRUPTED ||
        r.status === RunStatus.WAITING_FOR_INPUT
      )).toBe(true);
    });

    it('should sort by start_time (most recent first)', async () => {
      // Create runs with different timestamps
      await createTestRun(deltaDir, 'run-old', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');
      await createTestRun(deltaDir, 'run-middle', RunStatus.COMPLETED, '2025-01-01T12:00:00Z');
      await createTestRun(deltaDir, 'run-new', RunStatus.COMPLETED, '2025-01-01T14:00:00Z');

      const runs = await listRuns(deltaDir);

      // Should be sorted newest first
      expect(runs).toHaveLength(3);
      expect(runs[0].run_id).toBe('run-new');
      expect(runs[1].run_id).toBe('run-middle');
      expect(runs[2].run_id).toBe('run-old');
    });

    it('should return only first run when --first flag is true', async () => {
      // Create 3 runs
      await createTestRun(deltaDir, 'run-1', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');
      await createTestRun(deltaDir, 'run-2', RunStatus.COMPLETED, '2025-01-01T11:00:00Z');
      await createTestRun(deltaDir, 'run-3', RunStatus.COMPLETED, '2025-01-01T12:00:00Z');

      const runs = await listRuns(deltaDir, { first: true });

      // Should return only the most recent run
      expect(runs).toHaveLength(1);
      expect(runs[0].run_id).toBe('run-3');
    });

    it('should skip invalid metadata files', async () => {
      // Create valid run
      await createTestRun(deltaDir, 'run-valid', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');

      // Create invalid run (corrupted metadata)
      const invalidRunDir = path.join(deltaDir, 'run-invalid');
      await fs.mkdir(invalidRunDir, { recursive: true });
      await fs.writeFile(
        path.join(invalidRunDir, 'metadata.json'),
        'invalid json {',
        'utf-8'
      );

      const runs = await listRuns(deltaDir);

      // Should only return the valid run
      expect(runs).toHaveLength(1);
      expect(runs[0].run_id).toBe('run-valid');
    });

    it('should ignore VERSION file and dot files', async () => {
      // Create VERSION file
      await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.0', 'utf-8');

      // Create .gitignore file
      await fs.writeFile(path.join(deltaDir, '.gitignore'), '', 'utf-8');

      // Create valid run
      await createTestRun(deltaDir, 'run-1', RunStatus.COMPLETED, '2025-01-01T10:00:00Z');

      const runs = await listRuns(deltaDir);

      // Should only return the actual run, not VERSION or dot files
      expect(runs).toHaveLength(1);
      expect(runs[0].run_id).toBe('run-1');
    });
  });

  describe('formatRunList()', () => {
    const mockRuns: RunInfo[] = [
      {
        run_id: 'run-1',
        status: RunStatus.COMPLETED,
        start_time: '2025-01-01T10:00:00Z',
        end_time: '2025-01-01T10:05:00Z',
        task: 'Test task 1',
        iterations_completed: 5,
      },
      {
        run_id: 'run-2',
        status: RunStatus.INTERRUPTED,
        start_time: '2025-01-01T11:00:00Z',
        task: 'Test task 2',
        iterations_completed: 3,
      },
    ];

    it('should format empty array as JSON', () => {
      const output = formatRunList([], 'json');
      expect(output).toBe('[]');
    });

    it('should format empty array as text', () => {
      const output = formatRunList([], 'text');
      expect(output).toBe('[INFO] No runs found');
    });

    it('should format empty array as raw (empty string)', () => {
      const output = formatRunList([], 'raw');
      expect(output).toBe('');
    });

    it('should format runs as JSON', () => {
      const output = formatRunList(mockRuns, 'json');
      const parsed = JSON.parse(output);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].run_id).toBe('run-1');
      expect(parsed[1].run_id).toBe('run-2');
    });

    it('should format runs as raw (run IDs only)', () => {
      const output = formatRunList(mockRuns, 'raw');
      const lines = output.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('run-1');
      expect(lines[1]).toBe('run-2');
    });

    it('should format runs as human-readable text', () => {
      const output = formatRunList(mockRuns, 'text');

      // Check for expected structure
      expect(output).toContain('Found 2 run(s)');
      expect(output).toContain('Run ID: run-1');
      expect(output).toContain('Run ID: run-2');
      expect(output).toContain('Status: COMPLETED');
      expect(output).toContain('Status: INTERRUPTED');
      expect(output).toContain('Start Time:');
      expect(output).toContain('End Time:');
      expect(output).toContain('Iterations: 5');
      expect(output).toContain('Iterations: 3');
      expect(output).toContain('Task: Test task 1');
      expect(output).toContain('Task: Test task 2');
    });

    it('should truncate long task names in text format', () => {
      const longTaskRun: RunInfo = {
        run_id: 'run-long',
        status: RunStatus.COMPLETED,
        start_time: '2025-01-01T10:00:00Z',
        task: 'A'.repeat(100), // 100 characters
        iterations_completed: 1,
      };

      const output = formatRunList([longTaskRun], 'text');

      // Task should be truncated to 60 chars + '...'
      expect(output).toContain('A'.repeat(60) + '...');
      expect(output).not.toContain('A'.repeat(100));
    });

    it('should not show End Time if not present', () => {
      const runWithoutEndTime: RunInfo = {
        run_id: 'run-no-end',
        status: RunStatus.RUNNING,
        start_time: '2025-01-01T10:00:00Z',
        task: 'Running task',
        iterations_completed: 2,
      };

      const output = formatRunList([runWithoutEndTime], 'text');

      expect(output).toContain('Start Time:');
      expect(output).not.toContain('End Time:');
    });
  });
});

/**
 * Helper: Create a test run with metadata
 */
async function createTestRun(
  deltaDir: string,
  runId: string,
  status: RunStatus,
  startTime: string,
  endTime?: string
): Promise<void> {
  const runDir = path.join(deltaDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  const metadata = {
    run_id: runId,
    status: status,
    start_time: startTime,
    end_time: endTime,
    task: `Task for ${runId}`,
    iterations_completed: 3,
    max_iterations: 30,
    agent_ref: 'test-agent',
    pid: process.pid,
    hostname: os.hostname(),
    process_name: 'node',
  };

  await fs.writeFile(
    path.join(runDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );
}
