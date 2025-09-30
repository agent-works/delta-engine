import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { HookExecutor, createHookExecutor } from '../../src/hook-executor.js';
import { Journal, createJournal } from '../../src/journal.js';
import { HookDefinition } from '../../src/types.js';
import { JournalEventType } from '../../src/journal-types.js';

/**
 * High-quality unit tests for HookExecutor
 * Target: 90%+ coverage for hook-executor.ts
 *
 * Test Plan:
 * 1. Construction & Setup (4 tests)
 * 2. Hook Execution Core (executeHook) (12 tests)
 * 3. Command Execution & Timeout (8 tests)
 * 4. File I/O & Output Reading (8 tests)
 * 5. Specialized Hook Methods (8 tests)
 * 6. Error Handling & Edge Cases (8 tests)
 * Total: 48 tests
 */
describe('HookExecutor', () => {
  let tempDir: string;
  let workDir: string;
  let runId: string;
  let runDir: string;
  let journal: Journal;
  let hookExecutor: HookExecutor;
  let agentPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = path.join(os.tmpdir(), `delta-hook-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'workspace');
    runId = `test-run-${uuidv4().substring(0, 8)}`;
    runDir = path.join(workDir, '.delta', runId);
    agentPath = path.join(tempDir, 'agent');

    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(agentPath, { recursive: true });

    // Create journal and hook executor
    journal = createJournal(runId, runDir);
    await journal.initialize();

    hookExecutor = createHookExecutor(journal, workDir, runId);
  });

  afterEach(async () => {
    try {
      await journal.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // 1. Construction & Setup (4 tests)
  // ============================================

  describe('Construction & Setup', () => {
    test('should construct HookExecutor with correct properties', () => {
      expect(hookExecutor).toBeDefined();
      expect((hookExecutor as any).journal).toBe(journal);
      expect((hookExecutor as any).workDir).toBe(workDir);
      expect((hookExecutor as any).runId).toBe(runId);
      expect((hookExecutor as any).runtimeIoDir).toBe(path.join(runDir, 'io'));
    });

    test('should initialize step counter to 0', () => {
      expect((hookExecutor as any).stepCounter).toBe(0);
    });

    test('should increment step counter on each hook execution', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);
      expect((hookExecutor as any).stepCounter).toBe(1);

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);
      expect((hookExecutor as any).stepCounter).toBe(2);

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);
      expect((hookExecutor as any).stepCounter).toBe(3);
    });

    test('should create HookExecutor via factory function', () => {
      const executor = createHookExecutor(journal, workDir, runId);
      expect(executor).toBeDefined();
      expect((executor as any).workDir).toBe(workDir);
    });
  });

  // ============================================
  // 2. Hook Execution Core (executeHook) (12 tests)
  // ============================================

  describe('Hook Execution Core', () => {
    test('should execute simple hook successfully', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'hello'],
      };

      const result = await hookExecutor.executeHook(
        'test_hook',
        hookDef,
        { test: 'data' },
        agentPath
      );

      expect(result.success).toBe(true);
      expect(result.ioPathRef).toContain('001_test_hook');
    });

    test('should create proper directory structure', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const hookPath = path.join(runDir, 'io', 'hooks', '001_test_hook');
      const inputDir = path.join(hookPath, 'input');
      const outputDir = path.join(hookPath, 'output');
      const metaDir = path.join(hookPath, 'execution_meta');

      const inputExists = await fs.access(inputDir).then(() => true).catch(() => false);
      const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
      const metaExists = await fs.access(metaDir).then(() => true).catch(() => false);

      expect(inputExists).toBe(true);
      expect(outputExists).toBe(true);
      expect(metaExists).toBe(true);
    });

    test('should write context.json to input directory', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const contextPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'input', 'context.json');
      const contextContent = JSON.parse(await fs.readFile(contextPath, 'utf-8'));

      expect(contextContent.hook_name).toBe('test_hook');
      expect(contextContent.step_index).toBe(1);
      expect(contextContent.run_id).toBe(runId);
      expect(contextContent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should write payload.json for object payloads', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      const payload = { model: 'gpt-4', temperature: 0.7 };
      await hookExecutor.executeHook('test_hook', hookDef, payload, agentPath);

      const payloadPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'input', 'payload.json');
      const savedPayload = JSON.parse(await fs.readFile(payloadPath, 'utf-8'));

      expect(savedPayload).toEqual(payload);
    });

    test('should write proposed_payload.json for pre_llm_req hook', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      const payload = { model: 'gpt-4', messages: [] };
      await hookExecutor.executeHook('pre_llm_req', hookDef, payload, agentPath);

      const payloadPath = path.join(runDir, 'io', 'hooks', '001_pre_llm_req', 'input', 'proposed_payload.json');
      const exists = await fs.access(payloadPath).then(() => true).catch(() => false);

      expect(exists).toBe(true);
    });

    test('should write payload.dat for string payloads', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      const payload = 'raw string payload';
      await hookExecutor.executeHook('test_hook', hookDef, payload, agentPath);

      const payloadPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'input', 'payload.dat');
      const savedPayload = await fs.readFile(payloadPath, 'utf-8');

      expect(savedPayload).toBe(payload);
    });

    test('should substitute ${AGENT_HOME} in command', async () => {
      const hookScript = path.join(agentPath, 'hook.sh');
      await fs.writeFile(hookScript, '#!/bin/bash\necho "Hook from agent"\nexit 0\n', 'utf-8');
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: ['${AGENT_HOME}/hook.sh'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      // Verify command was substituted in execution_meta
      const commandPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'command.txt');
      const command = await fs.readFile(commandPath, 'utf-8');
      expect(command).toContain(agentPath);
      expect(command).not.toContain('${AGENT_HOME}');
    });

    test('should pass environment variables to hook', async () => {
      const hookScript = path.join(agentPath, 'env_check.sh');
      await fs.writeFile(
        hookScript,
        '#!/bin/bash\necho "RUN_ID=$DELTA_RUN_ID"\necho "IO_PATH=$DELTA_HOOK_IO_PATH"\nexit 0\n',
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      // Read stdout from execution_meta
      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout).toContain(`RUN_ID=${runId}`);
      expect(stdout).toContain('IO_PATH=');
    });

    test('should save execution metadata', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test output'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const metaDir = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta');
      const files = ['command.txt', 'stdout.log', 'stderr.log', 'exit_code.txt', 'duration_ms.txt'];

      for (const file of files) {
        const filePath = path.join(metaDir, file);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }

      const exitCode = await fs.readFile(path.join(metaDir, 'exit_code.txt'), 'utf-8');
      expect(exitCode.trim()).toBe('0');
    });

    test('should log SUCCESS audit event for successful hook', async () => {
      await journal.initializeMetadata(agentPath, 'Test');

      const hookDef: HookDefinition = {
        command: ['echo', 'success'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const events = await journal.readJournal();
      const hookEvents = events.filter(e => e.type === JournalEventType.HOOK_EXECUTION_AUDIT);

      expect(hookEvents.length).toBe(1);
      expect((hookEvents[0].payload as any).hook_name).toBe('test_hook');
      expect((hookEvents[0].payload as any).status).toBe('SUCCESS');
    });

    test('should log FAILED audit event for failed hook', async () => {
      await journal.initializeMetadata(agentPath, 'Test');

      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'exit 1'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);

      const events = await journal.readJournal();
      const hookEvents = events.filter(e => e.type === JournalEventType.HOOK_EXECUTION_AUDIT);

      expect(hookEvents.length).toBe(1);
      expect((hookEvents[0].payload as any).status).toBe('FAILED');
    });

    test('should handle hook execution exceptions', async () => {
      await journal.initializeMetadata(agentPath, 'Test');

      // Create invalid hook definition that will cause an error
      const hookDef: HookDefinition = {
        command: ['nonexistent_command_xyz'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);
      // Note: Command execution errors don't set result.error,
      // they just result in non-zero exit code with stderr message

      const events = await journal.readJournal();
      const hookEvents = events.filter(e => e.type === JournalEventType.HOOK_EXECUTION_AUDIT);
      expect(hookEvents.length).toBe(1);
      expect((hookEvents[0].payload as any).status).toBe('FAILED');
    });
  });

  // ============================================
  // 3. Command Execution & Timeout (8 tests)
  // ============================================

  describe('Command Execution & Timeout', () => {
    test('should capture stdout from command', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test stdout message'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout).toContain('test stdout message');
    });

    test('should capture stderr from command', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'echo "error message" >&2'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const stderrPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stderr.log');
      const stderr = await fs.readFile(stderrPath, 'utf-8');

      expect(stderr).toContain('error message');
    });

    test('should capture non-zero exit code', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'exit 42'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);

      const exitCodePath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'exit_code.txt');
      const exitCode = await fs.readFile(exitCodePath, 'utf-8');

      expect(exitCode.trim()).toBe('42');
    });

    test('should handle command timeout', async () => {
      const hookDef: HookDefinition = {
        command: ['sleep', '10'],
        timeout_ms: 100, // 100ms timeout
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);

      const exitCodePath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'exit_code.txt');
      const exitCode = await fs.readFile(exitCodePath, 'utf-8');

      // Timeout should result in exit code -1
      expect(exitCode.trim()).toBe('-1');
    }, 10000);

    test('should record execution duration', async () => {
      const hookDef: HookDefinition = {
        command: ['sleep', '0.1'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      const durationPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'duration_ms.txt');
      const duration = parseInt(await fs.readFile(durationPath, 'utf-8'), 10);

      expect(duration).toBeGreaterThan(50); // At least 50ms
      expect(duration).toBeLessThan(5000); // Less than 5s
    });

    test('should run command in workspace directory', async () => {
      // Create a file in workspace to verify CWD
      await fs.writeFile(path.join(workDir, 'test.txt'), 'test content', 'utf-8');

      const hookDef: HookDefinition = {
        command: ['ls', 'test.txt'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout).toContain('test.txt');
    });

    test('should handle empty command array', async () => {
      const hookDef: HookDefinition = {
        command: [],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);

      const stderrPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stderr.log');
      const stderr = await fs.readFile(stderrPath, 'utf-8');

      expect(stderr).toContain('No command provided');
    });

    test('should handle command execution errors', async () => {
      const hookDef: HookDefinition = {
        command: ['/nonexistent/path/to/command'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);

      const stderrPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stderr.log');
      const stderr = await fs.readFile(stderrPath, 'utf-8');

      expect(stderr.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 4. File I/O & Output Reading (8 tests)
  // ============================================

  describe('File I/O & Output Reading', () => {
    test('should read final_payload.json output', async () => {
      const hookScript = path.join(agentPath, 'output_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo '{"modified": true, "model": "gpt-4"}' > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('pre_llm_req', hookDef, {}, agentPath);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ modified: true, model: 'gpt-4' });
    });

    test('should read payload_override.dat output', async () => {
      const hookScript = path.join(agentPath, 'override_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "custom payload override" > "$DELTA_HOOK_IO_PATH/output/payload_override.dat"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);
      expect(result.output).toBe('custom payload override\n');
    });

    test('should read control.json output', async () => {
      const hookScript = path.join(agentPath, 'control_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo '{"skip": true, "reason": "Test skip"}' > "$DELTA_HOOK_IO_PATH/output/control.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('pre_tool_exec', hookDef, {}, agentPath);

      expect(result.success).toBe(true);
      expect(result.control).toEqual({ skip: true, reason: 'Test skip' });
    });

    test('should prioritize final_payload.json over payload_override.dat', async () => {
      const hookScript = path.join(agentPath, 'both_outputs.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "override content" > "$DELTA_HOOK_IO_PATH/output/payload_override.dat"
echo '{"final": true}' > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('pre_llm_req', hookDef, {}, agentPath);

      expect(result.success).toBe(true);
      // final_payload.json should be checked first
      expect(result.output).toEqual({ final: true });
    });

    test('should handle missing output files gracefully', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'no output files created'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);
      expect(result.output).toBeUndefined();
      expect(result.control).toBeUndefined();
    });

    test('should handle invalid JSON in output files', async () => {
      const hookScript = path.join(agentPath, 'invalid_json.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "invalid json {{{" > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('pre_llm_req', hookDef, {}, agentPath);

      // Should still succeed, but output parsing fails silently
      expect(result.success).toBe(true);
      // Invalid JSON should not crash, output should be undefined
      expect(result.output).toBeUndefined();
    });

    test('should not read outputs if hook fails', async () => {
      const hookScript = path.join(agentPath, 'fail_with_output.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo '{"data": "value"}' > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 1
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);
      // Output should not be read because exit code was non-zero
      expect(result.output).toBeUndefined();
    });

    test('should handle payload as undefined', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      // Don't pass any payload
      await hookExecutor.executeHook('test_hook', hookDef, undefined, agentPath);

      // Should not create any payload file
      const payloadJsonPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'input', 'payload.json');
      const payloadDatPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'input', 'payload.dat');

      const jsonExists = await fs.access(payloadJsonPath).then(() => true).catch(() => false);
      const datExists = await fs.access(payloadDatPath).then(() => true).catch(() => false);

      expect(jsonExists).toBe(false);
      expect(datExists).toBe(false);
    });
  });

  // ============================================
  // 5. Specialized Hook Methods (8 tests)
  // ============================================

  describe('Specialized Hook Methods', () => {
    test('should execute pre_llm_req hook and return finalPayload', async () => {
      const hookScript = path.join(agentPath, 'pre_llm.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" | \\
  jq '.modified = true' > \\
  "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const proposedPayload = { model: 'gpt-4', temperature: 0.7 };
      const result = await hookExecutor.executePreLLMReqHook(hookDef, proposedPayload, agentPath);

      expect(result.success).toBe(true);
      expect(result.finalPayload).toEqual({ model: 'gpt-4', temperature: 0.7, modified: true });
    });

    test('should return proposed payload if pre_llm_req fails', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'exit 1'],
      };

      const proposedPayload = { model: 'gpt-4' };
      const result = await hookExecutor.executePreLLMReqHook(hookDef, proposedPayload, agentPath);

      expect(result.success).toBe(false);
      expect(result.finalPayload).toEqual(proposedPayload);
      expect(result.error).toBeUndefined();
    });

    test('should execute post_llm_resp hook', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'processing response'],
      };

      const response = { content: 'LLM response', tool_calls: [] };
      const result = await hookExecutor.executePostLLMRespHook(hookDef, response, agentPath);

      expect(result.success).toBe(true);
    });

    test('should execute pre_tool_exec hook with control output', async () => {
      const hookScript = path.join(agentPath, 'pre_tool.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo '{"skip": true}' > "$DELTA_HOOK_IO_PATH/output/control.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const toolInfo = {
        tool_name: 'echo',
        tool_args: { message: 'hello' },
        resolved_command: 'echo hello',
      };

      const result = await hookExecutor.executePreToolExecHook(hookDef, toolInfo, agentPath);

      expect(result.success).toBe(true);
      expect(result.control).toEqual({ skip: true });
    });

    test('should execute post_tool_exec hook', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'tool executed'],
      };

      const executionResult = {
        tool_name: 'echo',
        exit_code: 0,
        stdout: 'output',
        stderr: '',
      };

      const result = await hookExecutor.executePostToolExecHook(hookDef, executionResult, agentPath);

      expect(result.success).toBe(true);
    });

    test('should execute on_error hook', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'error handled'],
      };

      const errorInfo = {
        error_type: 'TOOL_FAILURE',
        message: 'Tool execution failed',
        context: { tool: 'test' },
      };

      const result = await hookExecutor.executeOnErrorHook(hookDef, errorInfo, agentPath);

      expect(result.success).toBe(true);
    });

    test('should handle specialized hook method failures', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'exit 1'],
      };

      const result = await hookExecutor.executePostLLMRespHook(hookDef, {}, agentPath);

      expect(result.success).toBe(false);
      // Non-zero exit code indicates failure
    });

    test('should pass correct payload types to specialized hooks', async () => {
      const hookScript = path.join(agentPath, 'verify_input.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
if [ -f "$DELTA_HOOK_IO_PATH/input/payload.json" ]; then
  echo "Found payload.json"
fi
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      const hookDef: HookDefinition = {
        command: [hookScript],
      };

      const errorInfo = {
        error_type: 'TEST',
        message: 'Test error',
      };

      const result = await hookExecutor.executeOnErrorHook(hookDef, errorInfo, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_on_error', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');
      expect(stdout).toContain('Found payload.json');
    });
  });

  // ============================================
  // 6. Error Handling & Edge Cases (8 tests)
  // ============================================

  describe('Error Handling & Edge Cases', () => {
    test('should handle directory creation failures gracefully', async () => {
      // Make io directory read-only
      const ioDir = path.join(runDir, 'io');
      await fs.chmod(ioDir, 0o444);

      const hookDef: HookDefinition = {
        command: ['echo', 'test'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore permissions
      await fs.chmod(ioDir, 0o755);
    });

    test('should handle concurrent hook executions', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'concurrent'],
      };

      const results = await Promise.all([
        hookExecutor.executeHook('hook1', hookDef, {}, agentPath),
        hookExecutor.executeHook('hook2', hookDef, {}, agentPath),
        hookExecutor.executeHook('hook3', hookDef, {}, agentPath),
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);

      // Verify correct step numbering
      expect(results[0].ioPathRef).toContain('001_hook1');
      expect(results[1].ioPathRef).toContain('002_hook2');
      expect(results[2].ioPathRef).toContain('003_hook3');
    });

    test('should handle hooks with complex command arguments', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'echo "arg with spaces" && echo "line2"'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout).toContain('arg with spaces');
      expect(stdout).toContain('line2');
    });

    test('should handle hooks with large output', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'for i in {1..1000}; do echo "Line $i"; done'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout.split('\n').length).toBeGreaterThan(500);
    });

    test('should handle hooks that produce both stdout and stderr', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'echo "stdout message" && echo "stderr message" >&2'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stderrPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stderr.log');

      const stdout = await fs.readFile(stdoutPath, 'utf-8');
      const stderr = await fs.readFile(stderrPath, 'utf-8');

      expect(stdout).toContain('stdout message');
      expect(stderr).toContain('stderr message');
    });

    test('should handle hooks with special characters in output', async () => {
      const hookDef: HookDefinition = {
        command: ['bash', '-c', 'echo "Special chars: 你好 🚀 \\"quotes\\" $VAR"'],
      };

      const result = await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      expect(result.success).toBe(true);

      const stdoutPath = path.join(runDir, 'io', 'hooks', '001_test_hook', 'execution_meta', 'stdout.log');
      const stdout = await fs.readFile(stdoutPath, 'utf-8');

      expect(stdout).toContain('Special chars');
    });

    test('should handle rapid successive hook executions', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'rapid'],
      };

      const count = 10;
      const promises = [];

      for (let i = 0; i < count; i++) {
        promises.push(hookExecutor.executeHook(`hook_${i}`, hookDef, {}, agentPath));
      }

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Step counter should be correct
      expect((hookExecutor as any).stepCounter).toBe(count);
    });

    test('should cleanup resources properly after execution', async () => {
      const hookDef: HookDefinition = {
        command: ['echo', 'cleanup test'],
      };

      await hookExecutor.executeHook('test_hook', hookDef, {}, agentPath);

      // Verify all files were created and closed properly
      const hookPath = path.join(runDir, 'io', 'hooks', '001_test_hook');

      // Should be able to read all files immediately after execution
      const contextPath = path.join(hookPath, 'input', 'context.json');
      const context = JSON.parse(await fs.readFile(contextPath, 'utf-8'));

      expect(context.hook_name).toBe('test_hook');
    });
  });
});
