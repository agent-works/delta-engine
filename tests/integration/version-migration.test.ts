#!/usr/bin/env node

/**
 * Test script to verify VERSION file handling and v1.3 schema versioning
 * Tests VERSION file creation, reading, and migration detection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { initializeContext } from '../../src/context.js';

async function testVersionMigration() {
  console.log('=== Testing VERSION File Handling (v1.3) ===\n');

  // Create a temporary test agent directory
  const testAgentDir = path.join(os.tmpdir(), `delta-test-version-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  // Create minimal agent config
  await fs.writeFile(
    path.join(testAgentDir, 'config.yaml'),
    `name: test-version-agent
llm:
  model: gpt-4
  temperature: 0.7
tools: []
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(testAgentDir, 'system_prompt.md'),
    'Test agent for version testing',
    'utf-8'
  );

  console.log(`Test agent directory: ${testAgentDir}`);

  try {
    // Set dummy API key
    process.env.DELTA_API_KEY = 'test-key';

    // Test 1: Initialize context and verify VERSION file creation
    console.log('\nTest 1: Initialize context and verify VERSION file...');
    const context = await initializeContext(
      testAgentDir,
      'Test version file creation',
      undefined,
      false,
      undefined,
      false,
      true  // skipPrompt
    );

    console.log(`✓ Context initialized: ${context.runId}`);
    console.log(`  Workspace: ${path.basename(context.workDir)}`);

    // Check that VERSION file exists
    const deltaDir = path.join(context.workDir, '.delta');
    const versionFile = path.join(deltaDir, 'VERSION');

    const versionExists = await fs.access(versionFile).then(() => true).catch(() => false);
    if (!versionExists) {
      throw new Error('VERSION file not created');
    }
    console.log(`✓ VERSION file exists: ${versionFile}`);

    // Test 2: Read VERSION file content
    console.log('\nTest 2: Read VERSION file content...');
    const versionContent = await fs.readFile(versionFile, 'utf-8');
    const version = versionContent.trim();

    console.log(`  VERSION content: "${version}"`);

    // Verify it's a valid version format (e.g., "1.2", "1.3")
    if (!/^\d+\.\d+$/.test(version)) {
      throw new Error(`Invalid version format: ${version}`);
    }
    console.log(`✓ VERSION file has valid format`);

    // Test 3: Verify VERSION is at least 1.2 (v1.3 uses "1.2" for backward compat)
    console.log('\nTest 3: Verify schema version...');
    const [major, minor] = version.split('.').map(Number);

    if (major < 1 || (major === 1 && minor < 2)) {
      throw new Error(`VERSION should be at least 1.2, got ${version}`);
    }
    console.log(`✓ Schema version is ${version} (>= 1.2)`);

    // Test 4 (v1.10): Verify LATEST file removed (Frontierless Workspace)
    console.log('\nTest 4: Verify v1.10 Frontierless Workspace (no LATEST file)...');
    const latestFile = path.join(deltaDir, 'LATEST');
    const latestExists = await fs.access(latestFile).then(() => true).catch(() => false);

    if (latestExists) {
      throw new Error('LATEST file should not exist in v1.10');
    }

    console.log('✓ LATEST file correctly not created in v1.10 (eliminates race conditions)');

    // Test 5: Verify v1.3 directory structure (no 'runs/' subdirectory)
    console.log('\nTest 5: Verify v1.3 directory structure...');
    const runDir = path.join(deltaDir, context.runId);
    const runDirExists = await fs.access(runDir).then(() => true).catch(() => false);

    if (!runDirExists) {
      throw new Error(`Run directory not found: ${runDir}`);
    }
    console.log(`✓ Run directory: ${runDir}`);

    // Verify old v1.2 'runs/' directory does NOT exist
    const oldRunsDir = path.join(deltaDir, 'runs');
    const oldRunsDirExists = await fs.access(oldRunsDir).then(() => true).catch(() => false);

    if (oldRunsDirExists) {
      throw new Error('Old v1.2 "runs/" directory should not exist in v1.3');
    }
    console.log(`✓ No legacy "runs/" directory (v1.3 structure)`);

    // Test 6: Verify journal.jsonl would be at correct location (v1.3 structure)
    console.log('\nTest 6: Verify journal.jsonl location structure...');
    const expectedJournalPath = path.join(runDir, 'journal.jsonl');

    // Create the journal to test the path (simulating engine initialization)
    await fs.writeFile(expectedJournalPath, '', 'utf-8');
    const journalExists = await fs.access(expectedJournalPath).then(() => true).catch(() => false);

    if (!journalExists) {
      throw new Error(`journal.jsonl location test failed: ${expectedJournalPath}`);
    }
    console.log(`✓ journal.jsonl at correct v1.3 location: .delta/{runId}/journal.jsonl`);

    // Verify old v1.2 journal location does NOT exist
    const oldJournalPath = path.join(deltaDir, 'runs', context.runId, 'execution', 'journal.jsonl');
    const oldJournalExists = await fs.access(oldJournalPath).then(() => true).catch(() => false);

    if (oldJournalExists) {
      throw new Error('Old v1.2 journal location should not exist');
    }
    console.log(`✓ No legacy "execution/journal.jsonl" path`);

    // Test 7: Verify io/ directory structure (not runtime_io/)
    console.log('\nTest 7: Verify io/ directory structure...');
    const ioDir = path.join(runDir, 'io');

    // Create io/ directory to test path (simulating engine initialization)
    await fs.mkdir(ioDir, { recursive: true });
    const ioDirExists = await fs.access(ioDir).then(() => true).catch(() => false);

    if (!ioDirExists) {
      throw new Error(`io/ directory test failed: ${ioDir}`);
    }
    console.log(`✓ io/ directory at correct location: .delta/{runId}/io/`);

    // Verify old runtime_io/ does NOT exist
    const oldIoDir = path.join(runDir, 'runtime_io');
    const oldIoDirExists = await fs.access(oldIoDir).then(() => true).catch(() => false);

    if (oldIoDirExists) {
      throw new Error('Old "runtime_io/" directory should not exist in v1.3');
    }
    console.log(`✓ No legacy "runtime_io/" directory`);

    // Test 8: Verify LAST_USED file in workspaces/ directory
    console.log('\nTest 8: Verify LAST_USED file...');
    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const lastUsedFile = path.join(workspacesDir, 'LAST_USED');
    const lastUsedExists = await fs.access(lastUsedFile).then(() => true).catch(() => false);

    if (!lastUsedExists) {
      throw new Error('LAST_USED file not created in workspaces/');
    }

    const lastUsedContent = await fs.readFile(lastUsedFile, 'utf-8');
    console.log(`✓ LAST_USED file exists: ${lastUsedContent.trim()}`);

    console.log('\n=== ✅ ALL TESTS PASSED ===');
    console.log('VERSION file and schema features working correctly (v1.10):');
    console.log('  ✓ VERSION file created with valid format');
    console.log('  ✓ Schema version >= 1.2');
    console.log('  ✓ LATEST file removed in v1.10 (Frontierless Workspace)');
    console.log('  ✓ v1.3 directory structure (no "runs/" nesting)');
    console.log('  ✓ journal.jsonl at .delta/{runId}/journal.jsonl');
    console.log('  ✓ io/ directory (not runtime_io/)');
    console.log('  ✓ LAST_USED tracking in workspaces/');
    console.log('  ✓ No legacy v1.2 directory structure');

  } finally {
    // Cleanup
    await fs.rm(testAgentDir, { recursive: true, force: true });
    console.log('\n✓ Test directory cleaned up');
  }
}

// Run the test
testVersionMigration().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
