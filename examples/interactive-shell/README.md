# Interactive Shell Agent

An intelligent agent with access to a persistent bash shell session.

## Overview

This agent demonstrates how to use Delta Engine's session management to interact with a long-running bash shell. The shell session persists across multiple commands, maintaining environment variables, working directory, and command history.

## Features

- ✅ Persistent bash shell session
- ✅ Execute multiple commands in sequence
- ✅ Environment and state preservation
- ✅ Support for interactive programs
- ✅ Control key support (arrows, ctrl+c, etc.)

## Usage

### Basic Usage

```bash
# Run the agent
delta run --agent examples/interactive-shell --task "List files in the current directory and show disk usage"
```

### Example Tasks

**Simple Commands**:
```bash
delta run --agent examples/interactive-shell --task "What is the current directory? List all files."
```

**Multi-Step Tasks**:
```bash
delta run --agent examples/interactive-shell --task "Create a directory called 'test', navigate into it, create a file called 'hello.txt' with content 'Hello World', and show me the file content"
```

**Environment Exploration**:
```bash
delta run --agent examples/interactive-shell --task "Show me the value of PATH environment variable and list all shell aliases"
```

**System Information**:
```bash
delta run --agent examples/interactive-shell --task "Show system information: OS version, disk usage, memory usage, and current user"
```

## How It Works

### Tool Flow

1. **Start Session**: `shell_start()` creates a bash process with PTY
2. **Read Prompt**: `shell_read()` gets the initial shell prompt
3. **Execute Commands**: `shell_write()` sends commands with `\n`
4. **Get Results**: `shell_read()` retrieves command output
5. **Cleanup**: `shell_end()` terminates the session

### Example Execution

```
User: "List files and check disk space"

Agent:
1. shell_start() → session_id: sess_abc123
2. shell_read(sess_abc123, 1000) → "user@host:~$ "
3. shell_write(sess_abc123, "ls -la\n")
4. shell_read(sess_abc123, 2000) → [file listing]
5. shell_write(sess_abc123, "df -h\n")
6. shell_read(sess_abc123, 2000) → [disk usage]
7. shell_end(sess_abc123) → terminated
```

## Configuration

See `config.yaml` for tool definitions:
- `shell_start` - Start bash session
- `shell_write` - Send text input
- `shell_send_key` - Send control keys
- `shell_read` - Read output
- `shell_end` - Terminate session
- `shell_list` - List sessions (debug)

## Advanced Usage

### Working with Interactive Programs

The agent can navigate interactive menus using control keys:

```bash
delta run --agent examples/interactive-shell --task "Run 'top' and show me the top 5 processes, then exit"
```

The agent will:
1. Start the shell
2. Run `top`
3. Wait for output
4. Send `q` to quit
5. Read the result

### Long-Running Commands

For commands that take time:

```bash
delta run --agent examples/interactive-shell --task "Find all .js files in the current directory and subdirectories"
```

The agent will use appropriate timeouts in `shell_read()`.

### Handling Errors

The agent can recover from errors:

```bash
delta run --agent examples/interactive-shell --task "Try to cat a non-existent file and handle the error gracefully"
```

## Troubleshooting

### Session Errors

**Problem**: "Session not found or dead"

**Solution**: The session process may have crashed. The agent will automatically start a new session.

### No Output

**Problem**: `shell_read` returns empty string

**Possible Causes**:
- Command produces no output (e.g., `cd`)
- Timeout too short for slow commands
- Command is waiting for input

**Solution**: Agent should try longer timeout or check if command completed.

### Hung Processes

**Problem**: Command hangs and doesn't return

**Solution**: Agent can send `ctrl+c` via `shell_send_key(session_id, "ctrl+c")`

## Limitations

1. **Single Process Only**: Each session is independent
2. **No Process Restoration**: Sessions don't survive `delta-sessions` CLI restarts
3. **Output Buffering**: Very large outputs (>1MB) may be truncated
4. **Platform-Specific**: Behavior may vary on Windows (use WSL)

## See Also

- [Session Management Design](../../docs/architecture/v1.4-sessions-design.md)
- [delta-sessions CLI Reference](../../docs/api/delta-sessions.md)
- [Python REPL Example](../python-repl/)
