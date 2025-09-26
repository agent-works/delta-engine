#!/usr/bin/env node

/**
 * Integration Test Runner
 * Runs all integration tests in sequence and reports results
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

/**
 * Run a single test file
 */
async function runTest(testFile: string): Promise<TestResult> {
  const testName = path.basename(testFile, '.test.ts');
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', testFile], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;

      resolve({
        name: testName,
        passed,
        duration,
        error: passed ? undefined : stderr || stdout,
      });
    });
  });
}

/**
 * Main test runner
 */
async function main() {
  console.log('🧪 Running Integration Tests\n');
  console.log('=' .repeat(50));

  // Get all test files in integration directory
  const testDir = path.join(process.cwd(), 'tests', 'integration');
  const files = await fs.readdir(testDir);
  const testFiles = files
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(testDir, f));

  if (testFiles.length === 0) {
    console.log('No integration tests found.');
    return;
  }

  console.log(`Found ${testFiles.length} integration test(s)\n`);

  const results: TestResult[] = [];

  // Run tests sequentially
  for (const testFile of testFiles) {
    const testName = path.basename(testFile, '.test.ts');
    console.log(`Running: ${testName}...`);

    const result = await runTest(testFile);
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${testName} passed (${result.duration}ms)\n`);
    } else {
      console.log(`❌ ${testName} failed (${result.duration}ms)`);
      if (result.error) {
        console.log('Error output:');
        console.log(result.error.split('\n').map(l => '  ' + l).join('\n'));
      }
      console.log();
    }
  }

  // Summary
  console.log('=' .repeat(50));
  console.log('\n📊 Test Summary\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  // List failed tests
  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`  - ${r.name}`));
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});