import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  executeTool,
  buildCommandAndStdin,
  replaceVariables,
  validateRequiredParameters,
  formatExecutionResult,
} from '../src/executor.js';
import {
  EngineContext,
  ToolDefinition,
  InjectionType,
  AgentConfig,
} from '../src/types.js';

describe('ToolExecutor', () => {
  let tempDir: string;
  let workDir: string;
  let agentPath: string;
  let context: EngineContext;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = path.join(os.tmpdir(), `delta-engine-test-${uuidv4()}`);
    workDir = path.join(tempDir, 'work');
    agentPath = path.join(tempDir, 'agent');

    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(agentPath, { recursive: true });

    // Create a mock context
    const mockConfig: AgentConfig = {
      name: 'test-agent',
      version: '1.0.0',
      llm: {
        model: 'gpt-4',
        temperature: 0.7,
      },
      tools: [],
      max_iterations: 10,
    };

    context = {
      runId: uuidv4(),
      agentPath,
      workDir,
      config: mockConfig,
      systemPrompt: 'Test prompt',
      initialTask: 'Test task',
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

  describe('buildCommandAndStdin', () => {
    it('should correctly handle Argument injection', () => {
      const toolDef: ToolDefinition = {
        name: 'echo-tool',
        command: ['echo'],
        parameters: [
          {
            name: 'message',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const params = { message: 'Hello World' };
      const { args, stdinInput } = buildCommandAndStdin(toolDef, params);

      expect(args).toEqual(['Hello World']);
      expect(stdinInput).toBe('');
    });

    it('should correctly handle Option injection', () => {
      const toolDef: ToolDefinition = {
        name: 'grep-tool',
        command: ['grep'],
        parameters: [
          {
            name: 'pattern',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '--pattern',
          },
        ],
      };

      const params = { pattern: 'test' };
      const { args, stdinInput } = buildCommandAndStdin(toolDef, params);

      expect(args).toEqual(['--pattern', 'test']);
      expect(stdinInput).toBe('');
    });

    it('should correctly handle Stdin injection', () => {
      const toolDef: ToolDefinition = {
        name: 'cat-tool',
        command: ['cat'],
        parameters: [
          {
            name: 'content',
            type: 'string',
            inject_as: InjectionType.Stdin,
          },
        ],
      };

      const params = { content: 'Input via stdin' };
      const { args, stdinInput } = buildCommandAndStdin(toolDef, params);

      expect(args).toEqual([]);
      expect(stdinInput).toBe('Input via stdin');
    });

    it('should handle multiple parameters with different injection types', () => {
      const toolDef: ToolDefinition = {
        name: 'complex-tool',
        command: ['tool'],
        parameters: [
          {
            name: 'opt1',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '--option1',
          },
          {
            name: 'arg1',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
          {
            name: 'input',
            type: 'string',
            inject_as: InjectionType.Stdin,
          },
        ],
      };

      const params = {
        opt1: 'value1',
        arg1: 'argument1',
        input: 'stdin content',
      };

      const { args, stdinInput } = buildCommandAndStdin(toolDef, params);

      expect(args).toEqual(['--option1', 'value1', 'argument1']);
      expect(stdinInput).toBe('stdin content');
    });

    it('should skip undefined parameters', () => {
      const toolDef: ToolDefinition = {
        name: 'optional-tool',
        command: ['tool'],
        parameters: [
          {
            name: 'param1',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
          {
            name: 'param2',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const params = { param1: 'value1' }; // param2 is missing
      const { args, stdinInput } = buildCommandAndStdin(toolDef, params);

      expect(args).toEqual(['value1']);
      expect(stdinInput).toBe('');
    });
  });

  describe('replaceVariables', () => {
    it('should replace ${AGENT_HOME} with agent path', () => {
      const items = [
        '${AGENT_HOME}/bin/tool',
        '--config',
        '${AGENT_HOME}/config.yaml',
        'plain-text',
      ];

      const result = replaceVariables(items, '/path/to/agent');

      expect(result).toEqual([
        '/path/to/agent/bin/tool',
        '--config',
        '/path/to/agent/config.yaml',
        'plain-text',
      ]);
    });

    it('should handle multiple ${AGENT_HOME} in single item', () => {
      const items = ['${AGENT_HOME}/a/${AGENT_HOME}/b'];
      const result = replaceVariables(items, '/agent');

      expect(result).toEqual(['/agent/a//agent/b']);
    });

    it('should return unchanged items if no variables present', () => {
      const items = ['echo', 'hello', 'world'];
      const result = replaceVariables(items, '/agent');

      expect(result).toEqual(['echo', 'hello', 'world']);
    });
  });

  describe('executeTool', () => {
    it('should execute command successfully with correct CWD', async () => {
      const toolDef: ToolDefinition = {
        name: 'pwd-tool',
        command: ['pwd'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      // On macOS, /tmp is a symlink to /private/tmp, so paths may differ
      expect(result.stdout.trim()).toContain(path.basename(workDir));
      expect(result.stderr).toBe('');
    });

    it('should pass arguments correctly', async () => {
      const toolDef: ToolDefinition = {
        name: 'echo-tool',
        command: ['echo'],
        parameters: [
          {
            name: 'message',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const params = { message: 'Test Message' };
      const result = await executeTool(context, toolDef, params);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Test Message');
    });

    it('should pass stdin correctly', async () => {
      const toolDef: ToolDefinition = {
        name: 'cat-tool',
        command: ['cat'],
        parameters: [
          {
            name: 'content',
            type: 'string',
            inject_as: InjectionType.Stdin,
          },
        ],
      };

      const params = { content: 'Content via stdin\nLine 2' };
      const result = await executeTool(context, toolDef, params);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Content via stdin\nLine 2');
    });

    it('should handle command with options', async () => {
      const toolDef: ToolDefinition = {
        name: 'ls-tool',
        command: ['ls'],
        parameters: [
          {
            name: 'all',
            type: 'string',
            inject_as: InjectionType.Option,
            option_name: '-la',
          },
        ],
      };

      const params = { all: workDir };
      const result = await executeTool(context, toolDef, params);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should replace ${AGENT_HOME} in command', async () => {
      // Create a test script in agent directory
      const scriptPath = path.join(agentPath, 'test.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Agent script executed"', 'utf-8');
      await fs.chmod(scriptPath, 0o755);

      const toolDef: ToolDefinition = {
        name: 'agent-script',
        command: ['${AGENT_HOME}/test.sh'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Agent script executed');
    });

    it('should handle non-zero exit codes without throwing', async () => {
      const toolDef: ToolDefinition = {
        name: 'false-command',
        command: ['sh', '-c', 'exit 42'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });

    it('should capture stderr output', async () => {
      const toolDef: ToolDefinition = {
        name: 'stderr-tool',
        command: ['sh', '-c', 'echo "Error message" >&2'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(true);
      expect(result.stderr.trim()).toBe('Error message');
    });

    it('should handle command not found', async () => {
      const toolDef: ToolDefinition = {
        name: 'nonexistent',
        command: ['nonexistent-command-xyz'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(false);
      // Some systems may return exit code 0 with error in stderr
      expect(result.exitCode !== 0 || result.stderr.length > 0).toBe(true);
    });

    it('should verify files created in work directory', async () => {
      const toolDef: ToolDefinition = {
        name: 'touch-tool',
        command: ['touch', 'test-file.txt'],
        parameters: [],
      };

      const result = await executeTool(context, toolDef, {});

      expect(result.success).toBe(true);

      // Verify file was created in work directory
      const filePath = path.join(workDir, 'test-file.txt');
      const fileExists = await fs.stat(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should handle complex command with multiple parameter types', async () => {
      const toolDef: ToolDefinition = {
        name: 'complex-tool',
        command: ['sh', '-c'],
        parameters: [
          {
            name: 'script',
            type: 'string',
            inject_as: InjectionType.Argument,
          },
        ],
      };

      const params = {
        script: 'echo "CWD: $(pwd)" && echo "AGENT: $AGENT_HOME"',
      };

      const result = await executeTool(context, toolDef, params);

      expect(result.success).toBe(true);
      // On macOS, paths may be resolved differently
      expect(result.stdout).toContain('CWD:');
      expect(result.stdout).toContain(path.basename(workDir));
      expect(result.stdout).toContain('AGENT:');
      expect(result.stdout).toContain(path.basename(agentPath));
    });
  });

  describe('validateRequiredParameters', () => {
    it('should return empty array when all parameters provided', () => {
      const toolDef: ToolDefinition = {
        name: 'test',
        command: ['test'],
        parameters: [
          { name: 'param1', type: 'string', inject_as: InjectionType.Argument },
          { name: 'param2', type: 'string', inject_as: InjectionType.Argument },
        ],
      };

      const missing = validateRequiredParameters(toolDef, {
        param1: 'value1',
        param2: 'value2',
      });

      expect(missing).toEqual([]);
    });

    it('should return missing parameter names', () => {
      const toolDef: ToolDefinition = {
        name: 'test',
        command: ['test'],
        parameters: [
          { name: 'param1', type: 'string', inject_as: InjectionType.Argument },
          { name: 'param2', type: 'string', inject_as: InjectionType.Argument },
        ],
      };

      const missing = validateRequiredParameters(toolDef, {
        param1: 'value1',
      });

      expect(missing).toEqual(['param2']);
    });
  });

  describe('formatExecutionResult', () => {
    it('should format successful result', () => {
      const result = {
        stdout: 'Output line 1\nOutput line 2',
        stderr: '',
        exitCode: 0,
        success: true,
      };

      const formatted = formatExecutionResult(result);

      expect(formatted).toContain('Exit Code: 0 (Success)');
      expect(formatted).toContain('Output line 1');
      expect(formatted).toContain('Output line 2');
      expect(formatted).not.toContain('STDERR');
    });

    it('should format failed result with stderr', () => {
      const result = {
        stdout: '',
        stderr: 'Error occurred',
        exitCode: 1,
        success: false,
      };

      const formatted = formatExecutionResult(result);

      expect(formatted).toContain('Exit Code: 1 (Failed)');
      expect(formatted).toContain('STDERR');
      expect(formatted).toContain('Error occurred');
    });
  });
});