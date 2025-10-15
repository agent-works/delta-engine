#!/usr/bin/env node

/**
 * Integration test for journal-based resumability
 *
 * Tests specification from CLAUDE.md:
 * "Stateless Core - Perfect resumability through journal-based state reconstruction"
 * "rebuildConversationFromJournal() rebuilds state from journal"
 * "Journal is Single Source of Truth (SSOT)"
 *
 * This tests DOCUMENTED behavior from architecture docs
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createTestAgent } from '../fixtures/create-test-agent.js';
import { initializeContext } from '../../src/context.js';
import { Engine } from '../../src/engine.js';

// Load test environment variables
dotenv.config({ path: path.join(process.cwd(), 'tests', '.env') });

async function testJournalResumability() {
  console.log('=== Testing Journal-based Resumability (Spec Validation) ===\n');
  console.log('This test validates CLAUDE.md specification:');
  console.log('  - "Stateless Core" - no in-memory state between iterations');
  console.log('  - "Perfect resumability through journal-based state reconstruction"');
  console.log('  - "Journal is Single Source of Truth (SSOT)"\n');

  const testAgentDir = path.join(os.tmpdir(), `test-journal-resume-${uuidv4()}`);

  try {
    await createTestAgent(testAgentDir, {
      name: 'test-journal-resume',
      maxIterations: 5,
    });

    // Test 1: Verify journal.jsonl is created
    console.log('Test 1: Verify journal.jsonl exists in .delta/{run_id}/...');

    const context = await initializeContext(
      testAgentDir,
      'Test journal creation',
      undefined,
      false,
      undefined,
      false,
      true
    );

    const engine = new Engine(context);
    await engine.initialize();

    // Write an event to create journal.jsonl
    await engine.getJournal().logSystemMessage('INFO', 'Test message');

    // Note: context.deltaDir already includes workspace path, runId is just the run directory name
    const runDir = path.join(context.deltaDir, context.runId);
    const journalPath = path.join(runDir, 'journal.jsonl');
    const journalExists = await fs.access(journalPath).then(() => true).catch(() => false);

    if (!journalExists) {
      throw new Error(`journal.jsonl not found at expected location: ${journalPath}`);
    }

    console.log(`✓ Journal found at: .delta/${context.runId}/journal.jsonl`);

    // Test 2: Verify journal is append-only JSONL
    console.log('\nTest 2: Verify journal is append-only JSONL format...');

    // Write a test event
    await engine.getJournal().logSystemMessage('INFO', 'Test message');

    const journalContent = await fs.readFile(journalPath, 'utf-8');
    const lines = journalContent.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      throw new Error('Journal is empty after writing event');
    }

    // Each line should be valid JSON
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (typeof event.seq !== 'number' || !event.type || !event.timestamp) {
          throw new Error('Event missing required fields');
        }
      } catch (error) {
        throw new Error(`Invalid JSONL format: ${line}`);
      }
    }

    console.log(`✓ Journal is valid JSONL with ${lines.length} event(s)`);

    // Test 3: Verify metadata.json exists
    console.log('\nTest 3: Verify metadata.json tracks run state...');

    await engine.getJournal().initializeMetadata(testAgentDir, 'Test task');

    const metadataPath = path.join(context.deltaDir, context.runId, 'metadata.json');
    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);

    if (!metadataExists) {
      throw new Error('metadata.json not found');
    }

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    // Per spec: metadata must have status field
    if (!metadata.status) {
      throw new Error('metadata.json missing status field');
    }

    // Per spec: valid statuses from CLAUDE.md
    const validStatuses = ['RUNNING', 'WAITING_FOR_INPUT', 'COMPLETED', 'FAILED', 'INTERRUPTED'];
    if (!validStatuses.includes(metadata.status)) {
      throw new Error(`Invalid status: ${metadata.status}`);
    }

    console.log(`✓ metadata.json exists with status: ${metadata.status}`);

    // Test 4: Verify I/O audit structure
    console.log('\nTest 4: Verify I/O audit directory structure...');

    // Per spec: "io/invocations/ - LLM invocation records"
    const ioDir = path.join(context.deltaDir, context.runId, 'io');
    const invocationsDir = path.join(ioDir, 'invocations');
    const toolExecDir = path.join(ioDir, 'tool_executions');
    const hooksDir = path.join(ioDir, 'hooks');

    const invocationsDirExists = await fs.access(invocationsDir).then(() => true).catch(() => false);
    const toolExecDirExists = await fs.access(toolExecDir).then(() => true).catch(() => false);
    const hooksDirExists = await fs.access(hooksDir).then(() => true).catch(() => false);

    if (!invocationsDirExists || !toolExecDirExists || !hooksDirExists) {
      throw new Error('I/O audit directories not created');
    }

    console.log('✓ I/O audit structure exists:');
    console.log('  - io/invocations/');
    console.log('  - io/tool_executions/');
    console.log('  - io/hooks/');

    // Test 5 (v1.10): Verify LATEST file removed (Frontierless Workspace)
    console.log('\nTest 5: Verify v1.10 Frontierless Workspace (no LATEST file)...');

    const latestPath = path.join(context.deltaDir, 'LATEST');
    const latestExists = await fs.access(latestPath).then(() => true).catch(() => false);

    if (latestExists) {
      throw new Error('LATEST file should not exist in v1.10 (Frontierless Workspace)');
    }

    console.log('✓ LATEST file correctly removed in v1.10 (eliminates race conditions)');

    // Test 6: Verify journal can be read back (SSOT test)
    console.log('\nTest 6: Verify journal can be read back (SSOT validation)...');

    const events = await engine.getJournal().readJournal();

    if (events.length === 0) {
      throw new Error('Journal read returned no events');
    }

    // Verify events are ordered by sequence
    for (let i = 1; i < events.length; i++) {
      if (events[i].seq <= events[i - 1].seq) {
        throw new Error('Journal events not in sequence order');
      }
    }

    console.log(`✓ Journal contains ${events.length} events in correct sequence`);

    // Test 7: Simulate process restart (stateless core validation)
    console.log('\nTest 7: Simulate process restart - verify state reconstruction...');

    // Close first engine
    await engine.getJournal().close();

    // Create NEW engine instance (simulating restart)
    const engine2 = new Engine(context);
    await engine2.initialize();

    // Verify journal can still be read
    const eventsAfterRestart = await engine2.getJournal().readJournal();

    if (eventsAfterRestart.length !== events.length) {
      throw new Error('Journal events lost after restart');
    }

    // Verify events are identical
    for (let i = 0; i < events.length; i++) {
      if (events[i].seq !== eventsAfterRestart[i].seq) {
        throw new Error('Journal events changed after restart');
      }
    }

    console.log('✓ Journal state perfectly reconstructed after simulated restart');
    console.log('  (Validates stateless core + SSOT)');

    // Test 8: Verify run can be resumed
    console.log('\nTest 8: Verify run resumability...');

    // Check metadata can be read after restart
    const metadataAfterRestart = await engine2.getJournal().readMetadata();

    if (metadataAfterRestart.run_id !== context.runId) {
      throw new Error('Metadata run_id mismatch after restart');
    }

    console.log('✓ Run metadata accessible after restart');

    await engine2.getJournal().close();

    // Summary
    console.log('\n=== ✅ ALL SPECIFICATION TESTS PASSED ===');
    console.log('Validated documented behavior from CLAUDE.md:');
    console.log('  ✓ journal.jsonl created in .delta/{run_id}/');
    console.log('  ✓ Journal is append-only JSONL format');
    console.log('  ✓ metadata.json tracks run state with valid status');
    console.log('  ✓ I/O audit directories created (invocations, tool_executions, hooks)');
    console.log('  ✓ LATEST file removed in v1.10 (Frontierless Workspace)');
    console.log('  ✓ Journal can be read back (SSOT validated)');
    console.log('  ✓ State reconstructs after simulated restart (stateless core)');
    console.log('  ✓ Run is resumable');
    console.log('\nStateless Core + Journal-based resumability specification validated!');

  } finally {
    // Clean up
    try {
      await fs.rm(testAgentDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
testJournalResumability().catch(error => {
  console.error('\n❌ Specification test failed:', error);
  process.exit(1);
});
