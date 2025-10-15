import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import { Engine } from '../../src/engine.js';
import { createJournal } from '../../src/journal.js';
import { EngineContext, AgentConfig } from '../../src/types.js';

// Load test environment variables
dotenv.config({ path: path.join(process.cwd(), 'tests', '.env') });

/**
 * Critical Invariant Tests for Engine
 *
 * These tests protect against AI breaking core safety mechanisms:
 * 1. Max iterations MUST terminate loops
 * 2. Fatal errors MUST be logged properly
 * 3. ask_human MUST pause execution
 *
 * Everything else is implementation detail.
 */
describe('Engine - Critical Invariants', () => {
  let tempDir: string;
  let workDir: string;
  let agentPath: string;
  let runId: string;
  let context: EngineContext;
  let mockConfig: AgentConfig;

  beforeEach(async () => {
    if (!process.env.DELTA_API_KEY) {
      throw new Error('DELTA_API_KEY not found in tests/.env');
    }

    tempDir = path.join(os.tmpdir(), `delta-engine-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'work');
    agentPath = path.join(tempDir, 'agent');
    runId = `test-run-${uuidv4().substring(0, 8)}`;

    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(agentPath, { recursive: true });

    // Create required files
    await fs.writeFile(
      path.join(agentPath, 'system_prompt.md'),
      'You are a test agent.',
      'utf-8'
    );

    await fs.writeFile(
      path.join(agentPath, 'context.yaml'),
      `sources:
  - type: file
    id: system_prompt
    path: '\${AGENT_HOME}/system_prompt.md'
  - type: journal
    id: conversation_history
`,
      'utf-8'
    );

    mockConfig = {
      name: 'test-agent',
      version: '1.0.0',
      llm: {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 2000,
      },
      tools: [
        {
          name: 'echo',
          command: ['echo'],
          parameters: [
            {
              name: 'message',
              type: 'string',
              inject_as: 'argument' as const,
            },
          ],
        },
      ],
      max_iterations: 5,
    };

    const deltaDir = path.join(workDir, '.delta');
    const runDir = path.join(deltaDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const journal = createJournal(runId, runDir);

    context = {
      runId,
      agentPath,
      workDir,
      deltaDir,
      config: mockConfig,
      systemPrompt: 'You are a test agent.',
      initialTask: 'Test task',
      journal,
      currentStep: 0,
      isInteractive: false,
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Critical Safety Invariants', () => {
    test('MUST stop after reaching max_iterations to prevent infinite loops', async () => {
      // This is CRITICAL - prevents AI creating infinite loops
      context.config.max_iterations = 2;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to always return tool calls (would loop forever without max_iterations)
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Calling tool again',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function' as const,
              function: {
                name: 'echo',
                arguments: '{"message": "test"}',
              },
            },
          ],
        }),
      };

      const result = await engine.run();

      expect(result).toContain('Maximum iterations reached');

      // CRITICAL: Must have stopped at exactly max_iterations
      const metadata = await context.journal.readMetadata();
      expect(metadata.iterations_completed).toBe(2);
    });

    test('MUST handle fatal errors and mark run as FAILED', async () => {
      // This is CRITICAL - ensures errors are trackable
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw fatal error
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('API Error')),
      };

      await expect(engine.run()).rejects.toThrow('API Error');

      // CRITICAL: Run must be marked as FAILED for tracking
      const events = await context.journal.readJournal();
      const runEndEvents = events.filter(e => e.type === 'RUN_END');

      expect(runEndEvents.length).toBe(1);
      expect(runEndEvents[0].payload.status).toBe('FAILED');
    });

    test('MUST pause execution when ask_human is called in non-interactive mode', async () => {
      // This is CRITICAL - prevents AI from continuing without human input
      context.isInteractive = false;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Need user input',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function' as const,
              function: {
                name: 'ask_human',
                arguments: '{"prompt": "What is your name?"}',
              },
            },
          ],
        }),
      };

      // Mock process.exit to verify pause behavior
      const originalExit = process.exit;
      let exitCode: number | undefined;
      (process as any).exit = jest.fn((code: number) => {
        exitCode = code;
        throw new Error(`Process.exit called with code ${code}`);
      });

      try {
        await engine.run();
      } catch (error: any) {
        // Expected to throw due to mocked exit
      } finally {
        process.exit = originalExit;
      }

      // CRITICAL: Must have paused with code 101 (WAITING_FOR_INPUT)
      expect(exitCode).toBe(101);

      // CRITICAL: Must have created request file for user
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestFile = path.join(interactionDir, 'request.json');
      const requestExists = await fs.access(requestFile).then(() => true).catch(() => false);

      expect(requestExists).toBe(true);
    });

    test('MUST use default max_iterations when not configured', async () => {
      // This is CRITICAL - prevents undefined behavior
      context.config.max_iterations = undefined;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Create a counter to verify it stops
      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 30) {
            return Promise.resolve({
              content: 'Loop',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const result = await engine.run();

      expect(result).toContain('Maximum iterations reached');

      // CRITICAL: Must have used DEFAULT_MAX_ITERATIONS (30)
      const metadata = await context.journal.readMetadata();
      expect(metadata.iterations_completed).toBe(30);
    }, 30000); // Increase timeout for 30 iterations

    test('MUST handle tool execution failures without crashing', async () => {
      // This is CRITICAL - tool failures should not break the loop
      context.config.tools.push({
        name: 'fail_tool',
        command: ['bash', '-c', 'exit 1'],
        parameters: [],
      });

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Calling failing tool',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'fail_tool', arguments: '{}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done after failure', tool_calls: undefined });
        }),
      };

      // CRITICAL: Should NOT throw, should handle failure gracefully
      const result = await engine.run();

      expect(result).toBe('Done after failure');

      // CRITICAL: Failure must be logged for AI to see
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');

      expect(actionResults.length).toBeGreaterThan(0);
      expect(actionResults[0].payload.status).toBe('FAILED');
    });
  });
});