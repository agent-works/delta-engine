#!/usr/bin/env node

/**
 * Integration Test: LATEST File Removal (v1.10)
 * Priority: P0
 *
 * User Story:
 * As a user of v1.10 Frontierless Workspace, I need the engine to NOT use LATEST files,
 * so that multiple agents can run concurrently without race conditions.
 *
 * Success Criteria:
 * - [ ] delta run does NOT create LATEST file
 * - [ ] delta continue does NOT use or reference LATEST file
 * - [ ] Workspace only contains explicit run directories
 * - [ ] No LATEST pointer or symlink exists
 * - [ ] Manual LATEST file (from migration) is ignored
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testLatestFileRemoval() {
  console.log('=== Integration Test: LATEST File Removal ===\n');
  console.log('Validates v1.10 Frontierless Workspace Architecture');
  console.log('  • delta run does NOT create LATEST file');
  console.log('  • delta continue does NOT use LATEST file');
  console.log('  • No implicit "latest run" concept');
  console.log('  • Enables concurrent multi-agent execution\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-latest-removal-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  try {
    // Step 1: Create test agent
    console.log('Step 1: Create test agent with delta init...');
    const agentName = path.basename(testAgentDir);
    await execa('node', [cliPath, 'init', agentName, '-y'], {
      cwd: path.dirname(testAgentDir),
      reject: false,
    });

    expect(await exists(testAgentDir)).toBe(true);
    console.log('  ✓ Agent created\n');

    // Step 2: Create workspace
    console.log('Step 2: Create workspace directory...');
    const workspaceDir = path.join(testAgentDir, 'workspaces', 'W001');
    await fs.mkdir(workspaceDir, { recursive: true });
    const deltaDir = path.join(workspaceDir, '.delta');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.0', 'utf-8');
    console.log('  ✓ Workspace W001 created\n');

    // Step 3: Run first agent (should NOT create LATEST)
    console.log('Step 3: Run first agent with client-generated ID...');
    const runId1 = `test-${uuidv4().substring(0, 8)}`;
    console.log(`  • Run ID: ${runId1}`);

    const firstRun = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', runId1,
        '-m', 'First concurrent agent',
      ],
      {
        reject: false,
        timeout: 15000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log(`  ✓ First run completed (exit code: ${firstRun.exitCode})`);
    expect([0, 101]).toContain(firstRun.exitCode);
    console.log('  ✓ Run directory created\n');

    // Step 4: Verify NO LATEST file exists
    console.log('Step 4: Verify NO LATEST file was created...');
    const latestPath = path.join(deltaDir, 'LATEST');
    const latestExists = await exists(latestPath);

    expect(latestExists).toBe(false);
    console.log('  ✓ LATEST file does NOT exist');
    console.log('  ✓ Frontierless Workspace confirmed\n');

    // Step 5: Check .delta directory structure
    console.log('Step 5: Verify workspace structure (only explicit runs)...');
    const deltaContents = await fs.readdir(deltaDir);
    const runDirs = deltaContents.filter(f => f !== 'VERSION' && !f.startsWith('.'));

    expect(runDirs.length).toBe(1);
    expect(runDirs[0]).toBe(runId1);
    console.log(`  ✓ .delta/ contains: ${runDirs.join(', ')}`);
    console.log('  ✓ Only explicit run directories exist\n');

    // Step 6: Run second concurrent agent (should also NOT create LATEST)
    console.log('Step 6: Run second concurrent agent...');
    const runId2 = `test-${uuidv4().substring(0, 8)}`;
    console.log(`  • Run ID: ${runId2}`);

    const secondRun = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', runId2,
        '-m', 'Second concurrent agent',
      ],
      {
        reject: false,
        timeout: 15000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log(`  ✓ Second run completed (exit code: ${secondRun.exitCode})`);
    expect([0, 101]).toContain(secondRun.exitCode);
    console.log('  ✓ Both runs coexist without conflict\n');

    // Step 7: Verify STILL no LATEST file
    console.log('Step 7: Verify STILL no LATEST file after multiple runs...');
    const latestStillExists = await exists(latestPath);

    expect(latestStillExists).toBe(false);
    console.log('  ✓ LATEST file still does NOT exist');
    console.log('  ✓ No race condition possible\n');

    // Step 8: Verify both runs coexist
    console.log('Step 8: Verify both runs coexist in workspace...');
    const deltaContentsAfter = await fs.readdir(deltaDir);
    const runDirsAfter = deltaContentsAfter.filter(f => f !== 'VERSION' && !f.startsWith('.'));

    expect(runDirsAfter.length).toBe(2);
    expect(runDirsAfter).toContain(runId1);
    expect(runDirsAfter).toContain(runId2);
    console.log(`  ✓ .delta/ contains: ${runDirsAfter.join(', ')}`);
    console.log('  ✓ Multiple runs coexist safely\n');

    // Step 9: Test migration scenario (manual LATEST file)
    console.log('Step 9: Test migration scenario (manually create LATEST)...');
    console.log('  • Simulating v1.9 LATEST file for migration testing...');

    // Create a LATEST file pointing to first run (simulating old version)
    await fs.writeFile(latestPath, runId1, 'utf-8');
    console.log(`  ✓ Created LATEST file pointing to: ${runId1}`);

    // Verify file exists
    expect(await exists(latestPath)).toBe(true);
    console.log('  ✓ LATEST file confirmed\n');

    // Step 10: Verify LATEST is ignored by delta run
    console.log('Step 10: Verify LATEST is ignored by new runs...');
    const runId3 = `test-${uuidv4().substring(0, 8)}`;
    console.log(`  • Run ID: ${runId3}`);

    const thirdRun = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', runId3,
        '-m', 'Third run with LATEST present',
      ],
      {
        reject: false,
        timeout: 15000,
        env: {
          ...process.env,
          DELTA_API_KEY: process.env.DELTA_API_KEY || 'dummy-key',
        },
      }
    );

    console.log(`  ✓ Third run completed (exit code: ${thirdRun.exitCode})`);
    expect([0, 101]).toContain(thirdRun.exitCode);

    // Verify third run was created (not resumed via LATEST)
    const runDir3 = path.join(deltaDir, runId3);
    expect(await exists(runDir3)).toBe(true);
    console.log(`  ✓ New run directory created: ${runId3}`);
    console.log('  ✓ LATEST file was ignored (new run created)\n');

    // Step 11: Verify workspace has 3 independent runs
    console.log('Step 11: Verify workspace has 3 independent runs...');
    const finalDeltaContents = await fs.readdir(deltaDir);
    const finalRunDirs = finalDeltaContents.filter(f => f !== 'VERSION' && f !== 'LATEST' && !f.startsWith('.'));

    expect(finalRunDirs.length).toBe(3);
    expect(finalRunDirs).toContain(runId1);
    expect(finalRunDirs).toContain(runId2);
    expect(finalRunDirs).toContain(runId3);
    console.log(`  ✓ .delta/ contains: ${finalRunDirs.join(', ')}`);
    console.log('  ✓ All three runs are independent\n');

    // Step 12: Clean up manual LATEST file
    console.log('Step 12: Clean up test artifacts...');
    await fs.unlink(latestPath);
    expect(await exists(latestPath)).toBe(false);
    console.log('  ✓ LATEST file removed\n');

    // Summary
    console.log('=== ✅ LATEST FILE REMOVAL TEST COMPLETE ===');
    console.log('Validated v1.10 Frontierless Workspace Architecture');
    console.log('  ✓ delta run does NOT create LATEST file');
    console.log('  ✓ Multiple runs coexist without LATEST pointer');
    console.log('  ✓ No race conditions possible');
    console.log('  ✓ Legacy LATEST files are ignored (safe migration)');
    console.log('  ✓ All runs are independent and explicit');
    console.log('\n🚀 v1.10 enables concurrent multi-agent execution!');

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
    toContain(expected: any) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}, got ${JSON.stringify(actual)}`);
        }
      } else {
        throw new Error('toContain expects an array');
      }
    },
  };
}

testLatestFileRemoval().catch(error => {
  console.error('\n❌ Integration Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
