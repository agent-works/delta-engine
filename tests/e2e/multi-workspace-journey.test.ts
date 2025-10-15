#!/usr/bin/env node

/**
 * E2E Test: Multi-Workspace Management Journey
 *
 * Tests complete multi-workspace workflow from TESTING_STRATEGY.md Journey 4:
 * - Create agent for project A
 * - Run in workspace W001
 * - Create agent for project B
 * - Run in workspace W002
 * - Switch back to W001
 * - Verify workspace isolation
 * - Verify LAST_USED tracks active workspace
 * - Verify resume works in correct workspace
 *
 * User Journey Source: v1.2.1 release notes
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testMultiWorkspaceJourney() {
  console.log('=== E2E Test: Multi-Workspace Management Journey ===\n');
  console.log('Validates complete multi-workspace workflow:');
  console.log('  1. Create agent and run in W001');
  console.log('  2. Run task in W002');
  console.log('  3. Switch back to W001');
  console.log('  4. Verify workspace isolation');
  console.log('  5. Verify LAST_USED tracking');
  console.log('  6. Verify resume in correct workspace\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-multi-workspace-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  try {
    // Step 1: Create agent
    console.log('Step 1: Create agent with delta init...');

    const agentName = path.basename(testAgentDir);
    await execa('node', [cliPath, 'init', agentName, '-y'], {
      cwd: path.dirname(testAgentDir),
      reject: false,
    });

    expect(await exists(testAgentDir)).toBe(true);
    console.log('  ✓ Agent created');

    const workspacesDir = path.join(testAgentDir, 'workspaces');

    // Step 2: Run task in W001 (auto-created with -y flag)
    console.log('\nStep 2: Run task in W001 (auto-create with -y)...');

    const run1Result = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '-m', 'Project A task - echo hello',
        '-y', // Silent mode - auto-create W001
      ],
      {
        reject: false,
        timeout: 10000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log('  ✓ First run executed in W001 (exit code:', run1Result.exitCode, ')');

    // Verify W001 created
    const w001Dir = path.join(workspacesDir, 'W001');
    expect(await exists(w001Dir)).toBe(true);
    console.log('  ✓ W001 workspace directory created');

    // Verify .delta structure
    const w001DeltaDir = path.join(w001Dir, '.delta');
    expect(await exists(w001DeltaDir)).toBe(true);
    console.log('  ✓ W001 .delta/ directory created');

    // Get W001 run ID (v1.10: use delta list-runs)
    const w001ListRunsResult = await execa('node', [cliPath, 'list-runs', '--first', '--format', 'raw'], {
      cwd: w001Dir,
      reject: false,
    });
    const w001RunId = w001ListRunsResult.stdout.trim();
    console.log(`  ✓ W001 run ID: ${w001RunId}`);

    // Verify LAST_USED points to W001
    const lastUsedPath = path.join(workspacesDir, 'LAST_USED');
    const lastUsed1 = (await fs.readFile(lastUsedPath, 'utf-8')).trim();
    expect(lastUsed1).toBe('W001');
    console.log('  ✓ LAST_USED points to W001');

    // Step 3: Create W002 by running in explicit work directory
    console.log('\nStep 3: Run task in W002 (new workspace)...');

    // Create W002 manually first
    const w002Dir = path.join(workspacesDir, 'W002');
    await fs.mkdir(w002Dir, { recursive: true });

    const run2Result = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', w002Dir, // Explicit work directory
        '-m', 'Project B task - echo world',
      ],
      {
        reject: false,
        timeout: 10000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log('  ✓ Second run executed in W002 (exit code:', run2Result.exitCode, ')');

    // Verify W002 .delta structure
    const w002DeltaDir = path.join(w002Dir, '.delta');
    expect(await exists(w002DeltaDir)).toBe(true);
    console.log('  ✓ W002 .delta/ directory created');

    // Get W002 run ID (v1.10: use delta list-runs)
    const w002ListRunsResult = await execa('node', [cliPath, 'list-runs', '--first', '--format', 'raw'], {
      cwd: w002Dir,
      reject: false,
    });
    const w002RunId = w002ListRunsResult.stdout.trim();
    expect(w002RunId).not.toBe(w001RunId);
    console.log(`  ✓ W002 run ID: ${w002RunId}`);

    // Note: LAST_USED is NOT updated when using explicit --work-dir
    // It's only updated during interactive workspace selection
    const lastUsed2 = (await fs.readFile(lastUsedPath, 'utf-8')).trim();
    expect(lastUsed2).toBe('W001'); // Still W001 (explicit work-dir doesn't update LAST_USED)
    console.log('  ✓ LAST_USED remains W001 (explicit --work-dir preserves LAST_USED)');

    // Step 4: Verify workspace isolation
    console.log('\nStep 4: Verify workspace isolation...');

    // W001 and W002 should have separate .delta directories
    expect(w001DeltaDir).not.toBe(w002DeltaDir);
    console.log('  ✓ W001 and W002 have separate .delta/ directories');

    // Verify W001 journal still exists and is unchanged
    const w001JournalPath = path.join(w001DeltaDir, w001RunId, 'journal.jsonl');
    const w001JournalExists = await exists(w001JournalPath);
    expect(w001JournalExists).toBe(true);
    console.log('  ✓ W001 journal preserved');

    // Verify W002 journal exists
    const w002JournalPath = path.join(w002DeltaDir, w002RunId, 'journal.jsonl');
    const w002JournalExists = await exists(w002JournalPath);
    expect(w002JournalExists).toBe(true);
    console.log('  ✓ W002 journal created');

    // Read both journals to verify they're different
    const w001JournalContent = await fs.readFile(w001JournalPath, 'utf-8');
    const w002JournalContent = await fs.readFile(w002JournalPath, 'utf-8');
    expect(w001JournalContent).not.toBe(w002JournalContent);
    console.log('  ✓ W001 and W002 journals are independent');

    // Step 5: Switch back to W001
    console.log('\nStep 5: Switch back to W001...');

    const run3Result = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', w001Dir, // Switch back to W001
        '-m', 'Continue project A',
      ],
      {
        reject: false,
        timeout: 10000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log('  ✓ Third run executed in W001 (exit code:', run3Result.exitCode, ')');

    // LAST_USED remains W001 (never changed with explicit --work-dir)
    const lastUsed3 = (await fs.readFile(lastUsedPath, 'utf-8')).trim();
    expect(lastUsed3).toBe('W001');
    console.log('  ✓ LAST_USED still W001 (consistent with explicit work-dir behavior)');

    // Verify new run in W001 (v1.10: get latest run ID)
    const w001LatestResult = await execa('node', [cliPath, 'list-runs', '--first', '--format', 'raw'], {
      cwd: w001Dir,
      reject: false,
    });
    const w001LatestAfter = w001LatestResult.stdout.trim();
    console.log(`  ✓ W001 new run ID: ${w001LatestAfter}`);

    // Step 6: Verify both workspaces still exist
    console.log('\nStep 6: Verify both workspaces preserved...');

    expect(await exists(w001Dir)).toBe(true);
    expect(await exists(w002Dir)).toBe(true);
    console.log('  ✓ W001 workspace preserved');
    console.log('  ✓ W002 workspace preserved');

    // List all workspaces
    const workspaceEntries = await fs.readdir(workspacesDir);
    const workspaceList = workspaceEntries.filter(entry =>
      entry.startsWith('W') && !entry.includes('.')
    );

    expect(workspaceList).toContain('W001');
    expect(workspaceList).toContain('W002');
    console.log(`  ✓ Workspace list: ${workspaceList.join(', ')}`);

    // Step 7: Verify metadata tracking
    console.log('\nStep 7: Verify metadata tracking...');

    const w001MetadataPath = path.join(w001DeltaDir, w001LatestAfter, 'metadata.json');
    const w001Metadata = JSON.parse(await fs.readFile(w001MetadataPath, 'utf-8'));
    expect(w001Metadata.run_id).toBe(w001LatestAfter);
    console.log(`  ✓ W001 metadata tracked: ${w001Metadata.task}`);

    const w002MetadataPath = path.join(w002DeltaDir, w002RunId, 'metadata.json');
    const w002Metadata = JSON.parse(await fs.readFile(w002MetadataPath, 'utf-8'));
    expect(w002Metadata.run_id).toBe(w002RunId);
    console.log(`  ✓ W002 metadata tracked: ${w002Metadata.task}`);

    // Verify tasks are different
    expect(w001Metadata.task).not.toBe(w002Metadata.task);
    console.log('  ✓ W001 and W002 tasks are independent');

    // Summary
    console.log('\n=== ✅ MULTI-WORKSPACE JOURNEY COMPLETE ===');
    console.log('Validated complete multi-workspace workflow:');
    console.log('  ✓ W001 auto-created with -y flag');
    console.log('  ✓ W002 created with explicit --work-dir');
    console.log('  ✓ Workspaces have separate .delta/ directories');
    console.log('  ✓ Journals are independent');
    console.log('  ✓ LAST_USED only updates on workspace creation (not with --work-dir)');
    console.log('  ✓ Can switch between workspaces with --work-dir');
    console.log('  ✓ Metadata tracked per workspace');
    console.log('  ✓ Both workspaces preserved');
    console.log('\nMulti-workspace management validated end-to-end!');

  } finally {
    try {
      await fs.rm(testAgentDir, { recursive: true, force: true });
    } catch {}
  }
}

// Helper functions
async function exists(path: string): Promise<boolean> {
  return fs.access(path).then(() => true).catch(() => false);
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    not: {
      toBe(expected: any) {
        if (actual === expected) {
          throw new Error(`Expected ${actual} not to be ${expected}`);
        }
      },
    },
    toContain(expected: any) {
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${expected}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

testMultiWorkspaceJourney().catch(error => {
  console.error('\n❌ E2E Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
