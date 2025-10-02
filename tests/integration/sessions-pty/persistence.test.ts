import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.join(process.cwd(), 'dist/sessions-pty-cli.js');

/**
 * Integration tests for PTY session persistence and cross-process communication (v1.4 - EXPERIMENTAL)
 * Tests v1.4.2 Unix Socket-based architecture
 * Note: These tests are for the deprecated PTY-based sessions.
 */
describe('Session Persistence and Reconnection (v1.4.2)', () => {
  let testDir: string;
  let sessionsDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionsDir = path.join(testDir, '.sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test sessions
    try {
      await execFileAsync('node', [CLI_PATH, 'cleanup', '--sessions-dir', sessionsDir]);
    } catch {
      // Ignore cleanup errors
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should write and read from a session', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Write command
    const { stdout: writeOutput } = await execFileAsync(
      'node',
      [CLI_PATH, 'write', session_id, '--sessions-dir', sessionsDir],
      { input: 'echo hello\n' }
    );
    const writeResult = JSON.parse(writeOutput);
    expect(writeResult.status).toBe('sent');
    expect(writeResult.bytes).toBeGreaterThan(0);

    // Wait for output
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Read output
    const { stdout: readOutput } = await execFileAsync('node', [
      CLI_PATH,
      'read',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);

    expect(readOutput).toContain('echo hello');
    expect(readOutput).toContain('hello');
  }, 15000);

  it('should reconnect to session from different process', async () => {
    // Start session in first process
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Write from second process
    await execFileAsync(
      'node',
      [CLI_PATH, 'write', session_id, '--sessions-dir', sessionsDir],
      { input: 'pwd\n' }
    );

    // Wait for output
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Read from third process
    const { stdout: readOutput } = await execFileAsync('node', [
      CLI_PATH,
      'read',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);

    expect(readOutput).toContain('pwd');
  }, 15000);

  it('should handle session holder crash gracefully', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Get holder PID
    const { stdout: statusOutput } = await execFileAsync('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    const { holder_pid } = JSON.parse(statusOutput);

    // Kill holder process
    process.kill(holder_pid, 'SIGKILL');

    // Wait for process to die
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Try to read - should fail gracefully
    await expect(
      execFileAsync('node', [
        CLI_PATH,
        'read',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ])
    ).rejects.toThrow();

    // Cleanup should remove the dead session
    const { stdout: cleanupOutput } = await execFileAsync('node', [
      CLI_PATH,
      'cleanup',
      '--sessions-dir',
      sessionsDir,
    ]);
    const cleanupResult = JSON.parse(cleanupOutput);
    expect(cleanupResult.cleaned).toContain(session_id);
  }, 15000);

  it('should maintain session across multiple CLI invocations', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Multiple write operations from different processes
    for (let i = 0; i < 3; i++) {
      await execFileAsync(
        'node',
        [CLI_PATH, 'write', session_id, '--sessions-dir', sessionsDir],
        { input: `echo test${i}\n` }
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Wait for all output
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Read accumulated output
    const { stdout: readOutput } = await execFileAsync('node', [
      CLI_PATH,
      'read',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);

    expect(readOutput).toContain('test0');
    expect(readOutput).toContain('test1');
    expect(readOutput).toContain('test2');
  }, 20000);

  it('should detect stale socket files', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    const sessionDir = path.join(sessionsDir, session_id);
    const socketPath = path.join(sessionDir, 'session.sock');

    // Verify socket exists
    await expect(fs.access(socketPath)).resolves.toBeUndefined();

    // Get holder PID and kill it
    const { stdout: statusOutput } = await execFileAsync('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    const { holder_pid } = JSON.parse(statusOutput);
    process.kill(holder_pid, 'SIGKILL');

    // Wait for process to die
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Socket file should still exist (stale)
    await expect(fs.access(socketPath)).resolves.toBeUndefined();

    // Cleanup should detect and remove stale socket
    const { stdout: cleanupOutput } = await execFileAsync('node', [
      CLI_PATH,
      'cleanup',
      '--sessions-dir',
      sessionsDir,
    ]);
    const cleanupResult = JSON.parse(cleanupOutput);
    expect(cleanupResult.cleaned).toContain(session_id);

    // Socket should be gone now
    await expect(fs.access(socketPath)).rejects.toThrow();
  }, 15000);

  it('should handle concurrent reads from multiple processes', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Write some data
    await execFileAsync(
      'node',
      [CLI_PATH, 'write', session_id, '--sessions-dir', sessionsDir],
      { input: 'echo concurrent_test\n' }
    );

    // Wait for output
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Multiple concurrent reads
    const reads = await Promise.all([
      execFileAsync('node', [
        CLI_PATH,
        'read',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ]),
      execFileAsync('node', [
        CLI_PATH,
        'read',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ]),
      execFileAsync('node', [
        CLI_PATH,
        'read',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ]),
    ]);

    // First read should get the data (destructive read)
    const outputs = reads.map((r) => r.stdout);
    const nonEmptyOutputs = outputs.filter((o) => o.length > 10);
    expect(nonEmptyOutputs.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('should preserve metadata across reconnections', async () => {
    // Start session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id, command } = JSON.parse(startOutput);

    // Get status from different process
    const { stdout: status1 } = await execFileAsync('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    const metadata1 = JSON.parse(status1);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get status again from another process
    const { stdout: status2 } = await execFileAsync('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    const metadata2 = JSON.parse(status2);

    // Metadata should be consistent
    expect(metadata2.session_id).toBe(session_id);
    expect(metadata2.command).toEqual(command);
    expect(metadata2.pid).toBe(metadata1.pid);
    expect(metadata2.holder_pid).toBe(metadata1.holder_pid);
    expect(metadata2.uptime_seconds).toBeGreaterThan(metadata1.uptime_seconds);
  }, 15000);
});
