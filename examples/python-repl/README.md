# Python REPL Agent

An intelligent agent with access to a persistent Python interactive session (REPL).

## Overview

This agent demonstrates how to use Delta Engine's session management to interact with a long-running Python REPL. The Python session persists across multiple commands, maintaining variables, imports, and function definitions.

## Features

- ✅ Persistent Python REPL session
- ✅ Execute Python code interactively
- ✅ Define functions and classes that persist
- ✅ Import libraries and use them across commands
- ✅ Handle errors and interrupts

## Usage

### Basic Usage

```bash
delta run --agent examples/python-repl --task "Calculate the sum of numbers from 1 to 100"
```

### Example Tasks

**Simple Calculations**:
```bash
delta run --agent examples/python-repl --task "Calculate 2^10 and show the result"
```

**Function Definitions**:
```bash
delta run --agent examples/python-repl --task "Define a function to check if a number is prime, then test it with 17"
```

**Data Analysis**:
```bash
delta run --agent examples/python-repl --task "Create a list of numbers 1-10, calculate their squares, and show the average"
```

**String Processing**:
```bash
delta run --agent examples/python-repl --task "Reverse the string 'Hello World' and count vowels"
```

## How It Works

### Tool Flow

1. **Start REPL**: `python_start()` creates Python process with PTY
2. **Read Prompt**: `python_read()` gets the `>>>` prompt
3. **Execute Code**: `python_exec()` sends Python statements
4. **Get Results**: `python_read()` retrieves output
5. **Cleanup**: `python_end()` terminates the session

### Example Execution

```
User: "Calculate factorial of 5"

Agent:
1. python_start() → session_id: sess_abc123
2. python_read(sess_abc123, 1000) → "Python 3.9.7\n>>>"
3. python_exec(sess_abc123, "import math\n")
4. python_read(sess_abc123, 1000) → ">>>"
5. python_exec(sess_abc123, "print(math.factorial(5))\n")
6. python_read(sess_abc123, 1000) → "120\n>>>"
7. python_end(sess_abc123) → terminated

Response: "The factorial of 5 is 120."
```

## Configuration

See `config.yaml` for tool definitions:
- `python_start` - Start Python REPL
- `python_exec` - Execute code
- `python_read` - Read output
- `python_interrupt` - Send Ctrl+C
- `python_end` - Terminate session

## Advanced Usage

### Multi-Line Functions

```bash
delta run --agent examples/python-repl --task "Define a fibonacci function and calculate the 10th fibonacci number"
```

The agent will:
1. Start Python REPL
2. Define multi-line function with proper indentation
3. Call the function
4. Return the result

### Working with Libraries

```bash
delta run --agent examples/python-repl --task "Use numpy to create an array of 10 random numbers and calculate the mean"
```

### Error Recovery

```bash
delta run --agent examples/python-repl --task "Try to divide by zero, handle the error, and show the error message"
```

The agent can see Python errors and recover gracefully.

## Tips for Users

### Provide Clear Tasks

✅ **Good**: "Calculate the sum of squares of numbers 1-10"

❌ **Vague**: "Do some math"

### Specify Libraries

If you need specific libraries:

```bash
delta run --agent examples/python-repl --task "Use pandas to create a DataFrame with columns 'name' and 'age', then show it"
```

### Complex Algorithms

The agent can implement algorithms:

```bash
delta run --agent examples/python-repl --task "Implement bubble sort to sort the list [5, 2, 8, 1, 9]"
```

## Limitations

1. **No File Persistence**: Files created during session are lost after termination
2. **No GUI**: Can't display matplotlib plots or GUI windows
3. **Memory Limits**: Large computations limited by available RAM
4. **No Async**: Async/await patterns may not work in interactive mode
5. **Platform-Specific**: Python version depends on system installation

## Troubleshooting

### Import Errors

**Problem**: "ModuleNotFoundError: No module named 'numpy'"

**Solution**: Library not installed on system. Agent will inform you.

### Timeout Issues

**Problem**: Code takes longer than timeout

**Solution**: Agent will automatically use appropriate timeouts. For very slow operations, it may need to retry with longer timeout.

### Session Hangs

**Problem**: Infinite loop or blocking operation

**Solution**: Agent can send `python_interrupt` (Ctrl+C) to stop execution.

## See Also

- [Session Management Design](../../docs/architecture/v1.4-sessions-design.md)
- [Interactive Shell Example](../interactive-shell/)
- [delta-sessions CLI Reference](../../docs/api/delta-sessions.md)
