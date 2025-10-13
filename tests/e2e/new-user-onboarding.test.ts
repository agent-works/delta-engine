#!/usr/bin/env node

/**
 * E2E Test: New User Onboarding Journey
 *
 * Tests complete user workflow from TESTING_STRATEGY.md Journey 1:
 * - Fresh system, no .delta/ directory
 * - Run `delta init <path>`
 * - Create basic config.yaml + system_prompt.md
 * - Run `delta run --agent <path> -m "Hello world"`
 * - Verify workspace W001 created, first run completes, journal + tools logged
 *
 * User Journey Source: README.md Quick Start section
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testNewUserOnboarding() {
  console.log('=== E2E Test: New User Onboarding Journey ===\n');
  console.log('Validates complete first-time user experience:');
  console.log('  1. delta init → create agent');
  console.log('  2. delta run → first execution');
  console.log('  3. Verify W001 workspace created');
  console.log('  4. Verify journal and tool logs\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-onboarding-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  try {
    // Step 1: Fresh system - no agent exists
    console.log('Step 1: Fresh system (no agent directory)...');

    const agentDirExists = await fs.access(testAgentDir).then(() => true).catch(() => false);
    expect(agentDirExists).toBe(false);
    console.log('  ✓ No agent directory exists (fresh start)');

    // Step 2: Run delta init
    console.log('\nStep 2: Run `delta init` to create agent...');

    // Use -y flag for non-interactive init with minimal template
    const agentName = path.basename(testAgentDir);
    const initResult = await execa('node', [cliPath, 'init', agentName, '-y'], {
      cwd: path.dirname(testAgentDir),
      reject: false,
    });

    if (initResult.exitCode !== 0) {
      console.log('  ⚠️  delta init output:', initResult.stdout);
      console.log('  ⚠️  delta init errors:', initResult.stderr);
    }

    // Verify agent directory created
    const agentCreated = await fs.access(testAgentDir).then(() => true).catch(() => false);
    expect(agentCreated).toBe(true);
    console.log('  ✓ Agent directory created');

    // v1.9: Verify agent.yaml exists (not config.yaml)
    const agentYamlPath = path.join(testAgentDir, 'agent.yaml');
    const agentYamlExists = await fs.access(agentYamlPath).then(() => true).catch(() => false);
    expect(agentYamlExists).toBe(true);
    console.log('  ✓ agent.yaml created');

    // Verify system_prompt.md exists
    const promptPath = path.join(testAgentDir, 'system_prompt.md');
    const promptExists = await fs.access(promptPath).then(() => true).catch(() => false);
    expect(promptExists).toBe(true);
    console.log('  ✓ system_prompt.md created');

    // v1.9.1: Verify context.yaml exists (now required)
    const contextYamlPath = path.join(testAgentDir, 'context.yaml');
    const contextYamlExists = await fs.access(contextYamlPath).then(() => true).catch(() => false);
    expect(contextYamlExists).toBe(true);
    console.log('  ✓ context.yaml created');

    // Read and verify agent.yaml content
    const agentYamlContent = await fs.readFile(agentYamlPath, 'utf-8');
    expect(agentYamlContent).toContain('name:');
    expect(agentYamlContent).toContain('llm:');
    expect(agentYamlContent).toContain('tools:');
    console.log('  ✓ agent.yaml has valid structure');

    // Read and verify context.yaml content
    const contextYamlContent = await fs.readFile(contextYamlPath, 'utf-8');
    expect(contextYamlContent).toContain('sources:');
    console.log('  ✓ context.yaml has valid structure');

    // Step 3: Run delta run (first execution)
    console.log('\nStep 3: Run `delta run` with first task...');

    // Set minimal timeout since we expect LLM API errors anyway
    const runResult = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', testAgentDir,
        '-m', 'Echo hello world',
        '-y', // Silent mode, auto-create workspace
      ],
      {
        reject: false,
        timeout: 10000, // 10 second timeout
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'dummy-key-for-testing',
        },
      }
    );

    console.log('  ✓ delta run executed (exit code:', runResult.exitCode, ')');

    // Step 4: Verify W001 workspace created
    console.log('\nStep 4: Verify W001 workspace created...');

    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const w001Dir = path.join(workspacesDir, 'W001');

    const w001Exists = await fs.access(w001Dir).then(() => true).catch(() => false);
    expect(w001Exists).toBe(true);
    console.log('  ✓ W001 workspace directory created');

    // Verify .delta directory
    const deltaDir = path.join(w001Dir, '.delta');
    const deltaDirExists = await fs.access(deltaDir).then(() => true).catch(() => false);
    expect(deltaDirExists).toBe(true);
    console.log('  ✓ .delta control plane directory created');

    // Step 5: Verify LATEST file
    console.log('\nStep 5: Verify LATEST file tracking...');

    const latestPath = path.join(deltaDir, 'LATEST');
    const latestExists = await fs.access(latestPath).then(() => true).catch(() => false);
    expect(latestExists).toBe(true);

    const runId = await fs.readFile(latestPath, 'utf-8');
    expect(runId.trim().length).toBeGreaterThan(0);
    console.log(`  ✓ LATEST file points to: ${runId.trim()}`);

    // Step 6: Verify run directory structure
    console.log('\nStep 6: Verify run directory structure...');

    const runDir = path.join(deltaDir, runId.trim());
    const runDirExists = await fs.access(runDir).then(() => true).catch(() => false);
    expect(runDirExists).toBe(true);
    console.log('  ✓ Run directory exists');

    // Verify journal.jsonl
    const journalPath = path.join(runDir, 'journal.jsonl');
    const journalExists = await fs.access(journalPath).then(() => true).catch(() => false);
    expect(journalExists).toBe(true);
    console.log('  ✓ journal.jsonl created');

    // Read journal and verify structure
    const journalContent = await fs.readFile(journalPath, 'utf-8');
    const journalLines = journalContent.split('\n').filter(l => l.trim());

    expect(journalLines.length).toBeGreaterThan(0);

    // Verify first line is valid JSON
    const firstEvent = JSON.parse(journalLines[0]);
    expect(firstEvent.type).toBeDefined();
    expect(firstEvent.seq).toBeDefined();
    console.log(`  ✓ Journal has ${journalLines.length} events, valid JSONL format`);

    // Verify metadata.json
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
    expect(metadataExists).toBe(true);

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    expect(metadata.run_id).toBe(runId.trim());
    expect(metadata.task).toBe('Echo hello world');
    expect(metadata.status).toBeDefined();
    console.log(`  ✓ metadata.json valid, status: ${metadata.status}`);

    // Step 7: Verify I/O audit structure
    console.log('\nStep 7: Verify I/O audit directory structure...');

    const ioDir = path.join(runDir, 'io');
    const ioDirExists = await fs.access(ioDir).then(() => true).catch(() => false);
    expect(ioDirExists).toBe(true);

    const invocationsDir = path.join(ioDir, 'invocations');
    const toolExecDir = path.join(ioDir, 'tool_executions');
    const hooksDir = path.join(ioDir, 'hooks');

    const invocationsDirExists = await fs.access(invocationsDir).then(() => true).catch(() => false);
    const toolExecDirExists = await fs.access(toolExecDir).then(() => true).catch(() => false);
    const hooksDirExists = await fs.access(hooksDir).then(() => true).catch(() => false);

    expect(invocationsDirExists).toBe(true);
    expect(toolExecDirExists).toBe(true);
    expect(hooksDirExists).toBe(true);
    console.log('  ✓ I/O audit directories created:');
    console.log('    - io/invocations/');
    console.log('    - io/tool_executions/');
    console.log('    - io/hooks/');

    // Step 8: Verify LAST_USED file
    console.log('\nStep 8: Verify LAST_USED workspace tracking...');

    const lastUsedPath = path.join(workspacesDir, 'LAST_USED');
    const lastUsedExists = await fs.access(lastUsedPath).then(() => true).catch(() => false);
    expect(lastUsedExists).toBe(true);

    const lastUsedContent = await fs.readFile(lastUsedPath, 'utf-8');
    expect(lastUsedContent.trim()).toBe('W001');
    console.log('  ✓ LAST_USED points to W001');

    // Summary
    console.log('\n=== ✅ NEW USER ONBOARDING JOURNEY COMPLETE ===');
    console.log('Validated complete first-time user experience:');
    console.log('  ✓ delta init creates agent structure');
    console.log('  ✓ delta run creates W001 workspace');
    console.log('  ✓ .delta/ control plane initialized');
    console.log('  ✓ journal.jsonl tracks execution');
    console.log('  ✓ metadata.json tracks run state');
    console.log('  ✓ I/O audit structure created');
    console.log('  ✓ LATEST and LAST_USED files track state');
    console.log('\nNew user onboarding validated end-to-end!');

  } finally {
    // Clean up
    try {
      await fs.rm(testAgentDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Simple expect helper
function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toContain(expected: any) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected to contain "${expected}", got: ${actual}`);
      }
    },
    toBeGreaterThan(expected: any) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
  };
}

// Run the test
testNewUserOnboarding().catch(error => {
  console.error('\n❌ E2E Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
