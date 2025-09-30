import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { Journal, createJournal } from '../../src/journal.js';
import {
  JournalEventType,
  RunStatus,
  DeltaRunMetadata,
  LLMInvocationRequest,
  LLMInvocationResponse,
  LLMInvocationMetadata,
  ToolExecutionRecord,
} from '../../src/journal-types.js';

/**
 * High-quality unit tests for Journal core logic
 * Target: 90%+ coverage for journal.ts
 *
 * Test Plan:
 * 1. Construction & Initialization (6 tests)
 * 2. Event Writing & Sequencing (8 tests)
 * 3. Metadata Management (7 tests)
 * 4. I/O Storage (LLM, Tool, Hook) (10 tests)
 * 5. Journal Reading & Filtering (6 tests)
 * 6. Engine Log Management (4 tests)
 * 7. Resource Management & Error Handling (8 tests)
 * Total: 49 tests
 */
describe('Journal', () => {
  let tempDir: string;
  let runId: string;
  let runDir: string;
  let journal: Journal;

  beforeEach(async () => {
    // Create unique temporary directory for each test
    tempDir = path.join(os.tmpdir(), `delta-journal-test-${uuidv4()}`);
    runId = `test-run-${uuidv4().substring(0, 8)}`;
    runDir = path.join(tempDir, runId);

    await fs.mkdir(runDir, { recursive: true });

    journal = createJournal(runId, runDir);
  });

  afterEach(async () => {
    // Clean up resources
    try {
      await journal.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // 1. Construction & Initialization (6 tests)
  // ============================================

  describe('Construction & Initialization', () => {
    test('should construct Journal with correct paths', () => {
      expect(journal).toBeDefined();
      expect((journal as any).runId).toBe(runId);
      expect((journal as any).runDir).toBe(runDir);
      expect((journal as any).journalPath).toBe(path.join(runDir, 'journal.jsonl'));
      expect((journal as any).metadataPath).toBe(path.join(runDir, 'metadata.json'));
      expect((journal as any).engineLogPath).toBe(path.join(runDir, 'engine.log'));
    });

    test('should create directory structure on initialize', async () => {
      await journal.initialize();

      // Check directories exist
      const runDirExists = await fs.access(runDir).then(() => true).catch(() => false);
      const ioDirExists = await fs.access(path.join(runDir, 'io')).then(() => true).catch(() => false);
      const hooksDirExists = await fs.access(path.join(runDir, 'io', 'hooks')).then(() => true).catch(() => false);
      const invocationsDirExists = await fs.access(path.join(runDir, 'io', 'invocations')).then(() => true).catch(() => false);
      const toolExecDirExists = await fs.access(path.join(runDir, 'io', 'tool_executions')).then(() => true).catch(() => false);

      expect(runDirExists).toBe(true);
      expect(ioDirExists).toBe(true);
      expect(hooksDirExists).toBe(true);
      expect(invocationsDirExists).toBe(true);
      expect(toolExecDirExists).toBe(true);
    });

    test('should initialize sequence number to 0 for new journal', async () => {
      await journal.initialize();

      // Sequence number should start at 0
      expect((journal as any).sequenceNumber).toBe(0);
    });

    test('should resume sequence number from existing journal', async () => {
      await journal.initialize();

      // Write some events
      await journal.logRunStart('Test task', '/path/to/agent');
      await journal.logSystemMessage('INFO', 'Test message 1');
      await journal.logSystemMessage('INFO', 'Test message 2');

      // Close and reopen
      await journal.close();

      const journal2 = createJournal(runId, runDir);
      await journal2.initialize();

      // Should resume from sequence 3
      expect((journal2 as any).sequenceNumber).toBe(3);

      // Next event should have seq 4
      await journal2.logSystemMessage('INFO', 'After resume');
      const events = await journal2.readJournal();
      expect(events[events.length - 1].seq).toBe(4);

      await journal2.close();
    });

    test('should open engine log stream on initialize', async () => {
      await journal.initialize();

      expect((journal as any).engineLogStream).not.toBeNull();
    });

    test('should close existing engine log stream before reopening', async () => {
      await journal.initialize();
      const firstStream = (journal as any).engineLogStream;

      // Initialize again
      await journal.initialize();
      const secondStream = (journal as any).engineLogStream;

      // Should be a different stream
      expect(secondStream).not.toBeNull();
      expect(secondStream).not.toBe(firstStream);
    });
  });

  // ============================================
  // 2. Event Writing & Sequencing (8 tests)
  // ============================================

  describe('Event Writing & Sequencing', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should write RUN_START event with correct structure', async () => {
      await journal.logRunStart('Initial task', '/agent/path');

      const events = await journal.readJournal();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe(JournalEventType.RUN_START);
      expect(events[0].seq).toBe(1);
      expect(events[0].payload).toMatchObject({
        run_id: runId,
        task: 'Initial task',
        agent_ref: '/agent/path',
      });
      expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should write THOUGHT event with tool calls', async () => {
      const toolCalls = [
        {
          id: 'call_123',
          type: 'function' as const,
          function: {
            name: 'echo',
            arguments: '{"message": "test"}',
          },
        },
      ];

      await journal.logThought('Thinking...', 'inv-001', toolCalls);

      const events = await journal.readJournal();
      expect(events[0].type).toBe(JournalEventType.THOUGHT);
      expect(events[0].payload).toMatchObject({
        content: 'Thinking...',
        llm_invocation_ref: 'inv-001',
        tool_calls: toolCalls,
      });
    });

    test('should write ACTION_REQUEST event', async () => {
      const actionId = await journal.logActionRequest(
        'call_123',
        'echo',
        { message: 'hello' },
        'echo hello'
      );

      expect(actionId).toBe('call_123');

      const events = await journal.readJournal();
      expect(events[0].type).toBe(JournalEventType.ACTION_REQUEST);
      expect(events[0].payload).toMatchObject({
        action_id: 'call_123',
        tool_name: 'echo',
        tool_args: { message: 'hello' },
        resolved_command: 'echo hello',
      });
    });

    test('should write ACTION_RESULT event', async () => {
      await journal.logActionResult(
        'call_123',
        'SUCCESS',
        '=== STDOUT ===\nhello\n=== EXIT CODE: 0 ===',
        'exec-001'
      );

      const events = await journal.readJournal();
      expect(events[0].type).toBe(JournalEventType.ACTION_RESULT);
      expect(events[0].payload).toMatchObject({
        action_id: 'call_123',
        status: 'SUCCESS',
        observation_content: expect.stringContaining('hello'),
        execution_ref: 'exec-001',
      });
    });

    test('should write SYSTEM_MESSAGE event', async () => {
      await journal.logSystemMessage('WARN', 'Warning message');

      const events = await journal.readJournal();
      expect(events[0].type).toBe(JournalEventType.SYSTEM_MESSAGE);
      expect(events[0].payload).toMatchObject({
        level: 'WARN',
        content: 'Warning message',
      });
    });

    test('should write HOOK_EXECUTION_AUDIT event', async () => {
      await journal.logHookExecution('pre_llm_req', 'SUCCESS', '/path/to/hook/io');

      const events = await journal.readJournal();
      expect(events[0].type).toBe(JournalEventType.HOOK_EXECUTION_AUDIT);
      expect(events[0].payload).toMatchObject({
        hook_name: 'pre_llm_req',
        status: 'SUCCESS',
        io_path_ref: '/path/to/hook/io',
      });
    });

    test('should auto-increment sequence numbers', async () => {
      await journal.logSystemMessage('INFO', 'Message 1');
      await journal.logSystemMessage('INFO', 'Message 2');
      await journal.logSystemMessage('INFO', 'Message 3');

      const events = await journal.readJournal();
      expect(events[0].seq).toBe(1);
      expect(events[1].seq).toBe(2);
      expect(events[2].seq).toBe(3);
    });

    test('should maintain sequential writes with async operations', async () => {
      // Fire off multiple writes concurrently
      await Promise.all([
        journal.logSystemMessage('INFO', 'Message 1'),
        journal.logSystemMessage('INFO', 'Message 2'),
        journal.logSystemMessage('INFO', 'Message 3'),
        journal.logSystemMessage('INFO', 'Message 4'),
        journal.logSystemMessage('INFO', 'Message 5'),
      ]);

      const events = await journal.readJournal();

      // Should have exactly 5 events
      expect(events.length).toBe(5);

      // Sequence numbers should be sequential
      for (let i = 0; i < 5; i++) {
        expect(events[i].seq).toBe(i + 1);
      }
    });
  });

  // ============================================
  // 3. Metadata Management (7 tests)
  // ============================================

  describe('Metadata Management', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should initialize metadata with default values', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      const metadata = await journal.readMetadata();

      expect(metadata.run_id).toBe(runId);
      expect(metadata.agent_ref).toBe('/agent/path');
      expect(metadata.task).toBe('Test task');
      expect(metadata.status).toBe(RunStatus.RUNNING);
      expect(metadata.iterations_completed).toBe(0);
      expect(metadata.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(metadata.end_time).toBeUndefined();
    });

    test('should update metadata with partial updates', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.updateMetadata({
        iterations_completed: 5,
      });

      const metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(5);
      expect(metadata.status).toBe(RunStatus.RUNNING); // Other fields unchanged
    });

    test('should update status on logRunEnd (COMPLETED)', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.logRunEnd('COMPLETED');

      const metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.COMPLETED);
      expect(metadata.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should update status on logRunEnd (FAILED)', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.logRunEnd('FAILED');

      const metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.FAILED);
    });

    test('should update status on logRunEnd (INTERRUPTED)', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.logRunEnd('INTERRUPTED');

      const metadata = await journal.readMetadata();
      expect(metadata.status).toBe(RunStatus.INTERRUPTED);
    });

    test('should increment iterations correctly', async () => {
      await journal.initializeMetadata('/agent/path', 'Test task');

      await journal.incrementIterations();
      let metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(1);

      await journal.incrementIterations();
      metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(2);

      await journal.incrementIterations();
      metadata = await journal.readMetadata();
      expect(metadata.iterations_completed).toBe(3);
    });

    test('should throw error when reading non-existent metadata', async () => {
      await expect(journal.readMetadata()).rejects.toThrow();
    });
  });

  // ============================================
  // 4. I/O Storage (LLM, Tool, Hook) (10 tests)
  // ============================================

  describe('I/O Storage', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should save LLM invocation with all files', async () => {
      const invocationId = 'inv-001';
      const request: LLMInvocationRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        max_tokens: 2000,
        tools: [],
      };
      const response: LLMInvocationResponse = {
        content: 'Response',
        tool_calls: undefined,
        refusal: null,
      };
      const metadata: LLMInvocationMetadata = {
        invocation_id: invocationId,
        timestamp: new Date().toISOString(),
        model: 'gpt-4',
        duration_ms: 1234,
      };

      await journal.saveLLMInvocation(invocationId, request, response, metadata);

      // Verify directory structure
      const invocationDir = path.join(runDir, 'io', 'invocations', invocationId);
      const requestPath = path.join(invocationDir, 'request.json');
      const responsePath = path.join(invocationDir, 'response.json');
      const metadataPath = path.join(invocationDir, 'metadata.json');

      const requestExists = await fs.access(requestPath).then(() => true).catch(() => false);
      const responseExists = await fs.access(responsePath).then(() => true).catch(() => false);
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);

      expect(requestExists).toBe(true);
      expect(responseExists).toBe(true);
      expect(metadataExists).toBe(true);

      // Verify content
      const savedRequest = JSON.parse(await fs.readFile(requestPath, 'utf-8'));
      expect(savedRequest.model).toBe('gpt-4');
      expect(savedRequest.messages).toEqual(request.messages);
    });

    test('should save tool execution with all files', async () => {
      const actionId = 'exec-001';
      const record: ToolExecutionRecord = {
        command: 'echo test',
        stdout: 'test\n',
        stderr: '',
        exit_code: 0,
        duration_ms: 42,
      };

      await journal.saveToolExecution(actionId, record);

      // Verify directory structure
      const executionDir = path.join(runDir, 'io', 'tool_executions', actionId);
      const files = ['command.txt', 'stdout.log', 'stderr.log', 'exit_code.txt', 'duration_ms.txt'];

      for (const file of files) {
        const filePath = path.join(executionDir, file);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }

      // Verify content
      const command = await fs.readFile(path.join(executionDir, 'command.txt'), 'utf-8');
      const exitCode = await fs.readFile(path.join(executionDir, 'exit_code.txt'), 'utf-8');
      const duration = await fs.readFile(path.join(executionDir, 'duration_ms.txt'), 'utf-8');

      expect(command).toBe('echo test');
      expect(exitCode.trim()).toBe('0');
      expect(duration.trim()).toBe('42');
    });

    test('should setup hook invocation directory with input context', async () => {
      const contextData = {
        proposed_payload: { model: 'gpt-4', messages: [] },
      };
      const payload = { model: 'gpt-4', messages: [] };

      const hookPath = await journal.setupHookInvocation(
        1,
        'pre_llm_req',
        contextData,
        payload
      );

      expect(hookPath).toBeDefined();

      // Verify directory structure
      const inputDir = path.join(hookPath, 'input');
      const outputDir = path.join(hookPath, 'output');
      const metaDir = path.join(hookPath, 'execution_meta');

      const inputExists = await fs.access(inputDir).then(() => true).catch(() => false);
      const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
      const metaExists = await fs.access(metaDir).then(() => true).catch(() => false);

      expect(inputExists).toBe(true);
      expect(outputExists).toBe(true);
      expect(metaExists).toBe(true);

      // Verify input files
      const contextPath = path.join(inputDir, 'context.json');
      const payloadPath = path.join(inputDir, 'payload.json');

      const contextExists = await fs.access(contextPath).then(() => true).catch(() => false);
      const payloadExists = await fs.access(payloadPath).then(() => true).catch(() => false);

      expect(contextExists).toBe(true);
      expect(payloadExists).toBe(true);

      const savedPayload = JSON.parse(await fs.readFile(payloadPath, 'utf-8'));
      expect(savedPayload.model).toBe('gpt-4');
    });

    test('should save hook execution metadata', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_llm_req', {});

      await journal.saveHookExecutionMeta(
        hookPath,
        {
          command: 'hook.sh',
          stdout: 'Hook output',
          stderr: '',
          exit_code: 0,
          duration_ms: 123,
        }
      );

      // Verify execution_meta directory
      const metaDir = path.join(hookPath, 'execution_meta');
      const files = ['command.txt', 'stdout.log', 'stderr.log', 'exit_code.txt', 'duration_ms.txt'];

      for (const file of files) {
        const filePath = path.join(metaDir, file);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }

      const exitCode = await fs.readFile(path.join(metaDir, 'exit_code.txt'), 'utf-8');
      expect(exitCode.trim()).toBe('0');
    });

    test('should read hook outputs (final_payload.json)', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_llm_req', {});

      // Write final_payload.json
      const finalPayload = { model: 'gpt-4', modified: true };
      await fs.writeFile(
        path.join(hookPath, 'output', 'final_payload.json'),
        JSON.stringify(finalPayload),
        'utf-8'
      );

      const result = await journal.readHookOutput(hookPath);

      expect(result.payload).toEqual(finalPayload);
    });

    test('should read hook outputs (payload_override.dat)', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_llm_req', {});

      // Write payload_override.dat
      const overrideContent = 'custom payload content';
      await fs.writeFile(
        path.join(hookPath, 'output', 'payload_override.dat'),
        overrideContent,
        'utf-8'
      );

      const result = await journal.readHookOutput(hookPath);

      expect(result.payload).toBe(overrideContent);
    });

    test('should read hook control output', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_tool_exec', {});

      // Write control.json
      const control = { skip: true, reason: 'Test skip' };
      await fs.writeFile(
        path.join(hookPath, 'output', 'control.json'),
        JSON.stringify(control),
        'utf-8'
      );

      const result = await journal.readHookOutput(hookPath);

      expect(result.control).toEqual(control);
    });

    test('should return empty result when no hook outputs exist', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_llm_req', {});

      const result = await journal.readHookOutput(hookPath);

      expect(result.payload).toBeUndefined();
      expect(result.control).toBeUndefined();
    });

    test('should handle multiple hook input context fields', async () => {
      const contextData = {
        tool_name: 'echo',
        tool_args: { message: 'hello' },
        resolved_command: 'echo hello',
      };

      const hookPath = await journal.setupHookInvocation(
        2,
        'pre_tool_exec',
        contextData
      );

      // Verify context.json contains all fields
      const inputDir = path.join(hookPath, 'input');
      const contextPath = path.join(inputDir, 'context.json');

      const contextExists = await fs.access(contextPath).then(() => true).catch(() => false);
      expect(contextExists).toBe(true);

      const savedContext = JSON.parse(await fs.readFile(contextPath, 'utf-8'));
      expect(savedContext.tool_name).toBe('echo');
      expect(savedContext.tool_args).toEqual({ message: 'hello' });
      expect(savedContext.resolved_command).toBe('echo hello');
    });

    test('should prioritize payload_override.dat over final_payload.json', async () => {
      const hookPath = await journal.setupHookInvocation(1, 'pre_llm_req', {});

      // Write both files
      await fs.writeFile(
        path.join(hookPath, 'output', 'payload_override.dat'),
        'override content',
        'utf-8'
      );
      await fs.writeFile(
        path.join(hookPath, 'output', 'final_payload.json'),
        JSON.stringify({ preferred: true }),
        'utf-8'
      );

      const result = await journal.readHookOutput(hookPath);

      // Should prioritize payload_override.dat (first in the list in code)
      expect(result.payload).toBe('override content');
    });
  });

  // ============================================
  // 5. Journal Reading & Filtering (6 tests)
  // ============================================

  describe('Journal Reading & Filtering', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should return empty array for non-existent journal', async () => {
      // Don't write anything
      const events = await journal.readJournal();
      expect(events).toEqual([]);
    });

    test('should read all journal events in order', async () => {
      await journal.initializeMetadata('/agent', 'Task'); // Initialize metadata first
      await journal.logRunStart('Task', '/agent');
      await journal.logThought('Thinking', 'inv-1', undefined);
      await journal.logSystemMessage('INFO', 'Message');
      await journal.logRunEnd('COMPLETED');

      const events = await journal.readJournal();
      expect(events.length).toBe(4);
      expect(events[0].type).toBe(JournalEventType.RUN_START);
      expect(events[1].type).toBe(JournalEventType.THOUGHT);
      expect(events[2].type).toBe(JournalEventType.SYSTEM_MESSAGE);
      expect(events[3].type).toBe(JournalEventType.RUN_END);
    });

    test('should filter events by type', async () => {
      await journal.logSystemMessage('INFO', 'Message 1');
      await journal.logSystemMessage('WARN', 'Message 2');
      await journal.logThought('Thinking', 'inv-1', undefined);
      await journal.logSystemMessage('ERROR', 'Message 3');

      const systemMessages = await journal.readEventsByType(JournalEventType.SYSTEM_MESSAGE);
      expect(systemMessages.length).toBe(3);
      expect(systemMessages.every(e => e.type === JournalEventType.SYSTEM_MESSAGE)).toBe(true);
    });

    test('should handle corrupted journal lines gracefully', async () => {
      await journal.logSystemMessage('INFO', 'Valid message');

      // Manually append corrupted line
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.appendFile(journalPath, 'invalid json line\n', 'utf-8');

      await expect(journal.readJournal()).rejects.toThrow();
    });

    test('should handle journal with only whitespace lines', async () => {
      // Write valid events with extra whitespace
      await journal.logSystemMessage('INFO', 'Message 1');

      // Manually append whitespace lines
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.appendFile(journalPath, '\n\n   \n\t\n', 'utf-8');

      await journal.logSystemMessage('INFO', 'Message 2');

      const events = await journal.readJournal();
      // Should only have 2 valid events, whitespace lines filtered out
      expect(events.length).toBe(2);
    });

    test('should parse event payloads correctly', async () => {
      await journal.logActionRequest(
        'call_123',
        'echo',
        { message: 'hello', count: 42, flag: true },
        'echo hello'
      );

      const events = await journal.readJournal();
      const payload = events[0].payload as any;

      expect(payload.tool_args.message).toBe('hello');
      expect(payload.tool_args.count).toBe(42);
      expect(payload.tool_args.flag).toBe(true);
    });
  });

  // ============================================
  // 6. Engine Log Management (4 tests)
  // ============================================

  describe('Engine Log Management', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should write to engine log with timestamp', async () => {
      await journal.writeEngineLog('Test log message');

      const engineLogPath = path.join(runDir, 'engine.log');
      const content = await fs.readFile(engineLogPath, 'utf-8');

      expect(content).toContain('Test log message');
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T.*\] Test log message/);
    });

    test('should append multiple log entries', async () => {
      await journal.writeEngineLog('First message');
      await journal.writeEngineLog('Second message');
      await journal.writeEngineLog('Third message');

      const engineLogPath = path.join(runDir, 'engine.log');
      const content = await fs.readFile(engineLogPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('First message');
      expect(lines[1]).toContain('Second message');
      expect(lines[2]).toContain('Third message');
    });

    test('should handle engine log when stream is null', async () => {
      // Close the stream
      await journal.close();

      // Writing should not throw, just do nothing
      await journal.writeEngineLog('Message after close');

      // Engine log should not contain this message
      const engineLogPath = path.join(runDir, 'engine.log');
      const content = await fs.readFile(engineLogPath, 'utf-8');

      expect(content).not.toContain('Message after close');
    });

    test('should handle concurrent engine log writes', async () => {
      await Promise.all([
        journal.writeEngineLog('Concurrent message 1'),
        journal.writeEngineLog('Concurrent message 2'),
        journal.writeEngineLog('Concurrent message 3'),
        journal.writeEngineLog('Concurrent message 4'),
        journal.writeEngineLog('Concurrent message 5'),
      ]);

      const engineLogPath = path.join(runDir, 'engine.log');
      const content = await fs.readFile(engineLogPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines.length).toBe(5);
    });
  });

  // ============================================
  // 7. Resource Management & Error Handling (8 tests)
  // ============================================

  describe('Resource Management & Error Handling', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should close engine log stream on close()', async () => {
      await journal.close();

      expect((journal as any).engineLogStream).toBeNull();
    });

    test('should wait for pending writes on close()', async () => {
      // Queue up multiple writes
      const writePromises = [
        journal.logSystemMessage('INFO', 'Message 1'),
        journal.logSystemMessage('INFO', 'Message 2'),
        journal.logSystemMessage('INFO', 'Message 3'),
      ];

      // Close immediately (should wait for writes)
      await journal.close();

      // All writes should have completed
      await Promise.all(writePromises);

      const events = await journal.readJournal();
      expect(events.length).toBe(3);
    });

    test('should flush pending writes', async () => {
      // Queue writes without awaiting
      journal.logSystemMessage('INFO', 'Message 1');
      journal.logSystemMessage('INFO', 'Message 2');

      // Flush
      await journal.flush();

      // All writes should be complete
      const events = await journal.readJournal();
      expect(events.length).toBe(2);
    });

    test('should handle journal write errors', async () => {
      // Make journal path read-only to cause write error
      const journalPath = path.join(runDir, 'journal.jsonl');
      await fs.writeFile(journalPath, '', 'utf-8');
      await fs.chmod(journalPath, 0o444); // Read-only

      await expect(journal.logSystemMessage('INFO', 'Test')).rejects.toThrow(/Failed to write journal event/);

      // Restore permissions for cleanup
      await fs.chmod(journalPath, 0o644);
    });

    test('should support multiple concurrent journal instances', async () => {
      const journal2 = createJournal(runId, runDir);
      await journal2.initialize();

      await journal.logSystemMessage('INFO', 'From journal1');
      await journal2.logSystemMessage('INFO', 'From journal2');

      const events = await journal.readJournal();
      expect(events.length).toBe(2);

      await journal2.close();
    });

    test('should handle missing runDir gracefully', async () => {
      // Remove the runDir
      await fs.rm(runDir, { recursive: true, force: true });

      // Initialize should recreate it
      await journal.initialize();

      const runDirExists = await fs.access(runDir).then(() => true).catch(() => false);
      expect(runDirExists).toBe(true);
    });

    test('should handle file system errors when saving I/O', async () => {
      // Make io directory read-only
      const ioDir = path.join(runDir, 'io');
      await fs.chmod(ioDir, 0o444);

      const record: ToolExecutionRecord = {
        command: 'test',
        stdout: '',
        stderr: '',
        exit_code: 0,
        duration_ms: 1,
      };

      await expect(journal.saveToolExecution('exec-001', record)).rejects.toThrow();

      // Restore permissions
      await fs.chmod(ioDir, 0o755);
    });

    test('should create journal instance via factory function', () => {
      const j = createJournal('test-run', '/test/path');
      expect(j).toBeDefined();
      expect((j as any).runId).toBe('test-run');
      expect((j as any).runDir).toBe('/test/path');
    });
  });
});
