import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';
import { execa } from 'execa';

const sleep = promisify(setTimeout);
const CLI_PATH = path.join(process.cwd(), 'dist/sessions-cli.js');

/**
 * CRITICAL: Session Persistence Tests
 *
 * These tests verify that sessions survive CLI process exits.
 * This is the fundamental requirement for the session management feature.
 *
 * Expected behavior:
 * - When using node-pty (current): ALL TESTS FAIL
 * - When using screen (fixed): ALL TESTS PASS
 */
describe('Session Persistence (CRITICAL)', () => {
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
      await execa('node', [CLI_PATH, 'cleanup', '--sessions-dir', sessionsDir]);
    } catch {
      // Ignore cleanup errors
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * TEST 1: Most Critical Test
   * Verifies that a session survives after CLI process exits
   */
  it('session MUST survive CLI process exit (10 second test)', async () => {
    console.log('Starting critical persistence test...');

    // Start session in a child process
    const { stdout } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '60',
      '--sessions-dir',
      sessionsDir,
    ]);

    const { session_id, pid } = JSON.parse(stdout);
    console.log(`Session ${session_id} started with PID ${pid}`);

    // Wait 10 seconds (enough time for SIGHUP to propagate if bug exists)
    console.log('Waiting 10 seconds...');
    await sleep(10000);

    // Check if process is still alive
    console.log('Checking if process is still alive...');
    const alive = await isProcessAlive(pid);

    if (!alive) {
      console.error(`❌ FAILURE: Process ${pid} died within 10 seconds!`);
      console.error('This indicates the PTY Master FD was closed when CLI exited.');
    } else {
      console.log(`✅ SUCCESS: Process ${pid} is still alive after 10 seconds.`);
    }

    expect(alive).toBe(true);
  }, 15000); // 15 second timeout

  /**
   * TEST 2: Cross-Process Interaction
   * Verifies that sessions can be accessed from different CLI invocations
   */
  it('should work across multiple CLI invocations', async () => {
    console.log('Testing cross-process interaction...');

    // CLI call 1: Start bash session
    const { stdout: startOutput } = await execa('node', [
      CLI_PATH,
      'start',
      'bash',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);
    console.log(`Session ${session_id} started`);

    // Wait 2 seconds
    await sleep(2000);

    // CLI call 2: Write command (different CLI process)
    console.log('Writing to session...');
    const writeProcess = spawn('node', [
      CLI_PATH,
      'write',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    writeProcess.stdin.write('echo "persistence_test"\n');
    writeProcess.stdin.end();

    await new Promise((resolve, reject) => {
      writeProcess.on('close', (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`Write failed with code ${code}`));
      });
    });

    // Wait for command to execute
    await sleep(2000);

    // CLI call 3: Read output (different CLI process)
    console.log('Reading from session...');
    const { stdout: readOutput } = await execa('node', [
      CLI_PATH,
      'read',
      session_id,
      '--timeout',
      '2000',
      '--sessions-dir',
      sessionsDir,
    ]);

    console.log('Output:', readOutput);
    expect(readOutput).toContain('persistence_test');

    // Cleanup
    await execa('node', [CLI_PATH, 'end', session_id, '--sessions-dir', sessionsDir]);
  }, 20000);

  /**
   * TEST 3: Long-Term Stability
   * Verifies that sessions remain stable over 1 minute
   */
  it('should keep session alive for 1 minute', async () => {
    console.log('Testing long-term stability (1 minute)...');

    const { stdout } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '120',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id, pid } = JSON.parse(stdout);
    console.log(`Session ${session_id} started, testing for 60 seconds...`);

    // Check every 10 seconds for 1 minute
    for (let i = 1; i <= 6; i++) {
      await sleep(10000);
      console.log(`Check ${i}/6: Verifying session is alive...`);

      const { stdout: statusOutput } = await execa('node', [
        CLI_PATH,
        'status',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ]);
      const status = JSON.parse(statusOutput);

      if (!status.alive) {
        console.error(`❌ Session died at ${i * 10} seconds`);
        expect(status.alive).toBe(true);
        return;
      }

      console.log(`  ✓ Session still alive at ${i * 10} seconds`);
    }

    console.log('✅ Session survived 60 seconds');

    // Cleanup
    await execa('node', [CLI_PATH, 'end', session_id, '--sessions-dir', sessionsDir]);
  }, 70000);

  /**
   * TEST 4: Delayed Status Check
   * Verifies that status check works correctly after delay
   */
  it('should report correct status after 5 second delay', async () => {
    const { stdout: startOutput } = await execa('node', [
      CLI_PATH,
      'start',
      'bash',
      '--sessions-dir',
      sessionsDir,
    ]);
    const { session_id } = JSON.parse(startOutput);

    // Wait 5 seconds
    console.log('Waiting 5 seconds before status check...');
    await sleep(5000);

    // Check status
    const { stdout: statusOutput } = await execa('node', [
      CLI_PATH,
      'status',
      session_id,
      '--sessions-dir',
      sessionsDir,
    ]);
    const status = JSON.parse(statusOutput);

    console.log('Status:', status);
    expect(status.status).toBe('running');
    expect(status.alive).toBe(true);

    // Cleanup
    await execa('node', [CLI_PATH, 'end', session_id, '--sessions-dir', sessionsDir]);
  }, 10000);

  /**
   * TEST 5: Concurrent Sessions
   * Verifies that multiple sessions can coexist
   */
  it('should handle multiple independent sessions', async () => {
    console.log('Testing concurrent sessions...');

    // Start 3 sessions
    const { stdout: out1 } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '30',
      '--sessions-dir',
      sessionsDir,
    ]);
    const sess1 = JSON.parse(out1);

    const { stdout: out2 } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '30',
      '--sessions-dir',
      sessionsDir,
    ]);
    const sess2 = JSON.parse(out2);

    const { stdout: out3 } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '30',
      '--sessions-dir',
      sessionsDir,
    ]);
    const sess3 = JSON.parse(out3);

    console.log(`Started sessions: ${sess1.session_id}, ${sess2.session_id}, ${sess3.session_id}`);

    // Wait 5 seconds
    await sleep(5000);

    // Check all are alive
    const status1 = JSON.parse(
      (await execa('node', [CLI_PATH, 'status', sess1.session_id, '--sessions-dir', sessionsDir])).stdout
    );
    const status2 = JSON.parse(
      (await execa('node', [CLI_PATH, 'status', sess2.session_id, '--sessions-dir', sessionsDir])).stdout
    );
    const status3 = JSON.parse(
      (await execa('node', [CLI_PATH, 'status', sess3.session_id, '--sessions-dir', sessionsDir])).stdout
    );

    expect(status1.alive).toBe(true);
    expect(status2.alive).toBe(true);
    expect(status3.alive).toBe(true);

    console.log('✅ All 3 sessions are alive after 5 seconds');

    // Cleanup
    await execa('node', [CLI_PATH, 'end', sess1.session_id, '--sessions-dir', sessionsDir]);
    await execa('node', [CLI_PATH, 'end', sess2.session_id, '--sessions-dir', sessionsDir]);
    await execa('node', [CLI_PATH, 'end', sess3.session_id, '--sessions-dir', sessionsDir]);
  }, 15000);
});

/**
 * Helper: Check if a process is alive
 */
async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      // No such process
      return false;
    }
    // Other errors (like permission denied) mean process exists
    return true;
  }
}
