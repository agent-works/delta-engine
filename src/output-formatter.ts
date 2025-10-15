/**
 * v1.10: Output Formatting Module
 * Provides structured output for automation and Unix pipe integration
 */

import { DeltaRunMetadata, RunStatus } from './journal-types.js';
import { OutputFormat, RunResult } from './types.js';

/**
 * Build RunResult v2.0 from run metadata and execution data
 *
 * @param metadata - Run metadata from journal
 * @param finalResponse - Final response from agent (if completed)
 * @param error - Error information (if failed)
 * @returns Structured RunResult object
 */
export function buildRunResult(
  metadata: DeltaRunMetadata,
  finalResponse?: string,
  error?: { message: string; stack?: string }
): RunResult {
  // Calculate duration
  const startTime = new Date(metadata.start_time).getTime();
  const endTime = metadata.end_time ? new Date(metadata.end_time).getTime() : Date.now();
  const durationMs = endTime - startTime;

  // Base result structure
  const result: RunResult = {
    schema_version: '2.0',
    run_id: metadata.run_id,
    status: metadata.status as 'COMPLETED' | 'FAILED' | 'WAITING_FOR_INPUT' | 'INTERRUPTED',

    metrics: {
      iterations: metadata.iterations_completed,
      duration_ms: durationMs,
      start_time: metadata.start_time,
      end_time: metadata.end_time || new Date().toISOString(),
      usage: {
        total_cost_usd: 0, // TODO: Calculate from LLM invocation logs
        input_tokens: 0,
        output_tokens: 0,
        model_usage: {},
      },
    },

    metadata: {
      agent_name: metadata.agent_ref,
      workspace_path: '', // Will be filled by caller if needed
    },
  };

  // Add conditional fields based on status
  if (metadata.status === RunStatus.COMPLETED && finalResponse) {
    result.result = finalResponse;
  }

  if (metadata.status === RunStatus.FAILED && (error || metadata.error)) {
    result.error = {
      type: 'ExecutionError',
      message: error?.message || metadata.error || 'Unknown error',
      details: error?.stack,
    };
  }

  if (metadata.status === RunStatus.WAITING_FOR_INPUT) {
    // TODO: Read interaction/request.json to populate this
    result.interaction = {
      prompt: 'Waiting for human input',
      input_type: 'text',
      sensitive: false,
    };
  }

  return result;
}

/**
 * Format RunResult as human-readable text (default format)
 *
 * @param runResult - RunResult to format
 * @returns Human-readable text output
 */
export function formatText(runResult: RunResult): string {
  const lines: string[] = [];

  lines.push('─'.repeat(80));
  lines.push(`Run ID: ${runResult.run_id}`);
  lines.push(`Status: ${runResult.status}`);
  lines.push('─'.repeat(80));

  // Metrics
  lines.push('');
  lines.push('Execution Summary:');
  lines.push(`  • Iterations: ${runResult.metrics.iterations}`);
  lines.push(`  • Duration: ${(runResult.metrics.duration_ms / 1000).toFixed(2)}s`);
  lines.push(`  • Start Time: ${new Date(runResult.metrics.start_time).toLocaleString()}`);
  lines.push(`  • End Time: ${new Date(runResult.metrics.end_time).toLocaleString()}`);

  // Status-specific output
  if (runResult.status === 'COMPLETED' && runResult.result) {
    lines.push('');
    lines.push('Final Response:');
    lines.push('─'.repeat(80));
    lines.push(typeof runResult.result === 'string' ? runResult.result : JSON.stringify(runResult.result, null, 2));
  }

  if (runResult.status === 'FAILED' && runResult.error) {
    lines.push('');
    lines.push('Error:');
    lines.push(`  Type: ${runResult.error.type}`);
    lines.push(`  Message: ${runResult.error.message}`);
    if (runResult.error.details) {
      lines.push('  Details:');
      lines.push(runResult.error.details);
    }
  }

  if (runResult.status === 'WAITING_FOR_INPUT' && runResult.interaction) {
    lines.push('');
    lines.push('Human Input Required:');
    lines.push(`  Prompt: ${runResult.interaction.prompt}`);
    lines.push(`  Type: ${runResult.interaction.input_type}`);
  }

  lines.push('─'.repeat(80));
  return lines.join('\n');
}

/**
 * Format RunResult as JSON (structured format for automation)
 *
 * @param runResult - RunResult to format
 * @returns JSON string
 */
export function formatJson(runResult: RunResult): string {
  return JSON.stringify(runResult, null, 2);
}

/**
 * Format RunResult as raw output (Unix pipe-friendly)
 * Only outputs the essential result content without metadata
 *
 * @param runResult - RunResult to format
 * @returns Raw output string
 */
export function formatRaw(runResult: RunResult): string {
  if (runResult.status === 'COMPLETED' && runResult.result) {
    return typeof runResult.result === 'string' ? runResult.result : JSON.stringify(runResult.result);
  }

  if (runResult.status === 'FAILED' && runResult.error) {
    return runResult.error.message;
  }

  if (runResult.status === 'WAITING_FOR_INPUT' && runResult.interaction) {
    return runResult.interaction.prompt;
  }

  // For other statuses, return run_id
  return runResult.run_id;
}

/**
 * Main formatter function - routes to appropriate format handler
 *
 * @param runResult - RunResult to format
 * @param format - Output format (text, json, raw)
 * @returns Formatted output string
 */
export function formatOutput(runResult: RunResult, format: OutputFormat = OutputFormat.Text): string {
  switch (format) {
    case OutputFormat.Json:
      return formatJson(runResult);
    case OutputFormat.Raw:
      return formatRaw(runResult);
    case OutputFormat.Text:
    default:
      return formatText(runResult);
  }
}
