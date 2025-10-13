#!/usr/bin/env node

/**
 * Unit tests for v1.9 config loader with imports mechanism
 *
 * Tests specification-driven behavior from docs/architecture/v1.9-unified-agent-structure.md:
 * - agent.yaml vs config.yaml file location
 * - imports mechanism (single, multiple, nested)
 * - Circular import detection
 * - Last Write Wins merge strategy
 * - Path validation (security boundaries)
 * - hooks.yaml loading
 * - Backward compatibility with lifecycle_hooks
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { loadConfigWithCompat } from '../../src/config.js';

describe('v1.9 Config Loader', () => {
  let tempAgentDir: string;

  beforeEach(async () => {
    tempAgentDir = path.join(os.tmpdir(), `v1.9-config-test-${uuidv4()}`);
    await fs.mkdir(tempAgentDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempAgentDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('File Location - agent.yaml vs config.yaml', () => {
    it('should load agent.yaml when only agent.yaml exists', async () => {
      const agentYaml = `name: modern-agent
version: 1.9.0
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.name).toBe('modern-agent');
      expect(result.config.version).toBe('1.9.0');
    });

    it('should load config.yaml when only config.yaml exists (backward compatibility)', async () => {
      const configYaml = `name: legacy-agent
version: 1.0.0
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.name).toBe('legacy-agent');
      expect(result.config.version).toBe('1.0.0');
    });

    it('should prefer agent.yaml over config.yaml when both exist', async () => {
      const agentYaml = `name: modern-agent
llm:
  model: gpt-4
tools: []
`;
      const configYaml = `name: legacy-agent
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.name).toBe('modern-agent');
    });

    it('should throw error when neither agent.yaml nor config.yaml exists', async () => {
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      await expect(loadConfigWithCompat(tempAgentDir)).rejects.toThrow(
        'No agent configuration found'
      );
    });
  });

  describe('Imports Mechanism - Single Import', () => {
    it('should load tools from a single imported module', async () => {
      // Create module with tools
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const moduleYaml = `name: tool-module
llm:
  model: gpt-4
tools:
  - name: imported_tool
    command: [echo]
    parameters:
      - name: message
        type: string
        inject_as: argument
`;
      await fs.writeFile(path.join(moduleDir, 'tools.yaml'), moduleYaml, 'utf-8');

      // Create main agent that imports module
      const agentYaml = `name: agent-with-import
imports:
  - modules/tools.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(1);
      expect(result.config.tools[0].name).toBe('imported_tool');
    });

    it('should merge imported tools with local tools', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const moduleYaml = `name: tool-module
llm:
  model: gpt-4
tools:
  - name: imported_tool
    command: [echo, "imported"]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'tools.yaml'), moduleYaml, 'utf-8');

      const agentYaml = `name: agent-with-mixed-tools
imports:
  - modules/tools.yaml
llm:
  model: gpt-4
tools:
  - name: local_tool
    command: [echo, "local"]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(2);
      const toolNames = result.config.tools.map(t => t.name);
      expect(toolNames).toContain('imported_tool');
      expect(toolNames).toContain('local_tool');
    });
  });

  describe('Imports Mechanism - Multiple Imports', () => {
    it('should load tools from multiple imported modules', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const module1Yaml = `name: module1
llm:
  model: gpt-4
tools:
  - name: tool1
    command: [echo, "1"]
    parameters: []
`;
      const module2Yaml = `name: module2
llm:
  model: gpt-4
tools:
  - name: tool2
    command: [echo, "2"]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'module1.yaml'), module1Yaml, 'utf-8');
      await fs.writeFile(path.join(moduleDir, 'module2.yaml'), module2Yaml, 'utf-8');

      const agentYaml = `name: agent-multi-import
imports:
  - modules/module1.yaml
  - modules/module2.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(2);
      const toolNames = result.config.tools.map(t => t.name);
      expect(toolNames).toContain('tool1');
      expect(toolNames).toContain('tool2');
    });

    it('should apply Last Write Wins when duplicate tool names exist', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const module1Yaml = `name: module1
llm:
  model: gpt-4
tools:
  - name: echo
    command: [echo, "from module1"]
    parameters: []
`;
      const module2Yaml = `name: module2
llm:
  model: gpt-4
tools:
  - name: echo
    command: [echo, "from module2"]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'module1.yaml'), module1Yaml, 'utf-8');
      await fs.writeFile(path.join(moduleDir, 'module2.yaml'), module2Yaml, 'utf-8');

      const agentYaml = `name: agent-duplicate-tools
imports:
  - modules/module1.yaml
  - modules/module2.yaml
llm:
  model: gpt-4
tools:
  - name: echo
    command: [echo, "from local"]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      // Should only have one 'echo' tool (the local one, Last Write Wins)
      expect(result.config.tools.length).toBe(1);
      expect(result.config.tools[0].name).toBe('echo');
      expect(result.config.tools[0].command).toContain('from local');
    });
  });

  describe('Imports Mechanism - Nested Imports', () => {
    it('should support nested imports (module imports another module)', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      // Base module (no imports)
      const baseYaml = `name: base
llm:
  model: gpt-4
tools:
  - name: base_tool
    command: [echo, "base"]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'base.yaml'), baseYaml, 'utf-8');

      // Middle module (imports base)
      // Note: All imports are relative to AGENT_HOME, not the current file
      const middleYaml = `name: middle
imports:
  - modules/base.yaml
llm:
  model: gpt-4
tools:
  - name: middle_tool
    command: [echo, "middle"]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'middle.yaml'), middleYaml, 'utf-8');

      // Main agent (imports middle, which imports base)
      const agentYaml = `name: agent-nested-import
imports:
  - modules/middle.yaml
llm:
  model: gpt-4
tools:
  - name: local_tool
    command: [echo, "local"]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(3);
      const toolNames = result.config.tools.map(t => t.name);
      expect(toolNames).toContain('base_tool');
      expect(toolNames).toContain('middle_tool');
      expect(toolNames).toContain('local_tool');
    });
  });

  describe('Circular Import Detection', () => {
    it('should detect direct circular import (A -> B -> A)', async () => {
      const moduleAYaml = `name: module-a
imports:
  - module-b.yaml
llm:
  model: gpt-4
tools:
  - name: tool_a
    command: [echo, "a"]
    parameters: []
`;
      const moduleBYaml = `name: module-b
imports:
  - module-a.yaml
llm:
  model: gpt-4
tools:
  - name: tool_b
    command: [echo, "b"]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'module-a.yaml'), moduleAYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'module-b.yaml'), moduleBYaml, 'utf-8');

      const agentYaml = `name: agent-circular
imports:
  - module-a.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      await expect(loadConfigWithCompat(tempAgentDir)).rejects.toThrow(
        'Circular import detected'
      );
    });

    it('should detect indirect circular import (A -> B -> C -> A)', async () => {
      const moduleAYaml = `name: module-a
imports:
  - module-b.yaml
llm:
  model: gpt-4
tools:
  - name: tool_a
    command: [echo]
    parameters: []
`;
      const moduleBYaml = `name: module-b
imports:
  - module-c.yaml
llm:
  model: gpt-4
tools:
  - name: tool_b
    command: [echo]
    parameters: []
`;
      const moduleCYaml = `name: module-c
imports:
  - module-a.yaml
llm:
  model: gpt-4
tools:
  - name: tool_c
    command: [echo]
    parameters: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'module-a.yaml'), moduleAYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'module-b.yaml'), moduleBYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'module-c.yaml'), moduleCYaml, 'utf-8');

      const agentYaml = `name: agent-indirect-circular
imports:
  - module-a.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      await expect(loadConfigWithCompat(tempAgentDir)).rejects.toThrow(
        'Circular import detected'
      );
    });
  });

  describe('Path Validation - Security Boundaries', () => {
    it('should reject path traversal attempts (../ in import path)', async () => {
      const agentYaml = `name: agent-malicious
imports:
  - ../../../etc/passwd
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      await expect(loadConfigWithCompat(tempAgentDir)).rejects.toThrow(
        'Invalid import path'
      );
    });

    it('should reject absolute paths in imports', async () => {
      const agentYaml = `name: agent-absolute
imports:
  - /etc/passwd
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      await expect(loadConfigWithCompat(tempAgentDir)).rejects.toThrow(
        'Invalid import path'
      );
    });

    it('should allow imports from subdirectories within AGENT_HOME', async () => {
      const moduleDir = path.join(tempAgentDir, 'lib', 'tools');
      await fs.mkdir(moduleDir, { recursive: true });

      const moduleYaml = `name: nested-module
llm:
  model: gpt-4
tools:
  - name: nested_tool
    command: [echo]
    parameters: []
`;
      await fs.writeFile(path.join(moduleDir, 'tools.yaml'), moduleYaml, 'utf-8');

      const agentYaml = `name: agent-nested-dir
imports:
  - lib/tools/tools.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(1);
      expect(result.config.tools[0].name).toBe('nested_tool');
    });
  });

  describe('Hooks Loading - hooks.yaml', () => {
    it('should load hooks from hooks.yaml when it exists', async () => {
      const agentYaml = `name: agent-with-hooks
llm:
  model: gpt-4
tools: []
`;
      const hooksYaml = `pre_llm_req:
  command: [echo, "pre-llm-hook"]
  timeout_ms: 5000
post_tool_exec:
  command: [echo, "post-tool-hook"]
  timeout_ms: 5000
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'hooks.yaml'), hooksYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.hooks).not.toBeNull();
      expect(result.hooks?.pre_llm_req).toBeDefined();
      expect(result.hooks?.pre_llm_req?.command).toEqual(['echo', 'pre-llm-hook']);
      expect(result.hooks?.post_tool_exec).toBeDefined();
      expect(result.hooks?.post_tool_exec?.command).toEqual(['echo', 'post-tool-hook']);
    });

    it('should return null for hooks when hooks.yaml does not exist', async () => {
      const agentYaml = `name: agent-no-hooks
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.hooks).toBeNull();
    });

    it('should support on_run_end hook (v1.9 new)', async () => {
      const agentYaml = `name: agent-with-run-end
llm:
  model: gpt-4
tools: []
`;
      const hooksYaml = `on_run_end:
  command: [echo, "run-end-hook"]
  timeout_ms: 5000
  description: Hook executed when run completes
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'hooks.yaml'), hooksYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.hooks).not.toBeNull();
      expect(result.hooks?.on_run_end).toBeDefined();
      expect(result.hooks?.on_run_end?.command).toEqual(['echo', 'run-end-hook']);
    });
  });

  describe('Backward Compatibility - lifecycle_hooks in config', () => {
    it('should fall back to lifecycle_hooks when hooks.yaml does not exist', async () => {
      const configYaml = `name: legacy-hooks
llm:
  model: gpt-4
tools: []
lifecycle_hooks:
  pre_llm_req:
    command: [echo, "legacy-hook"]
    timeout_ms: 5000
`;
      await fs.writeFile(path.join(tempAgentDir, 'config.yaml'), configYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.hooks).not.toBeNull();
      expect(result.hooks?.pre_llm_req).toBeDefined();
      expect(result.hooks?.pre_llm_req?.command).toEqual(['echo', 'legacy-hook']);
    });

    it('should prefer hooks.yaml over lifecycle_hooks when both exist', async () => {
      const agentYaml = `name: agent-both-hooks
llm:
  model: gpt-4
tools: []
lifecycle_hooks:
  pre_llm_req:
    command: [echo, "from-lifecycle-hooks"]
`;
      const hooksYaml = `pre_llm_req:
  command: [echo, "from-hooks-yaml"]
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'hooks.yaml'), hooksYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.hooks).not.toBeNull();
      expect(result.hooks?.pre_llm_req?.command).toEqual(['echo', 'from-hooks-yaml']);
    });
  });

  describe('v1.7 Syntax Support - exec/shell in imports', () => {
    it('should expand exec syntax in imported tools', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const moduleYaml = `name: v1.7-module
llm:
  model: gpt-4
tools:
  - name: echo_tool
    description: Echo with v1.7 syntax
    exec: "echo \${message}"
`;
      await fs.writeFile(path.join(moduleDir, 'v1.7-tools.yaml'), moduleYaml, 'utf-8');

      const agentYaml = `name: agent-v1.7-import
imports:
  - modules/v1.7-tools.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(1);
      expect(result.config.tools[0].name).toBe('echo_tool');
      expect(result.config.tools[0].command).toBeDefined();
      expect(result.config.tools[0].parameters.length).toBeGreaterThan(0);
    });

    it('should expand shell syntax in imported tools', async () => {
      const moduleDir = path.join(tempAgentDir, 'modules');
      await fs.mkdir(moduleDir, { recursive: true });

      const moduleYaml = `name: shell-module
llm:
  model: gpt-4
tools:
  - name: pipe_tool
    description: Pipe with v1.7 syntax
    shell: "echo \${text} | wc -l"
`;
      await fs.writeFile(path.join(moduleDir, 'shell-tools.yaml'), moduleYaml, 'utf-8');

      const agentYaml = `name: agent-shell-import
imports:
  - modules/shell-tools.yaml
llm:
  model: gpt-4
tools: []
`;
      await fs.writeFile(path.join(tempAgentDir, 'agent.yaml'), agentYaml, 'utf-8');
      await fs.writeFile(path.join(tempAgentDir, 'system_prompt.md'), '# Test', 'utf-8');

      const result = await loadConfigWithCompat(tempAgentDir);

      expect(result.config.tools.length).toBe(1);
      expect(result.config.tools[0].name).toBe('pipe_tool');
      expect(result.config.tools[0].command[0]).toBe('sh'); // v1.7 uses 'sh' (POSIX compatible)
    });
  });
});
