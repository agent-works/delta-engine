# Delta Engine Tests

## Directory Structure

```
tests/
├── unit/                    # Unit tests (Jest framework)
│   ├── executor.test.ts    # Tool executor tests
│   ├── llm.test.ts         # LLM adapter tests
│   └── tool_schema.test.ts # Tool schema tests
├── integration/            # Integration tests (standalone scripts)
│   ├── stateless-core.test.ts # Stateless core implementation
│   ├── io-audit.test.ts      # Runtime I/O audit trail
│   ├── hooks.test.ts          # Lifecycle hooks protocol
│   └── pre-llm-req.test.ts   # Pre-LLM request hook
├── e2e/                    # End-to-end tests (future)
├── fixtures/               # Test data and configurations
└── run-integration.ts      # Integration test runner
```

## Running Tests

### All Tests
```bash
npm test                    # Run both unit and integration tests
```

### Unit Tests (Jest)
```bash
npm run test:unit          # Run all unit tests
npm run test:watch         # Watch mode for unit tests
npm run test:coverage      # Generate coverage report
```

### Integration Tests
```bash
npm run test:integration   # Run all integration tests
npm run test:stateless     # Test stateless core only
npm run test:hooks         # Test hooks only
npm run test:io           # Test I/O audit only
```

## Test Categories

### Unit Tests
- **Purpose**: Test individual functions and classes in isolation
- **Framework**: Jest with TypeScript support
- **Speed**: Fast (milliseconds)
- **Dependencies**: Mocked

### Integration Tests
- **Purpose**: Test v1.1 architectural features
- **Framework**: Standalone TypeScript scripts
- **Speed**: Medium (seconds)
- **Dependencies**: Real file system, mocked LLM

### E2E Tests (Future)
- **Purpose**: Test complete agent execution flows
- **Framework**: TBD
- **Speed**: Slow (minutes)
- **Dependencies**: Real LLM API

## Writing Tests

### Unit Test Example
```typescript
// tests/unit/my-feature.test.ts
import { myFunction } from '../../src/my-feature.js';

describe('MyFeature', () => {
  it('should do something', () => {
    expect(myFunction()).toBe('expected');
  });
});
```

### Integration Test Example
```typescript
// tests/integration/my-integration.test.ts
#!/usr/bin/env node

async function testMyIntegration() {
  console.log('=== Testing My Integration ===');

  // Test implementation

  console.log('✅ ALL TESTS PASSED');
}

testMyIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
```

## Test Coverage

Unit test coverage is generated using Jest:
```bash
npm run test:coverage
```

Coverage reports are saved in `coverage/` directory.

## CI/CD Integration

Tests are run automatically on:
- Pull requests
- Commits to main branch
- Release tags

See `.github/workflows/` for CI configuration.