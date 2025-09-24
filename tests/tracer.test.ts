import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { Tracer, createTracer } from '../src/tracer.js';
import { TraceEventType, ToolExecutionResult } from '../src/types.js';

describe('Tracer', () => {
  let tempDir: string;
  let workDir: string;
  let runId: string;
  let tracer: Tracer;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(os.tmpdir(), `delta-engine-tracer-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'work');
    await fs.mkdir(workDir, { recursive: true });

    runId = uuidv4();
    tracer = new Tracer(workDir, runId);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic functionality', () => {
    it('should create tracer with correct trace file path', () => {
      const tracePath = tracer.getTraceFilePath();
      expect(tracePath).toBe(path.join(workDir, 'trace.jsonl'));
    });

    it('should log a basic event', async () => {
      await tracer.logEvent(TraceEventType.ENGINE_START, -1, {
        agentPath: '/path/to/agent',
        workDir: workDir,
        task: 'Test task',
      });

      await tracer.flush();

      const content = await fs.readFile(tracer.getTraceFilePath(), 'utf-8');
      const event = JSON.parse(content.trim());

      expect(event.type).toBe(TraceEventType.ENGINE_START);
      expect(event.runId).toBe(runId);
      expect(event.timestamp).toBeDefined();
      expect(event.agentPath).toBe('/path/to/agent');
      expect(event.task).toBe('Test task');
    });

    it('should append multiple events as JSON Lines', async () => {
      await tracer.logEngineStart('/agent', workDir, 'Task 1');
      await tracer.logEngineEnd(true, 3);
      await tracer.flush();

      const content = await fs.readFile(tracer.getTraceFilePath(), 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);

      const event1 = JSON.parse(lines[0]);
      const event2 = JSON.parse(lines[1]);

      expect(event1.type).toBe(TraceEventType.ENGINE_START);
      expect(event2.type).toBe(TraceEventType.ENGINE_END);
    });
  });

  describe('Event logging methods', () => {
    it('should log engine start event', async () => {
      await tracer.logEngineStart('/agent/path', workDir, 'Test task');
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.ENGINE_START);
      expect((events[0] as any).agentPath).toBe('/agent/path');
      expect((events[0] as any).task).toBe('Test task');
    });

    it('should log engine end event', async () => {
      await tracer.logEngineEnd(true, 5);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.ENGINE_END);
      expect((events[0] as any).success).toBe(true);
      expect((events[0] as any).iterations).toBe(5);
    });

    it('should log LLM request event', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];
      const tools = [
        { name: 'tool1', description: 'Tool 1 description' },
      ];

      await tracer.logLLMRequest(1, messages, tools);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.LLM_REQUEST);
      expect((events[0] as any).messages).toEqual(messages);
      expect((events[0] as any).tools).toEqual(tools);
      expect((events[0] as any).iteration).toBe(1);
    });

    it('should log LLM response event', async () => {
      const toolCalls = [
        { id: 'call_1', name: 'tool1', arguments: '{"param": "value"}' },
      ];

      await tracer.logLLMResponse(2, 'Response content', toolCalls, 'stop');
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.LLM_RESPONSE);
      expect((events[0] as any).content).toBe('Response content');
      expect((events[0] as any).tool_calls).toEqual(toolCalls);
      expect((events[0] as any).finish_reason).toBe('stop');
      expect((events[0] as any).iteration).toBe(2);
    });

    it('should log tool execution start event', async () => {
      const command = ['echo', 'hello'];
      const parameters = { message: 'hello' };

      await tracer.logToolExecutionStart(3, 'echo_tool', command, parameters);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.TOOL_EXECUTION_START);
      expect((events[0] as any).toolName).toBe('echo_tool');
      expect((events[0] as any).command).toEqual(command);
      expect((events[0] as any).parameters).toEqual(parameters);
    });

    it('should log tool execution end event', async () => {
      const result: ToolExecutionResult = {
        stdout: 'Output',
        stderr: '',
        exitCode: 0,
        success: true,
      };

      await tracer.logToolExecutionEnd(4, 'echo_tool', result);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.TOOL_EXECUTION_END);
      expect((events[0] as any).toolName).toBe('echo_tool');
      expect((events[0] as any).result).toEqual(result);
    });

    it('should log error event with Error object', async () => {
      const error = new Error('Test error');
      await tracer.logError(error, 'Test context', 5);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.ERROR);
      expect((events[0] as any).error.message).toBe('Test error');
      expect((events[0] as any).error.stack).toBeDefined();
      expect((events[0] as any).context).toBe('Test context');
      expect((events[0] as any).iteration).toBe(5);
    });

    it('should log error event with string', async () => {
      await tracer.logError('String error', 'Context');
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TraceEventType.ERROR);
      expect((events[0] as any).error.message).toBe('String error');
      expect((events[0] as any).context).toBe('Context');
    });
  });

  describe('Trace reading and summary', () => {
    it('should read empty trace', async () => {
      const events = await tracer.readTrace();
      expect(events).toEqual([]);
    });

    it('should read trace with multiple events', async () => {
      await tracer.logEngineStart('/agent', workDir, 'Task');
      await tracer.logLLMRequest(1, [{ role: 'user', content: 'Hello' }]);
      await tracer.logLLMResponse(1, 'Response');
      await tracer.logEngineEnd(true, 1);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(4);
      expect(events.map(e => e.type)).toEqual([
        TraceEventType.ENGINE_START,
        TraceEventType.LLM_REQUEST,
        TraceEventType.LLM_RESPONSE,
        TraceEventType.ENGINE_END,
      ]);
    });

    it('should generate trace summary', async () => {
      await tracer.logEngineStart('/agent', workDir, 'Task');
      await tracer.logLLMRequest(1, [{ role: 'user', content: 'Hello' }]);
      await tracer.logToolExecutionStart(1, 'tool1', ['cmd'], {});
      await tracer.logToolExecutionEnd(1, 'tool1', {
        stdout: '',
        stderr: '',
        exitCode: 0,
        success: true,
      });
      await tracer.logError('Test error');
      await tracer.logEngineEnd(true, 1);
      await tracer.flush();

      const summary = await tracer.getTraceSummary();

      expect(summary.totalEvents).toBe(6);
      expect(summary.iterations).toBe(1);
      expect(summary.llmRequests).toBe(1);
      expect(summary.toolCalls).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.startTime).toBeDefined();
      expect(summary.endTime).toBeDefined();
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event formatting', () => {
    it('should format engine start event', () => {
      const event: any = {
        type: TraceEventType.ENGINE_START,
        timestamp: new Date().toISOString(),
        runId: 'test-run',
        task: 'Test task',
      };

      const formatted = Tracer.formatEvent(event);
      expect(formatted).toContain('ENGINE START');
      expect(formatted).toContain('Test task');
    });

    it('should format tool execution event with iteration', () => {
      const event: any = {
        type: TraceEventType.TOOL_EXECUTION_START,
        timestamp: new Date().toISOString(),
        runId: 'test-run',
        iteration: 3,
        toolName: 'echo',
        command: ['echo', 'hello'],
      };

      const formatted = Tracer.formatEvent(event);
      expect(formatted).toContain('[Iter 3]');
      expect(formatted).toContain('TOOL START');
      expect(formatted).toContain('echo');
      expect(formatted).toContain('echo hello');
    });

    it('should format error event', () => {
      const event: any = {
        type: TraceEventType.ERROR,
        timestamp: new Date().toISOString(),
        runId: 'test-run',
        error: { message: 'Test error' },
        context: 'During execution',
      };

      const formatted = Tracer.formatEvent(event);
      expect(formatted).toContain('ERROR');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('During execution');
    });
  });

  describe('Concurrent writes', () => {
    it('should handle concurrent log operations', async () => {
      const promises = [];

      // Log 10 events concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          tracer.logLLMRequest(i, [{ role: 'user', content: `Message ${i}` }])
        );
      }

      await Promise.all(promises);
      await tracer.flush();

      const events = await tracer.readTrace();
      expect(events).toHaveLength(10);

      // Check all events are present (order may vary)
      const iterations = events.map(e => (e as any).iteration).sort((a, b) => a - b);
      expect(iterations).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('createTracer factory', () => {
    it('should create a tracer instance', () => {
      const tracer = createTracer('/work/dir', 'run-123');
      expect(tracer).toBeInstanceOf(Tracer);
      expect(tracer.getTraceFilePath()).toBe('/work/dir/trace.jsonl');
    });
  });
});