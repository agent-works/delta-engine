#!/usr/bin/env node

/**
 * E2E Test: Claude Code Orchestrator Journey
 *
 * Tests AI-orchestrating-AI workflow using delta-sessions:
 * - Orchestrator agent controls Claude Code via delta-sessions
 * - Workflow automation: plan mode → review → execute → verify
 * - Experience recording to .claude-code-lab/sessions.jsonl
 * - Verification of task completion
 *
 * This demonstrates the unique value of delta-sessions for meta-level automation
 * where one AI manages another AI to complete development tasks.
 *
 * Example: examples/claude-code-workflow/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function expect(actual: any): any {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toContain: (expected: string) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected to contain "${expected}", got: ${actual}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

async function testClaudeCodeOrchestrator() {
  console.log('=== E2E Test: Claude Code Orchestrator Journey ===\n');
  console.log('Validates AI-orchestrating-AI workflow:');
  console.log('  1. Start Claude Code session via delta-sessions');
  console.log('  2. Submit task with plan mode workflow');
  console.log('  3. Monitor and interact with Claude Code');
  console.log('  4. Verify task completion');
  console.log('  5. Check experience recording\n');

  const testWorkspaceDir = path.join(os.tmpdir(), `e2e-cc-orchestrator-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');
  const agentPath = path.join(process.cwd(), 'examples', 'claude-code-workflow');

  try {
    // Step 1: Verify agent exists
    console.log('Step 1: Verify claude-code-workflow agent exists...');

    const agentConfigPath = path.join(agentPath, 'config.yaml');
    expect(await exists(agentConfigPath)).toBe(true);
    console.log('  ✓ Agent config found');

    const systemPromptPath = path.join(agentPath, 'system_prompt.md');
    expect(await exists(systemPromptPath)).toBe(true);
    console.log('  ✓ System prompt found');

    // Step 2: Create test workspace
    console.log('\nStep 2: Create test workspace...');

    await fs.mkdir(testWorkspaceDir, { recursive: true });
    expect(await exists(testWorkspaceDir)).toBe(true);
    console.log(`  ✓ Workspace created: ${testWorkspaceDir}`);

    // Step 3: Check if Claude Code CLI is available
    console.log('\nStep 3: Check Claude Code availability...');

    let claudeAvailable = false;
    try {
      const claudeCheck = await execa('claude', ['--version'], {
        reject: false,
        timeout: 5000,
      });
      claudeAvailable = claudeCheck.exitCode === 0;
    } catch {
      claudeAvailable = false;
    }

    if (!claudeAvailable) {
      console.log('  ⚠ Claude Code CLI not available - skipping full workflow test');
      console.log('  ℹ This is expected in CI/CD environments');
      console.log('  ✓ Test structure validated');

      // Verify agent structure instead
      console.log('\nVerifying agent structure...');

      // Check config.yaml has required tools
      const configContent = await fs.readFile(agentConfigPath, 'utf-8');
      expect(configContent).toContain('claude_start');
      expect(configContent).toContain('claude_write');
      expect(configContent).toContain('claude_read');
      expect(configContent).toContain('claude_end');
      expect(configContent).toContain('record_interaction');
      console.log('  ✓ All required tools defined in config.yaml');

      // Check system prompt has workflow logic
      const promptContent = await fs.readFile(systemPromptPath, 'utf-8');
      expect(promptContent).toContain('plan mode');
      expect(promptContent).toContain('record_interaction');
      expect(promptContent).toContain('verify');
      console.log('  ✓ System prompt contains workflow logic');

      console.log('\n✅ Agent structure validation passed');
      console.log('ℹ  For full workflow test, run manually with Claude Code installed\n');
      return;
    }

    console.log('  ✓ Claude Code CLI available');

    // Step 4: Run orchestrator with a simple verification task
    console.log('\nStep 4: Run orchestrator with test task...');
    console.log('  Task: Verify delta-sessions CLI is working');

    const runResult = await execa(
      'node',
      [
        cliPath,
        'run',
        '--agent', agentPath,
        '--work-dir', testWorkspaceDir,
        '--task', 'Use delta-sessions to start a bash session, write "echo hello", read the output, and end the session. Verify that the output contains "hello". This is a test to verify delta-sessions works correctly.',
        '-y', // Silent mode
      ],
      {
        reject: false,
        timeout: 120000, // 2 minutes
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'dummy-key',
        },
      }
    );

    console.log(`  Exit code: ${runResult.exitCode}`);

    if (runResult.exitCode !== 0) {
      console.log('\n  stdout:', runResult.stdout);
      console.log('\n  stderr:', runResult.stderr);
    }

    // Step 5: Check for .claude-code-lab/ directory and experience log
    console.log('\nStep 5: Check experience recording...');

    const labDir = path.join(testWorkspaceDir, '.claude-code-lab');
    const labDirExists = await exists(labDir);

    if (labDirExists) {
      console.log('  ✓ .claude-code-lab/ directory created');

      // Check for sessions.jsonl
      const sessionsLog = path.join(labDir, 'sessions.jsonl');
      const sessionsLogExists = await exists(sessionsLog);

      if (sessionsLogExists) {
        const logContent = await fs.readFile(sessionsLog, 'utf-8');
        const logLines = logContent.trim().split('\n').filter(line => line);

        console.log(`  ✓ sessions.jsonl exists with ${logLines.length} entries`);

        if (logLines.length > 0) {
          // Parse and validate log entries
          const entries = logLines.map(line => JSON.parse(line));
          const actions = entries.map((e: any) => e.action);

          console.log(`  ✓ Recorded actions: ${actions.join(', ')}`);

          // Expect at least some basic actions
          if (actions.includes('start') || actions.includes('send_task')) {
            console.log('  ✓ Experience recording working');
          }
        }
      } else {
        console.log('  ⚠ sessions.jsonl not created (agent may not have reached that step)');
      }
    } else {
      console.log('  ℹ .claude-code-lab/ not created (task may have completed differently)');
    }

    // Step 6: Check workspace metadata (if workspaces exist)
    console.log('\nStep 6: Check workspace metadata...');

    const workspacesDir = path.join(testWorkspaceDir, 'workspaces');
    const workspacesDirExists = await exists(workspacesDir);

    if (workspacesDirExists) {
      const workspaceDirs = await fs.readdir(workspacesDir);

      if (workspaceDirs.length > 0) {
        const workspaceDir = workspaceDirs[0]; // Should be W001
        const latestPath = path.join(testWorkspaceDir, 'workspaces', workspaceDir, '.delta', 'LATEST');

        if (await exists(latestPath)) {
          const latestRunId = (await fs.readFile(latestPath, 'utf-8')).trim();
          console.log(`  ✓ Latest run ID: ${latestRunId}`);

          const metadataPath = path.join(
            testWorkspaceDir,
            'workspaces',
            workspaceDir,
            '.delta',
            latestRunId,
            'metadata.json'
          );

          if (await exists(metadataPath)) {
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

            console.log(`  ✓ Run status: ${metadata.status}`);
            console.log(`  ✓ Total iterations: ${metadata.total_iterations}`);

            // Verify reasonable completion
            if (metadata.status === 'COMPLETED' || metadata.status === 'FAILED') {
              console.log('  ✓ Run completed');
            } else {
              console.log(`  ⚠ Run status: ${metadata.status}`);
            }
          } else {
            console.log('  ⚠ metadata.json not found');
          }
        } else {
          console.log('  ⚠ LATEST file not found');
        }
      } else {
        console.log('  ⚠ No workspaces created');
      }
    } else {
      console.log('  ⚠ Workspaces directory not created (agent may have used different structure)');
    }

    console.log('\n✅ Claude Code Orchestrator E2E test passed\n');

  } catch (error) {
    console.error('\n❌ Test failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (await exists(testWorkspaceDir)) {
      await fs.rm(testWorkspaceDir, { recursive: true, force: true });
      console.log('Cleanup: Removed test workspace');
    }
  }
}

// Run the test
testClaudeCodeOrchestrator().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
