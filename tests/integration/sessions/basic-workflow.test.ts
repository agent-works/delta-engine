import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.join(process.cwd(), 'dist/sessions-cli.js');

/**
 * Integration tests for basic session workflow
 */
describe('Session Workflow Integration', () => {
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

  it('should start a bash session', async () => {
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);

    const result = JSON.parse(stdout);
    expect(result.session_id).toMatch(/^sess_/);
    expect(result.status).toBe('running');
    expect(result.pid).toBeGreaterThan(0);
    expect(result.command).toEqual(['bash', '-i']);
  });

  it('should list sessions', async () => {
    // Start a session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // List sessions
    const { stdout: listOutput } = await execFileAsync('node', [
      CLI_PATH,
      'list',
      '--sessions-dir',
      sessionsDir,
    ]);

    const sessions = JSON.parse(listOutput);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe(session_id);
    expect(sessions[0].status).toBe('running');
  });

  it('should check session status', async () => {
    // Start a session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Check status
    const { stdout: statusOutput } = await execFileAsync('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);

    const status = JSON.parse(statusOutput);
    expect(status.session_id).toBe(session_id);
    expect(status.status).toBe('running');
    expect(status.alive).toBe(true);
    expect(status.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it('should terminate a session', async () => {
    // Start a session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Terminate session
    const { stdout: endOutput } = await execFileAsync('node', [
      CLI_PATH,
      'end',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);

    const endResult = JSON.parse(endOutput);
    expect(endResult.status).toBe('terminated');

    // Verify session is gone
    const { stdout: listOutput } = await execFileAsync('node', [
      CLI_PATH,
      'list',
      '--sessions-dir',
      sessionsDir,
    ]);

    const sessions = JSON.parse(listOutput);
    expect(sessions).toHaveLength(0);
  });

  it('should cleanup dead sessions', async () => {
    // Start a session
    const { stdout: startOutput } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id, pid } = JSON.parse(startOutput);

    // Kill the process manually
    process.kill(pid, 'SIGKILL');

    // Wait a bit for process to die
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Run cleanup
    const { stdout: cleanupOutput } = await execFileAsync('node', [
      CLI_PATH,
      'cleanup',
      '--sessions-dir',
      sessionsDir,
    ]);

    const cleanupResult = JSON.parse(cleanupOutput);
    expect(cleanupResult.cleaned).toContain(session_id);
    expect(cleanupResult.remaining).toHaveLength(0);
  });

  it('should handle errors gracefully', async () => {
    // Try to read from non-existent session
    await expect(
      execFileAsync('node', [
        CLI_PATH,
        'read',
        'sess_nonexistent',
        '--sessions-dir',
        sessionsDir,
      ])
    ).rejects.toThrow();

    // Try to write to non-existent session
    await expect(
      execFileAsync(
        'node',
        [CLI_PATH, 'write', 'sess_nonexistent', '--sessions-dir', sessionsDir],
        { input: 'test\n' }
      )
    ).rejects.toThrow();

    // Try to terminate non-existent session
    await expect(
      execFileAsync('node', [
        CLI_PATH,
        'end',
        'sess_nonexistent',
        '--sessions-dir',
        sessionsDir,
      ])
    ).rejects.toThrow();
  });

  it('should start session with different commands', async () => {
    // Test with echo command
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'start',
      'echo',
      'hello',
      '--sessions-dir',
      sessionsDir,
    ]);

    const result = JSON.parse(stdout);
    expect(result.session_id).toMatch(/^sess_/);
    expect(result.command).toEqual(['echo', 'hello']);
  });
});
