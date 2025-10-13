#!/usr/bin/env tsx

/**
 * Unified Test Runner
 *
 * Runs all test suites in sequence: Unit → Integration → E2E
 * Stops immediately on first failure for fast feedback
 *
 * Usage:
 *   npm run test:all
 *   tsx tests/run-all.ts
 */

import { execa } from 'execa';
import path from 'node:path';

const TESTS = [
  {
    name: 'Unit Tests',
    command: 'npm',
    args: ['run', 'test:unit'],
    description: 'Fast, isolated module tests',
  },
  {
    name: 'Integration Tests',
    command: 'npm',
    args: ['run', 'test:integration'],
    description: 'Component interaction tests',
  },
  {
    name: 'E2E Tests',
    command: 'npm',
    args: ['run', 'test:e2e'],
    description: 'Complete user journey tests',
  },
];

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

async function runAllTests() {
  console.log('🧪 Running All Tests\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results: TestResult[] = [];
  let totalDuration = 0;

  for (const test of TESTS) {
    console.log(`Phase ${results.length + 1}/3: ${test.name}`);
    console.log(`  ${test.description}\n`);

    const startTime = Date.now();

    try {
      await execa(test.command, test.args, {
        stdio: 'inherit',
        cwd: path.join(process.cwd()),
      });

      const duration = Date.now() - startTime;
      totalDuration += duration;

      results.push({
        name: test.name,
        passed: true,
        duration,
      });

      console.log(`  ✅ ${test.name} passed (${(duration / 1000).toFixed(1)}s)\n`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      totalDuration += duration;

      results.push({
        name: test.name,
        passed: false,
        duration,
        error: error.message,
      });

      console.log(`  ❌ ${test.name} failed (${(duration / 1000).toFixed(1)}s)\n`);

      // Stop immediately on first failure
      break;
    }
  }

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const skipped = TESTS.length - results.length;

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`  ${status} ${result.name}: ${duration}s`);
  }

  if (skipped > 0) {
    console.log(`  ⏭️  ${skipped} test suite(s) skipped (due to earlier failure)`);
  }

  console.log(`\n  Total: ${passed}/${TESTS.length} phases passed`);
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);

  if (failed > 0) {
    console.log('\n❌ Test suite FAILED - Fix failures before proceeding\n');
    console.log('Failed phases:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.name}`);
        if (r.error) {
          console.log(`    Error: ${r.error}`);
        }
      });
    console.log('\nTip: Run the failed test suite individually for detailed output:');
    const failedTest = results.find(r => !r.passed);
    if (failedTest) {
      const command = TESTS.find(t => t.name === failedTest.name);
      console.log(`  npm run ${command?.args[1]}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
  console.log('🚀 Ready for release\n');
  process.exit(0);
}

// Run the tests
runAllTests().catch(error => {
  console.error('\n❌ Test runner failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
