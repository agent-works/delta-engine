# Bash Session Agent

A Delta Engine agent that demonstrates persistent bash session management using v1.5 simplified sessions.

## Overview

This agent uses `delta-sessions` to maintain a persistent bash session across multiple commands. Unlike one-shot command execution, the session preserves working directory and environment state between commands.

## Features

- **Persistent state**: Working directory changes persist across commands
- **Command-based execution**: Single `exec` call returns complete output
- **No timing complexity**: Output returned immediately when command completes
- **Simple API**: Only 3 tools (start, exec, end)

## Quick Start

```bash
# Navigate to agent directory
cd examples/2-core-features/interactive-shell

# Run with Delta Engine
delta run --agent examples/2-core-features/interactive-shell  -m "List files then check disk usage"
```

## Example Tasks

### Basic File Operations
```bash
delta run --agent examples/2-core-features/interactive-shell   -m "Create a directory called 'test' and list its contents"
```

### Multi-step Workflows
```bash
delta run --agent examples/2-core-features/interactive-shell   -m "Navigate to /tmp, create 3 text files, then count them"
```

### System Information
```bash
delta run --agent examples/2-core-features/interactive-shell   -m "Show current directory, disk usage, and running processes"
```

## How It Works

### 1. Session Lifecycle

```yaml
session_start()
  ↓
  Returns: {"session_id": "sess_abc123"}
  ↓
session_exec(sess_abc123, "ls -la")
  ↓
  Returns: {"stdout": "...", "stderr": "", "exit_code": 0}
  ↓
session_exec(sess_abc123, "pwd")
  ↓
  Returns: {"stdout": "/current/directory", "exit_code": 0}
  ↓
session_end(sess_abc123)
```

### 2. State Preservation

Working directory changes persist:

```bash
session_exec(sess_abc, "cd /tmp")
session_exec(sess_abc, "pwd")  # Output: /tmp
session_exec(sess_abc, "cd ..")
session_exec(sess_abc, "pwd")  # Output: /
```

### 3. Error Handling

Exit codes indicate success/failure:

```bash
session_exec(sess_abc, "ls existing_file")
# exit_code: 0 (success)

session_exec(sess_abc, "ls nonexistent")
# exit_code: 1 (failure)
# stderr: "ls: nonexistent: No such file or directory"
```

## Tool Configuration

The agent uses 3 simple tools defined in `config.yaml`:

### session_start
Creates a new bash session.

**Parameters**: None

**Returns**:
```json
{
  "session_id": "sess_abc123",
  "command": "bash",
  "work_dir": "/current/directory",
  "status": "active"
}
```

### session_exec
Executes a command in the session.

**Parameters**:
- `session_id`: Session ID from start
- `command`: Bash command (via stdin)

**Returns**:
```json
{
  "stdout": "command output",
  "stderr": "error output",
  "exit_code": 0,
  "execution_time_ms": 42
}
```

### session_end
Terminates the session.

**Parameters**:
- `session_id`: Session ID

**Returns**:
```json
{
  "status": "terminated",
  "session_id": "sess_abc123"
}
```

## Comparison with v1.4 PTY Sessions

| Aspect | v1.4 (PTY) | v1.5 (Simplified) |
|--------|------------|-------------------|
| **Tools** | 5 tools | 3 tools |
| **Interaction** | write → wait → read | exec → immediate response |
| **Escape sequences** | Required (`\n`, `\x1b[A`) | Not needed |
| **Timing** | Must guess wait times | Automatic |
| **Complexity** | High (PTY, buffering) | Low (command execution) |

**Migration**: If you have a v1.4 agent, see [Migration Guide](../../docs/migration/v1.4-to-v1.5.md).

## Common Patterns

### Pattern 1: Sequential Commands
```yaml
Task: "Create a file and verify it"

session_start() → sess_abc
session_exec(sess_abc, "touch test.txt")
session_exec(sess_abc, "ls -la test.txt")
session_exec(sess_abc, "cat test.txt")
session_end(sess_abc)
```

### Pattern 2: Combined Commands
```yaml
Task: "Setup and verify"

session_start() → sess_abc
session_exec(sess_abc, "mkdir -p test && cd test && touch file.txt && ls -la")
session_end(sess_abc)
```

### Pattern 3: Multi-line Scripts
```yaml
Task: "Run a loop"

session_start() → sess_abc
session_exec(sess_abc, """
for i in {1..5}; do
  echo "Iteration $i"
  sleep 0.1
done
""")
session_end(sess_abc)
```

## Debugging

### View Session State
```bash
# List all sessions
delta-sessions list

# View session metadata
cat .sessions/sess_abc123/metadata.json

# View session state (working directory)
cat .sessions/sess_abc123/state.json

# View execution history
cat .sessions/sess_abc123/history.log
```

### Common Issues

**Issue**: "Session not found"
- **Cause**: Session ID incorrect or session already terminated
- **Solution**: Check `delta-sessions list`

**Issue**: "No command provided"
- **Cause**: Command not passed via stdin
- **Solution**: Ensure `inject_as: stdin` in config.yaml

**Issue**: Commands fail with exit code 1
- **Cause**: Command error (normal behavior)
- **Solution**: Check `stderr` field for error message

## Advanced Usage

### Environment Variables
```bash
session_exec(sess_abc, "export MY_VAR=hello")
session_exec(sess_abc, "echo $MY_VAR")  # Note: env vars currently not captured
```

**Note**: v1.5 MVP doesn't capture environment variable changes yet. Use combined commands:
```bash
session_exec(sess_abc, "MY_VAR=hello; echo $MY_VAR")
```

### Background Jobs
For long-running commands, consider:
```bash
session_exec(sess_abc, "nohup long_running_command > output.log 2>&1 &")
session_exec(sess_abc, "tail output.log")
```

## See Also

- [Session Management Guide](../../docs/guides/session-management.md) - Complete guide
- [delta-sessions API Reference](../../docs/api/delta-sessions.md) - CLI documentation
- [v1.5 Architecture Design](../../docs/architecture/v1.5-sessions-simplified.md) - Design rationale
- [v1.4 to v1.5 Migration](../../docs/migration/v1.4-to-v1.5.md) - Upgrade guide

## License

MIT
