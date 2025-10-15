#!/usr/bin/env node

/**
 * Unit tests for output-formatter.ts (v1.10)
 * Tests RunResult v2.0 schema and output formatting
 */

import { buildRunResult, formatText, formatJson, formatRaw, formatOutput } from '../../src/output-formatter.js';
import { DeltaRunMetadata, RunStatus } from '../../src/journal-types.js';
import { OutputFormat } from '../../src/types.js';

describe('output-formatter.ts - RunResult Building', () => {
  const createMockMetadata = (status: RunStatus): DeltaRunMetadata => ({
    run_id: 'test-run-456',
    start_time: '2025-01-15T10:00:00.000Z',
    end_time: '2025-01-15T10:05:00.000Z',
    agent_ref: '/path/to/agent',
    task: 'Test task for output formatting',
    status,
    iterations_completed: 10,
    pid: 12345,
    hostname: 'test-host',
    start_time_unix: 1705318800000,
    process_name: 'node',
  });

  describe('buildRunResult', () => {
    test('should build result for COMPLETED status', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const finalResponse = 'Task completed successfully';

      const result = buildRunResult(metadata, finalResponse);

      expect(result.schema_version).toBe('2.0');
      expect(result.run_id).toBe('test-run-456');
      expect(result.status).toBe('COMPLETED');
      expect(result.result).toBe('Task completed successfully');
      expect(result.metrics.iterations).toBe(10);
      expect(result.metadata.agent_name).toBe('/path/to/agent');
    });

    test('should build result for FAILED status with error', () => {
      const metadata = createMockMetadata(RunStatus.FAILED);
      metadata.error = 'Execution failed';
      const error = {
        message: 'Tool execution error',
        stack: 'Error stack trace'
      };

      const result = buildRunResult(metadata, undefined, error);

      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Tool execution error');
      expect(result.error?.details).toBe('Error stack trace');
      expect(result.result).toBeUndefined();
    });

    test('should build result for WAITING_FOR_INPUT status', () => {
      const metadata = createMockMetadata(RunStatus.WAITING_FOR_INPUT);

      const result = buildRunResult(metadata);

      expect(result.status).toBe('WAITING_FOR_INPUT');
      expect(result.interaction).toBeDefined();
      expect(result.interaction?.prompt).toBe('Waiting for human input');
      expect(result.interaction?.input_type).toBe('text');
    });

    test('should build result for INTERRUPTED status', () => {
      const metadata = createMockMetadata(RunStatus.INTERRUPTED);

      const result = buildRunResult(metadata);

      expect(result.status).toBe('INTERRUPTED');
      expect(result.result).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    test('should calculate duration correctly', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);

      const result = buildRunResult(metadata);

      // 5 minutes = 300000 ms
      expect(result.metrics.duration_ms).toBe(300000);
    });

    test('should handle metadata without end_time', () => {
      const metadata = createMockMetadata(RunStatus.RUNNING);
      delete metadata.end_time;

      const result = buildRunResult(metadata);

      // Duration should be calculated from start_time to now
      expect(result.metrics.duration_ms).toBeGreaterThan(0);
      expect(result.metrics.end_time).toBeDefined();
    });
  });

  describe('formatText', () => {
    test('should produce human-readable output for COMPLETED', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const result = buildRunResult(metadata, 'Success!');

      const output = formatText(result);

      expect(output).toContain('test-run-456');
      expect(output).toContain('COMPLETED');
      expect(output).toContain('Iterations: 10');
      expect(output).toContain('Duration: 300.00s');
      expect(output).toContain('Success!');
    });

    test('should include error details for FAILED', () => {
      const metadata = createMockMetadata(RunStatus.FAILED);
      const error = { message: 'Test error', stack: 'Stack trace' };
      const result = buildRunResult(metadata, undefined, error);

      const output = formatText(result);

      expect(output).toContain('FAILED');
      expect(output).toContain('Test error');
      expect(output).toContain('Stack trace');
    });

    test('should show interaction prompt for WAITING_FOR_INPUT', () => {
      const metadata = createMockMetadata(RunStatus.WAITING_FOR_INPUT);
      const result = buildRunResult(metadata);

      const output = formatText(result);

      expect(output).toContain('WAITING_FOR_INPUT');
      expect(output).toContain('Human Input Required');
    });
  });

  describe('formatJson', () => {
    test('should produce valid JSON', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const result = buildRunResult(metadata, 'Done');

      const output = formatJson(result);
      const parsed = JSON.parse(output);

      expect(parsed.schema_version).toBe('2.0');
      expect(parsed.run_id).toBe('test-run-456');
      expect(parsed.status).toBe('COMPLETED');
    });

    test('should be prettified with 2-space indentation', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const result = buildRunResult(metadata);

      const output = formatJson(result);

      // Check for pretty printing (newlines and indentation)
      expect(output).toContain('\n');
      expect(output).toMatch(/  "schema_version"/);
    });
  });

  describe('formatRaw', () => {
    test('should extract result content for COMPLETED', () => {
      const metadata = createMockMetadata(RunStatus.COMPLETED);
      const result = buildRunResult(metadata, 'Final result content');

      const output = formatRaw(result);

      expect(output).toBe('Final result content');
    });

    test('should extract error message for FAILED', () => {
      const metadata = createMockMetadata(RunStatus.FAILED);
      const error = { message: 'Error occurred' };
      const result = buildRunResult(metadata, undefined, error);

      const output = formatRaw(result);

      expect(output).toBe('Error occurred');
    });

    test('should extract prompt for WAITING_FOR_INPUT', () => {
      const metadata = createMockMetadata(RunStatus.WAITING_FOR_INPUT);
      const result = buildRunResult(metadata);

      const output = formatRaw(result);

      expect(output).toBe('Waiting for human input');
    });

    test('should return run_id for other statuses', () => {
      const metadata = createMockMetadata(RunStatus.INTERRUPTED);
      const result = buildRunResult(metadata);

      const output = formatRaw(result);

      expect(output).toBe('test-run-456');
    });
  });

  describe('formatOutput - Router', () => {
    const metadata = createMockMetadata(RunStatus.COMPLETED);
    const result = buildRunResult(metadata, 'Test');

    test('should route to formatText for OutputFormat.Text', () => {
      const output = formatOutput(result, OutputFormat.Text);
      expect(output).toContain('Execution Summary');
    });

    test('should route to formatJson for OutputFormat.Json', () => {
      const output = formatOutput(result, OutputFormat.Json);
      const parsed = JSON.parse(output);
      expect(parsed.schema_version).toBe('2.0');
    });

    test('should route to formatRaw for OutputFormat.Raw', () => {
      const output = formatOutput(result, OutputFormat.Raw);
      expect(output).toBe('Test');
    });

    test('should default to text format when no format specified', () => {
      const output = formatOutput(result);
      expect(output).toContain('Execution Summary');
    });
  });
});
