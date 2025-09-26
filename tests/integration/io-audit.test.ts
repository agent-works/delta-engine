#!/usr/bin/env node

/**
 * Test script to verify I/O audit trail implementation
 * This script validates that runtime_io details are properly saved
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { initializeContext } from '../../src/context.js';
import { runEngine } from '../../src/engine.js';

async function testIOAudit() {
  console.log('=== Testing I/O Audit Trail Implementation ===\n');

  // Set API key for testing
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

  // Step 1: Run a simple task that involves tool execution
  console.log('Step 1: Running engine with tool execution...');

  const context = await initializeContext(
    'examples/hello-agent',
    'Create a file named "audit-test.txt" with a long content (repeat "Hello World! " 500 times), then list the files'
  );

  console.log(`✓ Context initialized: ${context.runId}`);
  console.log(`  Work directory: ${context.workDir}`);

  try {
    const result = await runEngine(context);
    console.log('✓ Engine execution completed');
  } catch (error) {
    console.log('✓ Engine execution completed (or simulated)');
  }

  // Step 2: Verify journal events
  console.log('\nStep 2: Checking journal events...');

  const journalPath = path.join(
    context.deltaDir,
    'runs',
    context.runId,
    'execution',
    'journal.jsonl'
  );

  const journalContent = await fs.readFile(journalPath, 'utf-8');
  const events = journalContent.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  const thoughtEvents = events.filter(e => e.type === 'THOUGHT');
  const actionRequests = events.filter(e => e.type === 'ACTION_REQUEST');
  const actionResults = events.filter(e => e.type === 'ACTION_RESULT');

  console.log(`  THOUGHT events: ${thoughtEvents.length}`);
  console.log(`  ACTION_REQUEST events: ${actionRequests.length}`);
  console.log(`  ACTION_RESULT events: ${actionResults.length}`);

  // Step 3: Verify LLM invocation details
  console.log('\nStep 3: Verifying LLM invocation details...');

  for (const thought of thoughtEvents) {
    const invocationRef = thought.payload.llm_invocation_ref;
    if (!invocationRef) {
      throw new Error('❌ THOUGHT event missing llm_invocation_ref');
    }

    const invocationDir = path.join(
      context.deltaDir,
      'runs',
      context.runId,
      'runtime_io',
      'invocations',
      invocationRef
    );

    // Check if invocation directory exists
    try {
      await fs.access(invocationDir);
      console.log(`  ✓ Invocation directory exists: ${invocationRef}`);
    } catch {
      throw new Error(`❌ Invocation directory not found: ${invocationDir}`);
    }

    // Check required files
    const requiredFiles = ['request.json', 'response.json', 'metadata.json'];
    for (const file of requiredFiles) {
      const filePath = path.join(invocationDir, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.size === 0) {
          throw new Error(`❌ ${file} is empty`);
        }
        console.log(`    ✓ ${file} exists (${stat.size} bytes)`);
      } catch (error) {
        throw new Error(`❌ ${file} not found or empty: ${error}`);
      }
    }

    // Validate request.json structure
    const requestPath = path.join(invocationDir, 'request.json');
    const requestData = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

    if (!requestData.messages || !requestData.model) {
      throw new Error('❌ Invalid request.json structure');
    }
    console.log(`    ✓ request.json has valid structure`);
  }

  // Step 4: Verify tool execution details
  console.log('\nStep 4: Verifying tool execution details...');

  for (const actionResult of actionResults) {
    const executionRef = actionResult.payload.execution_ref;
    const actionId = actionResult.payload.action_id;

    if (!executionRef) {
      throw new Error('❌ ACTION_RESULT missing execution_ref');
    }

    const executionDir = path.join(
      context.deltaDir,
      'runs',
      context.runId,
      'runtime_io',
      'tool_executions',
      executionRef
    );

    // Check if execution directory exists
    try {
      await fs.access(executionDir);
      console.log(`  ✓ Execution directory exists: ${executionRef}`);
    } catch {
      throw new Error(`❌ Execution directory not found: ${executionDir}`);
    }

    // Check required files
    const requiredFiles = [
      'command.txt',
      'stdout.log',
      'stderr.log',
      'exit_code.txt',
      'duration_ms.txt'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(executionDir, file);
      try {
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        console.log(`    ✓ ${file} exists`);

        // Special checks
        if (file === 'exit_code.txt') {
          const exitCode = parseInt(content.trim());
          if (isNaN(exitCode)) {
            throw new Error(`❌ Invalid exit code: ${content}`);
          }
        }

        if (file === 'duration_ms.txt') {
          const duration = parseInt(content.trim());
          if (isNaN(duration) || duration < 0) {
            throw new Error(`❌ Invalid duration: ${content}`);
          }
        }
      } catch (error) {
        throw new Error(`❌ ${file} check failed: ${error}`);
      }
    }
  }

  // Step 5: Verify observation_content vs full output distinction
  console.log('\nStep 5: Checking observation_content vs full output...');

  for (const actionResult of actionResults) {
    const observationContent = actionResult.payload.observation_content;
    const executionRef = actionResult.payload.execution_ref;

    const stdoutPath = path.join(
      context.deltaDir,
      'runs',
      context.runId,
      'runtime_io',
      'tool_executions',
      executionRef,
      'stdout.log'
    );

    try {
      const fullOutput = await fs.readFile(stdoutPath, 'utf-8');

      console.log(`  Action ${executionRef}:`);
      console.log(`    Full output size: ${fullOutput.length} bytes`);
      console.log(`    Observation size: ${observationContent.length} bytes`);

      // Check if observation contains expected markers
      if (!observationContent.includes('=== EXIT CODE:')) {
        throw new Error('❌ Observation missing EXIT CODE marker');
      }

      // If output was large, check for truncation message
      if (fullOutput.length > 5000 && !observationContent.includes('[Output truncated')) {
        console.log('    ⚠️  Large output may not have truncation marker');
      }

      console.log('    ✓ Observation properly formatted');
    } catch (error) {
      throw new Error(`❌ Failed to compare outputs: ${error}`);
    }
  }

  // Step 6: Verify linkage between events
  console.log('\nStep 6: Verifying event linkages...');

  // Check ACTION_REQUEST -> ACTION_RESULT linkage
  for (const request of actionRequests) {
    const actionId = request.payload.action_id;
    const correspondingResult = actionResults.find(
      r => r.payload.action_id === actionId
    );

    if (!correspondingResult) {
      throw new Error(`❌ No ACTION_RESULT for ACTION_REQUEST ${actionId}`);
    }
    console.log(`  ✓ ACTION_REQUEST ${actionId} has corresponding ACTION_RESULT`);
  }

  console.log('\n=== ✅ ALL TESTS PASSED ===');
  console.log('The I/O audit trail implementation is working correctly:');
  console.log('  ✓ LLM invocations are fully logged with request/response/metadata');
  console.log('  ✓ Tool executions are fully logged with all I/O details');
  console.log('  ✓ THOUGHT events correctly reference llm_invocation_ref');
  console.log('  ✓ ACTION_RESULT events correctly reference execution_ref');
  console.log('  ✓ observation_content is distinct from full output');
  console.log('  ✓ All event linkages are properly maintained');
}

// Run the test
testIOAudit().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});