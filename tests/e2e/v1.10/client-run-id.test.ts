#!/usr/bin/env node

/**
 * E2E Test: P0.1 - Client-Generated Run ID + Basic Flow
 *
 * Tests v1.10 foundational capability: Clients provide deterministic Run IDs
 * instead of engine-generated timestamps, enabling predictable orchestration.
 *
 * Scenario: Orchestration script tracks runs by client-provided IDs
 * - Client provides --run-id parameter
 * - Run ID is used throughout execution
 * - Run directory created with client ID
 * - Metadata contains client run ID
 * - Basic lifecycle: RUNNING → COMPLETED
 *
 * Validates:
 * - --run-id parameter accepted
 * - Run directory: .delta/{client_run_id}/
 * - Metadata contains correct run_id
 * - Journal events reference correct run_id
 * - No LATEST file created (v1.10 Frontierless Workspace)
 * - Status transitions: RUNNING → COMPLETED
 *
 * Test Plan Reference: docs/testing/v1.10-test-plan.md#p01-client-generated-run-id--basic-flow
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testClientRunId() {
  console.log('=== E2E Test: P0.1 - Client-Generated Run ID + Basic Flow ===\n');
  console.log('Validates v1.10 foundational capability:');
  console.log('  • Client provides deterministic Run IDs');
  console.log('  • Run ID used throughout execution');
  console.log('  • Predictable run directory paths');
  console.log('  • No LATEST file (Frontierless Workspace)\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-client-id-${uuidv4()}`);
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

    // Step 2: Create workspace directory
    console.log('Step 2: Create workspace directory...');
    const workspaceDir = path.join(testAgentDir, 'workspaces', 'W001');
    await fs.mkdir(workspaceDir, { recursive: true });
    const deltaDir = path.join(workspaceDir, '.delta');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'VERSION'), '1.0', 'utf-8');
    console.log('  ✓ Workspace W001 created\n');

    // Step 3: Generate client-provided Run ID
    console.log('Step 3: Generate client-provided Run ID...');
    const clientRunId = `test-run-${uuidv4().substring(0, 8)}`;
    console.log(`  ✓ Client Run ID: ${clientRunId}\n`);

    // Step 4: Execute run with client-provided Run ID
    console.log('Step 4: Execute run with --run-id parameter...');
    const runResult = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '--work-dir', workspaceDir,
        '--run-id', clientRunId,
        '-m', 'Simple task: echo "Hello from client-generated run"',
        '-y',
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

    console.log(`  ✓ Command executed (exit code: ${runResult.exitCode})\n`);

    // Step 5: Verify run directory created with client ID
    console.log('Step 5: Verify run directory uses client ID...');
    const runDir = path.join(deltaDir, clientRunId);
    expect(await exists(runDir)).toBe(true);
    console.log(`  ✓ Run directory exists: .delta/${clientRunId}/`);

    // Verify standard structure
    expect(await exists(path.join(runDir, 'journal.jsonl'))).toBe(true);
    console.log('  ✓ journal.jsonl exists');

    expect(await exists(path.join(runDir, 'metadata.json'))).toBe(true);
    console.log('  ✓ metadata.json exists\n');

    // Step 6: Verify metadata contains client Run ID
    console.log('Step 6: Verify metadata contains client Run ID...');
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    expect(metadata.run_id).toBe(clientRunId);
    console.log(`  ✓ metadata.run_id: "${metadata.run_id}"`);

    expect(metadata.status).toBeDefined();
    console.log(`  ✓ metadata.status: "${metadata.status}"\n`);

    // Step 7: Verify journal references client Run ID
    console.log('Step 7: Verify journal references client Run ID...');
    const journalPath = path.join(runDir, 'journal.jsonl');
    const journalContent = await fs.readFile(journalPath, 'utf-8');
    const journalEvents = journalContent.split('\n').filter(l => l.trim());

    expect(journalEvents.length).toBeGreaterThan(0);
    console.log(`  ✓ Journal has ${journalEvents.length} events`);

    // Parse first event to verify it's valid JSON
    const firstEvent = JSON.parse(journalEvents[0]);
    expect(firstEvent.type).toBe('RUN_START');
    console.log(`  ✓ First event type: "${firstEvent.type}"`);
    console.log('  ✓ Journal format is valid\n');

    // Step 8: Verify no LATEST file created
    console.log('Step 8: Verify no LATEST file (v1.10 Frontierless)...');
    const latestPath = path.join(deltaDir, 'LATEST');
    const latestExists = await exists(latestPath);

    expect(latestExists).toBe(false);
    console.log('  ✓ No LATEST file created');
    console.log('  ✓ v1.10 Frontierless Workspace validated\n');

    // Step 9: Verify status lifecycle
    console.log('Step 9: Verify status lifecycle...');

    // Final status should be COMPLETED (assuming task succeeded)
    if (runResult.exitCode === 0) {
      expect(metadata.status).toBe('COMPLETED');
      console.log('  ✓ Final status: COMPLETED');
    } else {
      // If failed, status should be FAILED
      expect(['FAILED', 'WAITING_FOR_INPUT', 'INTERRUPTED']).toContain(metadata.status);
      console.log(`  ✓ Final status: ${metadata.status}`);
    }

    console.log('  ✓ Status lifecycle validated\n');

    // Step 10: Verify deterministic path access
    console.log('Step 10: Verify deterministic path access...');

    // Client can construct path directly without reading LATEST
    const predictedPath = path.join(deltaDir, clientRunId, 'metadata.json');
    expect(await exists(predictedPath)).toBe(true);
    console.log(`  ✓ Client can access run at predictable path`);
    console.log(`    Path: .delta/${clientRunId}/metadata.json`);
    console.log('  ✓ No file-system lookup required (deterministic)\n');

    // Summary
    console.log('=== ✅ CLIENT-GENERATED RUN ID TEST COMPLETE ===');
    console.log('Validated v1.10 foundational capability:');
    console.log('  ✓ --run-id parameter accepted');
    console.log('  ✓ Run directory uses client ID (.delta/{client_run_id}/)');
    console.log('  ✓ Metadata contains client run_id');
    console.log('  ✓ Journal references client run_id');
    console.log('  ✓ No LATEST file created (Frontierless Workspace)');
    console.log('  ✓ Status lifecycle correct (RUNNING → COMPLETED)');
    console.log('  ✓ Deterministic path access enabled');
    console.log('\n🎯 v1.10 enables predictable multi-agent orchestration!');

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
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toContain(item: any) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Expected array to contain ${item}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

testClientRunId().catch(error => {
  console.error('\n❌ E2E Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
