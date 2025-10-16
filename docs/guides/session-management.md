# Session Management Guide (v1.5)

Complete guide to using Delta Engine's simplified session management system.

---

## Table of Contents

- [What Are Sessions?](#what-are-sessions)
- [When to Use Sessions](#when-to-use-sessions)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Tool Configuration](#tool-configuration)
- [Common Patterns](#common-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)
- [Migration from v1.4](#migration-from-v14)

---

## What Are Sessions?

Sessions provide **persistent, stateful command execution** in Delta Engine. While the engine core remains stateless (rebuilding from journal), sessions enable agents to maintain working directory and environment context across multiple command executions.

### Key Features

- **Command-based execution**: Single `exec` call returns complete output
- **State preservation**: Working directory persists across commands
- **LLM-friendly**: No timing guesses, no escape sequences
- **Simple API**: Only 3 commands (start, exec, end)
- **File-based storage**: State visible in `.sessions/` directory

### When NOT to Use Sessions

- ✅ **Use sessions**: Multi-command workflows, state preservation needed
- ❌ **Don't use**: Single commands, no state needed → Use regular tools instead

---

## When to Use Sessions

### ✅ Use Sessions When:

**Stateful Context Required**
```
Task: "Navigate to /tmp, create files, then list them"
→ Working directory must persist across commands
```

**Multi-command Workflows**
```
Task: "Install package, run tests, check coverage"
→ Environment setup must persist
```

**Sequential Operations**
```
Task: "Analyze code, generate report, save results"
→ Intermediate state must be maintained
```

### ❌ Don't Use Sessions When:

**Single Commands**
```
Task: "Show current directory"
→ Use simple tool: [pwd]
```

**Independent Operations**
```
Task: "List files in /tmp AND check disk usage in /var"
→ Two separate one-shot commands suffice
```

---

## Quick Start

### 1. Add Session Tools to Agent

**`config.yaml`:**
```yaml
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

### 2. Update System Prompt

**`system_prompt.md`:**
```markdown
## Session Tools

### session_start()
Start a new bash session. Returns session_id.

### session_exec(session_id, command)
Execute command in session. Returns complete output immediately.

### session_end(session_id)
Terminate session when done.

## Workflow

1. Start: session_start() → get session_id
2. Execute: session_exec(session_id, "command") → get output
3. State preserved: Working directory persists
4. End: session_end(session_id) when finished
```

### 3. Run Your Agent

```bash
delta run -y -m "Create directory test and add 3 files"
```

---

## Core Concepts

### 1. Session Lifecycle

```
session_start()
    ↓
    Returns: {"session_id": "sess_abc123"}
    ↓
session_exec(sess_abc123, "cd /tmp")
    ↓
    Returns: {"stdout": "", "exit_code": 0}
    ↓
session_exec(sess_abc123, "pwd")
    ↓
    Returns: {"stdout": "/tmp", "exit_code": 0}
    ↓
session_end(sess_abc123)
```

**Key Point**: State (CWD) preserved between exec calls.

### 2. Command Execution Model

**Synchronous execution:**
```
exec("ls -la")
    ↓ [command runs to completion]
    ↓
{"stdout": "total 48...", "stderr": "", "exit_code": 0}
```

**Not asynchronous** (no write/sleep/read):
```
❌ write("ls\n") → sleep(2) → read()
✅ exec("ls -la") → immediate complete output
```

### 3. State Preservation

**Working directory persists:**
```bash
session_exec(sess_abc, "cd /tmp")
session_exec(sess_abc, "mkdir test")
session_exec(sess_abc, "cd test")
session_exec(sess_abc, "pwd")
# Output: /tmp/test
```

**Environment variables inherited** (not captured in v1.5 MVP):
```bash
# Workaround: use combined commands
session_exec(sess_abc, "VAR=hello; echo $VAR")
```

### 4. Output Structure

Every `exec` returns:
```json
{
  "stdout": "command output",
  "stderr": "error output",
  "exit_code": 0,
  "execution_time_ms": 42
}
```

- `exit_code == 0`: Success
- `exit_code != 0`: Failure (check `stderr`)

---

## Tool Configuration

### Minimal Configuration (3 tools)

**`config.yaml`:**
```yaml
name: my-agent
version: 1.0.0
description: Agent with session support

llm:
  model: gpt-4o
  temperature: 0.7

tools:
  - name: session_start
    description: "Start a persistent bash session"
    command: [delta-sessions, start]
    parameters: []

  - name: session_exec
    description: |
      Execute bash command in session.
      Returns complete output (stdout, stderr, exit_code).
    command: [delta-sessions, exec]
    parameters:
      - name: session_id
        type: string
        description: "Session ID from session_start"
        inject_as: argument
      - name: command
        type: string
        description: "Bash command (can be multi-line)"
        inject_as: stdin

  - name: session_end
    description: "Terminate session when done"
    command: [delta-sessions, end]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
```

### Alternative Shell Support

**Python shell:**
```yaml
- name: python_start
  command: [delta-sessions, start, python3]
```

**Custom shell:**
```yaml
- name: shell_start
  command: [delta-sessions, start, zsh]
```

---

## Common Patterns

### Pattern 1: Sequential Commands

**Use Case**: Commands depend on previous state

```yaml
Task: "Setup project structure"

Actions:
1. session_start() → sess_abc
2. session_exec(sess_abc, "mkdir -p src tests docs")
3. session_exec(sess_abc, "cd src")
4. session_exec(sess_abc, "touch index.js")
5. session_exec(sess_abc, "cd ../tests")
6. session_exec(sess_abc, "touch index.test.js")
7. session_exec(sess_abc, "ls -R")
8. session_end(sess_abc)
```

### Pattern 2: Combined Commands

**Use Case**: Multiple operations, atomic execution

```yaml
Task: "Install and verify"

Action:
session_exec(sess_abc, """
npm install express &&
node -e "require('express'); console.log('OK')"
""")
```

### Pattern 3: Error Recovery

**Use Case**: Handle command failures

```yaml
Thought: Try to remove directory
Action: session_exec(sess_abc, "rm -rf /tmp/test")
Result: {"stderr": "No such file", "exit_code": 1}

Thought: Directory doesn't exist, create it instead
Action: session_exec(sess_abc, "mkdir /tmp/test")
Result: {"exit_code": 0}
```

### Pattern 4: Multi-line Scripts

**Use Case**: Complex logic

```yaml
Action: session_exec(sess_abc, """
#!/bin/bash
for i in {1..5}; do
  echo "Processing $i"
  mkdir -p dir_$i
  cd dir_$i
  touch file.txt
  cd ..
done
ls -la
""")
```

### Pattern 5: Data Processing Pipeline

**Use Case**: Chain transformations

```yaml
# Step 1: Download data
session_exec(sess_abc, "curl https://api.example.com/data > data.json")

# Step 2: Process
session_exec(sess_abc, "jq '.items[] | .name' data.json > names.txt")

# Step 3: Analyze
session_exec(sess_abc, "wc -l names.txt")

# Step 4: Verify
session_exec(sess_abc, "cat names.txt")
```

---

## Best Practices

### 1. Session Lifecycle Management

✅ **Do**: Always call `session_end()`
```yaml
session_start() → sess_abc
# ... commands ...
session_end(sess_abc)  # Always cleanup
```

❌ **Don't**: Leave sessions open
```yaml
session_start() → sess_abc
# ... commands ...
# (forgot to end) → session orphaned
```

### 2. Error Handling

✅ **Do**: Check exit codes
```yaml
result = session_exec(sess_abc, "command")
if result.exit_code != 0:
    # Handle error
    check stderr for details
```

❌ **Don't**: Ignore failures
```yaml
session_exec(sess_abc, "command")
# (didn't check exit_code) → silent failure
```

### 3. Command Composition

✅ **Do**: Use `&&` for dependent commands
```yaml
session_exec(sess_abc, "cd /tmp && mkdir test && cd test")
```

❌ **Don't**: Use `;` without checking
```yaml
# This continues even if cd fails:
session_exec(sess_abc, "cd /nonexistent; rm -rf *")
```

### 4. State Verification

✅ **Do**: Verify state changes
```yaml
session_exec(sess_abc, "cd /tmp")
result = session_exec(sess_abc, "pwd")
# Verify: result.stdout.strip() == "/tmp"
```

### 5. Resource Cleanup

✅ **Do**: Clean up temporary files
```yaml
session_exec(sess_abc, "mktemp -d")
# ... work ...
session_exec(sess_abc, "rm -rf /tmp/tmpXXX")
session_end(sess_abc)
```

---

## Troubleshooting

### Issue: "Session not found"

**Symptom**: Error when calling `exec` or `end`

**Causes**:
- Session ID typo
- Session already terminated
- Session crashed

**Solution**:
```bash
# Check active sessions
delta-sessions list

# Create new session if needed
session_start()
```

### Issue: "No command provided (stdin is empty)"

**Symptom**: exec fails immediately

**Cause**: Command not passed via stdin

**Solution**: Verify `config.yaml`:
```yaml
- name: session_exec
  parameters:
    - name: command
      inject_as: stdin  # ← Must be stdin
```

### Issue: Commands fail with exit_code 1

**Symptom**: Unexpected failures

**Cause**: Command error (normal behavior)

**Solution**: Check `stderr` for details
```yaml
result = session_exec(sess_abc, "ls nonexistent")
# result.exit_code == 1
# result.stderr == "ls: nonexistent: No such file or directory"
```

### Issue: Working directory not preserved

**Symptom**: `cd` commands don't persist

**Causes**:
- Using separate sessions (each has own CWD)
- Command failed (exit_code != 0)

**Solution**:
```yaml
# ✅ Same session - CWD persists
session_exec(sess_abc, "cd /tmp")
session_exec(sess_abc, "pwd")  # /tmp

# ❌ Different sessions - CWD independent
session_exec(sess_abc, "cd /tmp")
session_exec(sess_xyz, "pwd")  # Original CWD
```

### Issue: Environment variables not preserved

**Symptom**: `export VAR=value` doesn't persist

**Cause**: v1.5 MVP doesn't capture env changes

**Workaround**: Use inline variables
```yaml
# Instead of:
session_exec(sess_abc, "export VAR=hello")
session_exec(sess_abc, "echo $VAR")  # Empty

# Use:
session_exec(sess_abc, "VAR=hello; echo $VAR")  # hello
```

---

## Advanced Topics

### Debugging Sessions

**View session state:**
```bash
# List all sessions
delta-sessions list

# Inspect metadata
cat .sessions/sess_abc123/metadata.json

# View state (working directory)
cat .sessions/sess_abc123/state.json

# View execution history
cat .sessions/sess_abc123/history.log
```

**Session metadata structure:**
```json
{
  "session_id": "sess_abc123",
  "command": "bash",
  "created_at": "2025-10-02T10:30:00Z",
  "last_executed_at": "2025-10-02T10:35:00Z",
  "status": "active",
  "work_dir": "/current/directory",
  "execution_count": 5
}
```

### Long-Running Commands

For commands that take time:
```yaml
# Background execution
session_exec(sess_abc, "nohup long_command > output.log 2>&1 &")

# Check progress
session_exec(sess_abc, "tail -10 output.log")

# Check if still running
session_exec(sess_abc, "ps aux | grep long_command")
```

### Multiple Sessions

Agents can manage multiple sessions:
```yaml
# Different purposes
sess_build = session_start()  # Build environment
sess_test = session_start()   # Test environment

# Parallel operations
session_exec(sess_build, "npm run build")
session_exec(sess_test, "npm test")

# Cleanup
session_end(sess_build)
session_end(sess_test)
```

### Session Cleanup

**Manual cleanup:**
```bash
# From command line
delta-sessions list
delta-sessions end sess_abc123
```

**Automatic cleanup (agent hook):**
```yaml
# config.yaml
hooks:
  on_error:
    command: [bash, -c, "delta-sessions list | jq -r '.[].session_id' | xargs -I {} delta-sessions end {}"]
```

---

## Migration from v1.4

If you have agents using v1.4 PTY-based sessions, see the complete [v1.4 to v1.5 Migration Guide](../migration/v1.4-to-v1.5.md).

### Quick Comparison

| Aspect | v1.4 (PTY) | v1.5 (Simplified) |
|--------|------------|-------------------|
| **API** | start, write, read, write-key, end | start, exec, end |
| **Interaction** | write → sleep → read | exec → immediate output |
| **Escape sequences** | Required (`\n`, `\x1b[A`) | Not needed |
| **Timing** | Must guess wait times | Automatic |
| **Tools count** | 5-8 tools | 3 tools |

### Migration Steps

1. Update tool definitions (5 → 3 tools)
2. Update system prompts (remove timing/escape guidance)
3. Test with `delta run`

**Time estimate**: 10-30 minutes per agent

---

## Examples

See complete working examples:
- **[interactive-shell](../../examples/interactive-shell/)** - Bash session patterns
- **[python-repl](../../examples/python-repl/)** - Python execution

---

## See Also

- **[delta-sessions CLI Reference](../api/delta-sessions.md)** - Complete API documentation
- **[v1.5 Architecture Design](../architecture/v1.5-sessions-simplified.md)** - Design rationale
- **[v1.4 PTY Deprecation](../architecture/v1.4-pty-deprecation.md)** - Why PTY was deprecated
- **[Migration Guide](../migration/v1.4-to-v1.5.md)** - Upgrade from v1.4

---

## Summary

**v1.5 simplified sessions** provide command-based execution optimized for LLM agents:

- ✅ **Simple**: 3 tools, no escape sequences
- ✅ **Fast**: Single call, complete output
- ✅ **Reliable**: No timing issues
- ✅ **LLM-friendly**: Request-response model

For real-time PTY interaction (vim, top), use experimental `delta-sessions-pty`.
