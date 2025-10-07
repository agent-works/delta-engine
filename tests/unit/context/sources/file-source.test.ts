import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { processFileSource } from '../../../../src/context/sources/file-source.js';
import type { FileSource } from '../../../../src/context/types.js';

describe('processFileSource', () => {
  const testDir = path.join('/tmp', `test-file-source-${Date.now()}`);
  const agentHome = path.join(testDir, 'agent');
  const cwd = path.join(testDir, 'workspace');

  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(agentHome, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should read file content successfully', async () => {
    const testFile = path.join(agentHome, 'test.md');
    const expectedContent = 'This is test content';
    await fs.writeFile(testFile, expectedContent);

    const source: FileSource = {
      type: 'file',
      path: testFile,
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should expand ${AGENT_HOME} variable', async () => {
    const testFile = path.join(agentHome, 'prompt.md');
    const expectedContent = 'Agent home content';
    await fs.writeFile(testFile, expectedContent);

    const source: FileSource = {
      type: 'file',
      path: '${AGENT_HOME}/prompt.md',
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should expand ${CWD} variable', async () => {
    const testFile = path.join(cwd, 'DELTA.md');
    const expectedContent = 'Workspace guide content';
    await fs.writeFile(testFile, expectedContent);

    const source: FileSource = {
      type: 'file',
      path: '${CWD}/DELTA.md',
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should expand multiple variables in same path', async () => {
    // Create a file in workspace that references agent home conceptually
    const testFile = path.join(cwd, 'test.md');
    const expectedContent = 'Multiple vars content';
    await fs.writeFile(testFile, expectedContent);

    const source: FileSource = {
      type: 'file',
      path: '${CWD}/test.md',
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should throw error when file not found and on_missing=error', async () => {
    const source: FileSource = {
      type: 'file',
      path: path.join(agentHome, 'nonexistent.md'),
      on_missing: 'error',
    };

    await expect(processFileSource(source, agentHome, cwd)).rejects.toThrow(
      /File not found/
    );
  });

  it('should throw error with source id in message', async () => {
    const source: FileSource = {
      type: 'file',
      id: 'my_source',
      path: path.join(agentHome, 'nonexistent.md'),
      on_missing: 'error',
    };

    await expect(processFileSource(source, agentHome, cwd)).rejects.toThrow(
      /my_source/
    );
  });

  it('should read UTF-8 encoded file correctly', async () => {
    const testFile = path.join(agentHome, 'utf8.md');
    const expectedContent = '你好世界 Hello World 🌍';
    await fs.writeFile(testFile, expectedContent, 'utf-8');

    const source: FileSource = {
      type: 'file',
      path: testFile,
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should read multiline file correctly', async () => {
    const testFile = path.join(agentHome, 'multiline.md');
    const expectedContent = 'Line 1\nLine 2\nLine 3\n';
    await fs.writeFile(testFile, expectedContent);

    const source: FileSource = {
      type: 'file',
      path: testFile,
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe(expectedContent);
  });

  it('should handle empty file', async () => {
    const testFile = path.join(agentHome, 'empty.md');
    await fs.writeFile(testFile, '');

    const source: FileSource = {
      type: 'file',
      path: testFile,
      on_missing: 'error',
    };

    const result = await processFileSource(source, agentHome, cwd);
    expect(result).toBe('');
  });

  it('should throw error for directory instead of file', async () => {
    const dirPath = path.join(agentHome, 'subdir');
    await fs.mkdir(dirPath);

    const source: FileSource = {
      type: 'file',
      path: dirPath,
      on_missing: 'error',
    };

    await expect(processFileSource(source, agentHome, cwd)).rejects.toThrow();
  });
});
