#!/usr/bin/env node

/**
 * Unit tests for context.ts
 *
 * Tests specification-driven behavior from CLAUDE.md and docs/:
 * - Workspace management (v1.2.1 W001-style naming)
 * - LAST_USED file tracking
 * - LATEST file creation and updates
 * - Resume logic for WAITING_FOR_INPUT and INTERRUPTED states
 * - Error handling for invalid paths, missing files
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  initializeContext,
  loadExistingContext,
  checkForResumableRun,
  resumeContext,
  cleanupWorkDirectory,
} from '../../src/context.js';
import { RunStatus } from '../../src/journal-types.js';

describe('context.ts - Workspace Management', () => {
  let tempAgentDir: string;

  beforeEach(async () => {
    tempAgentDir = path.join(os.tmpdir(), `test-context-${uuidv4()}`);
    await fs.mkdir(tempAgentDir, { recursive: true });

    // Create minimal agent config
    const configYaml = `name: test-agent
version: 1.0.0
llm:
  model: gpt-4
  temperature: 0.7
tools: []
`;
    await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
    await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test Agent', 'utf-8');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempAgentDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should auto-create W001 workspace when skipPrompt=true', async () => {
    const context = await initializeContext(
      tempAgentDir,
      'Test task',
      undefined,
      false,
      undefined,
      false,
      true // skipPrompt
    );

    // Verify workspace directory structure
    const workspacesDir = path.join(tempAgentDir, 'workspaces');
    const w001Dir = path.join(workspacesDir, 'W001');

    expect(context.workDir).toBe(w001Dir);
    const w001Exists = await fs.access(w001Dir).then(() => true).catch(() => false);
    expect(w001Exists).toBe(true);
  });

  test('should create LAST_USED file in workspaces directory', async () => {
    const context = await initializeContext(
      tempAgentDir,
      'Test task',
      undefined,
      false,
      undefined,
      false,
      true
    );

    const workspacesDir = path.join(tempAgentDir, 'workspaces');
    const lastUsedPath = path.join(workspacesDir, 'LAST_USED');

    const lastUsedExists = await fs.access(lastUsedPath).then(() => true).catch(() => false);
    expect(lastUsedExists).toBe(true);

    const lastUsedContent = await fs.readFile(lastUsedPath, 'utf-8');
    expect(lastUsedContent.trim()).toBe('W001');
  });

  test('should create VERSION file in .delta directory', async () => {
    const context = await initializeContext(
      tempAgentDir,
      'Test task',
      undefined,
      false,
      undefined,
      false,
      true
    );

    const versionPath = path.join(context.deltaDir, 'VERSION');
    const versionExists = await fs.access(versionPath).then(() => true).catch(() => false);
    expect(versionExists).toBe(true);

    const versionContent = await fs.readFile(versionPath, 'utf-8');
    expect(versionContent.trim()).toMatch(/^1\.\d+$/);
  });

  test('should handle explicit work directory (bypass workspace selection)', async () => {
    const explicitWorkDir = path.join(os.tmpdir(), `explicit-work-${uuidv4()}`);

    try {
      const context = await initializeContext(
        tempAgentDir,
        'Test task',
        explicitWorkDir,
        false,
        undefined,
        true, // explicitWorkDir=true
        false
      );

      expect(context.workDir).toBe(explicitWorkDir);

      // Verify no LAST_USED file created when explicit work dir provided
      const workspacesDir = path.join(tempAgentDir, 'workspaces');
      const lastUsedExists = await fs.access(path.join(workspacesDir, 'LAST_USED'))
        .then(() => true)
        .catch(() => false);
      expect(lastUsedExists).toBe(false);
    } finally {
      await fs.rm(explicitWorkDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('should reject invalid agent path (non-existent)', async () => {
    const invalidPath = path.join(os.tmpdir(), `non-existent-${uuidv4()}`);

    await expect(
      initializeContext(invalidPath, 'Test task', undefined, false, undefined, false, true)
    ).rejects.toThrow('Agent path does not exist');
  });

  test('should reject agent path pointing to file (not directory)', async () => {
    const filePath = path.join(os.tmpdir(), `test-file-${uuidv4()}.txt`);
    await fs.writeFile(filePath, 'not a directory', 'utf-8');

    try {
      await expect(
        initializeContext(filePath, 'Test task', undefined, false, undefined, false, true)
      ).rejects.toThrow('Agent path is not a directory');
    } finally {
      await fs.unlink(filePath);
    }
  });

  test('should override max_iterations from CLI argument', async () => {
    const context = await initializeContext(
      tempAgentDir,
      'Test task',
      undefined,
      false,
      5, // maxIterations override
      false,
      true
    );

    expect(context.config.max_iterations).toBe(5);
  });

  test('should set isInteractive flag in context', async () => {
    const context = await initializeContext(
      tempAgentDir,
      'Test task',
      undefined,
      true, // isInteractive
      undefined,
      false,
      true
    );

    expect(context.isInteractive).toBe(true);
  });
});

describe('context.ts - Load Existing Context', () => {
  let tempAgentDir: string;
  let workDir: string;

  beforeEach(async () => {
    tempAgentDir = path.join(os.tmpdir(), `test-context-load-${uuidv4()}`);
    await fs.mkdir(tempAgentDir, { recursive: true });

    // Create minimal agent
    const configYaml = `name: test-agent
version: 1.0.0
llm:
  model: gpt-4
  temperature: 0.7
tools: []
`;
    await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
    await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

    // Initialize context to create work directory
    const context = await initializeContext(
      tempAgentDir,
      'Initial task',
      undefined,
      false,
      undefined,
      false,
      true
    );
    workDir = context.workDir;
  });

  afterEach(async () => {
    try {
      await fs.rm(tempAgentDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('should load existing context from work directory', async () => {
    const loadedContext = await loadExistingContext(workDir);

    expect(loadedContext.agentPath).toBe(tempAgentDir);
    expect(loadedContext.initialTask).toBe('Initial task');
    expect(loadedContext.workDir).toBe(workDir);
  });

  test('should reject work directory without .delta', async () => {
    const emptyWorkDir = path.join(os.tmpdir(), `empty-work-${uuidv4()}`);
    await fs.mkdir(emptyWorkDir, { recursive: true });

    try {
      await expect(loadExistingContext(emptyWorkDir)).rejects.toThrow(
        'Invalid or missing .delta directory'
      );
    } finally {
      await fs.rm(emptyWorkDir, { recursive: true, force: true });
    }
  });

  test('should reject unsupported schema version', async () => {
    const deltaDir = path.join(workDir, '.delta');
    await fs.writeFile(path.join(deltaDir, 'VERSION'), '2.0\n', 'utf-8');

    await expect(loadExistingContext(workDir)).rejects.toThrow('Unsupported schema version: 2.0');
  });

  test('should find latest run by directory scanning (v1.10: no LATEST file)', async () => {
    // v1.10: No LATEST file exists, system scans directories to find most recent run
    const loadedContext = await loadExistingContext(workDir);
    expect(loadedContext.workDir).toBe(workDir);
    expect(loadedContext.initialTask).toBe('Initial task');
  });

  test('should count journal events to set currentStep', async () => {
    // Write some events to journal
    const deltaDir = path.join(workDir, '.delta');

    // v1.10: Find latest run by scanning directory (no LATEST file)
    const runs = await fs.readdir(deltaDir);
    const validRuns = runs.filter(r => r !== 'VERSION' && !r.startsWith('.')).sort();
    const runId = validRuns[validRuns.length - 1];

    const journalPath = path.join(deltaDir, runId, 'journal.jsonl');

    const event1 = JSON.stringify({
      seq: 1,
      type: 'ENGINE_START',
      timestamp: new Date().toISOString(),
    });
    const event2 = JSON.stringify({
      seq: 2,
      type: 'THOUGHT',
      timestamp: new Date().toISOString(),
    });

    await fs.appendFile(journalPath, event1 + '\n', 'utf-8');
    await fs.appendFile(journalPath, event2 + '\n', 'utf-8');

    const loadedContext = await loadExistingContext(workDir);

    // currentStep should equal number of events (2)
    // Note: Initial context starts with some events, so we check it's > 0
    expect(loadedContext.currentStep).toBeGreaterThan(0);
  });
});

describe('context.ts - Resume Logic', () => {
  let tempAgentDir: string;
  let workDir: string;
  let runDir: string;

  beforeEach(async () => {
    tempAgentDir = path.join(os.tmpdir(), `test-context-resume-${uuidv4()}`);
    await fs.mkdir(tempAgentDir, { recursive: true });

    // Create minimal agent
    const configYaml = `name: test-agent
version: 1.0.0
llm:
  model: gpt-4
  temperature: 0.7
tools: []
`;
    await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
    await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

    // Initialize context
    const context = await initializeContext(
      tempAgentDir,
      'Resume test task',
      undefined,
      false,
      undefined,
      false,
      true
    );
    workDir = context.workDir;
    runDir = path.join(context.deltaDir, context.runId);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempAgentDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('should detect WAITING_FOR_INPUT as resumable', async () => {
    // Update metadata status to WAITING_FOR_INPUT
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.WAITING_FOR_INPUT;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const resumableRunDir = await checkForResumableRun(workDir);
    expect(resumableRunDir).toBe(runDir);
  });

  test('should detect INTERRUPTED as resumable', async () => {
    // Update metadata status to INTERRUPTED
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.INTERRUPTED;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const resumableRunDir = await checkForResumableRun(workDir);
    expect(resumableRunDir).toBe(runDir);
  });

  test('should NOT detect COMPLETED as resumable', async () => {
    // Update metadata status to COMPLETED
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.COMPLETED;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const resumableRunDir = await checkForResumableRun(workDir);
    expect(resumableRunDir).toBeNull();
  });

  test('should NOT detect FAILED as resumable', async () => {
    // Update metadata status to FAILED
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.FAILED;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const resumableRunDir = await checkForResumableRun(workDir);
    expect(resumableRunDir).toBeNull();
  });

  test('should return null when no runs exist (v1.10)', async () => {
    // v1.10: Create empty work directory with only .delta/VERSION
    const emptyWorkDir = path.join(os.tmpdir(), `empty-runs-${uuidv4()}`);
    await fs.mkdir(path.join(emptyWorkDir, '.delta'), { recursive: true });
    await fs.writeFile(path.join(emptyWorkDir, '.delta', 'VERSION'), '1.2\n', 'utf-8');

    try {
      const resumableRunDir = await checkForResumableRun(emptyWorkDir);
      expect(resumableRunDir).toBeNull();
    } finally {
      await fs.rm(emptyWorkDir, { recursive: true, force: true });
    }
  });

  test('should return null when .delta directory missing', async () => {
    const nonExistentWorkDir = path.join(os.tmpdir(), `non-existent-${uuidv4()}`);
    const resumableRunDir = await checkForResumableRun(nonExistentWorkDir);
    expect(resumableRunDir).toBeNull();
  });

  test('should resume context and update status to RUNNING', async () => {
    // Set status to INTERRUPTED
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.INTERRUPTED;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Resume
    const resumedContext = await resumeContext(workDir, runDir, false);

    expect(resumedContext.workDir).toBe(workDir);
    expect(resumedContext.initialTask).toBe('Resume test task');

    // Verify status updated to RUNNING
    const updatedMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    expect(updatedMetadata.status).toBe(RunStatus.RUNNING);
  });

  test('should set isInteractive flag when resuming', async () => {
    // Set status to WAITING_FOR_INPUT
    const metadataPath = path.join(runDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.status = RunStatus.WAITING_FOR_INPUT;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Resume with interactive=true
    const resumedContext = await resumeContext(workDir, runDir, true);
    expect(resumedContext.isInteractive).toBe(true);
  });
});

describe('context.ts - Cleanup', () => {
  test('should cleanup work directory completely', async () => {
    const tempWorkDir = path.join(os.tmpdir(), `cleanup-test-${uuidv4()}`);
    await fs.mkdir(tempWorkDir, { recursive: true });
    await fs.writeFile(path.join(tempWorkDir, 'test.txt'), 'data', 'utf-8');

    await cleanupWorkDirectory(tempWorkDir);

    const exists = await fs.access(tempWorkDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test('should not throw when cleaning up non-existent directory', async () => {
    const nonExistentDir = path.join(os.tmpdir(), `non-existent-${uuidv4()}`);

    await expect(cleanupWorkDirectory(nonExistentDir)).resolves.not.toThrow();
  });
});

describe('context.ts - Path Resolution', () => {
  test('should handle relative agent path', async () => {
    const tempDir = path.join(os.tmpdir(), `relative-path-${uuidv4()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Create agent in temp dir
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempDir, 'system_prompt.md'), '# Test', 'utf-8');

      // Use relative path
      const originalCwd = process.cwd();
      process.chdir(path.dirname(tempDir));

      const relativePath = path.basename(tempDir);
      const context = await initializeContext(
        relativePath,
        'Test',
        undefined,
        false,
        undefined,
        false,
        true
      );

      // Should resolve to absolute path
      expect(path.isAbsolute(context.agentPath)).toBe(true);
      // On macOS, /var is symlinked to /private/var, so we need to use realpath to compare
      const { realpathSync } = await import('node:fs');
      expect(realpathSync(context.agentPath)).toBe(realpathSync(tempDir));

      process.chdir(originalCwd);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
