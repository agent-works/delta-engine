# delta-sessions CLI Reference (v1.5)

Complete API reference for the `delta-sessions` command-line tool.

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Commands](#commands)
  - [start](#start)
  - [exec](#exec)
  - [end](#end)
  - [list](#list)
- [Global Options](#global-options)
- [Exit Codes](#exit-codes)
- [Output Formats](#output-formats)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [See Also](#see-also)

---

## Overview

`delta-sessions` is a command-line tool for managing persistent, stateful command execution sessions. It enables agents to execute commands while preserving working directory context across multiple invocations.

**Key Features**:
- Command-based execution (no PTY complexity)
- Working directory preservation
- Immediate, complete output (no timing guesswork)
- Simple 3-command API
- Process-agnostic (bash, Python, any command-line program)

**Design Philosophy**: v1.5 sessions use synchronous command execution optimized for LLM agents. For experimental PTY-based real-time interaction, see `delta-sessions-pty`.

---

## Installation

```bash
# Install Delta Engine (includes delta-sessions)
npm install -g delta-engine

# Verify installation
delta-sessions --version

# Link for development
npm run build && npm link
```

---

## Commands

### `start`

Start a new session by launching a shell or interactive program.

#### Syntax

```bash
delta-sessions start [command] [args...] [--sessions-dir <dir>]
```

#### Parameters

- `[command]` - Shell or program to run (optional, default: `bash`)
- `[args...]` - Arguments to pass to command (optional)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `.sessions/` in CWD)

#### Output

JSON object with session metadata:
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "command": "bash",
  "work_dir": "/current/directory",
  "status": "active"
}
```

#### Examples

**Start bash shell** (default):
```bash
delta-sessions start
# Output: {"session_id":"sess_abc123","command":"bash","work_dir":"/tmp","status":"active"}
```

**Start Python REPL**:
```bash
delta-sessions start python3
# Output: {"session_id":"sess_def456","command":"python3",...}
```

**Start with custom directory**:
```bash
delta-sessions start bash --sessions-dir /tmp/my-sessions
```

**Start zsh**:
```bash
delta-sessions start zsh
```

**Start node REPL**:
```bash
delta-sessions start node
```

#### Behavior

1. Creates session directory (`.sessions/<session_id>/`)
2. Generates UUID-based session ID
3. Stores metadata (`metadata.json`)
4. Initializes state (`state.json`) with current working directory
5. Returns session ID for use with `exec`

#### Exit Codes

- `0` - Success
- `1` - Failed to create session

---

### `exec`

Execute a command in the session. Command runs to completion and returns full output immediately.

#### Syntax

```bash
delta-sessions exec <session_id> [--sessions-dir <dir>]
```

**Command input is read from stdin.**

#### Parameters

- `<session_id>` - Session ID from `start` (required)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `.sessions/`)

#### Input

Command text from stdin. Supports:
- Single-line commands: `ls -la`
- Multi-line scripts:
  ```bash
  for i in {1..5}; do
    echo "Number: $i"
  done
  ```
- Combined commands: `cd /tmp && mkdir test && ls`

#### Output

**Direct stdout/stderr output** (not JSON):
- Command stdout → stdout
- Command stderr → stderr
- Exit code passed through to shell exit code

#### Examples

**Execute simple command**:
```bash
echo "ls -la" | delta-sessions exec sess_abc123
# Output: (directory listing)
```

**Change directory and verify**:
```bash
echo "cd /tmp" | delta-sessions exec sess_abc123
echo "pwd" | delta-sessions exec sess_abc123
# Output: /tmp
```

**Multi-line Python script**:
```bash
cat <<'EOF' | delta-sessions exec sess_python1
def factorial(n):
    if n <= 1: return 1
    return n * factorial(n-1)

print(factorial(10))
EOF
# Output: 3628800
```

**Combined commands**:
```bash
echo "cd /tmp && mkdir testdir && cd testdir && pwd" | delta-sessions exec sess_abc123
# Output: /tmp/testdir
```

**Error handling**:
```bash
echo "ls /nonexistent" | delta-sessions exec sess_abc123
# stderr: ls: /nonexistent: No such file or directory
# Exit code: 1
```

#### Behavior

1. Reads command from stdin
2. Loads session state (working directory, metadata)
3. Executes command in session context
4. Captures stdout, stderr, exit code
5. Updates session state (new CWD if changed)
6. Returns complete output immediately

#### Key Differences from PTY (v1.4)

| Aspect | v1.4 PTY | v1.5 Exec |
|--------|----------|-----------|
| Interaction | write → sleep → read | exec → immediate output |
| Escape sequences | Required (`\n`, `\x1b[A`) | Not needed |
| Timing | Must guess wait times | Automatic (command completion) |
| Output | May be incomplete | Always complete |
| LLM calls | 3-5 per command | 1 per command |

#### Exit Codes

Exit code from executed command is passed through:
- `0` - Command succeeded
- `1-255` - Command failed (exit code from command)
- `1` - Session not found or session execution error

**Check exit code in scripts**:
```bash
echo "test -f /etc/passwd" | delta-sessions exec sess_abc123
if [ $? -eq 0 ]; then
  echo "File exists"
fi
```

---

### `end`

Terminate a session and clean up resources.

#### Syntax

```bash
delta-sessions end <session_id> [--sessions-dir <dir>]
```

#### Parameters

- `<session_id>` - Session ID (required)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `.sessions/`)

#### Output

JSON object:
```json
{
  "status": "terminated",
  "session_id": "sess_abc123"
}
```

#### Examples

**End bash session**:
```bash
delta-sessions end sess_abc123
# Output: {"status":"terminated","session_id":"sess_abc123"}
```

**End with custom directory**:
```bash
delta-sessions end sess_abc123 --sessions-dir /tmp/sessions
```

#### Behavior

1. Updates metadata status to "terminated"
2. Removes session directory (optional, configurable)
3. Returns confirmation

**Note**: Unlike v1.4 PTY sessions, v1.5 sessions don't have long-running processes to kill. State is file-based.

#### Exit Codes

- `0` - Success
- `1` - Session not found

---

### `list`

List all active sessions.

#### Syntax

```bash
delta-sessions list [--sessions-dir <dir>]
```

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `.sessions/`)

#### Output

JSON array of session summaries:
```json
[
  {
    "session_id": "sess_abc123",
    "command": "bash",
    "work_dir": "/tmp/project",
    "status": "active",
    "created_at": "2025-10-02T10:30:00.000Z",
    "execution_count": 5
  },
  {
    "session_id": "sess_def456",
    "command": "python3",
    "work_dir": "/home/user",
    "status": "active",
    "created_at": "2025-10-02T09:15:00.000Z",
    "execution_count": 12
  }
]
```

#### Examples

**List all sessions**:
```bash
delta-sessions list
```

**List with jq filtering**:
```bash
delta-sessions list | jq '.[] | select(.command == "bash")'
```

**Count sessions**:
```bash
delta-sessions list | jq 'length'
```

**Get first session ID**:
```bash
SESSION=$(delta-sessions list | jq -r '.[0].session_id')
```

#### Exit Codes

- `0` - Success (even if no sessions)

---

## Global Options

All commands support:

- `--sessions-dir <dir>` - Custom sessions directory
  - Default: `.sessions/` in current working directory
  - Use absolute path for shared sessions across projects

- `--help` - Show command help
- `--version` - Show version

#### Examples

**Custom sessions directory**:
```bash
delta-sessions start --sessions-dir /tmp/my-sessions
delta-sessions list --sessions-dir /tmp/my-sessions
echo "pwd" | delta-sessions exec sess_abc123 --sessions-dir /tmp/my-sessions
```

**Show help**:
```bash
delta-sessions --help
delta-sessions start --help
delta-sessions exec --help
```

**Show version**:
```bash
delta-sessions --version
# Output: 1.5.0
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (session not found, command failed) |
| N | For `exec`: exit code from executed command (1-255) |

### Exit Code Behavior

**start, end, list**:
- `0` = success
- `1` = error

**exec**:
- Passes through exit code from executed command
- Use `$?` to check command success

**Example**:
```bash
echo "test -f /etc/passwd" | delta-sessions exec sess_abc123
if [ $? -eq 0 ]; then
  echo "Command succeeded"
else
  echo "Command failed"
fi
```

---

## Output Formats

Commands output either **JSON** or **raw text**:

### JSON Commands

`start`, `end`, `list` return structured JSON:

**start**:
```json
{"session_id": "sess_abc123", "command": "bash", "work_dir": "/tmp", "status": "active"}
```

**end**:
```json
{"status": "terminated", "session_id": "sess_abc123"}
```

**list**:
```json
[{"session_id": "sess_abc123", "command": "bash", ...}]
```

**Parsing with jq**:
```bash
SESSION_ID=$(delta-sessions start | jq -r '.session_id')
WORK_DIR=$(delta-sessions list | jq -r '.[0].work_dir')
```

### Raw Text Commands

`exec` outputs raw command output (not wrapped in JSON):

**stdout → stdout**:
```bash
echo "ls -la" | delta-sessions exec sess_abc123
# Output: (raw directory listing)
```

**stderr → stderr**:
```bash
echo "ls /nonexistent" | delta-sessions exec sess_abc123
# stderr: ls: /nonexistent: No such file or directory
```

**Rationale**: Direct output provides better UX for reading command results and integrating with shell pipelines.

---

## Examples

### Example 1: Basic Shell Session

```bash
# Start bash session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Execute commands
echo "ls -la" | delta-sessions exec $SESSION
echo "pwd" | delta-sessions exec $SESSION
echo "df -h" | delta-sessions exec $SESSION

# Clean up
delta-sessions end $SESSION
```

### Example 2: Working Directory Persistence

```bash
# Start session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Change directory
echo "cd /tmp" | delta-sessions exec $SESSION

# Verify directory persists
echo "pwd" | delta-sessions exec $SESSION
# Output: /tmp

# Create subdirectory and navigate
echo "mkdir testdir && cd testdir" | delta-sessions exec $SESSION
echo "pwd" | delta-sessions exec $SESSION
# Output: /tmp/testdir

# End session
delta-sessions end $SESSION
```

### Example 3: Python REPL

```bash
# Start Python session
SESSION=$(delta-sessions start python3 | jq -r '.session_id')

# Define function
cat <<'EOF' | delta-sessions exec $SESSION
def factorial(n):
    if n <= 1: return 1
    return n * factorial(n-1)
EOF

# Call function
echo "print(factorial(10))" | delta-sessions exec $SESSION
# Output: 3628800

# End session
delta-sessions end $SESSION
```

### Example 4: Error Handling

```bash
#!/bin/bash
set -e

# Start session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Cleanup on exit
trap "delta-sessions end $SESSION 2>/dev/null || true" EXIT

# Try command
if echo "cd /nonexistent" | delta-sessions exec $SESSION; then
  echo "Success"
else
  echo "Failed with exit code: $?"
  # Continue with recovery...
  echo "cd /tmp" | delta-sessions exec $SESSION
fi

# Verify current directory
echo "pwd" | delta-sessions exec $SESSION
```

### Example 5: Multi-line Scripts

```bash
# Start session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Execute multi-line bash script
cat <<'EOF' | delta-sessions exec $SESSION
for i in {1..5}; do
  echo "Creating file_$i.txt"
  touch "file_$i.txt"
done
ls -la *.txt
EOF

# End session
delta-sessions end $SESSION
```

### Example 6: Project Setup Workflow

```bash
# Start session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Create project structure
echo "mkdir -p src tests docs" | delta-sessions exec $SESSION

# Navigate to src
echo "cd src" | delta-sessions exec $SESSION

# Create files
echo "touch index.js utils.js" | delta-sessions exec $SESSION

# Navigate to tests
echo "cd ../tests" | delta-sessions exec $SESSION
echo "touch index.test.js" | delta-sessions exec $SESSION

# Verify structure
echo "cd .." | delta-sessions exec $SESSION
echo "find . -type f" | delta-sessions exec $SESSION

# End session
delta-sessions end $SESSION
```

### Example 7: Data Pipeline

```bash
# Start session
SESSION=$(delta-sessions start | jq -r '.session_id')

# Download data
echo "curl -s https://api.example.com/data > data.json" | delta-sessions exec $SESSION

# Process with jq
echo "jq '.items[] | .name' data.json > names.txt" | delta-sessions exec $SESSION

# Analyze
echo "wc -l names.txt" | delta-sessions exec $SESSION

# View results
echo "cat names.txt" | delta-sessions exec $SESSION

# End session
delta-sessions end $SESSION
```

### Example 8: Multiple Sessions

```bash
# Start two separate sessions
SESSION_BUILD=$(delta-sessions start | jq -r '.session_id')
SESSION_TEST=$(delta-sessions start | jq -r '.session_id')

# Build in first session
echo "cd /project && npm run build" | delta-sessions exec $SESSION_BUILD &
BUILD_PID=$!

# Test in second session
echo "cd /project && npm test" | delta-sessions exec $SESSION_TEST &
TEST_PID=$!

# Wait for both
wait $BUILD_PID
wait $TEST_PID

# Clean up both
delta-sessions end $SESSION_BUILD
delta-sessions end $SESSION_TEST
```

### Example 9: Session Management

```bash
# List all sessions
delta-sessions list

# Get session count
COUNT=$(delta-sessions list | jq 'length')
echo "Active sessions: $COUNT"

# Find long-running sessions
delta-sessions list | jq '.[] | select(.execution_count > 10)'

# End all sessions (cleanup)
for session_id in $(delta-sessions list | jq -r '.[].session_id'); do
  delta-sessions end $session_id
done
```

### Example 10: Interactive Agent Integration

```yaml
# agent config.yaml
tools:
  - name: session_start
    command: [delta-sessions, start]
    parameters: []

  - name: session_exec
    command: [delta-sessions, exec]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: command
        type: string
        inject_as: stdin

  - name: session_end
    command: [delta-sessions, end]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
```

**Agent workflow**:
```
Thought: I need to list files and check disk usage
Action: session_start()
Result: {"session_id": "sess_abc123", ...}

Thought: List files
Action: session_exec("sess_abc123", "ls -la")
Result: (file listing)

Thought: Check disk usage
Action: session_exec("sess_abc123", "df -h")
Result: (disk usage)

Thought: Task complete, clean up
Action: session_end("sess_abc123")
Result: {"status": "terminated"}
```

---

## Troubleshooting

### Command Not Found

**Problem**: `delta-sessions: command not found`

**Solution**:
```bash
# Check installation
npm list -g delta-engine

# Reinstall
npm install -g delta-engine

# Verify
which delta-sessions

# For local development
npm run build && npm link
```

---

### Session Not Found

**Problem**: `Error: Session sess_abc123 not found`

**Causes**:
- Session ID typo
- Session already terminated
- Wrong `--sessions-dir` path

**Solution**:
```bash
# List all sessions
delta-sessions list

# Check specific directory
delta-sessions list --sessions-dir /path/to/sessions

# Verify session exists
ls -la .sessions/sess_abc123/
```

---

### Command Fails with Exit Code 1

**Problem**: Commands return exit code 1

**Cause**: Command error (normal behavior, not a delta-sessions bug)

**Solution**: Check stderr for error details
```bash
echo "ls /nonexistent" | delta-sessions exec sess_abc123 2>&1
# stderr shows: ls: /nonexistent: No such file or directory
```

**Handle errors in scripts**:
```bash
if echo "cd /tmp/test" | delta-sessions exec $SESSION; then
  echo "Directory exists"
else
  echo "Directory doesn't exist, creating..."
  echo "mkdir -p /tmp/test && cd /tmp/test" | delta-sessions exec $SESSION
fi
```

---

### Working Directory Not Preserved

**Problem**: `cd` commands don't persist

**Causes**:
- Using different session IDs (each session has independent CWD)
- Command failed (exit code != 0)

**Solution**:

**✅ Same session - CWD persists**:
```bash
echo "cd /tmp" | delta-sessions exec sess_abc123
echo "pwd" | delta-sessions exec sess_abc123  # Output: /tmp
```

**❌ Different sessions - CWD independent**:
```bash
echo "cd /tmp" | delta-sessions exec sess_abc123
echo "pwd" | delta-sessions exec sess_xyz456  # Output: (original CWD)
```

**Check exit code**:
```bash
if echo "cd /nonexistent" | delta-sessions exec $SESSION; then
  echo "Directory changed"
else
  echo "cd failed, CWD unchanged"
fi
```

---

### No Command Provided (stdin empty)

**Problem**: `Error: No command provided (stdin is empty)`

**Cause**: Forgot to pipe command to `exec`

**Solution**:

**❌ Wrong**:
```bash
delta-sessions exec sess_abc123 "ls -la"  # Doesn't work
```

**✅ Correct**:
```bash
echo "ls -la" | delta-sessions exec sess_abc123
```

---

### Comparison with PTY Sessions

**Problem**: Migrating from `delta-sessions-pty` (v1.4)

**Solution**: See [Migration Guide](../migration/v1.4-to-v1.5.md)

**Key differences**:

| Aspect | PTY (v1.4) | Simplified (v1.5) |
|--------|------------|-------------------|
| Commands | 8 commands | 3 commands |
| Interaction | write → sleep → read | exec → immediate |
| Escape sequences | Required | Not needed |
| Timing | Must guess | Automatic |
| Real-time apps | Supported (vim, top) | Not supported |
| LLM-friendliness | Low | High |

**When to use PTY**: Interactive TUI apps (vim, htop, tmux). Use `delta-sessions-pty` (experimental).

**When to use v1.5**: 90% of use cases (bash commands, Python scripts, SQL queries).

---

## See Also

- **[Session Management Guide](../guides/session-management.md)** - Comprehensive usage guide with patterns and best practices
- **[v1.5 Architecture Design](../architecture/v1.5-sessions-simplified.md)** - Technical design document and rationale
- **[v1.4 to v1.5 Migration Guide](../migration/v1.4-to-v1.5.md)** - Upgrade from PTY-based sessions
- **[Interactive Shell Example](../../examples/2-core-features/interactive-shell/)** - Working example agent
- **[Python REPL Example](../../examples/2-core-features/python-repl/)** - Python execution example

### Experimental PTY Sessions

For real-time PTY interaction (vim, top, htop):
- **[delta-sessions-pty Reference](./delta-sessions-pty.md)** - Experimental PTY API (v1.4)
- **[PTY Deprecation](../architecture/v1.4-pty-deprecation.md)** - Why PTY was deprecated

---

## Version History

- **v1.5.0** (2025-10-02) - Simplified command-based sessions (start, exec, end)
- **v1.4.2** (2025-10-01) - PTY-based sessions with Unix Domain Sockets
- **v1.4.0** (2025-09-30) - PTY-based sessions with screen backend

---

**Version**: 1.5.0
**Last Updated**: 2025-10-02

**Note**: This is the **recommended API** for Delta Engine sessions. For experimental PTY support, see `delta-sessions-pty` (not recommended for LLM agents).
