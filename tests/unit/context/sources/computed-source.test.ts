import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { processComputedFileSource } from '../../../../src/context/sources/computed-source.js';
import type { ComputedFileSource } from '../../../../src/context/types.js';

describe('processComputedFileSource', () => {
  const testDir = path.join('/tmp', `test-computed-source-${Date.now()}`);
  const agentHome = path.join(testDir, 'agent');
  const cwd = path.join(testDir, 'workspace');
  const runId = 'test-run-123';

  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(agentHome, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(path.join(cwd, '.delta', 'context_artifacts'), { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should execute generator and read output', async () => {
    const outputPath = path.join(cwd, '.delta', 'context_artifacts', 'output.md');
    const expectedContent = 'Generated content';

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['bash', '-c', `echo "${expectedContent}" > ${outputPath}`],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe(`${expectedContent}\n`);
  });

  it('should expand ${AGENT_HOME} in command', async () => {
    // Create a test script in agent home
    const scriptPath = path.join(agentHome, 'generate.sh');
    const outputPath = path.join(cwd, 'output.md');

    await fs.writeFile(
      scriptPath,
      '#!/bin/bash\necho "Script output" > "$1"',
      { mode: 0o755 }
    );

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['bash', '${AGENT_HOME}/generate.sh', outputPath],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe('Script output\n');
  });

  it('should expand ${CWD} in output_path', async () => {
    const outputPath = '${CWD}/.delta/context_artifacts/test.md';
    const expectedContent = 'Test content';

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: [
          'bash',
          '-c',
          `echo "${expectedContent}" > ${path.join(cwd, '.delta', 'context_artifacts', 'test.md')}`,
        ],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe(`${expectedContent}\n`);
  });

  it('should pass environment variables to generator', async () => {
    const outputPath = path.join(cwd, 'env-test.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: [
          'bash',
          '-c',
          `echo "RUN_ID=$DELTA_RUN_ID" > ${outputPath}`,
        ],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toContain(runId);
  });

  it('should timeout long-running generator', async () => {
    const outputPath = path.join(cwd, 'timeout-test.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['sleep', '10'], // Long running command
        timeout_ms: 100, // Short timeout
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    await expect(
      processComputedFileSource(source, agentHome, cwd, runId)
    ).rejects.toThrow(/timeout/);
  }, 10000);

  it('should throw error when generator exits with non-zero code', async () => {
    const outputPath = path.join(cwd, 'error-test.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['bash', '-c', 'exit 1'],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    await expect(
      processComputedFileSource(source, agentHome, cwd, runId)
    ).rejects.toThrow(/exited with code 1/);
  });

  it('should throw error when generator fails to create output file', async () => {
    const outputPath = path.join(cwd, 'nonexistent', 'output.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['echo', 'test'], // Command succeeds but doesn't create file
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    await expect(
      processComputedFileSource(source, agentHome, cwd, runId)
    ).rejects.toThrow(/output file not found/);
  });

  it('should throw error for invalid command', async () => {
    const outputPath = path.join(cwd, 'output.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['nonexistent-command-xyz'],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    await expect(
      processComputedFileSource(source, agentHome, cwd, runId)
    ).rejects.toThrow();
  });

  it('should handle generator that writes UTF-8 content', async () => {
    const outputPath = path.join(cwd, 'utf8-output.md');
    const utf8Content = '你好世界 🌍';

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['bash', '-c', `echo "${utf8Content}" > ${outputPath}`],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe(`${utf8Content}\n`);
  });

  it('should handle generator that writes multiline output', async () => {
    const outputPath = path.join(cwd, 'multiline-output.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: [
          'bash',
          '-c',
          `cat > ${outputPath} << 'EOF'
Line 1
Line 2
Line 3
EOF`,
        ],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe('Line 1\nLine 2\nLine 3\n');
  });

  it('should include source id in error message', async () => {
    const outputPath = path.join(cwd, 'error-test.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      id: 'test_generator',
      generator: {
        command: ['bash', '-c', 'exit 1'],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    await expect(
      processComputedFileSource(source, agentHome, cwd, runId)
    ).rejects.toThrow(/test_generator/);
  });

  it('should handle empty command output', async () => {
    const outputPath = path.join(cwd, 'empty-output.md');

    const source: ComputedFileSource = {
      type: 'computed_file',
      generator: {
        command: ['bash', '-c', `touch ${outputPath}`],
        timeout_ms: 5000,
      },
      output_path: outputPath,
      on_missing: 'error',
    };

    const result = await processComputedFileSource(source, agentHome, cwd, runId);
    expect(result).toBe('');
  });
});
