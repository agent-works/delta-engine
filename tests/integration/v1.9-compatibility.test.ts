#!/usr/bin/env node

/**
 * Integration test for v1.9 unified agent structure
 * Tests end-to-end compatibility and feature integration
 *
 * Test coverage:
 * 1. agent.yaml vs config.yaml file location
 * 2. imports mechanism (single, multiple, nested)
 * 3. hooks.yaml vs lifecycle_hooks compatibility
 * 4. Real agent loading and initialization
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { loadConfigWithCompat } from '../../dist/config.js';
import { initializeContext } from '../../dist/context.js';

// ESM alternative to __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testV19Compatibility() {
  console.log('=== Testing v1.9 Unified Agent Structure ===\n');

  const testBaseDir = path.join(os.tmpdir(), `delta-test-v1.9-${uuidv4()}`);
  await fs.mkdir(testBaseDir, { recursive: true });

  console.log(`Test base directory: ${testBaseDir}`);

  // Set dummy API key
  process.env.DELTA_API_KEY = 'test-key';

  try {
    // ========================================
    // Test 1: agent.yaml vs config.yaml
    // ========================================
    console.log('\n📋 Test 1: agent.yaml vs config.yaml compatibility...');

    // 1a: Load agent with agent.yaml
    const agentYamlDir = path.join(testBaseDir, 'agent-yaml-test');
    await fs.mkdir(agentYamlDir, { recursive: true });

    await fs.writeFile(
      path.join(agentYamlDir, 'agent.yaml'),
      `name: test-agent-yaml
version: 1.9.0
llm:
  model: gpt-4
tools:
  - name: echo
    exec: "echo \${message}"
`,
      'utf-8'
    );
    await fs.writeFile(path.join(agentYamlDir, 'system_prompt.md'), '# Test Agent', 'utf-8');

    const result1a = await loadConfigWithCompat(agentYamlDir);
    if (result1a.config.name !== 'test-agent-yaml') {
      throw new Error('Failed to load agent.yaml');
    }
    console.log('  ✓ agent.yaml loaded successfully');

    // 1b: Load agent with config.yaml (backward compatibility)
    const configYamlDir = path.join(testBaseDir, 'config-yaml-test');
    await fs.mkdir(configYamlDir, { recursive: true });

    await fs.writeFile(
      path.join(configYamlDir, 'config.yaml'),
      `name: test-config-yaml
version: 1.8.0
llm:
  model: gpt-4
tools:
  - name: echo
    exec: "echo \${message}"
`,
      'utf-8'
    );
    await fs.writeFile(path.join(configYamlDir, 'system_prompt.md'), '# Test Agent', 'utf-8');

    const result1b = await loadConfigWithCompat(configYamlDir);
    if (result1b.config.name !== 'test-config-yaml') {
      throw new Error('Failed to load config.yaml');
    }
    console.log('  ✓ config.yaml loaded successfully (backward compatibility)');

    // 1c: agent.yaml takes priority when both exist
    const bothDir = path.join(testBaseDir, 'both-files-test');
    await fs.mkdir(bothDir, { recursive: true });

    await fs.writeFile(
      path.join(bothDir, 'agent.yaml'),
      `name: from-agent-yaml
llm:
  model: gpt-4
tools: []
`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(bothDir, 'config.yaml'),
      `name: from-config-yaml
llm:
  model: gpt-4
tools: []
`,
      'utf-8'
    );
    await fs.writeFile(path.join(bothDir, 'system_prompt.md'), '# Test', 'utf-8');

    // Capture console warnings
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);

    const result1c = await loadConfigWithCompat(bothDir);

    console.warn = originalWarn;

    if (result1c.config.name !== 'from-agent-yaml') {
      throw new Error('agent.yaml should take priority over config.yaml');
    }

    const hasWarning = warnings.some(w => w.includes('Both agent.yaml and config.yaml found'));
    if (!hasWarning) {
      throw new Error('Should warn when both files exist');
    }

    console.log('  ✓ agent.yaml takes priority when both exist');
    console.log('  ✓ Warning displayed for duplicate files');

    // ========================================
    // Test 2: Imports Mechanism
    // ========================================
    console.log('\n📦 Test 2: Imports mechanism...');

    // 2a: Single import
    const singleImportDir = path.join(testBaseDir, 'single-import');
    const modulesDir = path.join(singleImportDir, 'modules');
    await fs.mkdir(modulesDir, { recursive: true });

    await fs.writeFile(
      path.join(modulesDir, 'file-tools.yaml'),
      `name: file-tools
llm:
  model: gpt-4
tools:
  - name: read_file
    exec: "cat \${filename}"
  - name: write_file
    exec: "tee \${filename}"
    stdin: content
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(singleImportDir, 'agent.yaml'),
      `name: agent-with-import
imports:
  - modules/file-tools.yaml
llm:
  model: gpt-4
tools:
  - name: local_tool
    exec: "echo \${message}"
`,
      'utf-8'
    );
    await fs.writeFile(path.join(singleImportDir, 'system_prompt.md'), '# Test', 'utf-8');

    const result2a = await loadConfigWithCompat(singleImportDir);
    if (result2a.config.tools.length !== 3) {
      throw new Error(`Expected 3 tools (2 imported + 1 local), got ${result2a.config.tools.length}`);
    }

    const toolNames = result2a.config.tools.map(t => t.name);
    if (!toolNames.includes('read_file') || !toolNames.includes('write_file') || !toolNames.includes('local_tool')) {
      throw new Error('Imported tools not properly merged');
    }

    console.log('  ✓ Single import works');
    console.log(`    Tools: ${toolNames.join(', ')}`);

    // 2b: Multiple imports
    const multiImportDir = path.join(testBaseDir, 'multi-import');
    const multiModulesDir = path.join(multiImportDir, 'modules');
    await fs.mkdir(multiModulesDir, { recursive: true });

    await fs.writeFile(
      path.join(multiModulesDir, 'tools-a.yaml'),
      `name: tools-a
llm:
  model: gpt-4
tools:
  - name: tool_a
    exec: "echo a"
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(multiModulesDir, 'tools-b.yaml'),
      `name: tools-b
llm:
  model: gpt-4
tools:
  - name: tool_b
    exec: "echo b"
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(multiImportDir, 'agent.yaml'),
      `name: multi-import-agent
imports:
  - modules/tools-a.yaml
  - modules/tools-b.yaml
llm:
  model: gpt-4
tools: []
`,
      'utf-8'
    );
    await fs.writeFile(path.join(multiImportDir, 'system_prompt.md'), '# Test', 'utf-8');

    const result2b = await loadConfigWithCompat(multiImportDir);
    if (result2b.config.tools.length !== 2) {
      throw new Error(`Expected 2 tools from multiple imports, got ${result2b.config.tools.length}`);
    }

    console.log('  ✓ Multiple imports work');

    // 2c: Last Write Wins (duplicate tool names)
    const overrideDir = path.join(testBaseDir, 'override-test');
    const overrideModulesDir = path.join(overrideDir, 'modules');
    await fs.mkdir(overrideModulesDir, { recursive: true });

    await fs.writeFile(
      path.join(overrideModulesDir, 'base-echo.yaml'),
      `name: base-echo
llm:
  model: gpt-4
tools:
  - name: echo
    command: [echo, "from module"]
    parameters: []
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(overrideDir, 'agent.yaml'),
      `name: override-agent
imports:
  - modules/base-echo.yaml
llm:
  model: gpt-4
tools:
  - name: echo
    command: [echo, "from local"]
    parameters: []
`,
      'utf-8'
    );
    await fs.writeFile(path.join(overrideDir, 'system_prompt.md'), '# Test', 'utf-8');

    const result2c = await loadConfigWithCompat(overrideDir);
    if (result2c.config.tools.length !== 1) {
      throw new Error('Last Write Wins failed: duplicate tools not merged');
    }

    const localEchoTool = result2c.config.tools[0];
    if (!localEchoTool || !localEchoTool.command.includes('from local')) {
      throw new Error('Local tool should override imported tool');
    }

    console.log('  ✓ Last Write Wins merge strategy works');

    // ========================================
    // Test 3: hooks.yaml vs lifecycle_hooks
    // ========================================
    console.log('\n🪝 Test 3: hooks.yaml vs lifecycle_hooks compatibility...');

    // 3a: Load hooks from hooks.yaml
    const hooksYamlDir = path.join(testBaseDir, 'hooks-yaml-test');
    await fs.mkdir(hooksYamlDir, { recursive: true });

    await fs.writeFile(
      path.join(hooksYamlDir, 'agent.yaml'),
      `name: agent-with-hooks-yaml
llm:
  model: gpt-4
tools: []
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(hooksYamlDir, 'hooks.yaml'),
      `pre_llm_req:
  command: [echo, "pre-llm-hook"]
post_tool_exec:
  command: [echo, "post-tool-hook"]
`,
      'utf-8'
    );

    await fs.writeFile(path.join(hooksYamlDir, 'system_prompt.md'), '# Test', 'utf-8');

    const result3a = await loadConfigWithCompat(hooksYamlDir);
    if (!result3a.hooks || !result3a.hooks.pre_llm_req) {
      throw new Error('hooks.yaml not loaded');
    }

    console.log('  ✓ hooks.yaml loaded successfully');

    // 3b: Fallback to lifecycle_hooks in config.yaml
    const lifecycleHooksDir = path.join(testBaseDir, 'lifecycle-hooks-test');
    await fs.mkdir(lifecycleHooksDir, { recursive: true });

    await fs.writeFile(
      path.join(lifecycleHooksDir, 'config.yaml'),
      `name: agent-with-lifecycle-hooks
llm:
  model: gpt-4
tools: []
lifecycle_hooks:
  pre_llm_req:
    command: [echo, "legacy-hook"]
`,
      'utf-8'
    );

    await fs.writeFile(path.join(lifecycleHooksDir, 'system_prompt.md'), '# Test', 'utf-8');

    // Capture deprecation warnings
    const warnings3b: string[] = [];
    console.warn = (msg: string) => warnings3b.push(msg);

    const result3b = await loadConfigWithCompat(lifecycleHooksDir);

    console.warn = originalWarn;

    if (!result3b.hooks || !result3b.hooks.pre_llm_req) {
      throw new Error('lifecycle_hooks not loaded as fallback');
    }

    const hasDeprecationWarning = warnings3b.some(w => w.includes('lifecycle_hooks') && w.includes('deprecated'));
    if (!hasDeprecationWarning) {
      throw new Error('Should warn about deprecated lifecycle_hooks');
    }

    console.log('  ✓ lifecycle_hooks fallback works (backward compatibility)');
    console.log('  ✓ Deprecation warning displayed');

    // 3c: hooks.yaml takes priority over lifecycle_hooks
    const hooksPriorityDir = path.join(testBaseDir, 'hooks-priority-test');
    await fs.mkdir(hooksPriorityDir, { recursive: true });

    await fs.writeFile(
      path.join(hooksPriorityDir, 'agent.yaml'),
      `name: hooks-priority-agent
llm:
  model: gpt-4
tools: []
lifecycle_hooks:
  pre_llm_req:
    command: [echo, "from-lifecycle-hooks"]
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(hooksPriorityDir, 'hooks.yaml'),
      `pre_llm_req:
  command: [echo, "from-hooks-yaml"]
`,
      'utf-8'
    );

    await fs.writeFile(path.join(hooksPriorityDir, 'system_prompt.md'), '# Test', 'utf-8');

    const result3c = await loadConfigWithCompat(hooksPriorityDir);
    if (!result3c.hooks || !result3c.hooks.pre_llm_req) {
      throw new Error('Hooks not loaded');
    }

    const hookCommand = result3c.hooks.pre_llm_req.command;
    if (!hookCommand.includes('from-hooks-yaml')) {
      throw new Error('hooks.yaml should take priority over lifecycle_hooks');
    }

    console.log('  ✓ hooks.yaml takes priority over lifecycle_hooks');

    // ========================================
    // Test 4: Real Agent Initialization
    // ========================================
    console.log('\n🚀 Test 4: Real agent initialization with v1.9 features...');

    // Create a real agent with all v1.9 features
    const realAgentDir = path.join(testBaseDir, 'real-agent');
    const realModulesDir = path.join(realAgentDir, 'modules');
    await fs.mkdir(realModulesDir, { recursive: true });

    // Create reusable tool modules
    await fs.writeFile(
      path.join(realModulesDir, 'file-ops.yaml'),
      `name: file-ops-module
llm:
  model: gpt-4
tools:
  - name: read_file
    exec: "cat \${filename}"
  - name: list_files
    exec: "ls -la"
`,
      'utf-8'
    );

    // Create main agent.yaml
    await fs.writeFile(
      path.join(realAgentDir, 'agent.yaml'),
      `name: real-v1.9-agent
version: 1.9.0
description: Complete v1.9 agent with all features

imports:
  - modules/file-ops.yaml

llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: custom_echo
    description: Custom echo tool
    exec: "echo 'Custom: ' \${message}"

max_iterations: 30
`,
      'utf-8'
    );

    // Create hooks.yaml
    await fs.writeFile(
      path.join(realAgentDir, 'hooks.yaml'),
      `pre_llm_req:
  command: [echo, "Calling LLM..."]
  description: Log before LLM calls

post_tool_exec:
  command: [echo, "Tool executed"]
  description: Log after tool execution
`,
      'utf-8'
    );

    // Create system_prompt.md
    await fs.writeFile(
      path.join(realAgentDir, 'system_prompt.md'),
      `# Real v1.9 Agent

You are a test agent demonstrating all v1.9 features:
- Unified agent.yaml configuration
- Modular tool imports
- Separate hooks.yaml

## Capabilities
- File operations (imported from modules)
- Custom echo (local tool)
`,
      'utf-8'
    );

    // Load the complete agent
    const realResult = await loadConfigWithCompat(realAgentDir);

    // Verify all features loaded
    if (realResult.config.name !== 'real-v1.9-agent') {
      throw new Error('Agent name not loaded correctly');
    }

    if (realResult.config.tools.length !== 3) {
      throw new Error(`Expected 3 tools (2 imported + 1 local), got ${realResult.config.tools.length}`);
    }

    if (!realResult.hooks || !realResult.hooks.pre_llm_req) {
      throw new Error('Hooks not loaded');
    }

    if (!realResult.systemPrompt.includes('v1.9 features')) {
      throw new Error('System prompt not loaded correctly');
    }

    console.log('  ✓ Real agent loaded successfully');
    console.log(`    Name: ${realResult.config.name}`);
    console.log(`    Version: ${realResult.config.version}`);
    console.log(`    Tools: ${realResult.config.tools.length}`);
    console.log(`    Hooks: ${Object.keys(realResult.hooks).length}`);

    // Test agent initialization with context
    const context = await initializeContext(
      realAgentDir,
      'Test task for v1.9 agent',
      undefined,
      false,
      undefined,
      false,
      true  // skipPrompt
    );

    if (context.config.name !== 'real-v1.9-agent') {
      throw new Error('Context not initialized with correct config');
    }

    console.log('  ✓ Agent context initialized successfully');
    console.log(`    Run ID: ${context.runId}`);
    console.log(`    Work directory: ${path.basename(context.workDir)}`);

    // ========================================
    // Test 5: Using Test Fixtures
    // ========================================
    console.log('\n📁 Test 5: Loading test fixtures...');

    // Use our pre-created test fixtures
    const fixturesDir = path.resolve(__dirname, '../fixtures');

    // 5a: Load agent-with-config-yaml fixture
    const configYamlFixture = path.join(fixturesDir, 'agent-with-config-yaml');
    const result5a = await loadConfigWithCompat(configYamlFixture);

    if (!result5a.config.name.includes('legacy')) {
      throw new Error('config.yaml fixture not loaded correctly');
    }

    console.log('  ✓ agent-with-config-yaml fixture loaded');

    // 5b: Load agent-with-agent-yaml fixture
    const agentYamlFixture = path.join(fixturesDir, 'agent-with-agent-yaml');
    const result5b = await loadConfigWithCompat(agentYamlFixture);

    if (!result5b.config.name.includes('modern')) {
      throw new Error('agent.yaml fixture not loaded correctly');
    }

    console.log('  ✓ agent-with-agent-yaml fixture loaded');

    // 5c: Load agent-with-imports fixture
    const importsFixture = path.join(fixturesDir, 'agent-with-imports');
    const result5c = await loadConfigWithCompat(importsFixture);

    if (result5c.config.tools.length < 5) {
      throw new Error('imports fixture should have multiple tools');
    }

    console.log('  ✓ agent-with-imports fixture loaded');
    console.log(`    Total tools: ${result5c.config.tools.length}`);

    // 5d: Load agent-with-hooks-yaml fixture
    const hooksFixture = path.join(fixturesDir, 'agent-with-hooks-yaml');
    const result5d = await loadConfigWithCompat(hooksFixture);

    if (!result5d.hooks || Object.keys(result5d.hooks).length < 3) {
      throw new Error('hooks fixture should have multiple hooks');
    }

    console.log('  ✓ agent-with-hooks-yaml fixture loaded');
    console.log(`    Total hooks: ${Object.keys(result5d.hooks).length}`);

    // 5e: Verify circular import detection with fixture
    console.log('  ⚠️  Testing circular import detection...');
    const circularFixture = path.join(fixturesDir, 'agent-with-circular-imports');

    try {
      await loadConfigWithCompat(circularFixture);
      throw new Error('Should have detected circular import');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Circular import detected')) {
        console.log('  ✓ Circular import properly detected and rejected');
      } else {
        throw error;
      }
    }

    console.log('\n=== ✅ ALL TESTS PASSED ===');
    console.log('v1.9 unified agent structure is working correctly:');
    console.log('  ✓ agent.yaml loads correctly');
    console.log('  ✓ config.yaml backward compatibility maintained');
    console.log('  ✓ agent.yaml takes priority when both exist');
    console.log('  ✓ Single imports work');
    console.log('  ✓ Multiple imports work');
    console.log('  ✓ Last Write Wins merge strategy works');
    console.log('  ✓ hooks.yaml loads correctly');
    console.log('  ✓ lifecycle_hooks fallback works');
    console.log('  ✓ hooks.yaml takes priority over lifecycle_hooks');
    console.log('  ✓ Real agent initialization works');
    console.log('  ✓ Test fixtures load correctly');
    console.log('  ✓ Circular import detection works');
    console.log('  ✓ All deprecation warnings displayed');

  } catch (error) {
    throw error;
  } finally {
    // Cleanup
    await fs.rm(testBaseDir, { recursive: true, force: true });
    console.log('\n✓ Test directory cleaned up');
  }
}

// Run the test
testV19Compatibility().catch(error => {
  console.error('\n❌ Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
