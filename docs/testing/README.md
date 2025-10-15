# Testing Guide

**Purpose**: This guide provides a comprehensive overview of Delta Engine's testing architecture, how to run tests, and how to write effective tests.

**Target Audience**: Developers contributing to delta-engine or building agents.

---

## 🚨 NEW: Testing System 2.0 (October 2025)

**Delta Engine has a NEW comprehensive testing system created after v1.10 failure analysis.**

**Start here**: **[NEW-TESTING-SYSTEM.md](./NEW-TESTING-SYSTEM.md)** - Complete rebuild with:
- 5 Core Principles (Design as Truth, Adversarial Testing, Multiple Verification, etc.)
- Comprehensive process documentation
- Mandatory checklists and enforcement
- Tools and automation

**Key Documents**:
- [TESTING-PHILOSOPHY.md](./TESTING-PHILOSOPHY.md) - Master document (30 min read)
- [DESIGN-DRIVEN-DEVELOPMENT.md](./DESIGN-DRIVEN-DEVELOPMENT.md) - Implementation process
- [ADVERSARIAL-TESTING.md](./ADVERSARIAL-TESTING.md) - How to write tests that catch bugs
- [VALIDATION-CHECKLIST-TEMPLATE.md](./VALIDATION-CHECKLIST-TEMPLATE.md) - QA validation
- [SMOKE-TEST-GUIDE.md](./SMOKE-TEST-GUIDE.md) - Manual testing procedures

**Why**: v1.10 had 553 tests passing but 2 of 5 core features unimplemented. New system ensures this never happens again.

**Status**: 🟢 **MANDATORY** for all new development

---

## Legacy Testing Guide (Below)

The sections below cover **how to run existing tests** and **test architecture**. For **how to write new tests and validate features**, see Testing System 2.0 above.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Architecture](#test-architecture)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Testing Standards](#testing-standards)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Run All Tests (Recommended)

```bash
# Complete test suite - USE THIS before committing/releasing
npm run test:all

# Expected output:
# Phase 1: Unit Tests ✅ 330/330 passed
# Phase 2: Integration Tests ✅ 15/15 passed
# Phase 3: E2E Tests ✅ 6/6 passed
# 🚀 Ready for release
```

### Run Specific Test Suites

```bash
npm run test:unit          # Fast feedback (10s)
npm run test:integration   # Component interactions (20s)
npm run test:e2e           # User journeys (45s)
```

---

## Test Architecture

Delta Engine uses a **3-layer test pyramid** architecture:

```
          E2E Tests
         ─────────────
        (6 core journeys)
       ─────────────────
      Integration Tests
     ───────────────────────
    (15 critical scenarios)
   ─────────────────────────────
          Unit Tests
  ─────────────────────────────────
      (330 tests, core modules)
```

### Layer 1: Unit Tests (330 tests, ~10s)

**Purpose**: Validate individual module logic in isolation

**Characteristics**:
- Fast execution (milliseconds per test)
- No file system dependencies (use temp dirs)
- No network calls (mocked)
- Focus on single responsibility

**Coverage**:
- Core modules: 80-95% (engine.ts, journal.ts, executor.ts, hook-executor.ts)
- Support modules: 70-85% (context.ts, config.ts, workspace-manager.ts)
- Overall: 62.5% (CLI/LLM covered by integration tests)

**Location**: `tests/unit/`

**Example**:
```typescript
// tests/unit/engine.test.ts
test('should rebuild context from journal on resume', async () => {
  // Arrange: Create journal with events
  // Act: Resume engine
  // Assert: Context restored correctly
});
```

### Layer 2: Integration Tests (15 tests, ~20s)

**Purpose**: Validate that components work together correctly

**Characteristics**:
- Real file system operations (temp directories)
- Real state transitions (RUNNING → WAITING_FOR_INPUT)
- No LLM calls (mocked or skipped)
- Validates end-to-end workflows within the engine

**Critical Scenarios Covered**:
1. Stateless core (journal resumability)
2. Hook execution (all lifecycle hooks)
3. I/O audit structure and logging
4. Workspace management (W001 → W002 selection)
5. Resume from WAITING_FOR_INPUT state
6. Multi-run history (LATEST file updates)
7. Delta init command
8. Version migration (v1.X → v1.Y)
9. Interactive resume (ask_human recovery)
10. Error recovery paths (hook failure, LLM retry)

**Location**: `tests/integration/`

**Example**:
```typescript
// tests/integration/workspace-isolation.test.ts
test('workspaces W001 and W002 are fully isolated', async () => {
  // Create W001, run task
  // Create W002, run different task
  // Verify separate .delta/ directories, LAST_USED updates
});
```

### Layer 3: E2E Tests (6+ tests, ~45s)

**Purpose**: Validate complete user workflows from CLI entry to completion

**Characteristics**:
- Real CLI execution (via `execa`)
- Real file system operations
- May use real or mocked LLM (depends on test)
- Validates documented user journeys

**Core User Journeys** (P0 + P1 priority):
1. **New user onboarding**: `delta init` → first run → W001 created
2. **Resume workflow**: Run → interrupt → resume → complete
3. **Human-in-loop**: Task requires input → WAITING_FOR_INPUT → response → continue
4. **Multi-workspace**: Create W001, W002 → switch → resume in correct context
5. **Hook-based workflow**: pre_llm_req → modify request → verify behavior
6. **Error handling**: Tool fails → on_error hook → graceful recovery

**Location**: `tests/e2e/`

**Example**:
```typescript
// tests/e2e/new-user-onboarding.test.ts
test('fresh user can init agent and run first task', async () => {
  await execa('node', ['dist/index.js', 'init', agentName, '-y']);
  await execa('node', ['dist/index.js', 'run', '-m', 'Hello world', '-y']);
  // Verify W001 created, journal exists, metadata.json correct
});
```

---

## Running Tests

### Production Workflow

```bash
# 1. Fast feedback during development
npm run test:quick   # Unit tests only (~10s)

# 2. Before committing
npm run test:all     # All tests (~80s)

# 3. Before releasing
npm run test:pre-release   # Build + All Tests (definitive validation)
```

### Development Workflow

```bash
# Watch mode (TDD)
npm run test:watch

# Run specific test file
npm run test:unit -- tests/unit/engine.test.ts

# Run with coverage
npm run test:unit -- --coverage

# Run specific integration test
npm run test:stateless
npm run test:hooks
npm run test:io

# Run only core E2E tests (P0+P1)
npm run test:e2e -- --core
```

### Test Output Interpretation

**Successful Run**:
```
🧪 Running All Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1/3: Unit Tests
  Fast, isolated module tests
  ✅ Unit Tests passed (10.2s)

Phase 2/3: Integration Tests
  Component interaction tests
  ✅ Integration Tests passed (21.4s)

Phase 3/3: E2E Tests
  Complete user journey tests
  ✅ E2E Tests passed (45.8s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Summary

  ✅ Unit Tests: 10.2s
  ✅ Integration Tests: 21.4s
  ✅ E2E Tests: 45.8s

  Total: 3/3 phases passed
  Duration: 77.4s

✅ All tests passed!
🚀 Ready for release
```

**Failed Run**:
```
Phase 1/3: Unit Tests
  ✅ Unit Tests passed (10.2s)

Phase 2/3: Integration Tests
  ❌ Integration Tests failed (12.3s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Summary

  ✅ Unit Tests: 10.2s
  ❌ Integration Tests: 12.3s
  ⏭️  1 test suite(s) skipped (due to earlier failure)

  Total: 1/3 phases passed
  Duration: 22.5s

❌ Test suite FAILED - Fix failures before proceeding

Failed phases:
  - Integration Tests
    Error: Test suite failed

Tip: Run the failed test suite individually for detailed output:
  npm run test:integration
```

---

## Writing Tests

### General Principles

1. **Specification-Driven**: Test documented behavior, not implementation
   ```typescript
   // ✅ Good: Tests CLAUDE.md spec
   test('should default max_iterations to 30', () => {
     expect(config.max_iterations).toBe(30);
   });

   // ❌ Bad: Tests implementation detail
   test('should call internal rebuildContext method', () => {
     expect(engine.rebuildContext).toHaveBeenCalled();
   });
   ```

2. **AAA Pattern**: Arrange → Act → Assert
   ```typescript
   test('example test', () => {
     // Arrange: Set up test data
     const input = { /* ... */ };

     // Act: Execute the code under test
     const result = functionUnderTest(input);

     // Assert: Verify the outcome
     expect(result).toBe(expected);
   });
   ```

3. **Independent Tests**: No shared state, no test order dependency
   ```typescript
   // ✅ Good: Each test is independent
   beforeEach(async () => {
     testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
   });

   afterEach(async () => {
     await fs.rm(testDir, { recursive: true, force: true });
   });
   ```

4. **Clear Error Messages**: Use descriptive expect messages
   ```typescript
   // ✅ Good: Clear failure message
   expect(status).toBe('COMPLETED', `Expected run to complete, but got ${status}`);

   // ❌ Bad: Generic failure
   expect(status).toBe('COMPLETED');
   ```

### Unit Test Template

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Module Name', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create isolated test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-module-'));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('should do something specific', async () => {
    // Arrange
    const input = /* setup */;

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { createTestAgent } from '../fixtures/create-test-agent.js';
import { initializeContext } from '../../src/context.js';
import { Engine } from '../../src/engine.js';

async function testIntegrationScenario() {
  console.log('=== Testing Integration Scenario ===\n');

  const testAgentDir = path.join(os.tmpdir(), `test-scenario-${uuidv4()}`);

  try {
    // Create test agent
    await createTestAgent(testAgentDir, {
      name: 'test-agent',
      maxIterations: 2,
      tools: [/* tools */],
    });

    // Initialize context
    const context = await initializeContext(
      testAgentDir,
      'Test task',
      undefined,
      false,
      undefined,
      false,
      true  // skipPrompt
    );

    // Run engine
    const engine = new Engine(context);
    await engine.initialize();

    try {
      await engine.run();
    } catch (error: any) {
      // Handle expected errors (e.g., LLM API not available)
    }

    // Verify expectations
    const events = await context.journal.readJournal();
    expect(events.length).toBeGreaterThan(0);

    await context.journal.close();

    console.log('✅ Integration test passed');
  } finally {
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}
```

### E2E Test Template

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { execa } from 'execa';

async function testE2EJourney() {
  const testAgentDir = path.join(os.tmpdir(), `e2e-test-${uuidv4()}`);
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  try {
    // Step 1: Initialize agent
    await execa('node', [cliPath, 'init', agentName, '-y'], {
      cwd: path.dirname(testAgentDir),
    });

    // Step 2: Run task
    const result = await execa(
      'node',
      [cliPath, 'run', '--agent', testAgentDir, '-m', 'Task', '-y'],
      { reject: false }
    );

    // Step 3: Verify outcome
    const workspaceDir = path.join(testAgentDir, 'workspaces', 'W001');
    expect(await exists(workspaceDir)).toBe(true);

    console.log('✅ E2E journey complete');
  } finally {
    await fs.rm(testAgentDir, { recursive: true, force: true });
  }
}
```

---

## Testing Standards

**Key Requirements**:
- Tests MUST be independent (no shared state)
- Tests MUST be deterministic (no flaky tests)
- Test failures MUST provide clear error messages
- NEVER comment out failing tests (fix or document)

**Detailed Standards**: See [`TEST_QUALITY_STANDARDS.md`](./TEST_QUALITY_STANDARDS.md)

---

## Troubleshooting

### Common Issues

**Problem**: "Too many open files" / EMFILE error
- **Cause**: File handles not closed in `finally` blocks
- **Solution**: Always close file handles explicitly
```typescript
const handle = await fs.open(path);
try {
  // operations
} finally {
  await handle.close();
}
```

**Problem**: Tests pass locally but fail in CI
- **Cause**: Test order dependency or shared state
- **Solution**: Ensure tests are independent, use isolated directories

**Problem**: E2E tests timeout
- **Cause**: LLM API calls taking too long or hanging
- **Solution**: Check timeout settings, verify LLM mock/stub logic

**Problem**: Flaky tests (sometimes pass, sometimes fail)
- **Cause**: Race conditions, timing assumptions, external dependencies
- **Solution**: Identify and eliminate non-deterministic behavior

### Getting Help

1. **Check existing tests**: Look for similar test patterns
2. **Review test strategy**: See `tests/TESTING_STRATEGY.md`
3. **Check standards**: See `TEST_QUALITY_STANDARDS.md`
4. **Ask for review**: Create PR with `[WIP]` prefix

---

## Related Documentation

- **Test Strategy**: `tests/TESTING_STRATEGY.md` - Comprehensive testing approach
- **Quality Standards**: `TEST_QUALITY_STANDARDS.md` - Test quality requirements
- **Release Process**: `RELEASE_PROCESS.md` - How testing fits into releases
- **CLAUDE.md**: Project root - Development guidelines including testing

---

**Last Updated**: 2025-10-13
**Status**: Active Reference Document
