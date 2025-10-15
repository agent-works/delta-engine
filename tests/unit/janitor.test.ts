#!/usr/bin/env node

/**
 * Unit tests for janitor.ts (v1.10)
 * Tests the Janitor mechanism for safe orphaned run recovery
 */

import os from 'node:os';
import { janitorCheck, applyJanitorCleanup } from '../../src/janitor.js';
import { DeltaRunMetadata, RunStatus } from '../../src/journal-types.js';

describe('janitor.ts - Janitor Mechanism', () => {
  const createMockMetadata = (status: RunStatus, pid?: number): DeltaRunMetadata => ({
    run_id: 'test-run-123',
    start_time: new Date().toISOString(),
    agent_ref: '/path/to/agent',
    task: 'Test task',
    status,
    iterations_completed: 5,
    pid: pid || process.pid,
    hostname: os.hostname(),
    start_time_unix: Date.now(),
    process_name: 'node',
  });

  describe('Quick return for non-RUNNING statuses', () => {
    test('should return wasRunning=false for COMPLETED status', async () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });

    test('should return wasRunning=false for INTERRUPTED status', async () => {
      const metadata = createMockMetadata(RunStatus.INTERRUPTED);
      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });

    test('should return wasRunning=false for WAITING_FOR_INPUT status', async () => {
      const metadata = createMockMetadata(RunStatus.WAITING_FOR_INPUT);
      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });

    test('should return wasRunning=false for FAILED status', async () => {
      const metadata = createMockMetadata(RunStatus.FAILED);
      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });
  });

  describe('Cross-host detection', () => {
    test('should throw error for different hostname without --force', async () => {
      const metadata = createMockMetadata(RunStatus.RUNNING);
      metadata.hostname = 'different-host';

      await expect(janitorCheck(metadata, false)).rejects.toThrow(
        /was started on host 'different-host'/
      );
    });

    test('should throw error message mentioning --force flag', async () => {
      const metadata = createMockMetadata(RunStatus.RUNNING);
      metadata.hostname = 'different-host';

      await expect(janitorCheck(metadata, false)).rejects.toThrow(/use --force/);
    });

    test('should bypass cross-host check with --force=true', async () => {
      const metadata = createMockMetadata(RunStatus.RUNNING, 99999); // Non-existent PID
      metadata.hostname = 'different-host';

      const result = await janitorCheck(metadata, true);

      // Should proceed to PID check, find process dead, and clean up
      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('no longer exists');
    });
  });

  describe('PID liveness check', () => {
    test('should detect dead process (non-existent PID)', async () => {
      const metadata = createMockMetadata(RunStatus.RUNNING, 99999); // Very unlikely PID

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('no longer exists');
    });

    test('should throw error for alive process (current process)', async () => {
      const metadata = createMockMetadata(RunStatus.RUNNING, process.pid);

      await expect(janitorCheck(metadata)).rejects.toThrow(
        /is still active/
      );
    });
  });

  describe('Process name verification (PID reuse protection)', () => {
    test('should clean up if PID reused by different process', async () => {
      // Find a system process that's definitely not node/delta
      const metadata = createMockMetadata(RunStatus.RUNNING, 1); // PID 1 is usually init/launchd
      metadata.hostname = os.hostname(); // Same host to pass cross-host check

      const result = await janitorCheck(metadata);

      // PID 1 exists but is not node/delta, so should clean up
      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('reused by different process');
    });
  });

  describe('applyJanitorCleanup', () => {
    test('should transition status from RUNNING to INTERRUPTED', () => {
      const metadata = createMockMetadata(RunStatus.RUNNING);
      const cleaned = applyJanitorCleanup(metadata);

      expect(cleaned.status).toBe(RunStatus.INTERRUPTED);
    });

    test('should preserve all other metadata fields', () => {
      const metadata = createMockMetadata(RunStatus.RUNNING);
      const cleaned = applyJanitorCleanup(metadata);

      expect(cleaned.run_id).toBe(metadata.run_id);
      expect(cleaned.start_time).toBe(metadata.start_time);
      expect(cleaned.agent_ref).toBe(metadata.agent_ref);
      expect(cleaned.task).toBe(metadata.task);
      expect(cleaned.iterations_completed).toBe(metadata.iterations_completed);
      expect(cleaned.pid).toBe(metadata.pid);
      expect(cleaned.hostname).toBe(metadata.hostname);
    });
  });
});
