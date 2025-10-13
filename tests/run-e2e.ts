#!/usr/bin/env tsx

/**
 * E2E Test Runner
 * Runs all E2E tests and reports results
 *
 * Usage:
 *   npm run test:e2e              # Run all E2E tests
 *   npm run test:e2e -- --core    # Run only core user journey tests (P0+P1)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

// Core user journey tests (P0 + P1 priority from TESTING_STRATEGY.md)
const CORE_TESTS = [
  'new-user-onboarding',
  'resume-workflow',
  'human-in-loop',
  'multi-workspace-journey',
  'hook-workflow',
  'error-handling-journey',
];

async function runE2ETests() {
  const coreOnly = process.argv.includes('--core');

  console.log('🧪 Running E2E Tests\n');
  if (coreOnly) {
    console.log('📌 Mode: Core user journeys only (P0 + P1)\n');
  }
  console.log('==================================================');

  const e2eDir = path.join(process.cwd(), 'tests', 'e2e');
  const files = await fs.readdir(e2eDir);
  let testFiles = files.filter(f => f.endsWith('.test.ts')).sort();

  if (coreOnly) {
    testFiles = testFiles.filter(f => {
      const testName = f.replace('.test.ts', '');
      return CORE_TESTS.includes(testName);
    });
  }

  console.log(`Found ${testFiles.length} E2E test(s)\n`);

  const results: Array<{ name: string; status: 'pass' | 'fail'; duration: number; error?: string }> = [];

  for (const testFile of testFiles) {
    const testName = testFile.replace('.test.ts', '');
    const testPath = path.join(e2eDir, testFile);

    process.stdout.write(`Running: ${testName}...`);

    const startTime = Date.now();
    try {
      const result = await execa('node', [testPath], {
        reject: false,
        timeout: testName === 'examples-validation' ? 120000 : 60000,
      });

      const duration = Date.now() - startTime;

      if (result.exitCode === 0) {
        console.log(` ✅ ${testName} passed (${duration}ms)`);
        results.push({ name: testName, status: 'pass', duration });
      } else {
        console.log(` ❌ ${testName} failed (${duration}ms)`);
        // Extract error message from output
        const errorMatch = result.stdout.match(/Error: (.+)/);
        const error = errorMatch ? errorMatch[1] : 'Unknown error';
        results.push({ name: testName, status: 'fail', duration, error });
        if (result.stderr) {
          console.log(`Error output:\n  ${result.stderr.substring(0, 500)}\n`);
        }
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(` ❌ ${testName} failed (${duration}ms)`);
      results.push({ name: testName, status: 'fail', duration, error: error.message });
    }
  }

  console.log('\n==================================================\n');
  console.log('📊 Test Summary\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter(r => r.status === 'fail')
      .forEach(r => {
        console.log(`  - ${r.name}`);
        if (r.error) {
          console.log(`    ${r.error}`);
        }
      });
    console.log('\n💡 Tip: Run failed test individually for detailed output:');
    console.log(`  node tests/e2e/${results.find(r => r.status === 'fail')?.name}.test.ts`);
  } else {
    console.log('\n✅ All E2E tests passed!');
    if (coreOnly) {
      console.log('📌 Core user journeys (P0 + P1) validated');
    } else {
      console.log('🚀 Complete E2E test suite validated');
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runE2ETests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
