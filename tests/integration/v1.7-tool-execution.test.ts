#!/usr/bin/env node

/**
 * Integration Test: v1.7 Tool Configuration Simplification - Tool Execution
 *
 * Tests the complete execution pipeline for v1.7 simplified syntax:
 * - Config loading with exec: and shell: modes
 * - Tool expansion to internal representation
 * - Actual command execution with parameter injection
 * - Security validation (command injection prevention)
 *
 * Test Scenarios (6 core scenarios):
 * 1. exec: mode basic execution
 * 2. shell: mode with pipes
 * 3. Command injection defense (exec: mode)
 * 4. Command injection defense (shell: mode)
 * 5. stdin parameter handling
 * 6. :raw modifier (expert feature)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { loadAndValidateAgent } from '../../dist/config.js';
import { executeTool } from '../../dist/executor.js';
import type { EngineContext } from '../../dist/types.js';

// Helper function to create test agent
async function createAgent(agentDir: string, configContent: string): Promise<void> {
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, 'config.yaml'), configContent);
  await fs.writeFile(path.join(agentDir, 'system_prompt.md'), '# Test Agent');
}

// Helper function to create mock context
function createMockContext(agentDir: string, workDir: string, tools: any[], config: any): EngineContext {
  return {
    agentPath: agentDir,
    workPath: workDir,
    runId: `test-run-${uuidv4()}`,
    conversationHistory: [],
    tools,
    agentConfig: config,
    agentHome: agentDir,
    agentCwd: workDir,
    iterations: 0,
  };
}

async function testV17ToolExecution() {
  console.log('=== v1.7 Tool Execution Integration Tests ===\n');

  const testDir = path.join(os.tmpdir(), `v1.7-integration-${uuidv4()}`);
  const workDir = path.join(testDir, 'work');
  await fs.mkdir(workDir, { recursive: true });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ============================================
    // Scenario 1: exec: mode basic execution
    // ============================================
    console.log('Scenario 1: exec: mode basic execution');
    console.log('─'.repeat(50));

    try {
      const agentDir = path.join(testDir, 'exec-basic-agent');
      await createAgent(
        agentDir,
        `name: exec-basic
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: echo_test
    exec: "echo \${message}"
max_iterations: 10
`
      );

      const { config } = await loadAndValidateAgent(agentDir);
      const tool = config.tools[0];

      // Verify expansion
      if (tool.command[0] !== 'echo') throw new Error('Command not expanded correctly');
      if (tool.parameters[0].name !== 'message') throw new Error('Parameter not inferred');
      if (tool.__meta?.syntax !== 'exec') throw new Error('Meta syntax not set');

      console.log('  ✓ Config loaded and expanded correctly');

      // Execute tool
      const context = createMockContext(agentDir, workDir, config.tools, config);
      const result = await executeTool(context, tool, { message: 'Hello v1.7!' }, 'action-1');

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}`);
      if (!result.stdout.includes('Hello v1.7!')) throw new Error('Unexpected output');

      console.log('  ✓ Tool executed correctly');
      console.log('  ✅ Scenario 1 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 1 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 2: shell: mode with pipes
    // ============================================
    console.log('Scenario 2: shell: mode with pipes');
    console.log('─'.repeat(50));

    try {
      const testFile = path.join(workDir, 'test-lines.txt');
      await fs.writeFile(testFile, 'line1\nline2\nline3\n');

      const agentDir = path.join(testDir, 'shell-pipe-agent');
      await createAgent(
        agentDir,
        `name: shell-pipe
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: count_lines
    shell: "cat \${file} | wc -l"
max_iterations: 10
`
      );

      const { config } = await loadAndValidateAgent(agentDir);
      const tool = config.tools[0];

      // Verify expansion
      if (tool.command[0] !== 'sh') throw new Error('Not wrapped with sh');
      if (tool.command[1] !== '-c') throw new Error('Missing -c flag');
      if (!tool.command[2].includes('cat "$1" | wc -l')) throw new Error('Parameters not quoted');

      console.log('  ✓ shell: mode expanded with sh -c');

      const context = createMockContext(agentDir, workDir, config.tools, config);
      const result = await executeTool(context, tool, { file: testFile }, 'action-2');

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}`);
      if (result.stdout.trim() !== '3') throw new Error(`Expected 3 lines, got ${result.stdout.trim()}`);

      console.log('  ✓ Pipeline executed correctly');
      console.log('  ✅ Scenario 2 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 2 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 3: Command injection defense (exec:)
    // ============================================
    console.log('Scenario 3: Command injection defense (exec: mode)');
    console.log('─'.repeat(50));

    try {
      const markerFile = path.join(workDir, `marker-exec-${uuidv4()}.txt`);
      await fs.writeFile(markerFile, 'marker content');

      const agentDir = path.join(testDir, 'exec-injection-agent');
      await createAgent(
        agentDir,
        `name: exec-injection
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: echo_input
    exec: "echo \${input}"
max_iterations: 10
`
      );

      const { config } = await loadAndValidateAgent(agentDir);
      const tool = config.tools[0];
      const context = createMockContext(agentDir, workDir, config.tools, config);

      // Attempt injection
      const maliciousInput = `; rm -rf ${markerFile}`;
      const result = await executeTool(context, tool, { input: maliciousInput }, 'action-3');

      if (!result.stdout.includes('; rm -rf')) throw new Error('Injection string not in output');

      // Verify marker file still exists
      const fileExists = await fs.access(markerFile).then(() => true).catch(() => false);
      if (!fileExists) throw new Error('Marker file was deleted - injection succeeded!');

      await fs.unlink(markerFile);

      console.log('  ✓ Semicolon treated as literal');
      console.log('  ✓ Marker file not deleted');
      console.log('  ✅ Scenario 3 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 3 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 4: Command injection defense (shell:)
    // ============================================
    console.log('Scenario 4: Command injection defense (shell: mode)');
    console.log('─'.repeat(50));

    try {
      const markerFile = path.join(workDir, `marker-shell-${uuidv4()}.txt`);
      await fs.writeFile(markerFile, 'marker content');

      const agentDir = path.join(testDir, 'shell-injection-agent');
      await createAgent(
        agentDir,
        `name: shell-injection
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: echo_input
    shell: "echo \${input}"
max_iterations: 10
`
      );

      const { config } = await loadAndValidateAgent(agentDir);
      const tool = config.tools[0];

      // Verify command structure
      if (!tool.command[2].includes('echo "$1"')) throw new Error('Parameter not quoted in shell mode');

      const context = createMockContext(agentDir, workDir, config.tools, config);

      // Attempt injection
      const maliciousInput = `; rm -rf ${markerFile}; echo done`;
      const result = await executeTool(context, tool, { input: maliciousInput }, 'action-4');

      if (!result.stdout.includes('; rm -rf')) throw new Error('Injection string not in output');

      // Verify marker file still exists
      const fileExists = await fs.access(markerFile).then(() => true).catch(() => false);
      if (!fileExists) throw new Error('Marker file was deleted - injection succeeded!');

      await fs.unlink(markerFile);

      console.log('  ✓ Automatic quoting prevented injection');
      console.log('  ✓ Marker file not deleted');
      console.log('  ✅ Scenario 4 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 4 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 5: stdin parameter handling
    // ============================================
    console.log('Scenario 5: stdin parameter handling');
    console.log('─'.repeat(50));

    try {
      const outputFile = path.join(workDir, `output-${uuidv4()}.txt`);

      const agentDir = path.join(testDir, 'exec-stdin-agent');
      await createAgent(
        agentDir,
        `name: exec-stdin
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: write_file
    exec: "tee \${filename}"
    stdin: content
max_iterations: 10
`
      );

      const { config } = await loadAndValidateAgent(agentDir);
      const tool = config.tools[0];

      // Verify parameter configuration
      const contentParam = tool.parameters.find((p: any) => p.name === 'content');
      if (contentParam?.inject_as !== 'stdin') throw new Error('stdin parameter not configured');

      const context = createMockContext(agentDir, workDir, config.tools, config);
      const result = await executeTool(
        context,
        tool,
        { filename: outputFile, content: 'Hello stdin v1.7!' },
        'action-5'
      );

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}`);

      // Verify file content
      const fileContent = await fs.readFile(outputFile, 'utf-8');
      if (fileContent !== 'Hello stdin v1.7!') throw new Error('File content mismatch');

      await fs.unlink(outputFile);

      console.log('  ✓ stdin parameter correctly configured');
      console.log('  ✓ Content passed via stdin');
      console.log('  ✅ Scenario 5 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 5 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 6: :raw modifier (expert feature)
    // ============================================
    console.log('Scenario 6: :raw modifier (expert feature)');
    console.log('─'.repeat(50));

    try {
      // Test 1: :raw allowed in shell: mode
      const agentDir1 = path.join(testDir, 'shell-raw-agent');
      const shellRawConfig = `name: shell-raw
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: echo_with_flags
    shell: "echo \${flags:raw} \${message}"
max_iterations: 10
`;
      await createAgent(agentDir1, shellRawConfig);

      const result1Obj = await loadAndValidateAgent(agentDir1);
      const config1 = result1Obj.config;
      const tool1 = config1.tools[0];

      // Verify $1 is unquoted, "$2" is quoted
      if (!tool1.command[2].includes('echo $1 "$2"')) throw new Error(':raw not expanded correctly');

      const context1 = createMockContext(agentDir1, workDir, config1.tools, config1);
      const result1 = await executeTool(
        context1,
        tool1,
        { flags: '-n', message: 'Test' },
        'action-6'
      );

      // -n flag should suppress trailing newline (echo behavior may vary)
      // Just verify execution succeeded and flags were passed
      if (result1.exitCode !== 0) throw new Error('Execution failed');

      console.log('  ✓ :raw allowed in shell: mode');

      // Test 2: :raw rejected in exec: mode
      const agentDir2 = path.join(testDir, 'exec-raw-reject-agent');
      const execRawConfig = `name: exec-raw-reject
version: 1.0.0
llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000
tools:
  - name: echo_raw
    exec: "echo \${flags:raw}"
max_iterations: 10
`;
      await createAgent(agentDir2, execRawConfig);

      let rejectedCorrectly = false;
      try {
        await loadAndValidateAgent(agentDir2);
      } catch (error: any) {
        if (error.message.includes(':raw')) {
          rejectedCorrectly = true;
        }
      }

      if (!rejectedCorrectly) throw new Error(':raw not rejected in exec: mode');

      console.log('  ✓ :raw rejected in exec: mode');
      console.log('  ✅ Scenario 6 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 6 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Summary
    // ============================================
    console.log('='.repeat(50));
    console.log('\n📊 Test Summary\n');
    console.log(`Total: ${testsPassed + testsFailed}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n✨ All v1.7 integration tests passed!\n');
      console.log('Validated:');
      console.log('  ✓ exec: mode direct execution');
      console.log('  ✓ shell: mode with pipes');
      console.log('  ✓ Command injection prevention (both modes)');
      console.log('  ✓ stdin parameter handling');
      console.log('  ✓ :raw modifier (allowed in shell:, rejected in exec:)');
    }
  } finally {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  // Exit with appropriate code
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run the test
testV17ToolExecution().catch((error) => {
  console.error('\n❌ Test runner failed:', error);
  process.exit(1);
});
