#!/usr/bin/env node

/**
 * Integration test for multi-run history tracking
 *
 * Tests specification from TESTING_STRATEGY.md Scenario 6:
 * - Run task 1, capture run_id_1
 * - Verify LATEST → run_id_1
 * - Run task 2, capture run_id_2
 * - Verify LATEST → run_id_2
 * - Verify both run directories exist
 * - Load context from run_id_1 (historical run access)
 *
 * This validates LATEST file updates and historical run preservation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createTestAgent } from '../fixtures/create-test-agent.js';
import { initializeContext, loadExistingContext } from '../../src/context.js';
import { Engine } from '../../src/engine.js';

// Load test environment variables
dotenv.config({ path: path.join(process.cwd(), 'tests', '.env') });

async function testMultiRunHistory() {
  console.log('=== Testing Multi-Run History Tracking (Integration) ===\n');
  console.log('Validates TESTING_STRATEGY.md Scenario 6');
  console.log('  - LATEST file updates');
  console.log('  - Historical run preservation');
  console.log('  - Access to previous runs\n');

  const testAgentDir = path.join(os.tmpdir(), `test-multi-run-${uuidv4()}`);

  try {
    // Create test agent
    await createTestAgent(testAgentDir, {
      name: 'test-multi-run',
      maxIterations: 2,
      tools: [
        {
          name: 'echo',
          command: ['echo'],
          description: 'Echo command',
          parameters: [
            {
              name: 'message',
              type: 'string',
              description: 'Message to echo',
              inject_as: 'argument',
            },
          ],
        },
      ],
    });

    const workDir = path.join(testAgentDir, 'workspaces', 'W001');
    const deltaDir = path.join(workDir, '.delta');
    const latestPath = path.join(deltaDir, 'LATEST');

    // Test 1: Run first task and capture run ID
    console.log('Test 1: Run first task and capture run_id_1...');

    const context1 = await initializeContext(
      testAgentDir,
      'First task - echo hello',
      undefined,
      false,
      undefined,
      false,
      true // skipPrompt
    );

    const runId1 = context1.runId;
    console.log(`  ✓ Created run_id_1: ${runId1}`);

    const engine1 = new Engine(context1);
    await engine1.initialize();

    try {
      await engine1.run();
    } catch (error: any) {
      if (!error.message?.includes('API') && !error.message?.includes('401')) {
        throw error;
      }
      console.log('  ⚠️  LLM API not available (expected)');
    }

    await context1.journal.close();

    // Verify run directory exists
    const run1Dir = path.join(deltaDir, runId1);
    const run1Exists = await fs.access(run1Dir).then(() => true).catch(() => false);
    expect(run1Exists).toBe(true);
    console.log(`  ✓ Run directory exists: ${run1Dir}`);

    // Test 2: Verify LATEST points to run_id_1
    console.log('\nTest 2: Verify LATEST → run_id_1...');

    const latestContent1 = await fs.readFile(latestPath, 'utf-8');
    expect(latestContent1.trim()).toBe(runId1);
    console.log(`  ✓ LATEST file points to run_id_1: ${latestContent1.trim()}`);

    // Test 3: Run second task in same workspace
    console.log('\nTest 3: Run second task and capture run_id_2...');

    // Need to use explicit work directory to run in same workspace
    const context2 = await initializeContext(
      testAgentDir,
      'Second task - echo world',
      workDir, // Explicit work directory
      false,
      undefined,
      true, // explicitWorkDir = true
      false
    );

    const runId2 = context2.runId;
    expect(runId2).not.toBe(runId1);
    console.log(`  ✓ Created run_id_2: ${runId2}`);

    const engine2 = new Engine(context2);
    await engine2.initialize();

    try {
      await engine2.run();
    } catch (error: any) {
      if (!error.message?.includes('API') && !error.message?.includes('401')) {
        throw error;
      }
      console.log('  ⚠️  LLM API not available (expected)');
    }

    await context2.journal.close();

    // Test 4: Verify LATEST updated to run_id_2
    console.log('\nTest 4: Verify LATEST → run_id_2...');

    const latestContent2 = await fs.readFile(latestPath, 'utf-8');
    expect(latestContent2.trim()).toBe(runId2);
    console.log(`  ✓ LATEST file updated to run_id_2: ${latestContent2.trim()}`);

    // Test 5: Verify both run directories exist
    console.log('\nTest 5: Verify both run directories exist...');

    const run2Dir = path.join(deltaDir, runId2);
    const run2Exists = await fs.access(run2Dir).then(() => true).catch(() => false);
    expect(run2Exists).toBe(true);

    // Both should exist
    const run1StillExists = await fs.access(run1Dir).then(() => true).catch(() => false);
    expect(run1StillExists).toBe(true);

    console.log(`  ✓ run_id_1 directory preserved: ${run1Dir}`);
    console.log(`  ✓ run_id_2 directory exists: ${run2Dir}`);

    // Test 6: List all runs in .delta directory
    console.log('\nTest 6: List all historical runs...');

    const deltaEntries = await fs.readdir(deltaDir);
    const runDirs = deltaEntries.filter(entry =>
      !entry.startsWith('.') && entry !== 'LATEST' && entry !== 'VERSION'
    );

    expect(runDirs).toContain(runId1);
    expect(runDirs).toContain(runId2);
    console.log(`  ✓ Found ${runDirs.length} run directories: ${runDirs.slice(0, 3).join(', ')}${runDirs.length > 3 ? '...' : ''}`);

    // Test 7: Access historical run (run_id_1)
    console.log('\nTest 7: Access historical run (run_id_1)...');

    // Verify run_id_1 metadata still accessible
    const metadata1Path = path.join(run1Dir, 'metadata.json');
    const metadata1Content = await fs.readFile(metadata1Path, 'utf-8');
    const metadata1 = JSON.parse(metadata1Content);

    expect(metadata1.run_id).toBe(runId1);
    expect(metadata1.task).toBe('First task - echo hello');
    console.log(`  ✓ Run 1 metadata accessible: task="${metadata1.task}"`);

    // Verify run_id_1 journal still accessible
    const journal1Path = path.join(run1Dir, 'journal.jsonl');
    const journal1Content = await fs.readFile(journal1Path, 'utf-8');
    const journal1Lines = journal1Content.split('\n').filter(l => l.trim());

    expect(journal1Lines.length).toBeGreaterThan(0);
    console.log(`  ✓ Run 1 journal accessible: ${journal1Lines.length} events`);

    // Test 8: Load context from historical run
    console.log('\nTest 8: Load context from historical run...');

    const contextLoaded = await loadExistingContext(workDir);

    // loadExistingContext uses LATEST, so it should load run_id_2
    expect(contextLoaded.runId).toBe(runId2);
    console.log(`  ✓ loadExistingContext loads latest run: ${contextLoaded.runId}`);

    await contextLoaded.journal.close();

    // Test 9: Manually switch LATEST to access run_id_1
    console.log('\nTest 9: Manually switch LATEST to access run_id_1...');

    // Update LATEST to point to run_id_1
    await fs.writeFile(latestPath, runId1, 'utf-8');

    const contextRun1 = await loadExistingContext(workDir);
    expect(contextRun1.runId).toBe(runId1);
    expect(contextRun1.initialTask).toBe('First task - echo hello');
    console.log(`  ✓ Successfully loaded historical run_id_1`);
    console.log(`  ✓ Task from run 1: "${contextRun1.initialTask}"`);

    await contextRun1.journal.close();

    // Test 10: Verify run directories are independent
    console.log('\nTest 10: Verify run directory independence...');

    // Check that both runs have separate journals
    const journal2Path = path.join(run2Dir, 'journal.jsonl');
    const journal2Content = await fs.readFile(journal2Path, 'utf-8');
    const journal2Lines = journal2Content.split('\n').filter(l => l.trim());

    expect(journal2Lines.length).toBeGreaterThan(0);

    // Journals should be different files
    expect(journal1Path).not.toBe(journal2Path);
    console.log(`  ✓ Run 1 and Run 2 have separate journals`);
    console.log(`  ✓ Run 1: ${journal1Lines.length} events`);
    console.log(`  ✓ Run 2: ${journal2Lines.length} events`);

    // Summary
    console.log('\n=== ✅ ALL INTEGRATION TESTS PASSED ===');
    console.log('Validated multi-run history features:');
    console.log('  ✓ Multiple runs in same workspace');
    console.log('  ✓ LATEST file updates to newest run');
    console.log('  ✓ Historical run directories preserved');
    console.log('  ✓ All run metadata and journals accessible');
    console.log('  ✓ loadExistingContext uses LATEST file');
    console.log('  ✓ Can manually switch LATEST to access historical runs');
    console.log('  ✓ Run directories are independent');
    console.log('\nMulti-run history tracking validated!');

  } finally {
    // Clean up
    try {
      await fs.rm(testAgentDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Simple expect helper for tests
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
      if (!actual.includes(expected)) {
        throw new Error(`Expected array to contain ${expected}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: any) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

// Run the test
testMultiRunHistory().catch(error => {
  console.error('\n❌ Integration test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
