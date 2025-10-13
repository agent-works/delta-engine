#!/usr/bin/env node

/**
 * Unit tests for config.ts
 *
 * Tests specification-driven behavior from docs/api/config.md:
 * - config.yaml validation against Zod schema
 * - system_prompt.md/.txt file loading
 * - Error handling for missing/invalid files
 * - Tool definition validation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { loadAndValidateAgent, validateToolDefinition } from '../../src/config.js';
import { InjectionType } from '../../src/types.js';

describe('config.ts', () => {
  let tempAgentDir: string;

  beforeEach(async () => {
    tempAgentDir = path.join(os.tmpdir(), `config-test-${uuidv4()}`);
    await fs.mkdir(tempAgentDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempAgentDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadAndValidateAgent - Success Cases', () => {
    it('should load valid agent with .md system prompt', async () => {
      const configYaml = `name: test-agent
version: 1.0.0
description: Test agent
llm:
  model: gpt-4
  temperature: 0.7
tools:
  - name: echo
    command: [echo]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test Prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.config.name).toBe('test-agent');
      expect(result.config.version).toBe('1.0.0');
      expect(result.systemPrompt).toBe('# Test Prompt');
    });

    it('should load valid agent with .txt system prompt fallback', async () => {
      const configYaml = `name: test-agent
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.txt'), 'Test Prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.systemPrompt).toBe('Test Prompt');
    });

    it('should prefer .md over .txt when both exist', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Markdown prompt', 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.txt'), 'Text prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.systemPrompt).toBe('Markdown prompt');
    });

    it('should trim whitespace from system prompt', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(
        path.join(tempAgentDir, 'system_prompt.md'),
        '  \n\n  Prompt with spaces  \n\n  ',
        'utf-8'
      );

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.systemPrompt).toBe('Prompt with spaces');
    });

    it('should apply default values from Zod schema', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      // Defaults from AgentConfigSchema
      expect(result.config.version).toBe('1.0.0');
      expect(result.config.llm.temperature).toBe(0.7);
      expect(result.config.max_iterations).toBe(30);
    });

    it('should load agent with lifecycle hooks', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
lifecycle_hooks:
  pre_llm_req:
    command: [echo, "pre-llm"]
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.config.lifecycle_hooks).toBeDefined();
      expect(result.config.lifecycle_hooks?.pre_llm_req).toBeDefined();
      expect(result.config.lifecycle_hooks?.pre_llm_req?.command).toEqual(['echo', 'pre-llm']);
    });

    it('should load agent with multiple tools and parameters', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools:
  - name: tool1
    command: [echo]
    parameters:
      - name: message
        type: string
        inject_as: argument
  - name: tool2
    command: [cat]
    parameters:
      - name: content
        type: string
        inject_as: stdin
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      const result = await loadAndValidateAgent(tempAgentDir);

      expect(result.config.tools.length).toBe(2);
      expect(result.config.tools[0].name).toBe('tool1');
      expect(result.config.tools[1].name).toBe('tool2');
    });
  });

  describe('loadAndValidateAgent - Error Cases', () => {
    it('should reject non-absolute agent path', async () => {
      await expect(loadAndValidateAgent('relative/path')).rejects.toThrow(
        'Agent path must be absolute'
      );
    });

    it('should reject when config.yaml is missing', async () => {
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'config.yaml not found or not readable'
      );
    });

    it('should show helpful hint when config.yaml not found in current directory (v1.8.1)', async () => {
      // Simulate current directory path
      const currentDir = process.cwd();
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(currentDir)).rejects.toThrow(
        'No config.yaml found in current directory'
      );
      await expect(loadAndValidateAgent(currentDir)).rejects.toThrow(
        "Hint: Either:"
      );
      await expect(loadAndValidateAgent(currentDir)).rejects.toThrow(
        "1. Run 'delta init'"
      );
    });

    it('should reject when system_prompt is missing', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'system_prompt.md or system_prompt.txt not found'
      );
    });

    it('should reject when config.yaml is invalid YAML', async () => {
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), 'invalid: yaml: content:', 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Failed to parse config.yaml'
      );
    });

    it('should reject when config fails Zod validation (missing required field)', async () => {
      const configYaml = `version: 1.0.0
tools: []
`;
      // Missing 'name' and 'llm' required fields
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should reject when system_prompt is empty', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'system_prompt.md is empty'
      );
    });

    it('should reject when system_prompt is only whitespace', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '  \n\n  ', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'system_prompt.md is empty'
      );
    });

    it('should provide formatted error message for Zod validation errors', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
  temperature: 10.0
tools: []
`;
      // temperature must be between 0 and 2
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should reject tool with invalid inject_as value', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools:
  - name: bad-tool
    command: [echo]
    parameters:
      - name: param
        type: string
        inject_as: invalid_type
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should reject tool with multiple stdin parameters', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools:
  - name: bad-tool
    command: [cat]
    parameters:
      - name: input1
        type: string
        inject_as: stdin
      - name: input2
        type: string
        inject_as: stdin
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should reject option parameter without option_name', async () => {
      const configYaml = `name: test
llm:
  model: gpt-4
tools:
  - name: bad-tool
    command: [command]
    parameters:
      - name: flag
        type: string
        inject_as: option
`;
      // Missing option_name
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), 'Prompt', 'utf-8');

      await expect(loadAndValidateAgent(tempAgentDir)).rejects.toThrow(
        'Configuration validation failed'
      );
    });
  });

  describe('validateToolDefinition', () => {
    it('should accept valid tool definition', () => {
      const tool = {
        name: 'valid-tool',
        command: ['echo'],
        parameters: [
          { name: 'param1', type: 'string', inject_as: InjectionType.Argument },
        ],
      };

      expect(() => validateToolDefinition(tool)).not.toThrow();
    });

    it('should reject tool with duplicate parameter names', () => {
      const tool = {
        name: 'bad-tool',
        command: ['echo'],
        parameters: [
          { name: 'param', type: 'string', inject_as: InjectionType.Argument },
          { name: 'param', type: 'string', inject_as: InjectionType.Option, option_name: '--flag' },
        ],
      };

      expect(() => validateToolDefinition(tool)).toThrow('Duplicate parameter name: param');
    });

    it('should reject invalid tool structure', () => {
      const tool = {
        name: 'bad-tool',
        // Missing 'command' field
        parameters: [],
      };

      expect(() => validateToolDefinition(tool)).toThrow('Tool validation failed');
    });

    it('should accept tool with no parameters', () => {
      const tool = {
        name: 'simple-tool',
        command: ['ls'],
        parameters: [],
      };

      expect(() => validateToolDefinition(tool)).not.toThrow();
    });

    it('should accept tool with multiple unique parameters', () => {
      const tool = {
        name: 'multi-param',
        command: ['command'],
        parameters: [
          { name: 'param1', type: 'string', inject_as: InjectionType.Argument },
          { name: 'param2', type: 'string', inject_as: InjectionType.Stdin },
          { name: 'param3', type: 'string', inject_as: InjectionType.Option, option_name: '--opt' },
        ],
      };

      expect(() => validateToolDefinition(tool)).not.toThrow();
    });
  });
});
