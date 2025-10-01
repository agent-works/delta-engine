# delta-sessions CLI Reference

Complete API reference for the `delta-sessions` command-line tool.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Commands](#commands)
  - [start](#start)
  - [write](#write)
  - [write-key](#write-key)
  - [read](#read)
  - [end](#end)
  - [list](#list)
  - [status](#status)
  - [cleanup](#cleanup)
- [Global Options](#global-options)
- [Exit Codes](#exit-codes)
- [Output Formats](#output-formats)
- [Supported Keys](#supported-keys)
- [Escape Sequences](#escape-sequences)
- [Examples](#examples)

---

## Overview

`delta-sessions` is a command-line tool for managing persistent PTY (pseudo-terminal) sessions. It enables agents to interact with long-running, stateful command-line programs.

**Key Features**:
- Start any interactive CLI program
- Read/write to running processes
- Support keyboard control sequences
- Process-agnostic (bash, Python, psql, ssh, etc.)
- Automatic dead session detection

---

## Installation

```bash
# Install Delta Engine (includes delta-sessions)
npm install -g delta-engine

# Verify installation
delta-sessions --version
```

---

## Commands

### `start`

Start a new session by launching a command in a PTY.

#### Syntax

```bash
delta-sessions start <command> [args...] [--sessions-dir <dir>]
```

#### Parameters

- `<command>` - Executable to run (required)
- `[args...]` - Arguments to pass to command (optional)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `~/.sessions/`)

#### Output

JSON object with session ID:
```json
{
  "session_id": "sess_abc123def456"
}
```

#### Examples

**Start bash shell**:
```bash
delta-sessions start bash
# Output: {"session_id":"sess_abc123"}
```

**Start Python REPL**:
```bash
delta-sessions start python3 -i
# Output: {"session_id":"sess_def456"}
```

**Start with custom directory**:
```bash
delta-sessions start bash --sessions-dir /tmp/my-sessions
```

**Start psql**:
```bash
delta-sessions start psql -h localhost -U postgres -d mydb
```

**Start SSH session**:
```bash
delta-sessions start ssh user@example.com
```

#### Exit Codes

- `0` - Success
- `1` - Failed to start process

---

### `write`

Send text input to a session (simulates typing).

#### Syntax

```bash
delta-sessions write <session_id> [--sessions-dir <dir>]
```

Input is read from stdin.

#### Parameters

- `<session_id>` - Session ID from `start` (required)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `~/.sessions/`)

#### Input

Text from stdin. Supports:
- Literal text
- Escape sequences: `\n` (newline), `\t` (tab), `\\` (backslash)
- Hex escapes: `\xNN` (e.g., `\x03` for Ctrl+C)
- Control characters for keyboard input

#### Output

Empty on success.

#### Examples

**Send command to shell**:
```bash
echo "ls -la\n" | delta-sessions write sess_abc123
```

**Send Python code**:
```bash
echo "print('hello')\n" | delta-sessions write sess_python1
```

**Send control character (Ctrl+C)**:
```bash
echo "\x03" | delta-sessions write sess_abc123
```

**Send multi-line code**:
```bash
cat <<'EOF' | delta-sessions write sess_python1
def factorial(n):
    if n <= 1: return 1
    return n * factorial(n-1)

EOF
```

**Send arrow key (escape sequence)**:
```bash
echo "\x1b[A" | delta-sessions write sess_abc123  # Up arrow
```

#### Exit Codes

- `0` - Success
- `1` - Session not found or dead
- `1` - Write failed

---

### `write-key`

Send a semantic keyboard key to a session (wrapper around `write` for clarity).

#### Syntax

```bash
delta-sessions write-key <session_id> <key_name> [--sessions-dir <dir>]
```

#### Parameters

- `<session_id>` - Session ID (required)
- `<key_name>` - Semantic key name (required, see [Supported Keys](#supported-keys))

#### Options

- `--sessions-dir <dir>` - Custom sessions directory (default: `~/.sessions/`)

#### Output

Empty on success.

#### Examples

**Send Enter key**:
```bash
delta-sessions write-key sess_abc123 enter
```

**Send Ctrl+C (interrupt)**:
```bash
delta-sessions write-key sess_abc123 ctrl+c
```

**Navigate menu with arrows**:
```bash
delta-sessions write-key sess_abc123 arrow_down
delta-sessions write-key sess_abc123 arrow_down
delta-sessions write-key sess_abc123 enter
```

**Send function key**:
```bash
delta-sessions write-key sess_abc123 f1
```

#### Exit Codes

- `0` - Success
- `1` - Session not found or dead
- `1` - Invalid key name

---

### `read`

Read output from a session.

#### Syntax

```bash
delta-sessions read <session_id> [options]
```

#### Parameters

- `<session_id>` - Session ID (required)

#### Options

- `--timeout <ms>` - Wait timeout in milliseconds (default: 0)
- `--wait` - Wait indefinitely until prompt detected
- `--follow` - Stream output continuously (like `tail -f`)
- `--lines <n>` - Return only first N lines
- `--sessions-dir <dir>` - Custom sessions directory

#### Read Modes

**1. Immediate read** (no options):
```bash
delta-sessions read sess_abc123
```
Returns buffered output immediately.

**2. Timeout wait** (`--timeout`):
```bash
delta-sessions read sess_abc123 --timeout 2000
```
Waits up to 2 seconds. Returns early if prompt detected.

**3. Wait for completion** (`--wait`):
```bash
delta-sessions read sess_abc123 --wait
```
Waits indefinitely until prompt pattern detected.

**4. Stream output** (`--follow`):
```bash
delta-sessions read sess_abc123 --follow
```
Continuously streams output (useful for monitoring).

**5. Limited lines** (`--lines`):
```bash
delta-sessions read sess_abc123 --lines 10
```
Returns first 10 lines only.

#### Output

Raw text output from session (stdout + stderr combined).

#### Prompt Detection

`read` with `--timeout` or `--wait` returns early when it detects:
- `$ ` - Shell prompt
- `>>> ` - Python prompt
- `=> ` - psql prompt
- `# ` - Root shell or comment prompt

Custom prompts may not be detected (will wait full timeout).

#### Examples

**Read shell output after command**:
```bash
echo "ls -la\n" | delta-sessions write sess_abc123
delta-sessions read sess_abc123 --timeout 2000
```

**Read Python REPL output**:
```bash
echo "print(2+2)\n" | delta-sessions write sess_py1
delta-sessions read sess_py1 --timeout 1000
# Output: 4\n>>>
```

**Stream long-running command**:
```bash
echo "npm install\n" | delta-sessions write sess_abc123
delta-sessions read sess_abc123 --follow
# Streams output as npm installs packages
```

**Get first 5 lines of help**:
```bash
echo "help\n" | delta-sessions write sess_abc123
delta-sessions read sess_abc123 --timeout 1000 --lines 5
```

#### Exit Codes

- `0` - Success (even if empty output)
- `1` - Session not found or dead

---

### `end`

Terminate a session by killing the process.

#### Syntax

```bash
delta-sessions end <session_id> [--sessions-dir <dir>]
```

#### Parameters

- `<session_id>` - Session ID (required)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory

#### Output

JSON object:
```json
{
  "status": "terminated"
}
```

#### Examples

**End bash session**:
```bash
delta-sessions end sess_abc123
```

**End Python session**:
```bash
delta-sessions end sess_python1
```

#### Behavior

- Sends SIGTERM to process
- Waits up to 5 seconds for graceful shutdown
- Force kills (SIGKILL) if still running
- Removes session metadata

#### Exit Codes

- `0` - Success
- `1` - Session not found (already dead or never existed)

---

### `list`

List all sessions.

#### Syntax

```bash
delta-sessions list [--sessions-dir <dir>]
```

#### Options

- `--sessions-dir <dir>` - Custom sessions directory

#### Output

JSON array of session summaries:
```json
{
  "sessions": [
    {
      "session_id": "sess_abc123",
      "command": ["bash"],
      "status": "running",
      "created_at": "2025-10-01T10:30:00.000Z"
    },
    {
      "session_id": "sess_def456",
      "command": ["python3", "-i"],
      "status": "dead",
      "created_at": "2025-10-01T09:15:00.000Z"
    }
  ]
}
```

#### Examples

**List all sessions**:
```bash
delta-sessions list
```

**List in custom directory**:
```bash
delta-sessions list --sessions-dir /tmp/sessions
```

#### Exit Codes

- `0` - Success (even if no sessions)

---

### `status`

Check if a session is alive.

#### Syntax

```bash
delta-sessions status <session_id> [--sessions-dir <dir>]
```

#### Parameters

- `<session_id>` - Session ID (required)

#### Options

- `--sessions-dir <dir>` - Custom sessions directory

#### Output

JSON object:
```json
{
  "session_id": "sess_abc123",
  "command": ["bash"],
  "pid": 12345,
  "status": "running",
  "created_at": "2025-10-01T10:30:00.000Z",
  "last_accessed_at": "2025-10-01T10:32:15.000Z"
}
```

#### Status Values

- `running` - Process is alive and healthy
- `dead` - Process terminated or killed

#### Examples

**Check bash session**:
```bash
delta-sessions status sess_abc123
```

**Check and parse with jq**:
```bash
STATUS=$(delta-sessions status sess_abc123 | jq -r '.status')
if [ "$STATUS" = "running" ]; then
  echo "Session is alive"
fi
```

#### Exit Codes

- `0` - Success (session exists, regardless of status)
- `1` - Session not found

---

### `cleanup`

Remove all dead sessions.

#### Syntax

```bash
delta-sessions cleanup [--sessions-dir <dir>]
```

#### Options

- `--sessions-dir <dir>` - Custom sessions directory

#### Output

JSON object with removal count:
```json
{
  "removed": 3
}
```

#### Examples

**Clean up dead sessions**:
```bash
delta-sessions cleanup
# Output: {"removed":2}
```

**Scheduled cleanup (cron)**:
```bash
# Add to crontab
0 2 * * * delta-sessions cleanup
```

#### Behavior

- Scans all sessions
- Checks process liveness (`kill -0`)
- Removes metadata for dead processes
- Deletes session directories

#### Exit Codes

- `0` - Success (even if no dead sessions)

---

## Global Options

All commands support:

- `--sessions-dir <dir>` - Custom sessions directory (default: `~/.sessions/`)
- `--help` - Show command help
- `--version` - Show version

#### Examples

**Custom sessions directory**:
```bash
delta-sessions start bash --sessions-dir /tmp/my-sessions
delta-sessions list --sessions-dir /tmp/my-sessions
```

**Show help**:
```bash
delta-sessions --help
delta-sessions start --help
delta-sessions read --help
```

**Show version**:
```bash
delta-sessions --version
# Output: 1.4.0
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (session not found, process failed, invalid input) |

All commands follow this convention for scripting.

---

## Output Formats

All commands output **JSON** or **raw text**:

**JSON commands** (`start`, `end`, `list`, `status`, `cleanup`):
```json
{"session_id": "sess_abc123"}
```

**Text commands** (`read`):
```
ls -la output
total 48
drwxr-xr-x  12 user  staff  384 Oct  1 10:30 .
```

**Parsing JSON**:
```bash
SESSION_ID=$(delta-sessions start bash | jq -r '.session_id')
echo "Started session: $SESSION_ID"
```

---

## Supported Keys

The `write-key` command supports the following semantic key names:

### Navigation Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `arrow_up` | `\x1b[A` | Up arrow |
| `arrow_down` | `\x1b[B` | Down arrow |
| `arrow_right` | `\x1b[C` | Right arrow |
| `arrow_left` | `\x1b[D` | Left arrow |
| `home` | `\x1b[H` | Home key |
| `end` | `\x1b[F` | End key |
| `page_up` | `\x1b[5~` | Page Up |
| `page_down` | `\x1b[6~` | Page Down |

### Confirmation Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `enter` | `\n` | Enter/Return |
| `tab` | `\t` | Tab |
| `space` | ` ` | Space bar |

### Control Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `ctrl+a` | `\x01` | Ctrl+A |
| `ctrl+b` | `\x02` | Ctrl+B |
| `ctrl+c` | `\x03` | Ctrl+C (interrupt) |
| `ctrl+d` | `\x04` | Ctrl+D (EOF) |
| `ctrl+e` | `\x05` | Ctrl+E |
| `ctrl+f` | `\x06` | Ctrl+F |
| `ctrl+g` | `\x07` | Ctrl+G |
| `ctrl+h` | `\x08` | Ctrl+H (backspace) |
| `ctrl+k` | `\x0b` | Ctrl+K |
| `ctrl+l` | `\x0c` | Ctrl+L (clear) |
| `ctrl+n` | `\x0e` | Ctrl+N |
| `ctrl+p` | `\x10` | Ctrl+P |
| `ctrl+r` | `\x12` | Ctrl+R (search) |
| `ctrl+t` | `\x14` | Ctrl+T |
| `ctrl+u` | `\x15` | Ctrl+U |
| `ctrl+w` | `\x17` | Ctrl+W |
| `ctrl+x` | `\x18` | Ctrl+X |
| `ctrl+y` | `\x19` | Ctrl+Y |
| `ctrl+z` | `\x1a` | Ctrl+Z (suspend) |

### Function Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `f1` | `\x1bOP` | F1 |
| `f2` | `\x1bOQ` | F2 |
| `f3` | `\x1bOR` | F3 |
| `f4` | `\x1bOS` | F4 |
| `f5` | `\x1b[15~` | F5 |
| `f6` | `\x1b[17~` | F6 |
| `f7` | `\x1b[18~` | F7 |
| `f8` | `\x1b[19~` | F8 |
| `f9` | `\x1b[20~` | F9 |
| `f10` | `\x1b[21~` | F10 |
| `f11` | `\x1b[23~` | F11 |
| `f12` | `\x1b[24~` | F12 |

### Editing Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `backspace` | `\x7f` | Backspace |
| `delete` | `\x1b[3~` | Delete |
| `insert` | `\x1b[2~` | Insert |
| `escape` | `\x1b` | Escape |

### Special Keys

| Key Name | Escape Sequence | Description |
|----------|----------------|-------------|
| `ctrl+shift+z` | `\x1b[1;6Z` | Ctrl+Shift+Z |

---

## Escape Sequences

The `write` command supports parsing escape sequences in input:

### Standard Escapes

| Sequence | Character | Description |
|----------|-----------|-------------|
| `\n` | Newline (0x0A) | Line feed |
| `\r` | Carriage return (0x0D) | Return |
| `\t` | Tab (0x09) | Horizontal tab |
| `\\` | Backslash (0x5C) | Literal backslash |

### Hex Escapes

Format: `\xNN` where `NN` is a two-digit hexadecimal value.

**Examples**:
```bash
\x03  # Ctrl+C
\x1b  # Escape key
\x0a  # Newline
\x20  # Space
```

### Unicode Escapes

Format: `\uNNNN` where `NNNN` is a four-digit hexadecimal Unicode code point.

**Examples**:
```bash
\u0041  # 'A'
\u2764  # ❤
\u4e2d  # 中
```

### Control Characters

ANSI escape sequences for cursor control and colors:

**Cursor movement**:
```bash
\x1b[A      # Up
\x1b[B      # Down
\x1b[C      # Right
\x1b[D      # Left
\x1b[H      # Home
\x1b[2J     # Clear screen
```

**Colors**:
```bash
\x1b[31m    # Red text
\x1b[32m    # Green text
\x1b[0m     # Reset colors
```

---

## Examples

### Example 1: Simple Shell Session

```bash
# Start bash
SESSION=$(delta-sessions start bash | jq -r '.session_id')

# Wait for prompt
delta-sessions read $SESSION --timeout 1000

# List files
echo "ls -la\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 2000

# Check disk usage
echo "df -h\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 2000

# End session
delta-sessions end $SESSION
```

### Example 2: Python REPL

```bash
# Start Python
SESSION=$(delta-sessions start python3 -i | jq -r '.session_id')

# Wait for prompt
delta-sessions read $SESSION --timeout 1000

# Define function
cat <<'EOF' | delta-sessions write $SESSION
def factorial(n):
    if n <= 1: return 1
    return n * factorial(n-1)

EOF
delta-sessions read $SESSION --timeout 1000

# Call function
echo "print(factorial(10))\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 1000
# Output: 3628800

# Clean up
delta-sessions end $SESSION
```

### Example 3: Interactive Menu Navigation

```bash
# Start program with menu
SESSION=$(delta-sessions start ./menu-program | jq -r '.session_id')

# Wait for menu
delta-sessions read $SESSION --timeout 2000

# Navigate down 2 times
delta-sessions write-key $SESSION arrow_down
delta-sessions read $SESSION --timeout 500
delta-sessions write-key $SESSION arrow_down
delta-sessions read $SESSION --timeout 500

# Select option
delta-sessions write-key $SESSION enter
delta-sessions read $SESSION --timeout 2000

# Exit
delta-sessions write-key $SESSION ctrl+c
delta-sessions end $SESSION
```

### Example 4: Long-Running Command

```bash
# Start session
SESSION=$(delta-sessions start bash | jq -r '.session_id')

# Run long command
echo "npm install\n" | delta-sessions write $SESSION

# Stream output
delta-sessions read $SESSION --follow &
READER_PID=$!

# Wait for completion (or interrupt manually)
wait $READER_PID

# Clean up
delta-sessions end $SESSION
```

### Example 5: Error Handling

```bash
#!/bin/bash
set -e

# Start session
SESSION=$(delta-sessions start bash | jq -r '.session_id')

# Function to clean up on exit
cleanup() {
  echo "Cleaning up..."
  delta-sessions end $SESSION 2>/dev/null || true
}
trap cleanup EXIT

# Execute command
echo "ls /nonexistent\n" | delta-sessions write $SESSION
OUTPUT=$(delta-sessions read $SESSION --timeout 2000)

# Check for errors
if echo "$OUTPUT" | grep -q "No such file"; then
  echo "Error: Directory not found"
  exit 1
fi

echo "Success!"
```

### Example 6: Session Lifecycle

```bash
#!/bin/bash

# Check existing sessions
delta-sessions list

# Clean up dead sessions
delta-sessions cleanup

# Start new session
SESSION=$(delta-sessions start bash | jq -r '.session_id')
echo "Started: $SESSION"

# Check status
delta-sessions status $SESSION

# Use session
echo "echo 'Hello World'\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 1000

# Verify still alive
STATUS=$(delta-sessions status $SESSION | jq -r '.status')
if [ "$STATUS" != "running" ]; then
  echo "Session died unexpectedly!"
  exit 1
fi

# End session
delta-sessions end $SESSION
echo "Session terminated"

# Verify it's gone
delta-sessions status $SESSION 2>/dev/null && echo "ERROR: Still exists!" || echo "Confirmed deleted"
```

### Example 7: Database Queries

```bash
# Connect to PostgreSQL
SESSION=$(delta-sessions start psql -h localhost -U postgres -d mydb | jq -r '.session_id')

# Wait for prompt
delta-sessions read $SESSION --timeout 3000

# Execute query
cat <<'EOF' | delta-sessions write $SESSION
SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days';
EOF
echo "\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 5000

# Another query
echo "\\dt\n" | delta-sessions write $SESSION  # List tables
delta-sessions read $SESSION --timeout 2000

# Exit
echo "\\q\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 1000

delta-sessions end $SESSION
```

### Example 8: SSH Remote Commands

```bash
# Connect via SSH
SESSION=$(delta-sessions start ssh user@example.com | jq -r '.session_id')

# Wait for connection
delta-sessions read $SESSION --timeout 10000

# Execute remote command
echo "df -h\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 3000

# Another command
echo "uptime\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 2000

# Disconnect
echo "exit\n" | delta-sessions write $SESSION
delta-sessions read $SESSION --timeout 2000

delta-sessions end $SESSION
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
```

### Session Not Found

**Problem**: `Error: Session not found or dead`

**Solution**:
```bash
# List all sessions
delta-sessions list

# Check specific session
delta-sessions status sess_abc123

# Clean up dead sessions
delta-sessions cleanup
```

### Timeout Issues

**Problem**: `read` returns empty or incomplete output

**Solutions**:
```bash
# Increase timeout
delta-sessions read $SESSION --timeout 5000  # 5 seconds

# Or wait indefinitely
delta-sessions read $SESSION --wait

# Or stream output
delta-sessions read $SESSION --follow
```

### Invalid Key Name

**Problem**: `Error: Invalid key name: xyz`

**Solution**: Check [Supported Keys](#supported-keys) section. Use exact key names:
```bash
# Wrong: delta-sessions write-key $SESSION up
# Correct:
delta-sessions write-key $SESSION arrow_up
```

---

## See Also

- [Session Management Guide](../guides/session-management.md) - Comprehensive usage guide
- [Architecture Design](../architecture/v1.4-sessions-design.md) - Technical design document
- [Interactive Shell Example](../../examples/interactive-shell/) - Working example agent
- [Python REPL Example](../../examples/python-repl/) - Python REPL agent

---

**Version**: 1.4.0
**Last Updated**: 2025-10-01
