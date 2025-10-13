# Test Quality Standards

**Purpose**: Define mandatory quality standards for all tests in delta-engine to ensure reliability, maintainability, and effectiveness.

**Scope**: Applies to all test code (unit, integration, E2E).

---

## Test Writing Standards

### MUST (Mandatory Requirements)

Every test MUST adhere to these requirements:

#### 1. Tests MUST be Independent

**Rule**: Each test runs in complete isolation without depending on other tests.

**Why**: Test order should not matter. Tests should pass whether run individually or as part of a suite.

**Implementation**:
```typescript
// ✅ GOOD: Independent test with own setup/teardown
describe('Module', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('test 1', async () => {
    // Uses testDir - no shared state with other tests
  });
});

// ❌ BAD: Tests share state
let sharedState: any;

test('test 1', () => {
  sharedState = { value: 1 };  // Affects test 2
});

test('test 2', () => {
  expect(sharedState.value).toBe(1);  // Depends on test 1
});
```

#### 2. Tests MUST be Deterministic

**Rule**: Same input always produces same output. No flaky tests.

**Why**: Flaky tests erode confidence in the test suite and waste developer time.

**Common Causes of Flakiness**:
- Timing dependencies (`setTimeout`, race conditions)
- External services (network calls, databases)
- Shared file system state
- Random data without fixed seeds

**Implementation**:
```typescript
// ✅ GOOD: Deterministic test
test('parses config correctly', async () => {
  const configContent = 'name: test\nllm:\n  model: gpt-4';
  const config = parseConfig(configContent);
  expect(config.name).toBe('test');
});

// ❌ BAD: Non-deterministic (depends on external timing)
test('waits for file to appear', async () => {
  await sleep(100);  // May or may not be enough time
  const exists = await fileExists(path);
  expect(exists).toBe(true);
});

// ✅ BETTER: Deterministic with explicit control
test('waits for file to appear', async () => {
  await waitForCondition(() => fileExists(path), { timeout: 1000 });
  const exists = await fileExists(path);
  expect(exists).toBe(true);
});
```

#### 3. Tests MUST Have Clear Names

**Rule**: Test name clearly describes what is being tested and expected behavior.

**Format**: `should [expected behavior] when [condition]`

**Implementation**:
```typescript
// ✅ GOOD: Clear, descriptive names
test('should resume from INTERRUPTED status when journal exists', async () => {
  // Clear what's tested and under what conditions
});

test('should default max_iterations to 30 per CLAUDE.md spec', () => {
  // References documentation, clear expectation
});

// ❌ BAD: Vague or implementation-focused names
test('test 1', () => {
  // What does "test 1" actually test?
});

test('calls rebuildContext method', () => {
  // Tests implementation detail, not behavior
});
```

#### 4. Tests MUST Provide Clear Failure Messages

**Rule**: When a test fails, the error message must clearly indicate what went wrong.

**Implementation**:
```typescript
// ✅ GOOD: Clear failure message
expect(status).toBe(
  'COMPLETED',
  `Expected run to complete successfully, but got status: ${status}`
);

expect(events.length).toBeGreaterThan(
  0,
  'Journal should contain at least one event'
);

// ❌ BAD: Generic failure
expect(status).toBe('COMPLETED');  // "Expected 'FAILED' to be 'COMPLETED'" - not helpful
```

#### 5. Tests MUST Clean Up Resources

**Rule**: All resources created by tests (files, directories, connections) must be cleaned up.

**Implementation**:
```typescript
// ✅ GOOD: Cleanup in finally block
async function testScenario() {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));

  try {
    // Test logic
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// ❌ BAD: No cleanup
async function testScenario() {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  // Test logic
  // testDir left behind, pollutes /tmp
}
```

#### 6. Tests MUST Close File Handles

**Rule**: All opened file handles must be explicitly closed to prevent EMFILE errors.

**Implementation**:
```typescript
// ✅ GOOD: Explicit close in finally
const handle = await fs.open(filePath);
try {
  const content = await handle.readFile('utf-8');
  // operations
} finally {
  await handle.close();
}

// ❌ BAD: Handle not closed
const handle = await fs.open(filePath);
const content = await handle.readFile('utf-8');
// Handle leaks
```

---

### SHOULD (Strong Recommendations)

#### 1. Tests SHOULD Follow AAA Pattern

**Pattern**: Arrange → Act → Assert

**Why**: Clear structure makes tests easy to read and understand.

**Implementation**:
```typescript
test('should parse valid config', () => {
  // Arrange: Set up test data
  const input = 'name: test\nllm:\n  model: gpt-4';

  // Act: Execute the code under test
  const result = parseConfig(input);

  // Assert: Verify the outcome
  expect(result.name).toBe('test');
  expect(result.llm.model).toBe('gpt-4');
});
```

#### 2. Tests SHOULD Test One Behavior

**Rule**: Each test validates a single behavior or aspect.

**Why**: Focused tests are easier to debug when they fail.

**Implementation**:
```typescript
// ✅ GOOD: One behavior per test
test('should load config from agent.yaml', async () => {
  const config = await loadConfig(agentDir);
  expect(config.name).toBe('test-agent');
});

test('should throw error when agent.yaml is missing', async () => {
  await expect(loadConfig(agentDir)).rejects.toThrow('agent.yaml not found');
});

// ❌ BAD: Multiple behaviors in one test
test('config loading', async () => {
  const config1 = await loadConfig(validDir);
  expect(config1.name).toBe('test-agent');

  await expect(loadConfig(invalidDir)).rejects.toThrow();

  const config2 = await loadConfig(anotherDir);
  expect(config2.name).toBe('other-agent');
  // Hard to tell which part failed
});
```

#### 3. Tests SHOULD Use Meaningful Test Data

**Rule**: Test data should be realistic and meaningful, not arbitrary values.

**Implementation**:
```typescript
// ✅ GOOD: Meaningful test data
test('should parse agent config with tools', () => {
  const config = `
name: code-reviewer
llm:
  model: gpt-4
tools:
  - name: review_file
    exec: "cat \${file}"
`;
  const result = parseConfig(config);
  expect(result.tools[0].name).toBe('review_file');
});

// ❌ BAD: Arbitrary, meaningless data
test('should parse config', () => {
  const config = `
name: foo
llm:
  model: bar
`;
  // Unclear what "foo" and "bar" represent
});
```

---

### NEVER (Prohibited Practices)

#### 1. NEVER Comment Out Failing Tests

**Rule**: Failing tests must be fixed or explicitly skipped with `test.skip()` and a reason.

**Why**: Commented-out tests hide problems and create technical debt.

**Implementation**:
```typescript
// ✅ GOOD: Explicit skip with reason
test.skip('should handle complex edge case (TODO: fix timing issue #123)', () => {
  // Test code
});

// ❌ BAD: Commented out
// test('this test sometimes fails', () => {
//   // Test code
// });
```

#### 2. NEVER Use Arbitrary Sleep/Delays

**Rule**: Never use `setTimeout` or `sleep` to "fix" timing issues.

**Why**: Indicates race conditions and makes tests slow/flaky.

**Implementation**:
```typescript
// ✅ GOOD: Wait for explicit condition
async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: { timeout: number }
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < options.timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timeout waiting for condition');
}

await waitForCondition(() => fileExists(path), { timeout: 1000 });

// ❌ BAD: Arbitrary sleep
await sleep(500);  // Why 500ms? What if it's not enough?
```

#### 3. NEVER Mock What You Don't Own

**Rule**: Don't mock external libraries or Node.js built-ins unless absolutely necessary.

**Why**: Makes tests brittle and doesn't catch real issues.

**Exception**: Mocking LLM API calls is acceptable for fast, deterministic tests.

**Implementation**:
```typescript
// ✅ GOOD: Test with real file system (in temp dir)
test('should create journal file', async () => {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  await journal.create(testDir);
  expect(await fs.access(path.join(testDir, 'journal.jsonl'))).resolves;
});

// ❌ BAD: Mocking fs.writeFile
jest.mock('fs/promises');
test('should create journal file', async () => {
  await journal.create(testDir);
  expect(fs.writeFile).toHaveBeenCalled();  // Doesn't actually test file creation
});
```

#### 4. NEVER Test Implementation Details

**Rule**: Test behavior, not internal implementation.

**Why**: Makes tests fragile and couples them to implementation.

**Implementation**:
```typescript
// ✅ GOOD: Tests behavior
test('should resume from INTERRUPTED status', async () => {
  const context = await loadExistingContext(workDir);
  expect(context.metadata.status).toBe('INTERRUPTED');

  const engine = new Engine(context);
  await engine.run();

  expect(context.metadata.status).toBe('COMPLETED');
});

// ❌ BAD: Tests internal implementation
test('should call rebuildContext on resume', async () => {
  const spy = jest.spyOn(engine, 'rebuildContext');
  await engine.run();
  expect(spy).toHaveBeenCalled();  // Tests how, not what
});
```

---

## Test Maintenance Responsibilities

### When Modifying Code

**MUST**:
- Run impacted tests before making changes
- Update tests to match new behavior
- Add tests for new code paths
- Verify all tests still pass

**Process**:
1. Identify affected tests (`grep -r "functionName" tests/`)
2. Run affected test suite (`npm run test:unit -- tests/unit/module.test.ts`)
3. Make code changes
4. Update tests as needed
5. Run full test suite (`npm run test:all`)

### When Adding Features

**MUST**:
- Add unit tests for new modules/functions
- Add integration tests if feature involves multiple components
- Add E2E test if feature is user-facing

**SHOULD**:
- Follow existing test patterns in the codebase
- Aim for ≥80% coverage on new code

**Process**:
1. Write tests first (TDD) or immediately after implementation
2. Ensure tests cover happy path + edge cases
3. Run `npm run test:all` to ensure nothing broke

### When Fixing Bugs

**MUST**:
- Add a test that reproduces the bug (failing test)
- Fix the bug (test now passes)
- Verify fix with `npm run test:all`

**Process**:
1. Write failing test that demonstrates bug
2. Fix code
3. Verify test now passes
4. Check for similar bugs (expand test coverage)

### When Discovering Failing Tests

**MUST**:
- Fix immediately (don't ignore or skip)
- If cannot fix immediately: create GitHub issue, use `test.skip()` with issue reference

**NEVER**:
- Comment out failing tests
- Ignore CI failures
- "Fix" by changing assertion to match broken behavior

---

## Test Coverage Requirements

### Overall Target

- **Core modules** (engine, journal, executor, hook-executor): ≥80%
- **Support modules** (context, config, workspace-manager): ≥70%
- **Overall project**: ≥60% (CLI/LLM covered by integration tests)

### New Code

All new code SHOULD achieve:
- ≥70% line coverage
- ≥80% branch coverage

### Coverage Exemptions

Acceptable low coverage for:
- CLI entry points (`src/index.ts`, `src/commands/*.ts`) - covered by E2E tests
- LLM adapters (`src/llm.ts`) - covered by integration tests
- Tracer/observability code (`src/tracer.ts`) - utility code, not core logic
- Template code (`src/templates/`) - covered by `delta init` tests

### Checking Coverage

```bash
# Run tests with coverage report
npm run test:unit -- --coverage

# View coverage report
open coverage/lcov-report/index.html
```

---

## Test Review Checklist

Before submitting PR with new/modified tests:

- [ ] All tests are independent (no shared state)
- [ ] All tests are deterministic (no flaky behavior)
- [ ] Test names clearly describe behavior
- [ ] Failure messages are clear and actionable
- [ ] Resources are cleaned up (files, handles)
- [ ] Tests follow AAA pattern
- [ ] Each test validates one behavior
- [ ] No commented-out tests
- [ ] No arbitrary delays/sleeps
- [ ] Tests validate behavior, not implementation
- [ ] Coverage meets requirements (≥70% for new code)
- [ ] All tests pass: `npm run test:all`

---

## Examples of Good vs Bad Tests

### Example 1: Testing Config Loading

**❌ BAD**:
```typescript
test('config', async () => {
  const config = await loadConfig('/tmp/agent');
  expect(config).toBeTruthy();
  expect(config.name).toBe('agent');
  expect(config.llm).toBeTruthy();
});
```

**Problems**:
- Vague test name
- Tests multiple things
- Uses hardcoded path (not isolated)
- Weak assertions (`toBeTruthy`)

**✅ GOOD**:
```typescript
describe('Config Loading', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-config-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('should load config from agent.yaml', async () => {
    // Arrange
    await fs.writeFile(
      path.join(testDir, 'agent.yaml'),
      'name: test-agent\nllm:\n  model: gpt-4'
    );

    // Act
    const config = await loadConfig(testDir);

    // Assert
    expect(config.name).toBe('test-agent');
    expect(config.llm.model).toBe('gpt-4');
  });

  test('should throw error when agent.yaml is missing', async () => {
    // No agent.yaml created

    await expect(loadConfig(testDir)).rejects.toThrow(
      'agent.yaml not found',
      'Should throw specific error when config is missing'
    );
  });
});
```

**Improvements**:
- Clear, descriptive test names
- Independent tests with proper setup/teardown
- Isolated test directory
- Strong, specific assertions
- Clear failure messages

### Example 2: Testing State Transitions

**❌ BAD**:
```typescript
test('resume works', async () => {
  const engine = new Engine(context);
  await engine.run();
  expect(engine.status).toBe('COMPLETED');

  await engine.run();
  expect(engine.status).toBe('COMPLETED');
});
```

**Problems**:
- Unclear what "resume" means
- Tests implementation (`engine.status`)
- No setup of INTERRUPTED state
- Reuses same engine instance (stateful)

**✅ GOOD**:
```typescript
test('should resume from INTERRUPTED status and complete task', async () => {
  // Arrange: Create run with INTERRUPTED status
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-resume-'));
  await createTestAgent(testDir, { maxIterations: 5 });

  const context1 = await initializeContext(testDir, 'Test task');
  const engine1 = new Engine(context1);
  await engine1.initialize();

  // Simulate interruption
  await context1.journal.writeEvent({
    type: 'ENGINE_START',
    seq: 1,
    payload: { task: 'Test task' },
  });
  await context1.metadata.update({ status: 'INTERRUPTED' });
  await context1.journal.close();

  // Act: Resume from INTERRUPTED
  const context2 = await loadExistingContext(workDir);
  expect(context2.metadata.status).toBe('INTERRUPTED', 'Precondition: Should be INTERRUPTED');

  const engine2 = new Engine(context2);
  await engine2.initialize();
  await engine2.run();

  // Assert: Should complete successfully
  const finalMetadata = await context2.journal.readMetadata();
  expect(finalMetadata.status).toBe(
    'COMPLETED',
    'Should transition from INTERRUPTED to COMPLETED after resume'
  );

  await context2.journal.close();
  await fs.rm(testDir, { recursive: true, force: true });
});
```

**Improvements**:
- Clear test name describes scenario
- Explicit setup of INTERRUPTED state
- Tests through public API (metadata.status, not engine.status)
- Clear assertions with failure messages
- Proper cleanup

---

## Related Documentation

- **Testing Guide**: [`README.md`](./README.md) - How to run and write tests
- **Testing Strategy**: `tests/TESTING_STRATEGY.md` - Comprehensive testing approach
- **Release Process**: [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md) - How testing fits into releases
- **CLAUDE.md**: Project root - Development guidelines

---

**Last Updated**: 2025-10-13
**Status**: Active Quality Standard
**Enforcement**: All PRs must adhere to these standards
