# Automated Test Runner

A smart agent that automatically detects and runs tests in your project, supporting multiple languages and testing frameworks.

## Features
- 🔍 Auto-detects testing framework (Jest, pytest, go test, etc.)
- 🏃 Runs tests with appropriate configurations
- 📊 Generates coverage reports when available
- 📝 Creates detailed test result summaries
- 🤖 Handles multiple languages (JavaScript, Python, Go)

## Usage

```bash
# Auto-detect and run tests
delta run --agent examples/test-runner --task "Find and run all tests in this project"

# Run with coverage
delta run --agent examples/test-runner --task "Run tests with coverage report"

# Interactive mode - asks for confirmation
delta run -i --agent examples/test-runner --task "Run tests and ask me before executing"
```

## Supported Frameworks

- **JavaScript/TypeScript**: npm test, Jest, Mocha, Vitest
- **Python**: pytest, unittest, nose
- **Go**: go test
- **Custom**: Any test command in package.json or Makefile

## Example Output

```markdown
# Test Results

**Framework**: Jest
**Total Tests**: 42
**Passed**: 40
**Failed**: 2
**Coverage**: 87.3%

## Failed Tests
- UserService › should validate email format
- AuthController › should reject expired tokens

## Recommendations
- Fix failing tests before deployment
- Increase coverage for auth module (currently 65%)
```