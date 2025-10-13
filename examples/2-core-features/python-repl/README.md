# Python REPL Agent

A Delta Engine agent with persistent Python REPL session using v1.5 simplified sessions.

## Overview

This agent demonstrates Delta Engine's v1.5 session management for maintaining a persistent Python interactive session (REPL). Variables, imports, and function definitions persist across commands, using the simplified command-based execution model.

## Features

- ✅ **Persistent Python REPL session** (v1.5 simplified)
- ✅ **Immediate output** - No timing guesses, results returned instantly
- ✅ **State preservation** - Variables and imports persist across executions
- ✅ **Error handling** - Exit codes and stderr for debugging
- ✅ **Simple API** - Only 3 tools (start, exec, end)

## Usage

### Basic Usage

```bash
delta run --agent examples/2-core-features/python-repl -m "Calculate the sum of numbers from 1 to 100"
```

### Example Tasks

**Simple Calculations**:
```bash
delta run --agent examples/2-core-features/python-repl -m "Calculate 2^10 and show the result"
```

**Function Definitions**:
```bash
delta run --agent examples/2-core-features/python-repl -m "Define a function to check if a number is prime, then test it with 17"
```

**Data Analysis**:
```bash
delta run --agent examples/2-core-features/python-repl -m "Create a list of numbers 1-10, calculate their squares, and show the average"
```

**String Processing**:
```bash
delta run --agent examples/2-core-features/python-repl -m "Reverse the string 'Hello World' and count vowels"
```

## How It Works

### Tool Flow (v1.5 Simplified Sessions)

1. **Start REPL**: `python_start()` → creates Python session, returns session_id
2. **Execute Code**: `python_exec(session_id, code)` → runs code, returns output immediately
3. **State Persists**: Variables remain in memory between executions
4. **Cleanup**: `python_end(session_id)` → terminates session

### Example Execution

**User Task**: "Calculate factorial of 5"

```
Agent Workflow:

1. python_start()
   → Result: {"session_id": "sess_abc123", "status": "active"}

2. python_exec(sess_abc123, """
   import math
   print(math.factorial(5))
   """)
   → Result: {"stdout": "120\n", "stderr": "", "exit_code": 0}

3. python_end(sess_abc123)
   → Result: {"status": "terminated"}

Response: "The factorial of 5 is 120."
```

**Key v1.5 Advantages**:
- ✅ Single `python_exec()` call returns complete output
- ✅ No separate read/wait steps needed
- ✅ JSON output format (stdout, stderr, exit_code)
- ✅ No timing complexity

## Configuration

See `config.yaml` for tool definitions:
- `python_start` - Start Python REPL session
- `python_exec` - Execute code and get immediate output
- `python_end` - Terminate session

**v1.5 Simplification**: Only 3 tools needed (vs 5 in v1.4 PTY model)

## Advanced Usage

### Multi-Line Functions

```bash
delta run --agent examples/2-core-features/python-repl -m "Define a fibonacci function and calculate the 10th fibonacci number"
```

The agent will:
1. Start Python REPL
2. Define multi-line function with proper indentation
3. Call the function
4. Return the result

### Working with Libraries

```bash
delta run --agent examples/2-core-features/python-repl -m "Use numpy to create an array of 10 random numbers and calculate the mean"
```

### Error Recovery

```bash
delta run --agent examples/2-core-features/python-repl -m "Try to divide by zero, handle the error, and show the error message"
```

The agent can see Python errors and recover gracefully.

## Tips for Users

### Provide Clear Tasks

✅ **Good**: "Calculate the sum of squares of numbers 1-10"

❌ **Vague**: "Do some math"

### Specify Libraries

If you need specific libraries:

```bash
delta run --agent examples/2-core-features/python-repl -m "Use pandas to create a DataFrame with columns 'name' and 'age', then show it"
```

### Complex Algorithms

The agent can implement algorithms:

```bash
delta run --agent examples/2-core-features/python-repl -m "Implement bubble sort to sort the list [5, 2, 8, 1, 9]"
```

## Debugging

### View Session State
```bash
# List all active Python sessions
delta-sessions list

# View session metadata
cat .sessions/sess_abc123/metadata.json

# View execution history
cat .sessions/sess_abc123/history.log
```

### Common Issues

**Issue**: "Session not found"
- **Cause**: Session ID incorrect or already terminated
- **Solution**: Check `delta-sessions list` for active sessions

**Issue**: exit_code is non-zero
- **Cause**: Python error occurred
- **Solution**: Check `stderr` field for error message

**Issue**: ImportError for library
- **Cause**: Library not installed on system
- **Solution**: Install with `pip install <library>` before running agent

## See Also

- [Session Management Guide](../../docs/guides/session-management.md) - Complete guide
- [delta-sessions API Reference](../../docs/api/delta-sessions.md) - CLI documentation
- [v1.5 Architecture Design](../../docs/architecture/v1.5-sessions-simplified.md) - Design rationale
- [Interactive Shell Example](../interactive-shell/) - Bash session equivalent

## License

MIT
