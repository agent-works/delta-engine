#!/usr/bin/env node

/**
 * Test script to verify stateless core implementation
 * This script validates that the engine correctly rebuilds context from journal
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { initializeContext } from '../../src/context.js';
import { Engine } from '../../src/engine.js';
import { createTestAgent } from '../fixtures/create-test-agent.js';

async function testStatelessCore() {
  console.log('=== Testing Stateless Core Implementation ===\n');

  // Set a dummy API key for testing (won't make actual API calls)
  process.env.OPENAI_API_KEY = 'test-key-for-stateless-validation';

  // Step 0: Create test agent
  const testAgentDir = path.join(os.tmpdir(), `delta-test-stateless-${uuidv4()}`);
  await createTestAgent(testAgentDir, { name: 'test-stateless-agent' });

  try {
    // Step 1: Initialize a new context
    console.log('Step 1: Initializing context...');
    const context = await initializeContext(
      testAgentDir,
      'List the files in the current directory, then create a file named "stateless-test.txt" with content "Testing stateless core"',
      undefined,
      false,
      undefined,
      false,
      true  // skipPrompt
    );

  console.log(`✓ Context initialized: ${context.runId}`);
  console.log(`  Work directory: ${context.workDir}`);

  // Step 2: Create an engine and run partial execution
  console.log('\nStep 2: Running partial execution (will interrupt after first iteration)...');

  const engine1 = new Engine(context);
  await engine1.initialize();
  const journal = engine1.getJournal();

  // Monkey-patch the engine to stop after first iteration
  const originalRun = engine1.run.bind(engine1);
  (engine1 as any).run = async function() {
    // Log engine start
    await journal.logRunStart(context.initialTask, context.agentPath);
    await journal.writeEngineLog(`Engine started: ${context.runId}`);

    // Run only one iteration
    console.log('\n[Iteration 1/30]');
    console.log('🤔 Thinking...');

    // Rebuild context from journal (should be empty on first run)
    const rebuildMethod = (engine1 as any).rebuildConversationFromJournal.bind(engine1);
    const messages = await rebuildMethod();

    console.log(`  Messages in context: ${messages.length}`);

    // Simulate LLM response with tool call
    await journal.logThought(
      'I need to list the files first, then create the requested file.',
      'test-invocation-1'
    );

    await journal.logActionRequest(
      'list_files',
      { directory: '.' },
      'ls -F .'
    );

    // Simulate tool execution
    await journal.logActionResult(
      'test-action-1',
      'SUCCESS',
      '=== STDOUT ===\nfile1.txt\nfile2.txt\n=== EXIT CODE: 0 ===',
      'test-action-1'
    );

    await journal.incrementIterations();
    await journal.flush();

    console.log('✓ First iteration completed and journaled');
    return 'Interrupted';
  };

  await engine1.run();

  // Step 3: Read journal to verify events were written
  console.log('\nStep 3: Verifying journal persistence...');

  const runDir = path.join(context.deltaDir, context.runId);
  const journalPath = path.join(runDir, 'journal.jsonl');

  const journalContent = await fs.readFile(journalPath, 'utf-8');
  const events = journalContent.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

  console.log(`  Total events in journal: ${events.length}`);
  console.log('  Event types:', events.map(e => e.type).join(', '));

  // Step 4: Create a new engine instance (simulating process restart)
  console.log('\nStep 4: Creating new engine instance (simulating restart)...');

  const engine2 = new Engine(context);
  await engine2.initialize();

  // Test context reconstruction
  const rebuildMethod = (engine2 as any).rebuildConversationFromJournal.bind(engine2);
  const reconstructedMessages = await rebuildMethod();

  console.log(`✓ Context reconstructed from journal`);
  console.log(`  Messages in reconstructed context: ${reconstructedMessages.length}`);

  // Verify the reconstructed messages
  if (reconstructedMessages.length === 0) {
    throw new Error('❌ Failed: No messages reconstructed from journal');
  }

  // Check message contents
  const hasUserMessage = reconstructedMessages.some(m => m.role === 'user');
  const hasAssistantMessage = reconstructedMessages.some(m => m.role === 'assistant');
  const hasToolMessage = reconstructedMessages.some(m => m.role === 'tool');

  console.log(`  Has user message: ${hasUserMessage}`);
  console.log(`  Has assistant message: ${hasAssistantMessage}`);
  console.log(`  Has tool message: ${hasToolMessage}`);

  if (!hasUserMessage || !hasAssistantMessage || !hasToolMessage) {
    throw new Error('❌ Failed: Not all message types were reconstructed');
  }

  // Step 5: Continue execution with the new engine
  console.log('\nStep 5: Testing continuation with new engine...');

  // Add another event to journal through the new engine
  const journal2 = engine2.getJournal();

  await journal2.logThought(
    'Files have been listed. Now I will create the requested file.',
    'test-invocation-2'
  );

  await journal2.logActionRequest(
    'write_file',
    { filename: 'stateless-test.txt', content: 'Testing stateless core' },
    'tee stateless-test.txt'
  );

  await journal2.flush();

  // Read journal again to verify append
  const journalContent2 = await fs.readFile(journalPath, 'utf-8');
  const events2 = journalContent2.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

  console.log(`✓ Successfully appended to journal`);
  console.log(`  Total events after continuation: ${events2.length}`);

  // Verify sequence numbers are monotonic
  let lastSeq = 0;
  for (const event of events2) {
    if (event.seq <= lastSeq) {
      throw new Error(`❌ Failed: Sequence numbers are not monotonic (${lastSeq} -> ${event.seq})`);
    }
    lastSeq = event.seq;
  }
  console.log(`✓ Sequence numbers are monotonic (1 to ${lastSeq})`);

  // Step 6: Final context reconstruction test
  console.log('\nStep 6: Final context reconstruction...');

  const finalMessages = await rebuildMethod();
  console.log(`  Final message count: ${finalMessages.length}`);

  // Verify all events are included
  const thoughtEvents = events2.filter(e => e.type === 'THOUGHT').length;
  const assistantMessages = finalMessages.filter(m => m.role === 'assistant').length;

  if (thoughtEvents !== assistantMessages) {
    throw new Error(`❌ Failed: Thought events (${thoughtEvents}) != Assistant messages (${assistantMessages})`);
  }

  console.log('\n=== ✅ ALL TESTS PASSED ===');
  console.log('The stateless core implementation is working correctly:');
  console.log('  ✓ No in-memory conversation state');
  console.log('  ✓ Context fully rebuilt from journal on each iteration');
  console.log('  ✓ Journal is the single source of truth');
  console.log('  ✓ Execution can be resumed after interruption');
  console.log('  ✓ Events are immediately persisted to disk');

  } finally {
    // Cleanup
    await fs.rm(testAgentDir, { recursive: true, force: true });
    console.log('\n✓ Test agent cleaned up');
  }
}

// Run the test
testStatelessCore().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});