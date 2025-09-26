#!/usr/bin/env node

/**
 * Test script to verify hook execution protocol
 * This validates the File-Based IPC implementation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { initializeContext } from '../../src/context.js';
import { createJournal } from '../../src/journal.js';
import { createHookExecutor } from '../../src/hook-executor.js';
import { HookDefinition } from '../../src/types.js';

async function testHookProtocol() {
  console.log('=== Testing Hook Execution Protocol ===\n');

  // Set dummy API key
  process.env.OPENAI_API_KEY = 'test-key';

  // Step 1: Create a test context
  console.log('Step 1: Setting up test environment...');

  const context = await initializeContext(
    'examples/hello-agent',
    'Test task for hooks'
  );

  const runDir = path.join(context.deltaDir, 'runs', context.runId);
  const journal = createJournal(context.runId, runDir);
  await journal.initialize();

  console.log(`✓ Context initialized: ${context.runId}`);
  console.log(`  Work directory: ${context.workDir}`);

  // Step 2: Create test hook scripts
  console.log('\nStep 2: Creating test hook scripts...');

  const hooksDir = path.join(context.workDir, 'test_hooks');
  await fs.mkdir(hooksDir, { recursive: true });

  // Create a simple echo hook
  const echoHookPath = path.join(hooksDir, 'echo_hook.sh');
  await fs.writeFile(
    echoHookPath,
    `#!/bin/bash
echo "Hook executed successfully"
echo "DELTA_RUN_ID: $DELTA_RUN_ID"
echo "DELTA_HOOK_IO_PATH: $DELTA_HOOK_IO_PATH"
echo "Current directory: $(pwd)"

# Read input
if [ -f "$DELTA_HOOK_IO_PATH/input/context.json" ]; then
  echo "Context file found"
  cat "$DELTA_HOOK_IO_PATH/input/context.json"
fi

# Write output
echo '{"status": "processed", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$DELTA_HOOK_IO_PATH/output/control.json"
`,
    'utf-8'
  );
  await fs.chmod(echoHookPath, 0o755);

  // Create a hook that modifies payload (for pre_llm_req)
  const modifyPayloadHookPath = path.join(hooksDir, 'modify_payload.sh');
  await fs.writeFile(
    modifyPayloadHookPath,
    `#!/bin/bash
# Read the proposed payload
if [ -f "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" ]; then
  # Add a custom field to the payload
  cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" | jq '. + {hook_modified: true, timestamp: "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
  echo "Payload modified successfully"
else
  echo "No payload found" >&2
  exit 1
fi
`,
    'utf-8'
  );
  await fs.chmod(modifyPayloadHookPath, 0o755);

  // Create a failing hook
  const failingHookPath = path.join(hooksDir, 'failing_hook.sh');
  await fs.writeFile(
    failingHookPath,
    `#!/bin/bash
echo "This hook will fail" >&2
exit 42
`,
    'utf-8'
  );
  await fs.chmod(failingHookPath, 0o755);

  console.log('✓ Test hook scripts created');

  // Step 3: Test basic hook execution
  console.log('\nStep 3: Testing basic hook execution...');

  const hookExecutor = createHookExecutor(
    journal,
    context.workDir,
    context.runId
  );

  const echoHookDef: HookDefinition = {
    command: [echoHookPath],
  };

  const result1 = await hookExecutor.executeHook(
    'test_echo',
    echoHookDef,
    { test: 'data' },
    context.agentPath
  );

  console.log(`  Hook executed: ${result1.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  IO path: ${result1.ioPathRef}`);

  if (!result1.success) {
    throw new Error('Echo hook should have succeeded');
  }

  // Verify hook output was read
  if (!result1.control || result1.control.status !== 'processed') {
    throw new Error('Hook control output not read correctly');
  }
  console.log('✓ Basic hook execution works');

  // Step 4: Test pre_llm_req hook with payload modification
  console.log('\nStep 4: Testing pre_llm_req hook...');

  const modifyHookDef: HookDefinition = {
    command: [modifyPayloadHookPath],
  };

  const originalPayload = {
    messages: [{ role: 'user', content: 'test' }],
    model: 'test-model',
  };

  const result2 = await hookExecutor.executePreLLMReqHook(
    modifyHookDef,
    originalPayload,
    context.agentPath
  );

  console.log(`  Hook executed: ${result2.success ? 'SUCCESS' : 'FAILED'}`);

  if (!result2.success) {
    throw new Error('Modify payload hook should have succeeded');
  }

  if (!result2.finalPayload || !result2.finalPayload.hook_modified) {
    throw new Error('Payload was not modified by hook');
  }

  console.log('✓ Payload modification works');
  console.log(`  Original payload keys: ${Object.keys(originalPayload).join(', ')}`);
  console.log(`  Modified payload keys: ${Object.keys(result2.finalPayload).join(', ')}`);

  // Step 5: Test failing hook
  console.log('\nStep 5: Testing failing hook...');

  const failingHookDef: HookDefinition = {
    command: [failingHookPath],
  };

  const result3 = await hookExecutor.executeHook(
    'test_failing',
    failingHookDef,
    null,
    context.agentPath
  );

  console.log(`  Hook executed: ${result3.success ? 'SUCCESS' : 'FAILED'}`);

  if (result3.success) {
    throw new Error('Failing hook should have failed');
  }

  console.log('✓ Hook failure handling works');

  // Step 6: Verify audit events in journal
  console.log('\nStep 6: Verifying audit events...');

  const events = await journal.readJournal();
  const auditEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');

  console.log(`  Total audit events: ${auditEvents.length}`);

  if (auditEvents.length !== 3) {
    throw new Error(`Expected 3 audit events, got ${auditEvents.length}`);
  }

  // Check audit event details
  for (const event of auditEvents) {
    const payload = event.payload as any;
    console.log(`    - ${payload.hook_name}: ${payload.status}`);

    if (!payload.io_path_ref) {
      throw new Error('Audit event missing io_path_ref');
    }
  }

  console.log('✓ Audit events properly recorded');

  // Step 7: Verify I/O directory structure
  console.log('\nStep 7: Verifying I/O directory structure...');

  const hooksIoDir = path.join(runDir, 'runtime_io', 'hooks');
  const hookDirs = await fs.readdir(hooksIoDir);

  console.log(`  Hook invocation directories: ${hookDirs.length}`);

  for (const dir of hookDirs) {
    const dirPath = path.join(hooksIoDir, dir);
    const contents = await fs.readdir(dirPath);

    if (!contents.includes('input') || !contents.includes('output') || !contents.includes('execution_meta')) {
      throw new Error(`Hook directory ${dir} missing required subdirectories`);
    }

    // Check execution_meta files
    const metaDir = path.join(dirPath, 'execution_meta');
    const metaFiles = await fs.readdir(metaDir);
    const requiredMeta = ['command.txt', 'stdout.log', 'stderr.log', 'exit_code.txt', 'duration_ms.txt'];

    for (const required of requiredMeta) {
      if (!metaFiles.includes(required)) {
        throw new Error(`Missing ${required} in ${dir}/execution_meta`);
      }
    }

    console.log(`    ✓ ${dir}: structure valid`);
  }

  // Step 8: Test environment variables
  console.log('\nStep 8: Verifying environment variable injection...');

  const stdout1Path = path.join(hooksIoDir, '001_test_echo', 'execution_meta', 'stdout.log');
  const stdout1 = await fs.readFile(stdout1Path, 'utf-8');

  if (!stdout1.includes(`DELTA_RUN_ID: ${context.runId}`)) {
    throw new Error('DELTA_RUN_ID not properly injected');
  }

  if (!stdout1.includes('DELTA_HOOK_IO_PATH:')) {
    throw new Error('DELTA_HOOK_IO_PATH not properly injected');
  }

  // On macOS, /var is a symlink to /private/var
  const normalizedWorkDir = context.workDir.replace(/^\/var/, '/private/var');
  if (!stdout1.includes(`Current directory: ${context.workDir}`) &&
      !stdout1.includes(`Current directory: ${normalizedWorkDir}`)) {
    throw new Error('Hook not executed with correct CWD');
  }

  console.log('✓ Environment variables properly injected');
  console.log('✓ Hook executed with correct CWD (workspace root)');

  console.log('\n=== ✅ ALL TESTS PASSED ===');
  console.log('The hook execution protocol is working correctly:');
  console.log('  ✓ File-Based IPC protocol implemented');
  console.log('  ✓ Input/output directories properly managed');
  console.log('  ✓ Environment variables correctly injected');
  console.log('  ✓ CWD set to workspace root');
  console.log('  ✓ Execution metadata captured');
  console.log('  ✓ Audit events recorded in journal');
  console.log('  ✓ Payload modification works (pre_llm_req)');
  console.log('  ✓ Failure handling works');
}

// Run the test
testHookProtocol().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});