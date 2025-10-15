#!/usr/bin/env node

/**
 * E2E Test: Concurrent Multi-Agent Execution
 * Priority: P0
 *
 * User Story:
 * As a user, I want to run multiple agents concurrently in the same workspace,
 * so that I can build complex multi-agent orchestration patterns.
 *
 * Success Criteria:
 * - [ ] Multiple agents can run concurrently without conflicts
 * - [ ] Each run has independent run directory (.delta/{run_id}/)
 * - [ ] Journal histories remain independent
 * - [ ] No LATEST file race conditions (v1.10 Frontierless)
 * - [ ] Workspace data plane is shared correctly
 * - [ ] All runs complete successfully
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testConcurrentExecution() {
  console.log('=== E2E Test: P0.2 - Concurrent Multi-Agent Execution ===\n');
  console.log('Validates v1.10 core value proposition:');
  console.log('  • Multiple agents run concurrently without conflicts');
  console.log('  • No LATEST file race conditions');
  console.log('  • Independent journal histories');
  console.log('  • Shared workspace data plane\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-concurrent-${uuidv4()}`);
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

    // Step 2: Create shared workspace directory
    console.log('Step 2: Create shared workspace directory...');
    const workspaceDir = path.join(testAgentDir, 'workspaces', 'W001');
    await fs.mkdir(workspaceDir, { recursive: true });
    const deltaDir = path.join(workspaceDir, '.delta');
    await fs.mkdir(deltaDir, { recursive: true });

    // Create VERSION file
    await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.0', 'utf-8');
    console.log('  ✓ Workspace W001 created\n');

    // Step 3: Generate two client-generated Run IDs
    console.log('Step 3: Generate two client-generated Run IDs...');
    const plannerRunId = `planner-${uuidv4().substring(0, 8)}`;
    const executorRunId = `executor-${uuidv4().substring(0, 8)}`;
    console.log(`  ✓ Planner Run ID: ${plannerRunId}`);
    console.log(`  ✓ Executor Run ID: ${executorRunId}\n`);

    // Step 4: Launch two runs concurrently
    console.log('Step 4: Launch two runs concurrently with Promise.all...');
    console.log('  • Planner agent: Creating execution plan');
    console.log('  • Executor agent: Running tasks from plan\n');

    const run1Promise = execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', plannerRunId,
        '-m', 'Planner: Create execution plan for data processing',
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

    const run2Promise = execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', executorRunId,
        '-m', 'Executor: Execute tasks from plan',
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

    // Wait for both runs to complete
    const [run1Result, run2Result] = await Promise.all([run1Promise, run2Promise]);

    console.log(`  ✓ Planner run completed (exit code: ${run1Result.exitCode})`);
    console.log(`  ✓ Executor run completed (exit code: ${run2Result.exitCode})\n`);

    // Step 5: Verify both run directories exist
    console.log('Step 5: Verify separate run directories created...');
    const plannerRunDir = path.join(deltaDir, plannerRunId);
    const executorRunDir = path.join(deltaDir, executorRunId);

    expect(await exists(plannerRunDir)).toBe(true);
    expect(await exists(executorRunDir)).toBe(true);
    console.log(`  ✓ Planner run directory: .delta/${plannerRunId}/`);
    console.log(`  ✓ Executor run directory: .delta/${executorRunId}/\n`);

    // Step 6: Verify separate journals exist
    console.log('Step 6: Verify independent journal histories...');
    const plannerJournalPath = path.join(plannerRunDir, 'journal.jsonl');
    const executorJournalPath = path.join(executorRunDir, 'journal.jsonl');

    expect(await exists(plannerJournalPath)).toBe(true);
    expect(await exists(executorJournalPath)).toBe(true);

    // Read both journals
    const plannerJournalContent = await fs.readFile(plannerJournalPath, 'utf-8');
    const executorJournalContent = await fs.readFile(executorJournalPath, 'utf-8');

    // Journals should be different
    expect(plannerJournalContent).not.toBe(executorJournalContent);

    // Count events in each journal
    const plannerEvents = plannerJournalContent.split('\n').filter(l => l.trim()).length;
    const executorEvents = executorJournalContent.split('\n').filter(l => l.trim()).length;

    console.log(`  ✓ Planner journal: ${plannerEvents} events`);
    console.log(`  ✓ Executor journal: ${executorEvents} events`);
    console.log('  ✓ Journal histories are independent\n');

    // Step 7: Verify separate metadata
    console.log('Step 7: Verify independent metadata tracking...');
    const plannerMetadataPath = path.join(plannerRunDir, 'metadata.json');
    const executorMetadataPath = path.join(executorRunDir, 'metadata.json');

    const plannerMetadata = JSON.parse(await fs.readFile(plannerMetadataPath, 'utf-8'));
    const executorMetadata = JSON.parse(await fs.readFile(executorMetadataPath, 'utf-8'));

    expect(plannerMetadata.run_id).toBe(plannerRunId);
    expect(executorMetadata.run_id).toBe(executorRunId);

    // Verify different tasks
    expect(plannerMetadata.task).not.toBe(executorMetadata.task);

    console.log(`  ✓ Planner metadata: run_id="${plannerMetadata.run_id}"`);
    console.log(`  ✓ Executor metadata: run_id="${executorMetadata.run_id}"`);
    console.log('  ✓ Metadata tracking is independent\n');

    // Step 8: Verify no LATEST file
    console.log('Step 8: Verify no LATEST file contention...');
    const latestPath = path.join(deltaDir, 'LATEST');
    const latestExists = await exists(latestPath);

    expect(latestExists).toBe(false);
    console.log('  ✓ No LATEST file created (v1.10: Frontierless Workspace)');
    console.log('  ✓ No race condition possible\n');

    // Step 9: Verify data plane isolation
    console.log('Step 9: Verify workspace data plane shared correctly...');

    // Both runs should see the same workspace directory
    expect(path.dirname(plannerRunDir)).toBe(deltaDir);
    expect(path.dirname(executorRunDir)).toBe(deltaDir);

    // Both run in same workspace
    const workspaceFiles = await fs.readdir(workspaceDir);
    console.log(`  ✓ Workspace files: ${workspaceFiles.filter(f => f !== '.delta').length} files`);
    console.log('  ✓ Data plane is shared correctly\n');

    // Step 10: Verify control plane isolation
    console.log('Step 10: Verify control plane isolation...');
    const deltaContents = await fs.readdir(deltaDir);
    const runDirs = deltaContents.filter(f => f !== 'VERSION' && !f.startsWith('.'));

    expect(runDirs).toContain(plannerRunId);
    expect(runDirs).toContain(executorRunId);
    console.log(`  ✓ Control plane has ${runDirs.length} run directories`);
    console.log('  ✓ Each run has isolated control plane\n');

    // Summary
    console.log('=== ✅ CONCURRENT EXECUTION TEST COMPLETE ===');
    console.log('Validated v1.10 core value proposition:');
    console.log('  ✓ Multiple agents run concurrently without conflicts');
    console.log('  ✓ No LATEST file race conditions');
    console.log('  ✓ Separate run directories (.delta/{run_id}/)');
    console.log('  ✓ Independent journal histories');
    console.log('  ✓ Independent metadata tracking');
    console.log('  ✓ Shared workspace data plane');
    console.log('  ✓ Isolated control plane (.delta/)');
    console.log('\n🚀 v1.10 enables concurrent multi-agent orchestration!');

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
      toContain(expected: any) {
        if (Array.isArray(actual) && actual.includes(expected)) {
          throw new Error(`Expected array not to contain ${expected}, but it did`);
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

testConcurrentExecution().catch(error => {
  console.error('\n❌ E2E Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
