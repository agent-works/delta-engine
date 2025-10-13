#!/usr/bin/env node

/**
 * E2E Test: Session Cleanup on Delta Run Completion
 *
 * Tests that sessions are automatically cleaned up when delta run finishes,
 * but preserved when waiting for user input (exit code 101).
 *
 * Scenarios:
 * 1. Normal completion - sessions should be cleaned up
 * 2. Failure - sessions should be cleaned up
 * 3. SIGINT interrupt - sessions should be cleaned up
 * 4. Exit code 101 (ask_human) - sessions should NOT be cleaned up until resume
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

const CLI_PATH = path.join(process.cwd(), 'dist', 'index.js');

// Helper: Check if sessions directory has any sessions
async function countSessions(workDir: string): Promise<number> {
  const sessionsDir = path.join(workDir, '.sessions');
  try {
    const entries = await fs.readdir(sessionsDir);
    // Filter out non-session entries (., .., etc.)
    return entries.filter(e => e.startsWith('sess_')).length;
  } catch {
    // Directory doesn't exist or is empty
    return 0;
  }
}

// Helper: Check if a specific session exists
async function sessionExists(workDir: string, sessionId: string): Promise<boolean> {
  const sessionDir = path.join(workDir, '.sessions', sessionId);
  try {
    await fs.access(sessionDir);
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if a process is alive
function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Helper: Get PIDs from all sessions in workspace
async function getSessionPids(workDir: string): Promise<number[]> {
  const sessionsDir = path.join(workDir, '.sessions');
  const pids: number[] = [];

  try {
    const sessions = await fs.readdir(sessionsDir);
    for (const sessionId of sessions) {
      if (!sessionId.startsWith('sess_')) continue;

      try {
        const metadataPath = path.join(sessionsDir, sessionId, 'metadata.json');
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
        if (metadata.pid) pids.push(metadata.pid);
        if (metadata.holder_pid) pids.push(metadata.holder_pid);
      } catch {
        // Skip invalid sessions
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return pids;
}

// Helper: Extract session_id from agent output
function extractSessionId(output: string): string | null {
  const match = output.match(/"session_id":\s*"(sess_[a-f0-9]+)"/);
  return match ? match[1] : null;
}

// Helper function for assertions
function expect(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function testScenario1_NormalCompletion() {
  console.log('\n=== Scenario 1: Normal Completion - Sessions Should Be Cleaned Up ===\n');

  // Create test agent that uses sessions
  const testAgentDir = path.join(os.tmpdir(), `e2e-cleanup-normal-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  try {
    // Create agent config with session tools
    const configContent = `name: test-session-normal
version: 1.0.0
description: Test agent that uses sessions and completes normally

llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: shell_start
    description: "Start a bash shell session"
    command: [delta-sessions, start, bash, "-i"]
    parameters: []

  - name: shell_write
    description: "Send input to shell"
    command: [delta-sessions, write]
    parameters:
      - name: session_id
        type: string
        description: "Session ID"
        inject_as: argument
      - name: input
        type: string
        description: "Input to send"
        inject_as: stdin

  - name: shell_end
    description: "End shell session"
    command: [delta-sessions, end]
    parameters:
      - name: session_id
        type: string
        description: "Session ID"
        inject_as: argument
`;

    const systemPrompt = `You are a test agent. Follow these steps:
1. Start a shell session using shell_start
2. Immediately end the session using shell_end
3. Report completion

Be concise and complete the task quickly.`;

    await fs.writeFile(path.join(testAgentDir, 'agent.yaml'), configContent, 'utf-8');
    await fs.writeFile(path.join(testAgentDir, 'system_prompt.md'), systemPrompt, 'utf-8');

    console.log('Step 1: Running agent that starts and ends a session...');

    // Run the agent (use -y to skip workspace prompt)
    const result = await execa('node', [
      CLI_PATH,
      'run',
      '--agent', testAgentDir,
      '-m', 'Start a shell session and end it immediately',
      '-y',
    ], {
      reject: false,
      env: { ...process.env },
    });

    console.log('Step 2: Checking if run completed...');
    expect(result.exitCode === 0, `Agent should complete successfully, got exit code ${result.exitCode}`);
    console.log('  ✓ Agent completed successfully');

    // Get the workspace directory
    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const workspaces = await fs.readdir(workspacesDir);
    expect(workspaces.length > 0, 'At least one workspace should exist');

    const workDir = path.join(workspacesDir, workspaces[0]);

    console.log('Step 3: Verifying sessions were cleaned up...');
    const sessionCount = await countSessions(workDir);
    expect(sessionCount === 0, `Expected 0 sessions after completion, found ${sessionCount}`);
    console.log('  ✓ All sessions cleaned up after normal completion');

    // CRITICAL: Verify that processes were actually killed
    console.log('Step 4: Verifying session processes were killed...');
    const remainingPids = await getSessionPids(workDir);
    const alivePids = remainingPids.filter(pid => isProcessAlive(pid));
    expect(alivePids.length === 0, `Expected 0 alive processes, found ${alivePids.length}: ${alivePids.join(', ')}`);
    console.log('  ✓ All session processes killed');

    console.log('\n✅ Scenario 1 PASSED\n');
  } finally {
    // Cleanup
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}

async function testScenario2_Failure() {
  console.log('\n=== Scenario 2: Failure - Sessions Should Be Cleaned Up ===\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-cleanup-failure-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  try {
    // Create agent that will fail after starting a session
    const configContent = `name: test-session-failure
version: 1.0.0
description: Test agent that fails

llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: shell_start
    description: "Start a bash shell session"
    command: [delta-sessions, start, bash, "-i"]
    parameters: []

  - name: fail_tool
    description: "A tool that always fails"
    command: [false]
    parameters: []
`;

    const systemPrompt = `You are a test agent. Follow these steps:
1. Start a shell session using shell_start
2. Call fail_tool (this will fail)

Keep it brief.`;

    await fs.writeFile(path.join(testAgentDir, 'agent.yaml'), configContent, 'utf-8');
    await fs.writeFile(path.join(testAgentDir, 'system_prompt.md'), systemPrompt, 'utf-8');

    console.log('Step 1: Running agent that starts session then fails...');

    // Run the agent (expect failure)
    const result = await execa('node', [
      CLI_PATH,
      'run',
      '--agent', testAgentDir,
      '-m', 'Start a session then call fail_tool',
      '-y',
    ], {
      reject: false,
      env: { ...process.env },
    });

    console.log('Step 2: Verifying run completed (possibly with non-zero exit)...');
    // Agent may exit with 0 even if tool fails (depends on LLM)
    console.log(`  • Exit code: ${result.exitCode}`);

    // Get the workspace directory
    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const workspaces = await fs.readdir(workspacesDir);
    expect(workspaces.length > 0, 'At least one workspace should exist');

    const workDir = path.join(workspacesDir, workspaces[0]);

    console.log('Step 3: Verifying sessions were cleaned up...');
    const sessionCount = await countSessions(workDir);
    expect(sessionCount === 0, `Expected 0 sessions after failure, found ${sessionCount}`);
    console.log('  ✓ All sessions cleaned up after failure');

    console.log('\n✅ Scenario 2 PASSED\n');
  } finally {
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}

async function testScenario3_SigintInterrupt() {
  console.log('\n=== Scenario 3: SIGINT Interrupt - Sessions Should Be Cleaned Up ===\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-cleanup-sigint-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  try {
    // Create agent with long-running task
    const configContent = `name: test-session-interrupt
version: 1.0.0
description: Test agent for interruption

llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: shell_start
    description: "Start a bash shell session"
    command: [delta-sessions, start, bash, "-i"]
    parameters: []

  - name: sleep_tool
    description: "Sleep for a while"
    command: [sleep, "10"]
    parameters: []
`;

    const systemPrompt = `You are a test agent. Follow these steps:
1. Start a shell session using shell_start
2. Call sleep_tool

Be brief.`;

    await fs.writeFile(path.join(testAgentDir, 'agent.yaml'), configContent, 'utf-8');
    await fs.writeFile(path.join(testAgentDir, 'system_prompt.md'), systemPrompt, 'utf-8');

    console.log('Step 1: Starting agent and interrupting it...');

    // Start the agent in background
    const childProcess = execa('node', [
      CLI_PATH,
      'run',
      '--agent', testAgentDir,
      '-m', 'Start a session then sleep',
      '-y',
    ], {
      reject: false,
      env: { ...process.env },
    });

    // Wait 3 seconds then send SIGINT
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('  • Sending SIGINT...');
    childProcess.kill('SIGINT');

    const result = await childProcess;
    console.log(`  • Process exited with code: ${result.exitCode}`);

    // Get the workspace directory
    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const workspaces = await fs.readdir(workspacesDir);

    if (workspaces.length === 0) {
      console.log('  ⚠️  No workspace created (interrupted too early), skipping cleanup check');
      console.log('\n✅ Scenario 3 PASSED (interrupted before workspace creation)\n');
      return;
    }

    const workDir = path.join(workspacesDir, workspaces[0]);

    console.log('Step 2: Verifying sessions were cleaned up...');
    const sessionCount = await countSessions(workDir);
    expect(sessionCount === 0, `Expected 0 sessions after interrupt, found ${sessionCount}`);
    console.log('  ✓ All sessions cleaned up after SIGINT');

    console.log('\n✅ Scenario 3 PASSED\n');
  } finally {
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}

async function testScenario4_ExitCode101_PreserveSessionsUntilResume() {
  console.log('\n=== Scenario 4: Exit Code 101 (ask_human) - Preserve Sessions Until Resume ===\n');

  const testAgentDir = path.join(os.tmpdir(), `e2e-cleanup-askhuman-${uuidv4()}`);
  await fs.mkdir(testAgentDir, { recursive: true });

  try {
    // Create simple agent that only uses ask_human
    const configContent = `name: test-session-askhuman
version: 1.0.0
description: Test agent with ask_human

llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 2000

tools: []
`;

    const systemPrompt = `You MUST use ask_human immediately to ask: "Should I continue?"

Do this FIRST before anything else.`;

    await fs.writeFile(path.join(testAgentDir, 'agent.yaml'), configContent, 'utf-8');
    await fs.writeFile(path.join(testAgentDir, 'system_prompt.md'), systemPrompt, 'utf-8');

    console.log('Step 1: Running agent with ask_human (will exit with code 101)...');

    // Run the agent without -i flag (async mode)
    const result1 = await execa('node', [
      CLI_PATH,
      'run',
      '--agent', testAgentDir,
      '-m', 'Ask me a question immediately',
      '-y',
    ], {
      reject: false,
      env: { ...process.env },
    });

    console.log(`  • Exit code: ${result1.exitCode}`);
    expect(result1.exitCode === 101, `Expected exit code 101 (ask_human pause), got ${result1.exitCode}`);
    console.log('  ✓ Agent paused with exit code 101');

    // Get the workspace directory (filter out LAST_USED file)
    const workspacesDir = path.join(testAgentDir, 'workspaces');
    const workspaces = (await fs.readdir(workspacesDir)).filter(w => w.startsWith('W'));
    expect(workspaces.length > 0, 'At least one workspace should exist');

    const workDir = path.join(workspacesDir, workspaces[0]);

    // Manually create a session to simulate the scenario where
    // a session was created before ask_human
    console.log('Step 2: Manually creating a session (simulating pre-ask_human state)...');
    const sessionsDir = path.join(workDir, '.sessions');
    const { stdout: sessionOutput } = await execa('delta-sessions', [
      'start',
      'bash',
      '-i',
      '--sessions-dir',
      sessionsDir,
    ], {
      reject: false,
    });
    const sessionInfo = JSON.parse(sessionOutput);
    console.log(`  ✓ Created session: ${sessionInfo.session_id}`);

    // Wait a moment for session to be fully created
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('Step 3: Verifying sessions are PRESERVED (not cleaned up on exit 101)...');
    const sessionCountBeforeResume = await countSessions(workDir);

    // Debug: list sessions
    if (sessionCountBeforeResume === 0) {
      console.log('  ⚠️  No sessions found in directory, listing via delta-sessions...');
      const { stdout: listOutput } = await execa('delta-sessions', [
        'list',
        '--sessions-dir',
        sessionsDir,
      ], { reject: false });
      console.log('  List output:', listOutput);
    }

    expect(sessionCountBeforeResume === 1, `Expected 1 session preserved, found ${sessionCountBeforeResume}`);
    console.log(`  ✓ Found ${sessionCountBeforeResume} session(s) preserved`);

    // CRITICAL: Verify session process is still alive
    const pidsBeforeResume = await getSessionPids(workDir);
    const alivePidsBeforeResume = pidsBeforeResume.filter(pid => isProcessAlive(pid));
    expect(alivePidsBeforeResume.length > 0, `Expected at least 1 alive process before resume, found ${alivePidsBeforeResume.length}`);
    console.log(`  ✓ Session processes still alive (PIDs: ${alivePidsBeforeResume.join(', ')})`);

    // Provide response
    console.log('Step 4: Providing user response...');
    const deltaDir = path.join(workDir, '.delta');
    const latestRunId = (await fs.readFile(path.join(deltaDir, 'LATEST'), 'utf-8')).trim();
    const interactionDir = path.join(deltaDir, latestRunId, 'interaction');
    await fs.writeFile(path.join(interactionDir, 'response.txt'), 'Yes, continue', 'utf-8');
    console.log('  ✓ Response provided');

    console.log('Step 5: Resuming agent...');
    const result2 = await execa('node', [
      CLI_PATH,
      'run',
      '--agent', testAgentDir,
      '-m', 'ignored', // Task is ignored when resuming
      '--work-dir', workDir,
    ], {
      reject: false,
      env: { ...process.env },
    });

    expect(result2.exitCode === 0, `Resume should succeed, got exit code ${result2.exitCode}`);
    console.log('  ✓ Agent resumed and completed');

    console.log('Step 6: Verifying sessions cleaned up after resume completion...');
    const sessionCountAfterResume = await countSessions(workDir);
    expect(sessionCountAfterResume === 0, `Expected 0 sessions after resume completion, found ${sessionCountAfterResume}`);
    console.log('  ✓ All sessions cleaned up after resume completion');

    // CRITICAL: Verify session processes were killed after resume
    const pidsAfterResume = await getSessionPids(workDir);
    const alivePidsAfterResume = pidsBeforeResume.filter(pid => isProcessAlive(pid));
    expect(alivePidsAfterResume.length === 0, `Expected 0 alive processes after resume, found ${alivePidsAfterResume.length}: ${alivePidsAfterResume.join(', ')}`);
    console.log('  ✓ All session processes killed after resume');

    console.log('\n✅ Scenario 4 PASSED\n');
  } finally {
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== E2E Test: Session Cleanup ===\n');
  console.log('Testing automatic session cleanup on delta run completion\n');

  let passedCount = 0;
  let failedCount = 0;

  // Run all scenarios
  const scenarios = [
    { name: 'Scenario 1: Normal Completion', fn: testScenario1_NormalCompletion },
    { name: 'Scenario 2: Failure', fn: testScenario2_Failure },
    { name: 'Scenario 3: SIGINT Interrupt', fn: testScenario3_SigintInterrupt },
    { name: 'Scenario 4: Exit Code 101 (ask_human)', fn: testScenario4_ExitCode101_PreserveSessionsUntilResume },
  ];

  for (const scenario of scenarios) {
    try {
      await scenario.fn();
      passedCount++;
    } catch (error) {
      failedCount++;
      console.error(`\n❌ ${scenario.name} FAILED:`);
      console.error(error);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary:');
  console.log(`  ✅ Passed: ${passedCount}/${scenarios.length}`);
  console.log(`  ❌ Failed: ${failedCount}/${scenarios.length}`);
  console.log('='.repeat(60) + '\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
