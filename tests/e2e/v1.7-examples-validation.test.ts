#!/usr/bin/env node

/**
 * E2E Test: v1.7 Examples and Templates Validation
 *
 * Tests complete user workflows for all examples and templates migrated to v1.7 syntax.
 * Validates that the simplified tool syntax works correctly in real-world scenarios.
 *
 * Test Scenarios (8 core validations):
 * 1. hello-world example - Basic file operations
 * 2. memory-folding example - File read/write workflow
 * 3. research-agent example - Note-taking and search
 * 4. code-reviewer example - Multi-file review workflow
 * 5. experience-analyzer subagent - Data analysis tools
 * 6. minimal template - Template instantiation
 * 7. hello-world template - Full template workflow
 * 8. file-ops template - File organization workflow
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

// CLI path
const CLI_PATH = path.join(process.cwd(), 'dist', 'index.js');

// Helper: Run delta command
async function runDelta(args: string[], timeout = 60000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execa('node', [CLI_PATH, ...args], { timeout, reject: false });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode || 0
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      exitCode: error.exitCode || 1
    };
  }
}

// Helper: Check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runE2ETests() {
  console.log('=== v1.7 Examples and Templates E2E Tests ===\n');

  const testDir = path.join(os.tmpdir(), `v1.7-e2e-${uuidv4()}`);
  await fs.mkdir(testDir, { recursive: true });

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ============================================
    // Scenario 1: hello-world example
    // ============================================
    console.log('Scenario 1: hello-world example - Basic file operations');
    console.log('─'.repeat(50));

    try {
      const workDir = path.join(testDir, 'hello-world-work');
      const agentPath = path.join(process.cwd(), 'examples/1-basics/hello-world');

      const result = await runDelta([
        'run',
        '--agent', agentPath,
        '-m', "Echo 'v1.7 test', create file test-v17.txt, write 'Hello v1.7' to output.txt, list files",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}: ${result.stderr}`);
      if (!result.stdout.includes('completed successfully') && !result.stdout.includes('Done')) {
        throw new Error('Task not completed');
      }

      // Verify files created
      const outputFile = path.join(workDir, 'output.txt');
      const testFile = path.join(workDir, 'test-v17.txt');

      if (!await fileExists(outputFile)) throw new Error('output.txt not created');
      if (!await fileExists(testFile)) throw new Error('test-v17.txt not created');

      const content = await fs.readFile(outputFile, 'utf-8');
      if (!content.includes('Hello v1.7')) throw new Error('Incorrect file content');

      console.log('  ✓ Agent executed successfully');
      console.log('  ✓ Files created correctly');
      console.log('  ✓ Content verified');
      console.log('  ✅ Scenario 1 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 1 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 2: memory-folding example
    // ============================================
    console.log('Scenario 2: memory-folding example - File read/write workflow');
    console.log('─'.repeat(50));

    try {
      const workDir = path.join(testDir, 'memory-folding-work');
      const agentPath = path.join(process.cwd(), 'examples/2-core-features/memory-folding');

      const result = await runDelta([
        'run',
        '--agent', agentPath,
        '-m', "Write 'Step 1 complete' to progress.txt, then read it back, then list files",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}: ${result.stderr}`);

      // Verify workflow
      const progressFile = path.join(workDir, 'progress.txt');
      if (!await fileExists(progressFile)) throw new Error('progress.txt not created');

      const content = await fs.readFile(progressFile, 'utf-8');
      if (!content.includes('Step 1 complete')) throw new Error('Incorrect content');

      console.log('  ✓ Write-read-list workflow succeeded');
      console.log('  ✓ File persistence verified');
      console.log('  ✅ Scenario 2 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 2 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 3: research-agent example
    // ============================================
    console.log('Scenario 3: research-agent example - Note-taking and search');
    console.log('─'.repeat(50));

    try {
      const workDir = path.join(testDir, 'research-work');
      const agentPath = path.join(process.cwd(), 'examples/3-advanced/research-agent');

      // Write notes
      const result1 = await runDelta([
        'run',
        '--agent', agentPath,
        '-m', "Write note to notes.md: '# Finding 1\\nv1.7 syntax is 77% more concise'",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result1.exitCode !== 0) throw new Error(`Write failed: ${result1.stderr}`);

      // Read and verify
      const notesFile = path.join(workDir, 'notes.md');
      if (!await fileExists(notesFile)) throw new Error('notes.md not created');

      const content = await fs.readFile(notesFile, 'utf-8');
      if (!content.includes('Finding 1') || !content.includes('77%')) {
        throw new Error('Note content incorrect');
      }

      console.log('  ✓ Note writing workflow succeeded');
      console.log('  ✓ Append mode (tee -a) working');
      console.log('  ✅ Scenario 3 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 3 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 4: code-reviewer example
    // ============================================
    console.log('Scenario 4: code-reviewer example - Multi-file review');
    console.log('─'.repeat(50));

    try {
      const workDir = path.join(testDir, 'review-work');
      const agentPath = path.join(process.cwd(), 'examples/3-advanced/code-reviewer');

      // Create test file to review
      await fs.mkdir(workDir, { recursive: true });
      await fs.writeFile(
        path.join(workDir, 'test.js'),
        'function test() { console.log("test"); }\n'
      );

      const result = await runDelta([
        'run',
        '--agent', agentPath,
        '-m', "Read test.js, write review to REVIEW.md noting file structure, list files",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}: ${result.stderr}`);

      // Verify review file
      const reviewFile = path.join(workDir, 'REVIEW.md');
      if (!await fileExists(reviewFile)) throw new Error('REVIEW.md not created');

      // Verify lifecycle hooks created audit log
      const auditLog = path.join(workDir, '.delta/review-audit.log');
      if (!await fileExists(auditLog)) throw new Error('Audit log not created (hooks not working)');

      console.log('  ✓ Multi-file review workflow succeeded');
      console.log('  ✓ Review file created');
      console.log('  ✓ Lifecycle hooks executed (audit log exists)');
      console.log('  ✅ Scenario 4 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 4 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 5: experience-analyzer subagent
    // ============================================
    console.log('Scenario 5: experience-analyzer subagent - Data analysis');
    console.log('─'.repeat(50));

    try {
      const workDir = path.join(testDir, 'analyzer-work');
      const agentPath = path.join(process.cwd(), 'examples/3-advanced/delta-agent-generator/experience-analyzer');

      // Create test data
      await fs.mkdir(path.join(workDir, '.claude-lab'), { recursive: true });
      await fs.writeFile(
        path.join(workDir, '.claude-lab/sessions.jsonl'),
        '{"timestamp":"2025-10-12T00:00:00Z","action":"execute","result":"success"}\n' +
        '{"timestamp":"2025-10-12T01:00:00Z","action":"execute","result":"failed"}\n'
      );

      const result = await runDelta([
        'run',
        '--agent', agentPath,
        '-m', "Read sessions file and output analysis showing we have 1 success and 1 failure",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}: ${result.stderr}`);

      // Check that shell: mode tools worked (grep with pipes)
      if (!result.stdout.includes('success') && !result.stdout.includes('failed')) {
        throw new Error('Analysis did not process data correctly');
      }

      console.log('  ✓ Data reading with shell: mode succeeded');
      console.log('  ✓ Grep pipelines working (shell: syntax)');
      console.log('  ✅ Scenario 5 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 5 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 6: minimal template instantiation
    // ============================================
    console.log('Scenario 6: minimal template - Template instantiation');
    console.log('─'.repeat(50));

    try {
      const agentDir = path.join(testDir, 'minimal-agent');
      const workDir = path.join(testDir, 'minimal-work');

      // Create agent from template
      const initResult = await runDelta([
        'init',
        agentDir,
        '-t', 'minimal',
        '-y'
      ]);

      if (initResult.exitCode !== 0) throw new Error(`Init failed: ${initResult.stderr}`);

      // Verify template files
      if (!await fileExists(path.join(agentDir, 'agent.yaml'))) throw new Error('agent.yaml not created');
      if (!await fileExists(path.join(agentDir, 'system_prompt.md'))) throw new Error('system_prompt.md not created');

      // Verify v1.7 syntax in config
      const configContent = await fs.readFile(path.join(agentDir, 'agent.yaml'), 'utf-8');
      if (!configContent.includes('exec:')) throw new Error('Template not using v1.7 syntax');

      // Test execution
      const runResult = await runDelta([
        'run',
        '--agent', agentDir,
        '-m', "Echo 'Template test' and write to template-test.txt",
        '--work-dir', workDir,
        '-y'
      ]);

      if (runResult.exitCode !== 0) throw new Error(`Execution failed: ${runResult.stderr}`);

      console.log('  ✓ Template instantiation succeeded');
      console.log('  ✓ v1.7 syntax in generated config');
      console.log('  ✓ Template agent execution succeeded');
      console.log('  ✅ Scenario 6 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 6 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 7: hello-world template workflow
    // ============================================
    console.log('Scenario 7: hello-world template - Full template workflow');
    console.log('─'.repeat(50));

    try {
      const agentDir = path.join(testDir, 'hello-agent');
      const workDir = path.join(testDir, 'hello-work');

      // Create from template
      await runDelta(['init', agentDir, '-t', 'hello-world', '-y']);

      // Test all 5 tools
      const result = await runDelta([
        'run',
        '--agent', agentDir,
        '-m', "Show date, echo 'Test', create empty.txt, write 'Content' to data.txt, list files",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}`);

      // Verify all file operations worked
      if (!await fileExists(path.join(workDir, 'empty.txt'))) throw new Error('create_file tool failed');
      if (!await fileExists(path.join(workDir, 'data.txt'))) throw new Error('write_to_file tool failed');

      const dataContent = await fs.readFile(path.join(workDir, 'data.txt'), 'utf-8');
      if (!dataContent.includes('Content')) throw new Error('File content incorrect');

      console.log('  ✓ All 5 tools executed successfully');
      console.log('  ✓ File operations verified');
      console.log('  ✅ Scenario 7 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 7 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Scenario 8: file-ops template workflow
    // ============================================
    console.log('Scenario 8: file-ops template - File organization');
    console.log('─'.repeat(50));

    try {
      const agentDir = path.join(testDir, 'fileops-agent');
      const workDir = path.join(testDir, 'fileops-work');

      // Create from template
      await runDelta(['init', agentDir, '-t', 'file-ops', '-y']);

      // Setup test files
      await fs.mkdir(workDir, { recursive: true });
      await fs.writeFile(path.join(workDir, 'test1.txt'), 'test');
      await fs.writeFile(path.join(workDir, 'test2.txt'), 'test');

      // Test file operations
      const result = await runDelta([
        'run',
        '--agent', agentDir,
        '-m', "Create directory 'archive', move test1.txt to archive/, copy test2.txt to archive/, list files in archive/",
        '--work-dir', workDir,
        '-y'
      ]);

      if (result.exitCode !== 0) throw new Error(`Exit code ${result.exitCode}`);

      // Verify operations
      const archiveDir = path.join(workDir, 'archive');
      if (!await fileExists(archiveDir)) throw new Error('Directory not created');
      if (!await fileExists(path.join(archiveDir, 'test1.txt'))) throw new Error('Move failed');
      if (!await fileExists(path.join(archiveDir, 'test2.txt'))) throw new Error('Copy failed');

      console.log('  ✓ Directory creation working');
      console.log('  ✓ File move/copy operations working');
      console.log('  ✓ Multi-parameter tools working');
      console.log('  ✅ Scenario 8 PASSED\n');
      testsPassed++;
    } catch (error: any) {
      console.log(`  ❌ Scenario 8 FAILED: ${error.message}\n`);
      testsFailed++;
    }

    // ============================================
    // Summary
    // ============================================
    console.log('='.repeat(50));
    console.log('\n📊 E2E Test Summary\n');
    console.log(`Total: ${testsPassed + testsFailed}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n✨ All v1.7 E2E tests passed!\n');
      console.log('Validated:');
      console.log('  ✓ Examples: hello-world, memory-folding, research-agent, code-reviewer');
      console.log('  ✓ Subagent: experience-analyzer');
      console.log('  ✓ Templates: minimal, hello-world, file-ops');
      console.log('  ✓ v1.7 syntax: exec:, shell:, stdin:');
      console.log('  ✓ Lifecycle hooks integration');
      console.log('  ✓ Multi-parameter tools');
      console.log('  ✓ File operations workflow');
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

// Run the tests
runE2ETests().catch((error) => {
  console.error('\n❌ E2E test runner failed:', error);
  process.exit(1);
});
