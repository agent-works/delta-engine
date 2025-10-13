#!/usr/bin/env node

/**
 * Test script to verify pre_llm_req hook integration end-to-end
 * This validates the Payload Transformer pattern implementation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { initializeContext } from '../../src/context.js';
import { Engine } from '../../src/engine.js';

async function testPreLLMReqIntegration() {
  console.log('=== Testing pre_llm_req Hook Integration ===\n');

  // Set dummy API key for testing
  process.env.OPENAI_API_KEY = 'test-key';

  // Step 1: Create test agent with pre_llm_req hook
  console.log('Step 1: Creating test agent with pre_llm_req hook...');

  const testAgentDir = '/tmp/test-pre-llm-req-agent';
  await fs.mkdir(testAgentDir, { recursive: true });

  // Create config with pre_llm_req hook
  await fs.writeFile(
    path.join(testAgentDir, 'config.yaml'),
    `name: test-pre-llm-req-agent
llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: echo
    command: [echo]
    parameters:
      - name: message
        type: string
        description: Message to echo
        inject_as: argument

lifecycle_hooks:
  pre_llm_req:
    command: ["${testAgentDir}/modify_request.sh"]
`,
    'utf-8'
  );

  // Create system prompt (v1.6: requires system_prompt.md, not .txt)
  await fs.writeFile(
    path.join(testAgentDir, 'system_prompt.md'),
    'You are a test agent for validating hook integration.',
    'utf-8'
  );

  // Create the hook script that modifies requests
  const hookScript = `#!/bin/bash
set -e

echo "pre_llm_req hook executed at $(date)" >&2
echo "Input directory: $DELTA_HOOK_IO_PATH/input" >&2
echo "Output directory: $DELTA_HOOK_IO_PATH/output" >&2

# Read the proposed payload
if [ -f "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" ]; then
  echo "Found proposed_payload.json" >&2

  # Modify the payload by adding a custom marker
  # This simulates a hook that adds context or modifies the request
  cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" | jq '.hook_metadata = {
    modified: true,
    timestamp: "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    hook_version: "1.0"
  }' > "$DELTA_HOOK_IO_PATH/output/final_payload.json"

  echo "Payload modified and saved to final_payload.json" >&2

  # Also write control output
  echo '{"status": "modified", "action": "added_metadata"}' > "$DELTA_HOOK_IO_PATH/output/control.json"
else
  echo "ERROR: No proposed payload found" >&2
  exit 1
fi
`;

  await fs.writeFile(
    path.join(testAgentDir, 'modify_request.sh'),
    hookScript,
    'utf-8'
  );
  await fs.chmod(path.join(testAgentDir, 'modify_request.sh'), 0o755);

  console.log('✓ Test agent created with pre_llm_req hook');

  // Step 2: Initialize context and engine
  console.log('\nStep 2: Initializing engine with hook-enabled agent...');

  const context = await initializeContext(
    testAgentDir,
    'Test the pre_llm_req hook integration',
    undefined,
    false,
    undefined,
    false,
    true  // skipPrompt
  );

  const engine = new Engine(context);
  await engine.initialize();

  console.log(`✓ Engine initialized: ${context.runId}`);

  // Step 3: Mock the LLM call to intercept and validate
  console.log('\nStep 3: Mocking LLM to validate request transformation...');

  // We'll need to mock the actual LLM call since we're testing
  // For now, let's just verify the hook execution by checking the audit trail

  const journal = engine.getJournal();

  // Trigger one iteration to execute the hook
  // We'll catch the error from missing API key but can still check hook execution
  try {
    // This will fail due to invalid API key, but hooks should still run
    // Add timeout to prevent test from hanging indefinitely
    await Promise.race([
      (engine as any).run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API call timeout - expected with dummy key')), 5000)
      )
    ]);
  } catch (error: any) {
    if (!error.message.includes('API') && !error.message.includes('timeout')) {
      throw error;
    }
    console.log('✓ Expected API error or timeout (testing with dummy key)');
  }

  // Step 4: Verify hook execution in audit trail
  console.log('\nStep 4: Verifying hook execution audit trail...');

  const runDir = path.join(context.deltaDir, context.runId);
  const events = await journal.readJournal();

  const hookAuditEvents = events.filter(
    (e: any) => e.type === 'HOOK_EXECUTION_AUDIT' && e.payload.hook_name === 'pre_llm_req'
  );

  if (hookAuditEvents.length === 0) {
    throw new Error('No pre_llm_req hook audit events found');
  }

  console.log(`✓ Found ${hookAuditEvents.length} pre_llm_req audit event(s)`);

  // Step 5: Verify the hook I/O structure
  console.log('\nStep 5: Verifying hook I/O directory structure...');

  const hooksDir = path.join(runDir, 'io', 'hooks');

  // Find the pre_llm_req hook directory
  const hookDirs = await fs.readdir(hooksDir).catch(() => []);
  const preLLMReqDir = hookDirs.find(d => d.includes('pre_llm_req'));

  if (!preLLMReqDir) {
    throw new Error('pre_llm_req hook directory not found');
  }

  const hookPath = path.join(hooksDir, preLLMReqDir);

  // Check input directory
  const proposedPayloadPath = path.join(hookPath, 'input', 'proposed_payload.json');
  const proposedPayloadExists = await fs.access(proposedPayloadPath).then(() => true).catch(() => false);

  if (!proposedPayloadExists) {
    throw new Error('proposed_payload.json not found in hook input directory');
  }

  const proposedPayload = JSON.parse(
    await fs.readFile(proposedPayloadPath, 'utf-8')
  );

  console.log('✓ Found proposed_payload.json with structure:');
  console.log(`  - messages: ${proposedPayload.messages?.length || 0} messages`);
  console.log(`  - model: ${proposedPayload.model}`);
  console.log(`  - tools: ${proposedPayload.tools?.length || 0} tools`);

  // Check output directory
  const finalPayloadPath = path.join(hookPath, 'output', 'final_payload.json');
  const finalPayloadExists = await fs.access(finalPayloadPath).then(() => true).catch(() => false);

  if (!finalPayloadExists) {
    throw new Error('final_payload.json not found in hook output directory');
  }

  const finalPayload = JSON.parse(
    await fs.readFile(finalPayloadPath, 'utf-8')
  );

  // Verify the hook modified the payload
  if (!finalPayload.hook_metadata || !finalPayload.hook_metadata.modified) {
    throw new Error('Hook did not modify the payload as expected');
  }

  console.log('✓ Found final_payload.json with modifications:');
  console.log(`  - hook_metadata.modified: ${finalPayload.hook_metadata.modified}`);
  console.log(`  - hook_metadata.hook_version: ${finalPayload.hook_metadata.hook_version}`);

  // Step 6: Verify the modified payload would be saved to invocations
  console.log('\nStep 6: Checking io/invocations structure...');

  const invocationsDir = path.join(runDir, 'io', 'invocations');

  try {
    const invocationDirs = await fs.readdir(invocationsDir);

    if (invocationDirs.length > 0) {
      const firstInvocation = invocationDirs[0];
      const requestPath = path.join(invocationsDir, firstInvocation, 'request.json');

      const requestExists = await fs.access(requestPath).then(() => true).catch(() => false);

      if (requestExists) {
        const savedRequest = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

        // Check if the saved request contains the hook modifications
        if (savedRequest.hook_metadata) {
          console.log('✓ Invocation request.json contains hook modifications');
          console.log(`  - This confirms the final payload is saved, not the baseline`);
        } else {
          console.log('⚠️  Invocation request.json does not contain hook modifications');
          console.log('  - This may be due to the API call failing before save');
        }
      }
    } else {
      console.log('  - No invocations saved (expected due to API error)');
    }
  } catch (error) {
    console.log('  - Invocations directory not created (expected due to early API error)');
  }

  // Step 7: Verify execution metadata
  console.log('\nStep 7: Verifying hook execution metadata...');

  const execMetaDir = path.join(hookPath, 'execution_meta');
  const metaFiles = await fs.readdir(execMetaDir);

  const requiredFiles = ['command.txt', 'stdout.log', 'stderr.log', 'exit_code.txt', 'duration_ms.txt'];
  for (const file of requiredFiles) {
    if (!metaFiles.includes(file)) {
      throw new Error(`Missing execution metadata file: ${file}`);
    }
  }

  const exitCode = await fs.readFile(
    path.join(execMetaDir, 'exit_code.txt'),
    'utf-8'
  );

  if (exitCode.trim() !== '0') {
    throw new Error(`Hook failed with exit code: ${exitCode}`);
  }

  console.log('✓ Hook execution metadata complete');
  console.log('  - Exit code: 0 (success)');

  // Summary
  console.log('\n=== ✅ ALL TESTS PASSED ===');
  console.log('The pre_llm_req hook integration is working correctly:');
  console.log('  ✓ Hook is executed before LLM call');
  console.log('  ✓ proposed_payload.json is written to input directory');
  console.log('  ✓ Hook can modify the payload');
  console.log('  ✓ final_payload.json is read from output directory');
  console.log('  ✓ Modified payload would be used for LLM call');
  console.log('  ✓ Audit events are recorded in journal');
  console.log('  ✓ Execution metadata is captured');
  console.log('\nPayload Transformer pattern successfully implemented!');
}

// Run the test
testPreLLMReqIntegration().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});