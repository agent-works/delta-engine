import os from 'node:os';
import { jest } from '@jest/globals';
import { janitorCheck, applyJanitorCleanup, JanitorResult } from '../../src/janitor.js';
import { DeltaRunMetadata, RunStatus } from '../../src/journal-types.js';

/**
 * Janitor Mechanism Tests (v1.10)
 *
 * Critical safety mechanism for recovering orphaned RUNNING processes.
 * These tests validate the three-layer protection:
 * 1. Cross-host detection
 * 2. PID liveness check
 * 3. Process name verification (PID reuse protection)
 */
describe('Janitor Mechanism', () => {
  const createMetadata = (overrides: Partial<DeltaRunMetadata> = {}): DeltaRunMetadata => ({
    run_id: 'test-run-123',
    status: RunStatus.RUNNING,
    pid: 99999, // Non-existent PID by default
    hostname: os.hostname(),
    start_time: new Date().toISOString(),
    process_name: 'node',
    ...overrides,
  });

  describe('REQ-3.5.1: Quick Return for Non-RUNNING Status', () => {
    test('should skip cleanup for COMPLETED status', async () => {
      const metadata = createMetadata({ status: RunStatus.COMPLETED });

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    test('should skip cleanup for FAILED status', async () => {
      const metadata = createMetadata({ status: RunStatus.FAILED });

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });

    test('should skip cleanup for INTERRUPTED status', async () => {
      const metadata = createMetadata({ status: RunStatus.INTERRUPTED });

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });

    test('should skip cleanup for WAITING_FOR_INPUT status', async () => {
      const metadata = createMetadata({ status: RunStatus.WAITING_FOR_INPUT });

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(false);
      expect(result.cleaned).toBe(false);
    });
  });

  describe('REQ-3.5.2: PID Liveness Check', () => {
    test('should detect dead process and allow cleanup', async () => {
      const metadata = createMetadata({ pid: 99999 }); // Extremely unlikely to exist

      const result = await janitorCheck(metadata);

      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('no longer exists');
      expect(result.reason).toContain('99999');
    });

    test('should reject cleanup if current process (still alive)', async () => {
      const metadata = createMetadata({
        pid: process.pid,
        process_name: 'node',
      });

      await expect(janitorCheck(metadata)).rejects.toThrow('still active');
      await expect(janitorCheck(metadata)).rejects.toThrow(process.pid.toString());
    });
  });

  describe('REQ-3.5.2: Process Name Verification (PID Reuse Protection)', () => {
    test('should detect PID reuse by different process type', async () => {
      // Strategy: Find a real PID that is NOT a node process
      // On most systems, PID 1 is init/systemd/launchd
      const nonNodePid = 1;
      const metadata = createMetadata({
        pid: nonNodePid,
        process_name: 'node', // Original process was node
      });

      const result = await janitorCheck(metadata);

      // Should clean up because actual process is not 'node' or 'delta'
      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('reused');
      expect(result.reason).toContain(nonNodePid.toString());
    });

    test('should fail cleanup if process name matches (node still running)', async () => {
      // Use current process (guaranteed to be node and running)
      const metadata = createMetadata({
        pid: process.pid,
        process_name: 'node',
      });

      await expect(janitorCheck(metadata)).rejects.toThrow('still active');
      await expect(janitorCheck(metadata)).rejects.toThrow('Cannot continue');
    });
  });

  describe('REQ-3.5.3: Cross-Host Detection', () => {
    test('should refuse cleanup for different hostname without --force', async () => {
      const metadata = createMetadata({
        hostname: 'other-host-name',
        pid: 99999,
      });

      await expect(janitorCheck(metadata)).rejects.toThrow('other-host-name');
      await expect(janitorCheck(metadata)).rejects.toThrow(os.hostname());
      await expect(janitorCheck(metadata)).rejects.toThrow('--force');
    });

    test('should allow cleanup with --force for cross-host scenario', async () => {
      const metadata = createMetadata({
        hostname: 'other-host-name',
        pid: 99999, // Dead process
      });

      const result = await janitorCheck(metadata, true); // force=true

      expect(result.wasRunning).toBe(true);
      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('no longer exists');
    });

    test('should use current hostname for same-host detection', async () => {
      const currentHost = os.hostname();
      const metadata = createMetadata({
        hostname: currentHost,
        pid: 99999,
      });

      const result = await janitorCheck(metadata);

      // Should succeed (same host, dead process)
      expect(result.cleaned).toBe(true);
    });
  });

  describe('REQ-3.5: Edge Cases and Error Conditions', () => {
    test('should handle permission denied (EPERM) as process alive', async () => {
      // Mock process.kill to simulate EPERM
      const originalKill = process.kill;
      (process as any).kill = jest.fn((pid: number, signal: number) => {
        if (signal === 0) {
          const err: any = new Error('Operation not permitted');
          err.code = 'EPERM';
          throw err;
        }
      });

      try {
        const metadata = createMetadata({ pid: 12345 });

        // EPERM means process exists but we lack permission
        await expect(janitorCheck(metadata)).rejects.toThrow('still active');
      } finally {
        process.kill = originalKill;
      }
    });

    test('should handle ESRCH (no such process) as dead process', async () => {
      // Mock process.kill to simulate ESRCH
      const originalKill = process.kill;
      (process as any).kill = jest.fn((pid: number, signal: number) => {
        if (signal === 0) {
          const err: any = new Error('No such process');
          err.code = 'ESRCH';
          throw err;
        }
      });

      try {
        const metadata = createMetadata({ pid: 12345 });

        const result = await janitorCheck(metadata);

        expect(result.cleaned).toBe(true);
        expect(result.reason).toContain('no longer exists');
      } finally {
        process.kill = originalKill;
      }
    });

    test('should handle process name check failure gracefully', async () => {
      // PID exists but process name check fails (returns empty string)
      // This can happen on Windows or permission issues
      const metadata = createMetadata({
        pid: process.pid, // Current process (exists)
      });

      // Even if process name check fails, should still reject if PID is alive
      await expect(janitorCheck(metadata)).rejects.toThrow('still active');
    });
  });

  describe('REQ-3.5: applyJanitorCleanup Function', () => {
    test('should transition RUNNING to INTERRUPTED', () => {
      const metadata = createMetadata({ status: RunStatus.RUNNING });

      const cleaned = applyJanitorCleanup(metadata);

      expect(cleaned.status).toBe(RunStatus.INTERRUPTED);
      expect(cleaned.run_id).toBe(metadata.run_id);
      expect(cleaned.pid).toBe(metadata.pid);
    });

    test('should preserve all other metadata fields', () => {
      const metadata = createMetadata({
        status: RunStatus.RUNNING,
        pid: 12345,
        hostname: 'test-host',
        start_time: '2025-10-14T10:00:00Z',
        process_name: 'node',
      });

      const cleaned = applyJanitorCleanup(metadata);

      expect(cleaned.run_id).toBe(metadata.run_id);
      expect(cleaned.pid).toBe(12345);
      expect(cleaned.hostname).toBe('test-host');
      expect(cleaned.start_time).toBe('2025-10-14T10:00:00Z');
      expect(cleaned.process_name).toBe('node');
      expect(cleaned.status).toBe(RunStatus.INTERRUPTED);
    });

    test('should work even for non-RUNNING status (idempotent)', () => {
      const metadata = createMetadata({ status: RunStatus.COMPLETED });

      const cleaned = applyJanitorCleanup(metadata);

      // Should still transition to INTERRUPTED (even though it's unusual)
      expect(cleaned.status).toBe(RunStatus.INTERRUPTED);
    });
  });

  describe('Integration: Complete Janitor Workflow', () => {
    test('should correctly identify and clean orphaned run', async () => {
      // Scenario: Process was killed (PID no longer exists)
      const metadata = createMetadata({
        status: RunStatus.RUNNING,
        pid: 99999,
        hostname: os.hostname(),
      });

      // Step 1: Check if cleanup needed
      const result = await janitorCheck(metadata);
      expect(result.cleaned).toBe(true);

      // Step 2: Apply cleanup
      const cleanedMetadata = applyJanitorCleanup(metadata);
      expect(cleanedMetadata.status).toBe(RunStatus.INTERRUPTED);
    });

    test('should refuse cleanup for active run', async () => {
      // Scenario: Process still running (current process)
      const metadata = createMetadata({
        status: RunStatus.RUNNING,
        pid: process.pid,
        hostname: os.hostname(),
      });

      // Should throw error, no cleanup
      await expect(janitorCheck(metadata)).rejects.toThrow('still active');
    });

    test('should detect PID reuse and clean up safely', async () => {
      // Scenario: PID reused by different process (e.g., bash replaced node)
      const metadata = createMetadata({
        status: RunStatus.RUNNING,
        pid: 1, // System process (init/systemd/launchd) - not node
        hostname: os.hostname(),
        process_name: 'node', // Original process was node
      });

      const result = await janitorCheck(metadata);

      expect(result.cleaned).toBe(true);
      expect(result.reason).toContain('reused');
    });
  });
});
