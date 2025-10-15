#!/usr/bin/env node

/**
 * Integration Test: I4 - list-runs Filtering and Sorting
 *
 * Tests v1.10 observability: list-runs command supports filtering and sorting
 * to help users find specific runs in multi-agent workflows.
 *
 * Scenario: Developer lists runs with various filters
 * - Create multiple runs with different statuses
 * - Filter by status (--status)
 * - Filter by resumability (--resumable)
 * - Get most recent run (--first)
 * - Verify sorting (most recent first)
 *
 * Validates:
 * - list-runs command executes without errors
 * - --status filter works correctly
 * - --resumable filter returns only INTERRUPTED/WAITING_FOR_INPUT
 * - --first returns single most recent run
 * - Default sort order is by start_time (descending)
 * - JSON output format is parseable
 *
 * Test Plan Reference: docs/testing/v1.10-test-plan.md#i4-list-runs-filtering-and-sorting
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

// Run status enum (from types.ts)
const RunStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  INTERRUPTED: 'INTERRUPTED',
  WAITING_FOR_INPUT: 'WAITING_FOR_INPUT',
} as const;

type RunStatus = typeof RunStatus[keyof typeof RunStatus];

async function testListRunsFiltering() {
  console.log('=== I4: list-runs Filtering and Sorting Integration Test ===\n');

  const testAgentDir = path.join(os.tmpdir(), `int-list-runs-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  try {
    // Step 1: Create test agent
    console.log('Step 1: Create test agent...');
    const agentName = path.basename(testAgentDir);
    await execa('node', [cliPath, 'init', agentName, '-y'], {
      cwd: path.dirname(testAgentDir),
      reject: false,
    });

    // Create workspace
    const workspaceDir = path.join(testAgentDir, 'workspaces', 'W001');
    await fs.mkdir(workspaceDir, { recursive: true });
    const deltaDir = path.join(workspaceDir, '.delta');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.0', 'utf-8');
    console.log('  ✓ Agent and workspace created\n');

    // Step 2: Create test runs with different statuses
    console.log('Step 2: Create test runs with different statuses...');

    // Create runs with sequential timestamps (baseTime - 6 days, -5 days, -4 days, etc.)
    const baseTime = Date.now();

    // Create 3 completed runs (oldest)
    await createTestRun(deltaDir, 'run-completed-1', RunStatus.COMPLETED, baseTime - 6 * 24 * 60 * 60 * 1000);
    await createTestRun(deltaDir, 'run-completed-2', RunStatus.COMPLETED, baseTime - 5 * 24 * 60 * 60 * 1000);
    await createTestRun(deltaDir, 'run-completed-3', RunStatus.COMPLETED, baseTime - 4 * 24 * 60 * 60 * 1000);

    // Create 2 interrupted runs
    await createTestRun(deltaDir, 'run-interrupted-1', RunStatus.INTERRUPTED, baseTime - 3 * 24 * 60 * 60 * 1000);
    await createTestRun(deltaDir, 'run-interrupted-2', RunStatus.INTERRUPTED, baseTime - 2 * 24 * 60 * 60 * 1000);

    // Create 1 waiting for input run
    await createTestRun(deltaDir, 'run-waiting', RunStatus.WAITING_FOR_INPUT, baseTime - 1 * 24 * 60 * 60 * 1000);

    // Create 1 failed run (most recent)
    await createTestRun(deltaDir, 'run-failed', RunStatus.FAILED, baseTime);

    console.log('  ✓ Created 7 test runs\n');

    // Test 1: list-runs without filters
    console.log('Test 1: list-runs without filters...');
    const allRuns = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--format', 'json'],
      { reject: false }
    );

    expect(allRuns.exitCode).toBe(0);
    const allRunsData = JSON.parse(allRuns.stdout);
    expect(allRunsData.length).toBe(7);
    console.log(`  ✓ Returns all 7 runs\n`);

    // Test 2: Filter by status (COMPLETED)
    console.log('Test 2: Filter by status (--status COMPLETED)...');
    const completedRuns = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--status', 'COMPLETED', '--format', 'json'],
      { reject: false }
    );

    expect(completedRuns.exitCode).toBe(0);
    const completedData = JSON.parse(completedRuns.stdout);
    expect(completedData.length).toBe(3);
    console.log(`  ✓ Returns 3 COMPLETED runs\n`);

    // Test 3: Filter by resumable
    console.log('Test 3: Filter resumable runs (--resumable)...');
    const resumableRuns = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--resumable', '--format', 'json'],
      { reject: false }
    );

    expect(resumableRuns.exitCode).toBe(0);
    const resumableData = JSON.parse(resumableRuns.stdout);
    expect(resumableData.length).toBe(3); // 2 INTERRUPTED + 1 WAITING_FOR_INPUT

    // Verify all are resumable statuses
    const resumableStatuses = resumableData.map((r: any) => r.status);
    expect(resumableStatuses.every((s: string) =>
      s === RunStatus.INTERRUPTED || s === RunStatus.WAITING_FOR_INPUT
    )).toBe(true);
    console.log(`  ✓ Returns 3 resumable runs (INTERRUPTED + WAITING_FOR_INPUT)\n`);

    // Test 4: Get first run
    console.log('Test 4: Get most recent run (--first)...');
    const firstRun = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--first', '--format', 'json'],
      { reject: false }
    );

    expect(firstRun.exitCode).toBe(0);
    const firstData = JSON.parse(firstRun.stdout);
    expect(firstData.length).toBe(1);
    expect(firstData[0].run_id).toBe('run-failed'); // Most recently created
    console.log(`  ✓ Returns 1 run (most recent)\n`);

    // Test 5: Verify sorting (most recent first)
    console.log('Test 5: Verify sorting (most recent first)...');
    expect(allRunsData[0].run_id).toBe('run-failed');
    expect(allRunsData[6].run_id).toBe('run-completed-1');
    console.log('  ✓ Runs sorted by start_time (descending)\n');

    // Test 6: Text format output
    console.log('Test 6: Text format output...');
    const textRuns = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--format', 'text'],
      { reject: false }
    );

    expect(textRuns.exitCode).toBe(0);
    expect(textRuns.stdout).toContain('Run ID');
    expect(textRuns.stdout).toContain('Status');
    console.log('  ✓ Text format contains headers\n');

    // Test 7: Raw format output
    console.log('Test 7: Raw format output (run IDs only)...');
    const rawRuns = await execa(
      'node',
      [cliPath, 'list-runs', '--work-dir', workspaceDir, '--format', 'raw'],
      { reject: false }
    );

    expect(rawRuns.exitCode).toBe(0);
    const rawLines = rawRuns.stdout.trim().split('\n');
    expect(rawLines.length).toBe(7);
    expect(rawLines[0]).toBe('run-failed'); // Just IDs, no metadata
    console.log('  ✓ Raw format outputs run IDs only\n');

    // Summary
    console.log('=== ✅ LIST-RUNS FILTERING TEST COMPLETE ===');
    console.log('Validated v1.10 observability:');
    console.log('  ✓ list-runs command executes successfully');
    console.log('  ✓ --status filter works correctly');
    console.log('  ✓ --resumable filter returns correct runs');
    console.log('  ✓ --first returns single most recent run');
    console.log('  ✓ Sorting by start_time (descending)');
    console.log('  ✓ JSON format is parseable');
    console.log('  ✓ Text format is human-readable');
    console.log('  ✓ Raw format outputs IDs only');
    console.log('\n📊 v1.10 enables powerful run observability!');

  } finally {
    try {
      await fs.rm(testAgentDir, { recursive: true, force: true });
    } catch {}
  }
}

// Helper: Create a test run with specific status
async function createTestRun(deltaDir: string, runId: string, status: RunStatus, timestamp: number) {
  const runDir = path.join(deltaDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  // Create metadata
  const metadata = {
    run_id: runId,
    status,
    start_time: new Date(timestamp).toISOString(),
    end_time: new Date(timestamp + 1000).toISOString(),
    task: `Test task for ${runId}`,
    iterations_completed: 1,
    pid: process.pid,
  };

  await fs.writeFile(
    path.join(runDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  // Create minimal journal
  const journalEvent = {
    type: 'RUN_START',
    timestamp: metadata.start_time,
    run_id: runId,
  };

  await fs.writeFile(
    path.join(runDir, 'journal.jsonl'),
    JSON.stringify(journalEvent) + '\n',
    'utf-8'
  );
}

// Helper functions
function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(item: any) {
      if (!String(actual).includes(String(item))) {
        throw new Error(`Expected to contain "${item}", got: ${String(actual).substring(0, 200)}`);
      }
    },
  };
}

testListRunsFiltering().catch(error => {
  console.error('\n❌ I4 Integration Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
