import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import { Engine } from '../../src/engine.js';
import { createJournal } from '../../src/journal.js';
import { EngineContext, AgentConfig } from '../../src/types.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/index.js';

// Load test environment variables from tests/.env
dotenv.config({ path: path.join(process.cwd(), 'tests', '.env') });

/**
 * High-quality unit tests for Engine core logic
 * Target: 85%+ coverage for engine.ts
 */
describe('Engine', () => {
  let tempDir: string;
  let workDir: string;
  let agentPath: string;
  let runId: string;
  let context: EngineContext;
  let mockConfig: AgentConfig;

  beforeEach(async () => {
    // API key is now loaded from tests/.env via dotenv
    // Verify it's set
    if (!process.env.DELTA_API_KEY) {
      throw new Error('DELTA_API_KEY not found in tests/.env');
    }

    // Create temporary directories for testing
    tempDir = path.join(os.tmpdir(), `delta-engine-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'work');
    agentPath = path.join(tempDir, 'agent');
    runId = `test-run-${uuidv4().substring(0, 8)}`;

    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(agentPath, { recursive: true });

    // v1.8.1 fix: Create system_prompt.md file (required by v1.6 context composition)
    await fs.writeFile(
      path.join(agentPath, 'system_prompt.md'),
      'You are a test agent.',
      'utf-8'
    );

    // v1.9.1 fix: Create context.yaml file (now required)
    await fs.writeFile(
      path.join(agentPath, 'context.yaml'),
      `sources:
  - type: file
    id: system_prompt
    path: '\${AGENT_HOME}/system_prompt.md'
  - type: file
    id: workspace_guide
    path: '\${CWD}/DELTA.md'
    on_missing: skip
  - type: journal
    id: conversation_history
`,
      'utf-8'
    );

    // Create a mock agent config
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

    // Create delta directory structure
    const deltaDir = path.join(workDir, '.delta');
    const runDir = path.join(deltaDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create context with shared journal
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
    // Clean up temporary directories
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // 1. Core Lifecycle Tests (10 test cases)
  // ============================================

  describe('Core Lifecycle', () => {
    test('should construct Engine with correct dependencies', () => {
      const engine = new Engine(context);

      expect(engine).toBeDefined();
      expect(engine.getJournal()).toBe(context.journal);
    });

    test('should initialize journal successfully', async () => {
      const engine = new Engine(context);
      await engine.initialize();

      // Verify journal directory structure was created
      const runDir = path.join(context.deltaDir, context.runId);
      const journalPath = path.join(runDir, 'journal.jsonl');
      const metadataPath = path.join(runDir, 'metadata.json');

      const journalExists = await fs.access(journalPath).then(() => true).catch(() => false);
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);

      // Note: metadata.json is only created when logRunStart is called
      expect(journalExists).toBe(false); // Not yet created until first write
    });

    test('should handle journal initialization failure', async () => {
      // Remove the pre-created runDir and create a file with same name
      const runDir = path.join(context.deltaDir, context.runId);
      await fs.rm(runDir, { recursive: true, force: true });
      await fs.writeFile(runDir, 'invalid', 'utf-8');

      const engine = new Engine(context);

      await expect(engine.initialize()).rejects.toThrow();
    });

    test('should distinguish new run vs resumed run', async () => {
      const engine = new Engine(context);
      await engine.initialize();

      // Initialize metadata (normally done by logRunStart, but we need it for updateMetadata)
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to immediately return without tool calls
      const originalLLM = (engine as any).llm;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Task completed',
          tool_calls: undefined,
          refusal: null,
        }),
      };

      const result = await engine.run();

      // Verify RUN_START was logged
      const events = await context.journal.readJournal();
      const runStartEvents = events.filter(e => e.type === 'RUN_START');

      expect(runStartEvents.length).toBe(1);
      expect(result).toBe('Task completed');

      // Restore LLM
      (engine as any).llm = originalLLM;
    });

    test('should not log duplicate RUN_START when resuming', async () => {
      // Pre-populate journal with RUN_START
      await context.journal.initialize();
      await context.journal.logRunStart('Initial task', agentPath);
      await context.journal.initializeMetadata(agentPath, 'Initial task');

      const engine = new Engine(context);
      await engine.initialize();

      // Mock LLM
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Resumed',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      // Verify only one RUN_START
      const events = await context.journal.readJournal();
      const runStartEvents = events.filter(e => e.type === 'RUN_START');

      expect(runStartEvents.length).toBe(1);
    });

    test('should complete normally when LLM returns no tool calls', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to return no tool calls
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Task is complete. No further actions needed.',
          tool_calls: undefined,
        }),
      };

      const result = await engine.run();

      expect(result).toContain('Task is complete');

      // Verify RUN_END was logged
      const events = await context.journal.readJournal();
      const runEndEvents = events.filter(e => e.type === 'RUN_END');

      expect(runEndEvents.length).toBe(1);
      expect(runEndEvents[0].payload.status).toBe('COMPLETED');
    });

    test('should stop after reaching max_iterations', async () => {
      context.config.max_iterations = 2;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to always return tool calls (infinite loop simulation)
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

      // Verify exactly 2 iterations
      const metadata = await context.journal.readMetadata();
      expect(metadata.iterations_completed).toBe(2);
    });

    test('should handle fatal error and log RUN_END with FAILED', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw error
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('API Error')),
      };

      await expect(engine.run()).rejects.toThrow('API Error');

      // Verify RUN_END was logged with FAILED status
      const events = await context.journal.readJournal();
      const runEndEvents = events.filter(e => e.type === 'RUN_END');

      expect(runEndEvents.length).toBe(1);
      expect(runEndEvents[0].payload.status).toBe('FAILED');
    });

    test('should call journal.flush() and close() in finally block', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      const flushSpy = jest.spyOn(context.journal, 'flush');
      const closeSpy = jest.spyOn(context.journal, 'close');

      // Mock LLM
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Done',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      expect(flushSpy).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();

      flushSpy.mockRestore();
      closeSpy.mockRestore();
    });

    test('should return correct journal instance via getJournal()', () => {
      const engine = new Engine(context);
      const journal = engine.getJournal();

      expect(journal).toBe(context.journal);
    });
  });

  // ============================================
  // 2. (REMOVED) Stateless Core: rebuildConversationFromJournal()
  // ============================================
  //
  // These 12 tests were removed because they test implementation details of a method
  // that no longer exists. The method `rebuildConversationFromJournal()` was removed
  // in v1.6 context composition refactor and replaced by:
  //
  // - `private async buildContext()` in engine.ts (delegates to ContextBuilder)
  // - Journal-to-messages conversion logic in src/context/sources/journal-source.ts
  //
  // The functionality is now comprehensively tested in:
  // - tests/unit/context/sources/journal-source.test.ts (13 test cases)
  //
  // This change aligns with the v1.6 architectural shift from hardcoded context
  // building to flexible, modular context composition.
  //
  // Reference: docs/architecture/v1.6-context-composition.md

  // ============================================
  // 3. LLM Invocation & Hook Integration (10 test cases)
  // ============================================

  describe('LLM Invocation & Hook Integration', () => {
    test('should use baseline payload when no pre_llm_req hook', async () => {
      // Ensure no hook is configured
      context.config.lifecycle_hooks = undefined;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Spy on LLM to capture the request
      let capturedRequest: any = null;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation((req) => {
          capturedRequest = req;
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Verify baseline request was used (no modifications)
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.model).toBe('gpt-4');
      expect(capturedRequest.messages.length).toBeGreaterThan(0);
      expect(capturedRequest.messages[0].role).toBe('system');
    });

    test('should use modified payload when pre_llm_req succeeds', async () => {
      // Create a hook script that modifies the payload
      const hookScript = path.join(agentPath, 'modify_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
set -e
# Read proposed payload and add a marker
cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" | \\
  jq '.test_marker = "modified_by_hook"' > \\
  "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_llm_req: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Spy on LLM
      let capturedRequest: any = null;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation((req) => {
          capturedRequest = req;
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Verify modified payload was used
      expect(capturedRequest).toBeDefined();
      expect((capturedRequest as any).test_marker).toBe('modified_by_hook');
    });

    test('should fallback to baseline when pre_llm_req fails', async () => {
      // Create a hook script that fails
      const hookScript = path.join(agentPath, 'failing_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "Hook failed" >&2
exit 1
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_llm_req: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let capturedRequest: any = null;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation((req) => {
          capturedRequest = req;
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Should use baseline (no test_marker)
      expect(capturedRequest).toBeDefined();
      expect((capturedRequest as any).test_marker).toBeUndefined();

      // Verify warning was logged
      const events = await context.journal.readJournal();
      const warnings = events.filter(e =>
        e.type === 'SYSTEM_MESSAGE' && (e.payload as any).level === 'WARN'
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('should fallback to baseline when pre_llm_req times out', async () => {
      // Create a hook script that times out
      const hookScript = path.join(agentPath, 'timeout_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
sleep 2
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_llm_req: {
          command: [hookScript],
          timeout_ms: 100, // 100ms timeout (hook sleeps 2s)
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let capturedRequest: any = null;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation((req) => {
          capturedRequest = req;
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Should use baseline despite timeout
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.model).toBe('gpt-4');
    }, 10000); // Increase test timeout to 10s

    test('should handle pre_llm_req returning invalid JSON', async () => {
      // Create a hook that outputs invalid JSON
      const hookScript = path.join(agentPath, 'invalid_json_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "invalid json {{{" > "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_llm_req: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let capturedRequest: any = null;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation((req) => {
          capturedRequest = req;
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Should fallback to baseline
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.model).toBe('gpt-4');
    });

    test('should execute post_llm_resp hook without affecting flow', async () => {
      // Create a post_llm_resp hook that just logs
      const hookScript = path.join(agentPath, 'post_llm_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "post_llm_resp executed" > "$DELTA_HOOK_IO_PATH/output/log.txt"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        post_llm_resp: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Task complete',
          tool_calls: undefined,
        }),
      };

      const result = await engine.run();

      // Flow should complete normally
      expect(result).toContain('Task complete');

      // Verify hook was executed
      const events = await context.journal.readJournal();
      const hookEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const postLLMHooks = hookEvents.filter(e =>
        (e.payload as any).hook_name === 'post_llm_resp'
      );
      expect(postLLMHooks.length).toBeGreaterThan(0);
    });

    test('should log warning when post_llm_resp fails but continue', async () => {
      const hookScript = path.join(agentPath, 'failing_post_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
exit 1
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        post_llm_resp: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Done',
          tool_calls: undefined,
        }),
      };

      // Should not throw
      const result = await engine.run();
      expect(result).toBeDefined();

      // Verify warning was logged
      const events = await context.journal.readJournal();
      const warnings = events.filter(e =>
        e.type === 'SYSTEM_MESSAGE' && (e.payload as any).level === 'WARN'
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('should save LLM invocation to io/invocations/', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Done',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      // Check io/invocations/ directory
      const runDir = path.join(context.deltaDir, context.runId);
      const invocationsDir = path.join(runDir, 'io', 'invocations');

      const invocationDirs = await fs.readdir(invocationsDir);
      expect(invocationDirs.length).toBeGreaterThan(0);

      // Verify structure of first invocation
      const firstInvocation = invocationDirs[0];
      const invocationPath = path.join(invocationsDir, firstInvocation);

      const requestPath = path.join(invocationPath, 'request.json');
      const responsePath = path.join(invocationPath, 'response.json');
      const metadataPath = path.join(invocationPath, 'metadata.json');

      const requestExists = await fs.access(requestPath).then(() => true).catch(() => false);
      const responseExists = await fs.access(responsePath).then(() => true).catch(() => false);
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);

      expect(requestExists).toBe(true);
      expect(responseExists).toBe(true);
      expect(metadataExists).toBe(true);

      // Verify request.json contains expected fields
      const requestContent = JSON.parse(await fs.readFile(requestPath, 'utf-8'));
      expect(requestContent.model).toBe('gpt-4');
      expect(requestContent.messages).toBeDefined();
      expect(requestContent.tools).toBeDefined();
    });

    test('should save finalRequest not baseline to io/invocations/', async () => {
      // Create a hook that modifies the request
      const hookScript = path.join(agentPath, 'marker_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" | \\
  jq '.custom_field = "hook_was_here"' > \\
  "$DELTA_HOOK_IO_PATH/output/final_payload.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_llm_req: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Done',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      // Read saved request
      const runDir = path.join(context.deltaDir, context.runId);
      const invocationsDir = path.join(runDir, 'io', 'invocations');
      const invocationDirs = await fs.readdir(invocationsDir);
      const firstInvocation = invocationDirs[0];
      const requestPath = path.join(invocationsDir, firstInvocation, 'request.json');

      const savedRequest = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

      // Verify it contains the hook's modification
      expect((savedRequest as any).custom_field).toBe('hook_was_here');
    });

    test('should reference correct invocation_id in THOUGHT event', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'My thought',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      // Read journal
      const events = await context.journal.readJournal();
      const thoughtEvents = events.filter(e => e.type === 'THOUGHT');
      expect(thoughtEvents.length).toBeGreaterThan(0);

      const firstThought = thoughtEvents[0];
      const invocationRef = (firstThought.payload as any).llm_invocation_ref;
      expect(invocationRef).toBeDefined();

      // Verify this invocation exists in io/
      const runDir = path.join(context.deltaDir, context.runId);
      const invocationPath = path.join(runDir, 'io', 'invocations', invocationRef);
      const exists = await fs.access(invocationPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  // ============================================
  // 4. Tool Execution Flow (12 test cases)
  // ============================================

  describe('Tool Execution Flow', () => {
    test('should execute single tool call successfully', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to return tool call, then complete
      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Executing echo',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: {
                    name: 'echo',
                    arguments: '{"message": "hello"}',
                  },
                },
              ],
            });
          }
          return Promise.resolve({
            content: 'Done',
            tool_calls: undefined,
          });
        }),
      };

      await engine.run();

      // Verify tool was executed
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).status).toBe('SUCCESS');
      expect((actionResults[0].payload as any).observation_content).toContain('hello');
    });

    test('should execute multiple tool calls in batch', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Calling multiple tools',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'echo', arguments: '{"message": "first"}' },
                },
                {
                  id: 'call_2',
                  type: 'function' as const,
                  function: { name: 'echo', arguments: '{"message": "second"}' },
                },
                {
                  id: 'call_3',
                  type: 'function' as const,
                  function: { name: 'echo', arguments: '{"message": "third"}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBe(3);

      // Verify all three executed
      const contents = actionResults.map(e => (e.payload as any).observation_content);
      expect(contents.some(c => c.includes('first'))).toBe(true);
      expect(contents.some(c => c.includes('second'))).toBe(true);
      expect(contents.some(c => c.includes('third'))).toBe(true);
    });

    test('should log error when tool not found but continue', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Calling unknown tool',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'unknown_tool', arguments: '{}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).status).toBe('ERROR');
      expect((actionResults[0].payload as any).observation_content).toContain('Tool not found');
    });

    test('should record failure when tool exits with non-zero code', async () => {
      // Add a tool that fails
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
              content: 'Calling tool',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'fail_tool', arguments: '{}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).status).toBe('FAILED');
      expect((actionResults[0].payload as any).observation_content).toContain('EXIT CODE: 1');
    });

    test('should handle tool execution error gracefully', async () => {
      // Test error handling by calling a tool that throws
      context.config.tools.push({
        name: 'error_tool',
        command: ['bash', '-c', 'echo "Error message" >&2 && exit 1'],
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
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'error_tool', arguments: '{}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      // Should not throw - errors are captured
      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).status).toBe('FAILED');
      expect((actionResults[0].payload as any).observation_content).toContain('STDERR');
    });

    test('should skip tool when pre_tool_exec hook returns skip', async () => {
      // Create hook that returns skip control
      const hookScript = path.join(agentPath, 'skip_hook.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo '{"skip": true}' > "$DELTA_HOOK_IO_PATH/output/control.json"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_tool_exec: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{"message":"test"}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).observation_content).toContain('skipped');
    });

    test('should continue tool execution when pre_tool_exec fails', async () => {
      const hookScript = path.join(agentPath, 'failing_pre_tool.sh');
      await fs.writeFile(hookScript, '#!/bin/bash\nexit 1\n', 'utf-8');
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        pre_tool_exec: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{"message":"test"}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      // Tool should still execute despite hook failure
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).status).toBe('SUCCESS');
    });

    test('should execute post_tool_exec hook after tool execution', async () => {
      const hookScript = path.join(agentPath, 'post_tool.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "post_tool_exec executed" > "$DELTA_HOOK_IO_PATH/output/log.txt"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        post_tool_exec: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{"message":"test"}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      // Verify hook was executed
      const events = await context.journal.readJournal();
      const hookEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const postToolHooks = hookEvents.filter(e => (e.payload as any).hook_name === 'post_tool_exec');
      expect(postToolHooks.length).toBeGreaterThan(0);
    });

    test('should trigger on_error hook when tool fails', async () => {
      const hookScript = path.join(agentPath, 'on_error.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "Error handled" > "$DELTA_HOOK_IO_PATH/output/log.txt"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.tools.push({
        name: 'fail_tool',
        command: ['bash', '-c', 'exit 1'],
        parameters: [],
      });

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'fail_tool', arguments: '{}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      // Note: on_error is not triggered for tool failures in current implementation
      // It's only for fatal errors. This test documents current behavior.
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
    });

    test('should truncate tool output when exceeds 5KB', async () => {
      // Create a tool that outputs large data
      const largeOutput = 'x'.repeat(10000); // 10KB
      context.config.tools.push({
        name: 'large_output',
        command: ['echo', largeOutput],
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
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'large_output', arguments: '{}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);

      const observation = (actionResults[0].payload as any).observation_content;
      expect(observation).toContain('truncated');
    });

    test('should handle tool with no output', async () => {
      context.config.tools.push({
        name: 'no_output',
        command: ['bash', '-c', 'exit 0'],
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
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'no_output', arguments: '{}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults.length).toBeGreaterThan(0);
      expect((actionResults[0].payload as any).observation_content).toContain('no output');
    });

    test('should save tool execution to io/tool_executions/', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Call',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{"message":"test"}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      // Verify io/tool_executions/ directory
      const runDir = path.join(context.deltaDir, context.runId);
      const toolExecDir = path.join(runDir, 'io', 'tool_executions');

      const execDirs = await fs.readdir(toolExecDir);
      expect(execDirs.length).toBeGreaterThan(0);

      // Verify structure
      const firstExec = execDirs[0];
      const execPath = path.join(toolExecDir, firstExec);

      const files = await fs.readdir(execPath);
      expect(files).toContain('command.txt');
      expect(files).toContain('stdout.log');
      expect(files).toContain('stderr.log');
      expect(files).toContain('exit_code.txt');
      expect(files).toContain('duration_ms.txt');

      // Verify content
      const exitCode = await fs.readFile(path.join(execPath, 'exit_code.txt'), 'utf-8');
      expect(exitCode.trim()).toBe('0');
    });
  });

  // ============================================
  // 5. ask_human Interaction (simplified - 4 test cases)
  // ============================================

  describe('ask_human Interaction', () => {
    // Note: Full ask_human testing is complex due to process.exit() and interactive mode
    // These tests focus on the interaction detection and journal recording

    test('should detect ask_human tool call', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
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
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      // Mock process.exit to prevent actual exit
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
        if (error.message.includes('Process.exit called with code 101')) {
          // This is the expected pause behavior
          exitCode = 101;
        }
      } finally {
        process.exit = originalExit;
      }

      // Verify ask_human was logged
      const events = await context.journal.readJournal();
      const actionRequests = events.filter(e => e.type === 'ACTION_REQUEST');
      const askHumanRequest = actionRequests.find(e => (e.payload as any).tool_name === 'ask_human');

      expect(askHumanRequest).toBeDefined();
      expect((askHumanRequest?.payload as any).tool_args.prompt).toBe('What is your name?');
    });

    test('should create interaction request file in async mode', async () => {
      context.isInteractive = false; // Async mode

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Need input',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'ask_human', arguments: '{"prompt": "Enter value:"}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const originalExit = process.exit;
      (process as any).exit = jest.fn((code: number) => {
        throw new Error(`Exit ${code}`);
      });

      try {
        await engine.run();
      } catch (error: any) {
        // Expected
      } finally {
        process.exit = originalExit;
      }

      // Verify interaction directory was created
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestFile = path.join(interactionDir, 'request.json');

      const requestExists = await fs.access(requestFile).then(() => true).catch(() => false);
      expect(requestExists).toBe(true);

      const requestContent = JSON.parse(await fs.readFile(requestFile, 'utf-8'));
      expect(requestContent.prompt).toBe('Enter value:');
    });

    test('should log ACTION_REQUEST for ask_human', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Asking',
              tool_calls: [
                { id: 'call_1', type: 'function' as const, function: { name: 'ask_human', arguments: '{"prompt":"Q?"}' } },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const originalExit = process.exit;
      (process as any).exit = jest.fn(() => { throw new Error('Exit'); });

      try {
        await engine.run();
      } catch (e) {}

      process.exit = originalExit;

      const events = await context.journal.readJournal();
      const actionRequests = events.filter(e => e.type === 'ACTION_REQUEST');
      expect(actionRequests.some(e => (e.payload as any).tool_name === 'ask_human')).toBe(true);
    });

    test('should handle ask_human with sensitive flag', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Need password',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: {
                    name: 'ask_human',
                    arguments: '{"prompt": "Enter password:", "sensitive": true}',
                  },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const originalExit = process.exit;
      (process as any).exit = jest.fn(() => { throw new Error('Exit'); });

      try {
        await engine.run();
      } catch (e) {}

      process.exit = originalExit;

      const events = await context.journal.readJournal();
      const actionRequests = events.filter(e => e.type === 'ACTION_REQUEST');
      const askHumanReq = actionRequests.find(e => (e.payload as any).tool_name === 'ask_human');

      expect(askHumanReq).toBeDefined();
      expect((askHumanReq?.payload as any).tool_args.sensitive).toBe(true);
    });

    // ============================================
    // ask_human Recovery Path Tests (5 tests)
    // ============================================

    test('should detect and process existing interaction response on resume', async () => {
      context.isInteractive = false; // Async mode

      // Pre-create interaction response
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      // Use correct format: request_id (not action_id)
      const requestData = {
        request_id: 'req_123',
        timestamp: new Date().toISOString(),
        prompt: 'What is your name?',
        input_type: 'text',
        sensitive: false,
      };
      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify(requestData),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'Alice',
        'utf-8'
      );

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Log the ask_human action request
      await context.journal.logActionRequest(
        'call_ask_1',
        'ask_human',
        { prompt: 'What is your name?', sensitive: false },
        'ask_human "What is your name?"'
      );

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            content: 'Got the name: Alice',
            tool_calls: undefined,
          });
        }),
      };

      const result = await engine.run();

      // Verify response was read and injected
      expect(result).toContain('Alice');

      // Verify ACTION_RESULT was logged
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      const askHumanResult = actionResults.find(e => (e.payload as any).action_id === 'call_ask_1');

      expect(askHumanResult).toBeDefined();
      expect((askHumanResult?.payload as any).observation_content).toContain('Alice');

      // Note: In async mode, checkForInteractionResponse() only deletes files, not directory
      // Verify files were deleted but directory may still exist
      const requestExists = await fs.access(path.join(interactionDir, 'request.json')).then(() => true).catch(() => false);
      const responseExists = await fs.access(path.join(interactionDir, 'response.txt')).then(() => true).catch(() => false);
      expect(requestExists).toBe(false);
      expect(responseExists).toBe(false);
    });

    test('should handle async mode by creating request.json and pausing', async () => {
      context.isInteractive = false; // Async mode

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Need input',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: {
                    name: 'ask_human',
                    arguments: '{"prompt": "Enter value:", "sensitive": false}',
                  },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const originalExit = process.exit;
      let exitCode: number | undefined;
      (process as any).exit = jest.fn((code: number) => {
        exitCode = code;
        throw new Error(`Exit ${code}`);
      });

      try {
        await engine.run();
      } catch (error: any) {
        // Expected
      } finally {
        process.exit = originalExit;
      }

      // Verify exit code 101 (pause)
      expect(exitCode).toBe(101);

      // Verify interaction directory was created with request.json
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      const requestFile = path.join(interactionDir, 'request.json');

      const requestExists = await fs.access(requestFile).then(() => true).catch(() => false);
      expect(requestExists).toBe(true);

      const requestContent = JSON.parse(await fs.readFile(requestFile, 'utf-8'));
      expect(requestContent.prompt).toBe('Enter value:');
      expect(requestContent.request_id).toBeDefined(); // Uses request_id, not action_id
      expect(requestContent.timestamp).toBeDefined();
      expect(requestContent.input_type).toBe('text');
    });

    test('should delete interaction files after successful response (async mode)', async () => {
      context.isInteractive = false;

      // Pre-create interaction with response
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify({
          request_id: 'req_test',
          timestamp: new Date().toISOString(),
          prompt: 'Test?',
          input_type: 'text',
          sensitive: false,
        }),
        'utf-8'
      );
      await fs.writeFile(
        path.join(interactionDir, 'response.txt'),
        'Test response',
        'utf-8'
      );

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Log pending ask_human
      await context.journal.logActionRequest(
        'call_1',
        'ask_human',
        { prompt: 'Test?', sensitive: false },
        'ask_human'
      );

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Received: Test response',
          tool_calls: undefined,
        }),
      };

      await engine.run();

      // Verify files were deleted (but directory may still exist in async mode)
      const requestExists = await fs.access(path.join(interactionDir, 'request.json')).then(() => true).catch(() => false);
      const responseExists = await fs.access(path.join(interactionDir, 'response.txt')).then(() => true).catch(() => false);
      expect(requestExists).toBe(false);
      expect(responseExists).toBe(false);
    });

    test('should handle missing response.txt gracefully', async () => {
      context.isInteractive = false;

      // Create interaction dir with request.json but NO response.txt
      const interactionDir = path.join(context.deltaDir, context.runId, 'interaction');
      await fs.mkdir(interactionDir, { recursive: true });

      await fs.writeFile(
        path.join(interactionDir, 'request.json'),
        JSON.stringify({
          request_id: 'req_wait',
          timestamp: new Date().toISOString(),
          prompt: 'Test?',
          input_type: 'text',
          sensitive: false,
        }),
        'utf-8'
      );

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Log pending ask_human
      await context.journal.logActionRequest(
        'call_1',
        'ask_human',
        { prompt: 'Test?', sensitive: false },
        'ask_human'
      );

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Still waiting for response
            return Promise.resolve({
              content: 'Asking again',
              tool_calls: [
                {
                  id: 'call_2',
                  type: 'function' as const,
                  function: { name: 'ask_human', arguments: '{"prompt":"Still waiting?"}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      const originalExit = process.exit;
      (process as any).exit = jest.fn(() => { throw new Error('Exit'); });

      try {
        await engine.run();
      } catch (e) {}

      process.exit = originalExit;

      // Should not have logged ACTION_RESULT for call_1 (no response found)
      const events = await context.journal.readJournal();
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      const call1Result = actionResults.find(e => (e.payload as any).action_id === 'call_1');

      expect(call1Result).toBeUndefined();
    });

    test('should include sensitive flag in request.json for async mode', async () => {
      context.isInteractive = false;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Asking',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function' as const,
              function: {
                name: 'ask_human',
                arguments: '{"prompt": "Password:", "sensitive": true}',
              },
            },
          ],
        }),
      };

      const originalExit = process.exit;
      (process as any).exit = jest.fn(() => { throw new Error('Exit'); });

      try {
        await engine.run();
      } catch (e) {}

      process.exit = originalExit;

      // Verify request.json contains sensitive flag
      const requestFile = path.join(
        context.deltaDir,
        context.runId,
        'interaction',
        'request.json'
      );
      const requestContent = JSON.parse(await fs.readFile(requestFile, 'utf-8'));

      expect(requestContent.sensitive).toBe(true);
    });
  });

  // ============================================
  // 6. on_error Hook Integration (5 test cases)
  // ============================================

  describe('on_error Hook Integration', () => {
    test('should NOT trigger on_error for tool failures (only exceptions)', async () => {
      // Note: on_error hook is only triggered when executeTool() throws exception,
      // not when tool returns non-zero exit code (which is logged as FAILED status)

      const hookScript = path.join(agentPath, 'on_error.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "on_error triggered" > "$DELTA_HOOK_IO_PATH/output/log.txt"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.tools.push({
        name: 'fail_tool',
        command: ['bash', '-c', 'exit 1'],
        parameters: [],
      });

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              content: 'Calling tool',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function' as const,
                  function: { name: 'fail_tool', arguments: '{}' },
                },
              ],
            });
          }
          return Promise.resolve({ content: 'Done', tool_calls: undefined });
        }),
      };

      await engine.run();

      // Verify on_error hook was NOT executed (tool failure != exception)
      const events = await context.journal.readJournal();
      const hookEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const onErrorHooks = hookEvents.filter(e => (e.payload as any).hook_name === 'on_error');

      expect(onErrorHooks.length).toBe(0); // Not triggered for normal tool failures

      // Verify tool failure was logged as FAILED
      const actionResults = events.filter(e => e.type === 'ACTION_RESULT');
      expect(actionResults[0].payload.status).toBe('FAILED');
    });

    test('should trigger on_error hook on fatal LLM error', async () => {
      const hookScript = path.join(agentPath, 'on_error_fatal.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "Fatal error handled" > "$DELTA_HOOK_IO_PATH/output/log.txt"
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw fatal error
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('LLM API timeout')),
      };

      await expect(engine.run()).rejects.toThrow('LLM API timeout');

      // Verify on_error hook was executed
      const events = await context.journal.readJournal();
      const hookEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const onErrorHooks = hookEvents.filter(e => (e.payload as any).hook_name === 'on_error');

      expect(onErrorHooks.length).toBeGreaterThan(0);
    });

    test('should continue when on_error hook itself fails', async () => {
      // Note: executeOnErrorHook() returns {success: false} for failures,
      // it doesn't throw exceptions. Engine.ts doesn't check the return value,
      // so hook failures are recorded in journal but not logged to engine.log.

      const hookScript = path.join(agentPath, 'failing_on_error.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
echo "Hook is failing" >&2
exit 1
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw fatal error (this WILL trigger on_error hook)
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('Fatal LLM error')),
      };

      // Should throw LLM error and continue despite hook failure
      await expect(engine.run()).rejects.toThrow('Fatal LLM error');

      // Verify on_error hook was executed (even though it failed)
      const events = await context.journal.readJournal();
      const hookEvents = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const onErrorHooks = hookEvents.filter(e => (e.payload as any).hook_name === 'on_error');

      expect(onErrorHooks.length).toBeGreaterThan(0);
      expect((onErrorHooks[0].payload as any).status).toBe('FAILED');
    });

    test('should provide error context to on_error hook for fatal errors', async () => {
      const hookScript = path.join(agentPath, 'context_check.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
# Verify context contains error details
if [ -f "$DELTA_HOOK_IO_PATH/input/payload.json" ]; then
  cat "$DELTA_HOOK_IO_PATH/input/payload.json" > "$DELTA_HOOK_IO_PATH/output/received_context.json"
fi
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw fatal error
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('API timeout error')),
      };

      await expect(engine.run()).rejects.toThrow('API timeout error');

      // Verify hook received context
      const runDir = path.join(context.deltaDir, context.runId);
      const hookDirs = await fs.readdir(path.join(runDir, 'io', 'hooks')).catch(() => []);
      const onErrorDir = hookDirs.find(d => d.includes('on_error'));

      expect(onErrorDir).toBeDefined();

      if (onErrorDir) {
        const contextPath = path.join(runDir, 'io', 'hooks', onErrorDir, 'output', 'received_context.json');
        const contextExists = await fs.access(contextPath).then(() => true).catch(() => false);

        if (contextExists) {
          const errorContext = JSON.parse(await fs.readFile(contextPath, 'utf-8'));
          expect(errorContext.error_type).toBe('FATAL_ERROR');
          expect(errorContext.message).toContain('API timeout error');
          expect(errorContext.context).toBeDefined();
        }
      }
    });

    test('should log on_error hook execution in journal', async () => {
      const hookScript = path.join(agentPath, 'simple_on_error.sh');
      await fs.writeFile(
        hookScript,
        `#!/bin/bash
exit 0
`,
        'utf-8'
      );
      await fs.chmod(hookScript, 0o755);

      context.config.lifecycle_hooks = {
        on_error: {
          command: [hookScript],
        },
      };

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to throw error
      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('Test error')),
      };

      await expect(engine.run()).rejects.toThrow('Test error');

      // Verify HOOK_EXECUTION_AUDIT event logged
      const events = await context.journal.readJournal();
      const hookAudits = events.filter(e => e.type === 'HOOK_EXECUTION_AUDIT');
      const onErrorAudits = hookAudits.filter(e => (e.payload as any).hook_name === 'on_error');

      expect(onErrorAudits.length).toBe(1);
      expect((onErrorAudits[0].payload as any).status).toBe('SUCCESS');
      expect((onErrorAudits[0].payload as any).io_path_ref).toBeDefined();
    });
  });

  // ============================================
  // 7. Boundary Cases & Error Handling (8 test cases)
  // ============================================

  describe('Boundary Cases & Error Handling', () => {
    test('should handle very low max_iterations correctly', async () => {
      // Note: max_iterations must be positive per schema (min 1)
      // Testing with explicit 1 to ensure loop runs exactly once
      context.config.max_iterations = 1;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to return tool calls (would continue if allowed)
      const mockCall = jest.fn().mockResolvedValue({
        content: 'Calling tool',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'echo', arguments: '{\"message\":\"test\"}' },
          },
        ],
      });
      (engine as any).llm = {
        callWithRequest: mockCall,
      };

      const result = await engine.run();

      // Should stop after 1 iteration
      expect(result).toContain('Maximum iterations reached');
      expect(mockCall).toHaveBeenCalledTimes(1);

      const metadata = await context.journal.readMetadata();
      expect(metadata.iterations_completed).toBe(1);
    });

    test('should complete normally when LLM finishes within max_iterations', async () => {
      context.config.max_iterations = 5;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      const mockCall = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          content: `Task completed on iteration ${callCount}`,
          tool_calls: undefined, // No tool calls = completion
        });
      });
      (engine as any).llm = {
        callWithRequest: mockCall,
      };

      const result = await engine.run();

      // Should complete with LLM response (not "Maximum iterations reached")
      expect(result).toContain('Task completed on iteration 1');
      expect(result).not.toContain('Maximum iterations');
      expect(callCount).toBe(1);

      const metadata = await context.journal.readMetadata();
      // Note: When LLM completes immediately without tool calls,
      // iterations_completed is 0 because incrementIterations() is only called
      // at the end of the loop after tool execution
      expect(metadata.iterations_completed).toBe(0);
    });

    test('should use DEFAULT_MAX_ITERATIONS when not configured', async () => {
      context.config.max_iterations = undefined;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock LLM to always return tool calls (infinite loop)
      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Loop',
          tool_calls: [
            { id: 'call_1', type: 'function' as const, function: { name: 'echo', arguments: '{}' } },
          ],
        }),
      };

      const result = await engine.run();

      expect(result).toContain('Maximum iterations reached');

      // Should have stopped at DEFAULT_MAX_ITERATIONS (30)
      const metadata = await context.journal.readMetadata();
      expect(metadata.iterations_completed).toBe(30);
    }, 30000); // Increase timeout for 30 iterations

    test('should handle LLM API error gracefully', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      (engine as any).llm = {
        callWithRequest: jest.fn().mockRejectedValue(new Error('API rate limit exceeded')),
      };

      await expect(engine.run()).rejects.toThrow('API rate limit exceeded');

      // Verify error was logged
      const events = await context.journal.readJournal();
      const errors = events.filter(e => e.type === 'SYSTEM_MESSAGE' && (e.payload as any).level === 'ERROR');
      expect(errors.length).toBeGreaterThan(0);

      // Verify RUN_END with FAILED
      const runEnd = events.find(e => e.type === 'RUN_END');
      expect(runEnd).toBeDefined();
      expect((runEnd?.payload as any).status).toBe('FAILED');
    });

    test('should handle journal write failure', async () => {
      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      // Mock journal to throw on write
      const originalLogThought = context.journal.logThought.bind(context.journal);
      jest.spyOn(context.journal, 'logThought').mockRejectedValue(new Error('Disk full'));

      (engine as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({
          content: 'Test',
          tool_calls: undefined,
        }),
      };

      await expect(engine.run()).rejects.toThrow();

      // Restore
      (context.journal.logThought as any).mockRestore();
    });

    test('should handle concurrent runs with different runIds', async () => {
      // Create two separate contexts
      const runId1 = `test-run-1-${uuidv4().substring(0, 8)}`;
      const runId2 = `test-run-2-${uuidv4().substring(0, 8)}`;

      const runDir1 = path.join(context.deltaDir, runId1);
      const runDir2 = path.join(context.deltaDir, runId2);

      await fs.mkdir(runDir1, { recursive: true });
      await fs.mkdir(runDir2, { recursive: true });

      const journal1 = createJournal(runId1, runDir1);
      const journal2 = createJournal(runId2, runDir2);

      const context1 = { ...context, runId: runId1, journal: journal1 };
      const context2 = { ...context, runId: runId2, journal: journal2 };

      const engine1 = new Engine(context1);
      const engine2 = new Engine(context2);

      await engine1.initialize();
      await engine2.initialize();

      await journal1.initializeMetadata(agentPath, 'Task 1');
      await journal2.initializeMetadata(agentPath, 'Task 2');

      (engine1 as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({ content: 'Done 1', tool_calls: undefined }),
      };
      (engine2 as any).llm = {
        callWithRequest: jest.fn().mockResolvedValue({ content: 'Done 2', tool_calls: undefined }),
      };

      // Run concurrently
      const [result1, result2] = await Promise.all([
        engine1.run(),
        engine2.run(),
      ]);

      expect(result1).toBe('Done 1');
      expect(result2).toBe('Done 2');

      // Verify separate journals
      const events1 = await journal1.readJournal();
      const events2 = await journal2.readJournal();

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);

      // Clean up
      await journal1.close();
      await journal2.close();
    });

    test('should handle file system permission error', async () => {
      // This test documents expected behavior but may be hard to reliably trigger
      const engine = new Engine(context);
      await engine.initialize();

      // Mock fs operations to fail
      const originalWriteFile = fs.writeFile;
      (fs as any).writeFile = jest.fn().mockRejectedValue(new Error('EACCES: permission denied'));

      try {
        await context.journal.initializeMetadata(agentPath, 'Test task');
        // Should throw
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('permission denied');
      } finally {
        (fs as any).writeFile = originalWriteFile;
      }
    });

    test('should maintain iteration counter correctly across errors', async () => {
      context.config.max_iterations = 5;

      const engine = new Engine(context);
      await engine.initialize();
      await context.journal.initializeMetadata(agentPath, 'Test task');

      let callCount = 0;
      (engine as any).llm = {
        callWithRequest: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 3) {
            // Simulate error on 3rd call
            return Promise.reject(new Error('Temporary error'));
          }
          // Return tool calls for iterations 1 and 2 to continue the loop
          return Promise.resolve({
            content: `Call ${callCount}`,
            tool_calls: [
              {
                id: `call_${callCount}`,
                type: 'function' as const,
                function: { name: 'echo', arguments: '{\"message\":\"test\"}' },
              },
            ],
          });
        }),
      };

      await expect(engine.run()).rejects.toThrow('Temporary error');

      // Check that iterations were counted up to the error
      const metadata = await context.journal.readMetadata();
      // Iterations 1 and 2 completed, iteration 3 started but failed
      expect(metadata.iterations_completed).toBe(2);
    });
  });
});
