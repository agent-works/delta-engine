/**
 * Manual test script to verify session persistence issue
 * This will demonstrate that sessions DIE when CLI exits (with node-pty)
 */
import { execa } from 'execa';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

const CLI_PATH = path.join(process.cwd(), 'dist/sessions-cli.js');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    return err.code !== 'ESRCH';
  }
}

async function main() {
  const testDir = path.join(os.tmpdir(), `test-sessions-${Date.now()}`);
  const sessionsDir = path.join(testDir, '.sessions');
  await fs.mkdir(sessionsDir, { recursive: true });

  console.log('='.repeat(60));
  console.log('CRITICAL TEST: Session Persistence');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test 1: Start a sleep process
    console.log('Test 1: Starting session with sleep 60...');
    const { stdout } = await execa('node', [
      CLI_PATH,
      'start',
      'sleep',
      '60',
      '--sessions-dir',
      sessionsDir,
    ]);

    const { session_id, pid } = JSON.parse(stdout);
    console.log(`  ✓ Session ${session_id} started with PID ${pid}`);
    console.log('');

    // Check immediately
    console.log('Checking immediately...');
    const alive1 = await isProcessAlive(pid);
    console.log(`  Process alive: ${alive1}`);
    console.log('');

    // Wait 5 seconds
    console.log('Waiting 5 seconds...');
    await sleep(5000);
    const alive2 = await isProcessAlive(pid);
    console.log(`  Process alive after 5s: ${alive2}`);
    console.log('');

    // Wait another 5 seconds (total 10)
    console.log('Waiting another 5 seconds (total 10s)...');
    await sleep(5000);
    const alive3 = await isProcessAlive(pid);
    console.log(`  Process alive after 10s: ${alive3}`);
    console.log('');

    // Check status via CLI
    console.log('Checking status via CLI...');
    try {
      const { stdout: statusOutput } = await execa('node', [
        CLI_PATH,
        'status',
        session_id,
        '--sessions-dir',
        sessionsDir,
      ]);
      const status = JSON.parse(statusOutput);
      console.log(`  Status from CLI: ${status.status}`);
      console.log(`  Alive from CLI: ${status.alive}`);
    } catch (error: unknown) {
      const err = error as Error;
      console.log(`  CLI status check failed: ${err.message}`);
    }
    console.log('');

    // Final verdict
    console.log('='.repeat(60));
    if (alive3) {
      console.log('✅ TEST PASSED: Session survived 10 seconds');
      console.log('   This indicates the fix is working!');
    } else {
      console.log('❌ TEST FAILED: Session died within 10 seconds');
      console.log('   This confirms the PTY Master FD problem');
      console.log('   Expected: Process should stay alive for 60 seconds');
      console.log('   Actual: Process died shortly after CLI exited');
    }
    console.log('='.repeat(60));
    console.log('');

    // Cleanup
    console.log('Cleaning up...');
    try {
      await execa('node', [CLI_PATH, 'cleanup', '--sessions-dir', sessionsDir]);
    } catch {
      // Ignore
    }

    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Done.');

    process.exit(alive3 ? 0 : 1);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Test error:', err.message);
    process.exit(1);
  }
}

main();
