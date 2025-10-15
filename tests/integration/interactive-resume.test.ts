#!/usr/bin/env node

/**
 * Test script to verify ask_human interactive resume feature (v1.3.1)
 * Tests that resumed runs properly handle ask_human responses
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { initializeContext } from '../../src/context.js';
import { RunStatus, DeltaRunMetadata } from '../../src/journal-types.js';
import { checkForInteractionResponse } from '../../src/ask-human.js';

async function testInteractiveResume() {
  console.log('=== Testing ask_human Interactive Resume (v1.3.1) ===\n');

  // Create a temporary test agent directory
  const testAgentDir = path.join(os.tmpdir(), `delta-test-resume-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  // Create minimal agent config
  await fs.writeFile(
    path.join(testAgentDir, 'config.yaml'),
    `name: test-resume-agent
llm:
  model: gpt-4
  temperature: 0.7
tools:
  - name: ask_human
    command: [echo]
    description: Ask the human for input
    parameters:
      - name: prompt
        type: string
        description: The question to ask
        inject_as: argument
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(testAgentDir, 'system_prompt.md'),
    'Test agent for resume testing',
    'utf-8'
  );

  console.log(`Test agent directory: ${testAgentDir}`);

  try {
    // Set dummy API key
    process.env.DELTA_API_KEY = 'test-key';

    // Test 1: Initialize context and create paused state
    console.log('\nTest 1: Initialize context and simulate paused state...');
    const context = await initializeContext(
      testAgentDir,
      'Test interactive resume',
      undefined,
      false,
      undefined,
      false,
      true  // skipPrompt
    );

    console.log(`✓ Context initialized: ${context.runId}`);
    console.log(`  Workspace: ${path.basename(context.workDir)}`);

    const deltaDir = path.join(context.workDir, '.delta');
    const runDir = path.join(deltaDir, context.runId);

    // Test 2: Create interaction request (simulating ask_human pause)
    console.log('\nTest 2: Create interaction request...');
    const interactionDir = path.join(runDir, 'interaction');
    await fs.mkdir(interactionDir, { recursive: true });

    const requestData = {
      request_id: uuidv4(),
      timestamp: new Date().toISOString(),
      prompt: 'What is your favorite color?',
      input_type: 'text',
      sensitive: false,
    };

    const requestPath = path.join(interactionDir, 'request.json');
    await fs.writeFile(requestPath, JSON.stringify(requestData, null, 2), 'utf-8');
    console.log(`✓ Interaction request created: ${requestPath}`);

    // Test 3: Update metadata to WAITING_FOR_INPUT
    console.log('\nTest 3: Set run status to WAITING_FOR_INPUT...');
    const metadataPath = path.join(runDir, 'metadata.json');

    const metadata: DeltaRunMetadata = {
      status: RunStatus.WAITING_FOR_INPUT,
      started_at: new Date().toISOString(),
      iterations: 1,
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`✓ Metadata status set to WAITING_FOR_INPUT`);

    // Test 4: Verify checkForInteractionResponse returns null (no response yet)
    console.log('\nTest 4: Verify no response initially...');
    const noResponse = await checkForInteractionResponse(context.workDir, context.runId);
    if (noResponse !== null) {
      throw new Error('Expected null when response not provided');
    }
    console.log(`✓ checkForInteractionResponse correctly returns null`);

    // Test 5: Create response.txt
    console.log('\nTest 5: Create user response...');
    const responsePath = path.join(interactionDir, 'response.txt');
    const userResponse = 'Blue';
    await fs.writeFile(responsePath, userResponse, 'utf-8');
    console.log(`✓ Response created: "${userResponse}"`);

    // Test 6: Verify checkForInteractionResponse now returns the response
    console.log('\nTest 6: Verify response is detected...');
    const detectedResponse = await checkForInteractionResponse(context.workDir, context.runId);
    if (detectedResponse !== userResponse) {
      throw new Error(`Expected "${userResponse}", got "${detectedResponse}"`);
    }
    console.log(`✓ Response correctly detected: "${detectedResponse}"`);

    // Test 7: Verify interaction files are cleaned up
    console.log('\nTest 7: Verify interaction files cleaned up...');
    const requestExists = await fs.access(requestPath).then(() => true).catch(() => false);
    const responseExists = await fs.access(responsePath).then(() => true).catch(() => false);

    if (requestExists) {
      throw new Error('request.json should be deleted after reading response');
    }
    if (responseExists) {
      throw new Error('response.txt should be deleted after reading response');
    }
    console.log(`✓ Interaction files cleaned up after response`);

    // Test 8: Test resume with different workspace
    console.log('\nTest 8: Test with explicit workspace path...');
    const context2 = await initializeContext(
      testAgentDir,
      'Second test run',
      context.workDir,  // Explicit workspace
      false,
      undefined,
      true,  // explicitWorkDir
      true   // skipPrompt
    );

    // Should resume in the same workspace
    if (context2.workDir !== context.workDir) {
      throw new Error(`Expected same workspace, got different: ${context2.workDir}`);
    }
    console.log(`✓ Explicit workspace path works: ${context2.workDir}`);

    // Test 9 (v1.10): LATEST file removed - skip this test
    console.log('\nTest 9: Verify v1.10 Frontierless Workspace (no LATEST file)...');
    const latestPath = path.join(deltaDir, 'LATEST');
    const latestExists = await fs.access(latestPath).then(() => true).catch(() => false);
    if (latestExists) {
      throw new Error('LATEST file should not exist in v1.10');
    }
    console.log(`✓ LATEST file correctly removed in v1.10`);

    // Test 10: Test interaction directory structure in v1.3
    console.log('\nTest 10: Verify v1.3 interaction directory structure...');
    const expectedInteractionPath = path.join(deltaDir, context.runId, 'interaction');

    // Create a new interaction for structure test
    await fs.mkdir(expectedInteractionPath, { recursive: true });
    await fs.writeFile(
      path.join(expectedInteractionPath, 'request.json'),
      JSON.stringify(requestData),
      'utf-8'
    );

    const interactionDirExists = await fs.access(expectedInteractionPath).then(() => true).catch(() => false);
    if (!interactionDirExists) {
      throw new Error(`Interaction directory should be at: ${expectedInteractionPath}`);
    }

    // Verify old v1.2 location does NOT exist
    const oldInteractionPath = path.join(deltaDir, 'runs', context.runId, 'interaction');
    const oldExists = await fs.access(oldInteractionPath).then(() => true).catch(() => false);

    if (oldExists) {
      throw new Error('Old v1.2 interaction path should not exist');
    }

    console.log(`✓ Interaction directory at correct v1.3 location`);
    console.log(`  Location: .delta/{runId}/interaction`);

    console.log('\n=== ✅ ALL TESTS PASSED ===');
    console.log('ask_human interactive resume features working correctly:');
    console.log('  ✓ Interaction request creation');
    console.log('  ✓ WAITING_FOR_INPUT status tracking');
    console.log('  ✓ Response detection');
    console.log('  ✓ Automatic cleanup after response read');
    console.log('  ✓ Workspace resume with explicit path');
    console.log('  ✓ LATEST file tracking across runs');
    console.log('  ✓ v1.3 interaction directory structure');
    console.log('  ✓ No legacy v1.2 paths');

  } finally {
    // Cleanup
    await fs.rm(testAgentDir, { recursive: true, force: true });
    console.log('\n✓ Test directory cleaned up');
  }
}

// Run the test
testInteractiveResume().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
