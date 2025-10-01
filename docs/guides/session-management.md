# Session Management Guide

## Table of Contents

- [What Are Sessions?](#what-are-sessions)
- [When to Use Sessions](#when-to-use-sessions)
- [Quick Start](#quick-start)
- [Common Patterns](#common-patterns)
  - [Interactive Shell](#interactive-shell)
  - [Python REPL](#python-repl)
  - [Database Console](#database-console)
  - [SSH Sessions](#ssh-sessions)
- [Tool Design Patterns](#tool-design-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

---

## What Are Sessions?

Sessions provide **persistent, stateful interactions** with command-line programs in Delta Engine. While Delta Engine's core is stateless (rebuilding state from the journal), some tools require maintaining long-running processes:

- **Interactive shells** (bash, zsh)
- **REPLs** (Python, Node.js, Ruby)
- **Database consoles** (psql, mysql, redis-cli)
- **Interactive CLIs** (ssh, vim, tmux)

Sessions bridge the gap by managing these stateful processes **outside** the engine core, preserving Delta Engine's "Everything is a Command" philosophy.

### Key Characteristics

- **Process-Agnostic**: Support any interactive CLI program
- **PTY-Based**: Real terminal emulation via pseudo-terminals
- **Read/Write Separation**: Asynchronous interactions (write → wait → read)
- **Manual Lifecycle**: Agent controls when to start/end sessions
- **Independent Storage**: Sessions live in `.sessions/`, separate from `.delta/`

---

## When to Use Sessions

### ✅ Use Sessions When:

- **Stateful Context Required**: Variables, environment, or history must persist
- **Multi-Turn Interactions**: Execute multiple commands in sequence
- **Interactive Programs**: Navigate menus, respond to prompts
- **Long-Running Processes**: Keep process alive between agent iterations

**Examples**:
- Python REPL: Define functions, use them later
- Shell: `cd` into directory, run commands there
- SSH: Connect once, run many commands
- psql: Open transaction, run queries, commit

### ❌ Don't Use Sessions When:

- **One-Shot Commands**: Single command with no state
- **No State Needed**: Each invocation is independent
- **File-Based State**: State persists via files, not memory

**Use regular tools instead**:
- `curl` for HTTP requests
- `grep` for file searches
- `jq` for JSON processing

---

## Quick Start

### 1. Install Delta Engine

```bash
npm install -g delta-engine
# or
npm install delta-engine
```

This provides two CLI commands:
- `delta` - Main engine
- `delta-sessions` - Session management

### 2. Create a Simple Agent

**config.yaml**:
```yaml
name: shell-agent
version: 1.0.0
description: Agent with bash shell

llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: shell_start
    description: "Start a bash shell session"
    command: [delta-sessions, start, bash]
    parameters: []

  - name: shell_write
    description: "Send command to shell (include \\n for Enter)"
    command: [delta-sessions, write]
    parameters:
      - name: session_id
        type: string
        description: "Session ID from shell_start"
        inject_as: argument
      - name: input
        type: string
        description: "Command to execute"
        inject_as: stdin

  - name: shell_read
    description: "Read shell output"
    command: [delta-sessions, read]
    parameters:
      - name: session_id
        type: string
        description: "Session ID"
        inject_as: argument
      - name: timeout_ms
        type: string
        description: "Timeout in milliseconds (e.g., '1000', '2000')"
        inject_as: option
        option_name: --timeout

  - name: shell_end
    description: "Terminate shell session"
    command: [delta-sessions, end]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
```

**system_prompt.md**:
```markdown
# Shell Assistant

You have access to a persistent bash shell.

## Workflow

1. Start session: `shell_start()`
2. Wait for prompt: `shell_read(session_id, 1000)`
3. Execute commands: `shell_write(session_id, "ls -la\n")`
4. Read output: `shell_read(session_id, 2000)`
5. End when done: `shell_end(session_id)`

Always include `\n` at the end of commands to execute them.
```

### 3. Run the Agent

```bash
delta run --agent ./shell-agent --task "List files in /tmp and show disk usage"
```

**Agent execution**:
1. Calls `shell_start()` → Returns `{"session_id": "sess_abc123"}`
2. Calls `shell_read(sess_abc123, 1000)` → Gets prompt
3. Calls `shell_write(sess_abc123, "ls -la /tmp\n")`
4. Calls `shell_read(sess_abc123, 2000)` → Gets file listing
5. Calls `shell_write(sess_abc123, "df -h\n")`
6. Calls `shell_read(sess_abc123, 2000)` → Gets disk usage
7. Calls `shell_end(sess_abc123)` → Terminates session

---

## Common Patterns

### Interactive Shell

**Use Case**: Execute multiple shell commands with state preservation.

**Tools**:
- `shell_start()` - Start bash/zsh
- `shell_write(session_id, input)` - Send commands
- `shell_send_key(session_id, key)` - Send control keys (optional)
- `shell_read(session_id, timeout_ms)` - Read output
- `shell_end(session_id)` - Terminate

**Example Task**: "Create directory, add files, then archive"

```
Agent workflow:
1. shell_start() → sess_001
2. shell_read(sess_001, 1000) → "user@host:~$ "
3. shell_write(sess_001, "mkdir myproject\n")
4. shell_read(sess_001, 1000) → prompt
5. shell_write(sess_001, "cd myproject\n")
6. shell_read(sess_001, 1000) → prompt
7. shell_write(sess_001, "touch file1.txt file2.txt\n")
8. shell_read(sess_001, 1000) → prompt
9. shell_write(sess_001, "tar -czf ../myproject.tar.gz .\n")
10. shell_read(sess_001, 2000) → completion
11. shell_end(sess_001) → terminated
```

**Key Points**:
- Working directory persists (`cd` affects subsequent commands)
- Environment variables carry over
- Always include `\n` to execute commands

**See**: `examples/interactive-shell/`

---

### Python REPL

**Use Case**: Execute Python code with persistent variables and imports.

**Tools**:
- `python_start()` - Start Python interactive mode
- `python_exec(session_id, code)` - Execute code (write + read in one)
- `python_read(session_id, timeout_ms)` - Read output
- `python_interrupt(session_id, "ctrl+c")` - Interrupt execution
- `python_end(session_id)` - Terminate

**Example Task**: "Calculate factorial using recursion"

```
Agent workflow:
1. python_start() → sess_py1
2. python_read(sess_py1, 1000) → "Python 3.9.7\n>>>"
3. python_exec(sess_py1, "def factorial(n):\n    if n <= 1: return 1\n    return n * factorial(n-1)\n\n")
4. python_read(sess_py1, 1000) → ">>>"
5. python_exec(sess_py1, "result = factorial(10)\n")
6. python_read(sess_py1, 1000) → ">>>"
7. python_exec(sess_py1, "print(result)\n")
8. python_read(sess_py1, 1000) → "3628800\n>>>"
9. python_end(sess_py1) → terminated
```

**Key Points**:
- Functions and variables persist across calls
- Use `\n\n` to signal end of multi-line blocks
- Imports remain loaded for entire session
- Handle errors gracefully (output shows Python errors)

**Multi-Line Code**:
```python
# Agent sends this as single string:
python_exec(session_id, "def greet(name):\n    return f'Hello, {name}!'\n\n")
```

**See**: `examples/python-repl/`

---

### Database Console

**Use Case**: Connect to database, run queries, manage transactions.

**Example: PostgreSQL**

**config.yaml**:
```yaml
tools:
  - name: psql_start
    description: "Connect to PostgreSQL"
    command: [delta-sessions, start, psql, -h, localhost, -U, postgres, -d, mydb]
    parameters: []

  - name: psql_query
    description: "Execute SQL query"
    command: [delta-sessions, write]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: query
        type: string
        description: "SQL query (include \\n)"
        inject_as: stdin

  - name: psql_read
    description: "Read query results"
    command: [delta-sessions, read]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: timeout_ms
        type: string
        description: "Timeout in milliseconds (e.g., '3000')"
        inject_as: option
        option_name: --timeout
```

**Example Task**: "Find users created in last 30 days"

```
Agent workflow:
1. psql_start() → sess_db1
2. psql_read(sess_db1, 2000) → "mydb=#"
3. psql_query(sess_db1, "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '30 days';\n")
4. psql_read(sess_db1, 3000) → [query results]
5. psql_query(sess_db1, "\\q\n")  # Quit psql
6. psql_read(sess_db1, 1000) → session ends
```

**Key Points**:
- Connection credentials in `start` command
- Transactions persist across queries
- Use `\n` to execute SQL statements
- Special commands (`\dt`, `\q`) work as expected

---

### SSH Sessions

**Use Case**: Connect to remote server, run commands, maintain connection.

**config.yaml**:
```yaml
tools:
  - name: ssh_connect
    description: "SSH to remote server"
    command: [delta-sessions, start, ssh, user@example.com]
    parameters: []

  - name: ssh_exec
    description: "Execute remote command"
    command: [delta-sessions, write]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: command
        type: string
        inject_as: stdin

  - name: ssh_read
    description: "Read command output"
    command: [delta-sessions, read]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: timeout_ms
        type: string
        description: "Timeout in milliseconds (e.g., '1000', '5000')"
        inject_as: option
        option_name: --timeout
```

**Example Task**: "Deploy code to production server"

```
Agent workflow:
1. ssh_connect() → sess_ssh1
2. ssh_read(sess_ssh1, 3000) → [connection prompt/success]
3. ssh_exec(sess_ssh1, "cd /var/www/app\n")
4. ssh_read(sess_ssh1, 1000) → prompt
5. ssh_exec(sess_ssh1, "git pull origin main\n")
6. ssh_read(sess_ssh1, 5000) → [git output]
7. ssh_exec(sess_ssh1, "npm install\n")
8. ssh_read(sess_ssh1, 30000) → [npm install output]
9. ssh_exec(sess_ssh1, "pm2 restart app\n")
10. ssh_read(sess_ssh1, 2000) → [pm2 output]
11. ssh_exec(sess_ssh1, "exit\n")
12. ssh_read(sess_ssh1, 1000) → session ends
```

**Key Points**:
- Single SSH connection for all commands
- Working directory persists on remote
- Use longer timeouts for slow operations (npm, git)
- Session ends automatically on `exit`

---

## Tool Design Patterns

### Pattern 1: Separate Tools for Each Operation

**Recommended for clarity**:
```yaml
tools:
  - name: repl_start
    command: [delta-sessions, start, python3, -i]

  - name: repl_write
    command: [delta-sessions, write]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: code
        type: string
        inject_as: stdin

  - name: repl_read
    command: [delta-sessions, read]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: timeout_ms
        type: string
        description: "Timeout in milliseconds (e.g., '2000')"
        inject_as: option
        option_name: --timeout
```

**Benefits**:
- Clear separation of concerns
- Easier to document and understand
- More flexible (agent controls timing)

---

### Pattern 2: Combined Write+Read Tool

**For convenience**:
```yaml
tools:
  - name: repl_exec
    description: "Execute code and return result"
    command: [bash, -c]
    parameters:
      - name: exec_script
        type: string
        inject_as: stdin
        # Script: echo "$code" | delta-sessions write "$session_id" && delta-sessions read "$session_id" --timeout 2000
```

**Benefits**:
- Single tool call for common case
- Less verbose agent workflows

**Drawbacks**:
- Less control over timing
- Harder to debug
- Can't handle streaming or complex interactions

**Recommendation**: Use Pattern 1 for maximum flexibility.

---

### Pattern 3: Control Keys for Interactive Programs

**Use `write-key` for semantic clarity**:
```yaml
tools:
  - name: shell_send_key
    description: "Send keyboard control (arrow_up, enter, ctrl+c, etc.)"
    command: [delta-sessions, write-key]
    parameters:
      - name: session_id
        type: string
        inject_as: argument
      - name: key
        type: string
        description: "Key name (see key reference)"
        inject_as: argument
```

**Example usage**:
```
# Navigate interactive menu
1. shell_send_key(sess, "arrow_down")
2. shell_read(sess, 500)
3. shell_send_key(sess, "enter")
4. shell_read(sess, 1000)
```

**Alternative**: Use `write` with escape sequences:
```
shell_write(sess, "\x1b[B")  # arrow_down
shell_write(sess, "\n")       # enter
```

**Recommendation**: Use `write-key` for common controls (better journal readability), fall back to `write` for uncommon sequences.

---

## Best Practices

### 1. Always Include Newlines

Commands need `\n` (Enter key) to execute:

```yaml
✅ CORRECT:
shell_write(session_id, "ls -la\n")

❌ WRONG:
shell_write(session_id, "ls -la")
```

### 2. Use Appropriate Timeouts

Match timeout to expected execution time:

```yaml
Fast commands (pwd, echo):       1000ms (1 second)
Medium commands (ls, grep):      2000ms (2 seconds)
Slow commands (find, npm):       5000ms+ (5+ seconds)
Interactive waits (prompts):     10000ms+ (10+ seconds)
```

### 3. Read After Every Write

Always read output after sending input:

```yaml
✅ CORRECT:
shell_write(session_id, "echo hello\n")
output = shell_read(session_id, 1000)

❌ WRONG:
shell_write(session_id, "echo hello\n")
shell_write(session_id, "echo world\n")  # Lost "hello" output!
```

### 4. Clean Up Sessions

Always call `end` when done:

```yaml
try:
  session_id = shell_start()
  # ... use session
finally:
  shell_end(session_id)  # Clean up
```

### 5. Handle Errors Gracefully

Check output for error messages:

```python
output = shell_read(session_id, 2000)
if "command not found" in output:
  # Handle error
elif "permission denied" in output:
  # Handle permission issue
```

### 6. One Session Per Task

Don't reuse sessions across different tasks:

```yaml
✅ CORRECT:
Task 1: Start session → Use → End
Task 2: Start new session → Use → End

❌ WRONG:
Task 1: Start session → Use
Task 2: Reuse same session  # Polluted state!
```

### 7. State Explicitly in Prompts

Document expected workflow in system prompt:

```markdown
## Workflow

1. Start session: `tool_start()`
2. Wait for prompt: `tool_read(session_id, timeout_ms)`
3. Execute commands: `tool_write(session_id, "command\n")`
4. Read results: `tool_read(session_id, timeout_ms)`
5. Clean up: `tool_end(session_id)`
```

---

## Troubleshooting

### Problem: "Session not found or dead"

**Cause**: Session process crashed or was terminated externally.

**Solutions**:
1. Start a new session
2. Check if process was killed (e.g., out of memory)
3. Verify command is valid and accessible

**Example**:
```bash
# Manual check
delta-sessions list
delta-sessions status sess_abc123

# If dead, clean up
delta-sessions cleanup
```

---

### Problem: No output from `read`

**Possible Causes**:
1. Command produces no output (e.g., `cd`, `export`)
2. Timeout too short for slow commands
3. Command waiting for input
4. Process still running

**Solutions**:
1. **Check if command outputs anything**:
   ```bash
   # Some commands are silent
   cd /tmp        # No output expected
   export VAR=1   # No output
   ```

2. **Increase timeout**:
   ```yaml
   # Before: shell_read(sess, 1000)
   # After:
   shell_read(sess, 5000)  # Wait longer
   ```

3. **Check if waiting for input**:
   ```yaml
   # Command may be prompting
   output = shell_read(sess, 1000)
   if "password:" in output.lower():
     shell_write(sess, "mypassword\n")
     shell_read(sess, 2000)
   ```

4. **Try `--wait` mode** (wait for command to complete):
   ```bash
   delta-sessions read sess_abc123 --wait
   ```

---

### Problem: Output truncated or incomplete

**Cause**: Large output exceeds buffer, or command still running.

**Solutions**:
1. **Use `--follow` mode** for streaming:
   ```bash
   delta-sessions read sess_abc123 --follow
   ```

2. **Read in chunks**:
   ```yaml
   # Read multiple times
   chunk1 = shell_read(sess, 1000)
   chunk2 = shell_read(sess, 1000)
   chunk3 = shell_read(sess, 1000)
   ```

3. **Redirect to file in command**:
   ```yaml
   shell_write(sess, "long_command > /tmp/output.txt\n")
   shell_read(sess, 5000)  # Wait for completion
   # Then read file with regular tool
   ```

---

### Problem: Process hangs or infinite loop

**Cause**: Command entered infinite loop or blocking operation.

**Solutions**:
1. **Send interrupt (Ctrl+C)**:
   ```yaml
   shell_send_key(session_id, "ctrl+c")
   shell_read(session_id, 1000)
   # Output: "KeyboardInterrupt" or "^C"
   ```

2. **Terminate session** (last resort):
   ```yaml
   shell_end(session_id)  # Kills process
   ```

3. **Prevention**: Use timeouts in commands:
   ```bash
   timeout 10s long_running_command
   ```

---

### Problem: Multi-line code not executing (Python/REPLs)

**Cause**: Missing blank line to signal end of block.

**Solution**: Add `\n\n` after multi-line blocks:

```python
✅ CORRECT:
python_exec(session_id, "def foo():\n    return 42\n\n")
# Two newlines ^^ signals end of function

❌ WRONG:
python_exec(session_id, "def foo():\n    return 42\n")
# Single newline - Python waits for more input
```

---

### Problem: Escape sequences not working

**Cause**: Incorrect escaping or unsupported key.

**Solutions**:
1. **Use `write-key` instead** (recommended):
   ```yaml
   # Instead of: shell_write(sess, "\x1b[A")
   # Use:
   shell_send_key(sess, "arrow_up")
   ```

2. **Check escape sequence syntax**:
   ```yaml
   ✅ CORRECT:
   shell_write(sess, "line1\\nline2\\n")  # In YAML
   shell_write(sess, "line1\nline2\n")   # In tool call

   ❌ WRONG:
   shell_write(sess, "line1\nline2\n")   # In YAML (interpreted)
   ```

3. **Verify key is supported**:
   ```bash
   # Check supported keys
   delta-sessions write-key sess_abc123 invalid_key
   # Error: Invalid key name: invalid_key
   ```

---

### Problem: Permission denied or command not found

**Cause**: Command not in PATH or lacks execute permissions.

**Solutions**:
1. **Use absolute paths**:
   ```yaml
   # Instead of: delta-sessions start python3
   # Use:
   delta-sessions start /usr/bin/python3
   ```

2. **Check PATH in session**:
   ```yaml
   shell_write(sess, "echo $PATH\n")
   output = shell_read(sess, 1000)
   ```

3. **Set environment before starting**:
   ```yaml
   - name: custom_start
     command: [bash, -c, "PATH=/custom/path:$PATH delta-sessions start myprogram"]
   ```

---

## Advanced Topics

### Custom Timeouts and Read Modes

The `read` command supports multiple modes:

**1. Immediate read** (return buffered output):
```bash
delta-sessions read sess_abc123
# Returns immediately with whatever is in buffer
```

**2. Timeout wait** (wait up to N milliseconds):
```bash
delta-sessions read sess_abc123 --timeout 5000
# Waits up to 5 seconds, returns when:
# - Timeout expires, OR
# - Prompt detected (shell prompt pattern)
```

**3. Wait for completion** (wait indefinitely):
```bash
delta-sessions read sess_abc123 --wait
# Waits until prompt detected, no timeout
```

**4. Follow mode** (stream output):
```bash
delta-sessions read sess_abc123 --follow
# Streams output as it arrives, like `tail -f`
```

**5. Limited lines** (return first N lines):
```bash
delta-sessions read sess_abc123 --lines 10
# Returns first 10 lines of output
```

---

### Session Persistence and Limitations

**Sessions do NOT survive**:
- `delta-sessions` CLI process restarts
- System reboots
- Process crashes

**Why**: Sessions are in-memory PTY processes. No restoration mechanism (by design - kept simple).

**Workaround**: Design agents to be idempotent:
```yaml
# Check if session exists before starting
sessions = shell_list()
if session_id not in sessions:
  session_id = shell_start()
```

**Alternative**: Use connection caching at application level (e.g., keep SSH connection alive in agent process, not session).

---

### Session Cleanup Strategies

**Manual cleanup** (recommended):
```yaml
# In system prompt
Always call tool_end(session_id) when task completes.
```

**Automatic cleanup** (via cron or scheduled task):
```bash
# Cron job: Clean up dead sessions daily
0 2 * * * delta-sessions cleanup
```

**Lazy cleanup** (on-demand):
```yaml
# Only clean up when needed
- name: cleanup_sessions
  description: "Remove dead sessions"
  command: [delta-sessions, cleanup]
```

**Best practice**: Combine manual cleanup (agent responsibility) with periodic automated cleanup (safety net).

---

### Debugging Sessions

**Enable verbose logging**:
```bash
# Set log level (if supported)
DELTA_LOG_LEVEL=debug delta-sessions start bash
```

**Inspect session files**:
```bash
# List session metadata
cat ~/.sessions/sess_abc123/metadata.json

# View session logs
cat ~/.sessions/sess_abc123/output.log
cat ~/.sessions/sess_abc123/input.log
```

**Monitor active sessions**:
```bash
# List all sessions
delta-sessions list

# Check specific session
delta-sessions status sess_abc123

# Read raw output
delta-sessions read sess_abc123
```

---

### Custom PTY Programs

Sessions support any program that can run in a terminal:

**Example: Custom REPL**:
```yaml
- name: myrepl_start
  command: [delta-sessions, start, /path/to/myrepl, --flag, value]
```

**Example: Docker container**:
```yaml
- name: docker_start
  command: [delta-sessions, start, docker, exec, -it, container_name, bash]
```

**Example: Vim editor** (advanced):
```yaml
- name: vim_start
  command: [delta-sessions, start, vim, file.txt]

- name: vim_command
  description: "Send vim command (e.g., ':wq')"
  command: [delta-sessions, write]
  parameters:
    - name: session_id
      type: string
      inject_as: argument
    - name: command
      type: string
      inject_as: stdin
```

**Key requirement**: Program must be interactive (read from stdin, write to stdout/stderr).

---

### Security Considerations

**1. Credential Handling**:
```yaml
❌ WRONG: Hardcode credentials
- name: psql_start
  command: [delta-sessions, start, psql, -U, admin, -p, "password123"]

✅ CORRECT: Use environment variables
- name: psql_start
  command: [bash, -c, "delta-sessions start psql -U $DB_USER"]
  # Requires: export DB_USER=admin DB_PASSWORD=secret
```

**2. Command Injection**:
```yaml
# Validate user inputs before passing to shell
# Avoid: shell_write(session_id, user_input + "\n")
# Better: Sanitize user_input first
```

**3. Privilege Escalation**:
```yaml
# Avoid: sudo commands without user approval
# If needed, document clearly in system prompt:
## Security Note
This agent may run commands with sudo. User approval required.
```

**4. Session Isolation**:
- Each agent should use separate sessions
- Don't share session IDs between agents
- Clean up sessions after use

---

## Examples Summary

| Use Case | Example Agent | Key Tools |
|----------|---------------|-----------|
| Shell scripting | `examples/interactive-shell/` | `shell_start`, `shell_write`, `shell_read`, `shell_end` |
| Python coding | `examples/python-repl/` | `python_start`, `python_exec`, `python_read`, `python_end` |
| Database queries | (Custom) | `psql_start`, `psql_query`, `psql_read` |
| Remote servers | (Custom) | `ssh_connect`, `ssh_exec`, `ssh_read` |

All examples are fully functional and can be run with:
```bash
delta run --agent examples/<agent-name> --task "<your task>"
```

---

## API Reference

For detailed CLI command documentation, see: [delta-sessions API Reference](../api/delta-sessions.md)

For architectural details, see: [Session Management Design](../architecture/v1.4-sessions-design.md)

---

## FAQ

**Q: Can sessions be shared between different agent runs?**
A: No. Sessions are tied to the `delta-sessions` process. When the process restarts, sessions are lost.

**Q: How many sessions can I run concurrently?**
A: Limited by system resources (PTY limits, memory). Typically 100+ sessions on modern systems.

**Q: Can I use sessions in hooks?**
A: Yes, but be careful - hooks run synchronously. Long-running sessions may block engine execution.

**Q: Are sessions restored after crash?**
A: No. Sessions are in-memory processes. Design agents to handle session loss gracefully.

**Q: Can I SSH into a remote server and run sessions there?**
A: Yes - SSH itself can be a session (`delta-sessions start ssh user@host`), then run commands remotely.

**Q: Do sessions work on Windows?**
A: Partially. `node-pty` has limited Windows support. WSL recommended.

---

**Last Updated**: v1.4.2
**See Also**: [API Reference](../api/delta-sessions.md) | [Architecture Design](../architecture/v1.4-sessions-design.md)
