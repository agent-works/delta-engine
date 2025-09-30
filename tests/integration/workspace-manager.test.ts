#!/usr/bin/env node

/**
 * Test script to verify workspace management (v1.3)
 * Tests W001-style naming, LAST_USED tracking, and workspace selection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  generateNextWorkspaceId,
  saveLastUsedWorkspace,
  loadLastUsedWorkspace,
} from '../../src/workspace-manager.js';

async function testWorkspaceManager() {
  console.log('=== Testing Workspace Management (v1.3) ===\n');

  // Create a temporary test agent directory
  const testAgentDir = path.join(os.tmpdir(), `delta-test-workspace-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  const workspacesDir = path.join(testAgentDir, 'workspaces');
  await fs.mkdir(workspacesDir, { recursive: true });

  console.log(`Test agent directory: ${testAgentDir}`);

  try {
    // Test 1: Generate first workspace ID
    console.log('\nTest 1: Generate first workspace ID...');
    const ws1 = await generateNextWorkspaceId(workspacesDir);
    if (ws1 !== 'W001') {
      throw new Error(`Expected W001, got ${ws1}`);
    }
    console.log(`✓ First workspace ID: ${ws1}`);

    // Test 2: Create workspace directory
    console.log('\nTest 2: Create workspace directory...');
    const ws1Path = path.join(workspacesDir, ws1);
    await fs.mkdir(ws1Path, { recursive: true });
    const ws1Exists = await fs.access(ws1Path).then(() => true).catch(() => false);
    if (!ws1Exists) {
      throw new Error('Workspace directory not created');
    }
    console.log(`✓ Workspace created: ${ws1Path}`);

    // Test 3: Generate second workspace ID
    console.log('\nTest 3: Generate second workspace ID...');
    const ws2 = await generateNextWorkspaceId(workspacesDir);
    if (ws2 !== 'W002') {
      throw new Error(`Expected W002, got ${ws2}`);
    }
    console.log(`✓ Second workspace ID: ${ws2}`);

    // Create second workspace
    const ws2Path = path.join(workspacesDir, ws2);
    await fs.mkdir(ws2Path, { recursive: true });

    // Test 4: Save LAST_USED
    console.log('\nTest 4: Save LAST_USED...');
    await saveLastUsedWorkspace(workspacesDir, ws2);

    const lastUsedPath = path.join(workspacesDir, 'LAST_USED');
    const lastUsedExists = await fs.access(lastUsedPath).then(() => true).catch(() => false);
    if (!lastUsedExists) {
      throw new Error('LAST_USED file not created');
    }

    const lastUsedContent = await fs.readFile(lastUsedPath, 'utf-8');
    if (lastUsedContent.trim() !== ws2) {
      throw new Error(`Expected LAST_USED to be ${ws2}, got ${lastUsedContent.trim()}`);
    }
    console.log(`✓ LAST_USED saved: ${lastUsedContent.trim()}`);

    // Test 5: Load LAST_USED
    console.log('\nTest 5: Load LAST_USED...');
    const loadedWorkspace = await loadLastUsedWorkspace(workspacesDir);
    if (loadedWorkspace !== ws2) {
      throw new Error(`Expected to load ${ws2}, got ${loadedWorkspace}`);
    }
    console.log(`✓ LAST_USED loaded: ${loadedWorkspace}`);

    // Test 6: Generate workspace ID with gaps
    console.log('\nTest 6: Test workspace ID generation with gaps...');
    // Create W005 manually (leaving W003, W004 as gaps)
    const ws5Path = path.join(workspacesDir, 'W005');
    await fs.mkdir(ws5Path, { recursive: true });

    const ws3 = await generateNextWorkspaceId(workspacesDir);
    if (ws3 !== 'W006') {
      throw new Error(`Expected W006 (next after W005), got ${ws3}`);
    }
    console.log(`✓ Workspace ID correctly skips to W006 after W005`);

    // Test 7: Verify sequential naming up to W999
    console.log('\nTest 7: Verify high workspace numbers...');
    // Create W998 and W999
    await fs.mkdir(path.join(workspacesDir, 'W998'), { recursive: true });
    await fs.mkdir(path.join(workspacesDir, 'W999'), { recursive: true });

    const wsNext = await generateNextWorkspaceId(workspacesDir);
    if (wsNext !== 'W1000') {
      throw new Error(`Expected W1000, got ${wsNext}`);
    }
    console.log(`✓ Workspace numbering continues beyond W999: ${wsNext}`);

    // Test 8: Update LAST_USED with different workspace
    console.log('\nTest 8: Update LAST_USED...');
    await saveLastUsedWorkspace(workspacesDir, ws1);
    const updatedLastUsed = await loadLastUsedWorkspace(workspacesDir);
    if (updatedLastUsed !== ws1) {
      throw new Error(`Expected ${ws1}, got ${updatedLastUsed}`);
    }
    console.log(`✓ LAST_USED updated to: ${updatedLastUsed}`);

    // Test 9: Handle missing LAST_USED file
    console.log('\nTest 9: Handle missing LAST_USED...');
    await fs.unlink(lastUsedPath);
    const noLastUsed = await loadLastUsedWorkspace(workspacesDir);
    if (noLastUsed !== null) {
      throw new Error(`Expected null when LAST_USED missing, got ${noLastUsed}`);
    }
    console.log(`✓ Returns null when LAST_USED is missing`);

    console.log('\n=== ✅ ALL TESTS PASSED ===');
    console.log('Workspace management features working correctly:');
    console.log('  ✓ W001-style sequential naming');
    console.log('  ✓ LAST_USED file tracking');
    console.log('  ✓ Workspace ID generation handles gaps');
    console.log('  ✓ Numbering continues beyond W999');
    console.log('  ✓ LAST_USED updates correctly');
    console.log('  ✓ Handles missing LAST_USED gracefully');

  } finally {
    // Cleanup
    await fs.rm(testAgentDir, { recursive: true, force: true });
    console.log('\n✓ Test directory cleaned up');
  }
}

// Run the test
testWorkspaceManager().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
