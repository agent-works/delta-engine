# Hello World Example

The simplest Delta Engine agent to get you started.

## Features
- 👋 Print messages
- 📄 Create and write files
- 📁 List directory contents
- 📅 Show current date

## Usage

```bash
# Say hello
delta run --agent examples/hello-world -m "Say hello to the world"

# Create a file
delta run --agent examples/hello-world -m "Create a file called test.txt with 'Hello Delta Engine' inside"

# Multiple actions
delta run --agent examples/hello-world -m "Create three files: one.txt, two.txt, three.txt, then list all files"
```

## How It Works

### The Think-Act-Observe Loop

Delta Engine operates on a simple but powerful loop:

```
User Task: "Create a file greeting.txt with 'Hello'"

1. THINK (LLM Planning)
   Agent analyzes: "I need to create and write to a file"
   → Decides to use: create_file + write_to_file

2. ACT (Tool Execution)
   Action 1: create_file(filename="greeting.txt")
   → Executes: `touch greeting.txt`
   → Logs to journal: ACTION_RESULT event

   Action 2: write_to_file(filename="greeting.txt", content="Hello")
   → Executes: `echo "Hello" | tee greeting.txt`
   → Logs to journal: ACTION_RESULT event

3. OBSERVE (Result Processing)
   Agent sees: "Files created successfully"
   → Responds to user: "I've created greeting.txt with 'Hello'"
```

### Delta Engine's Three Pillars (Demonstrated)

#### 1. Everything is a Command
All tools are just bash commands:
- `print_message` → `echo`
- `create_file` → `touch`
- `write_to_file` → `tee`
- `list_files` → `ls -la`
- `show_date` → `date`

**No magic** - just CLI tools wrapped for the LLM.

#### 2. Environment as Interface
The agent works in a **working directory**:
```bash
# Files created during execution
workspaces/W001/
├── greeting.txt      # Created by agent
├── one.txt          # From multi-file task
└── .delta/          # Control plane (journal, logs)
    └── {run_id}/
        └── journal.jsonl  # Every action logged
```

#### 3. Stateless Core
The agent has **no memory** between iterations. All state comes from:
- **Journal** (`.delta/{run_id}/journal.jsonl`) - Single source of truth
- **Workspace files** - Environment state

You can **interrupt** (Ctrl+C) and **resume** anytime:
```bash
# Start task
delta run --agent examples/hello-world -m "Create 100 files"
^C  # Interrupt after 50 files

# Resume - continues from where it left off
delta run --agent examples/hello-world -m "Continue creating files"
```

The journal tells the agent what already happened.

## What This Example Teaches

### Core Concepts
1. **Tool Definition**: 5 simple bash commands wrapped as tools
2. **Parameter Injection**: `argument` vs `stdin` injection modes
3. **System Prompts**: Clear instructions for the LLM
4. **Stateless Execution**: Journal-based state reconstruction

### Delta-Specific Value
- **Resumability**: Interrupt and continue tasks anytime
- **Auditability**: Full execution log in `journal.jsonl`
- **Simplicity**: Complex behavior from simple tools
- **Debuggability**: Every action visible and traceable

## Files

- `config.yaml` - Agent configuration with 5 simple tools
- `system_prompt.md` - Agent instructions and behavior
- `README.md` - This file

## Troubleshooting

### Common Issues

**Issue**: "Permission denied" when creating files
- **Cause**: Working directory is read-only or you lack permissions
- **Solution**: Run from a writable directory or specify one:
  ```bash
  delta run --agent examples/hello-world --work-dir /tmp/test -m "..."
  ```

**Issue**: File already exists warning
- **Cause**: `touch` doesn't fail on existing files (expected behavior)
- **Solution**: This is normal. The file is unchanged if it exists.

**Issue**: Agent completes instantly without showing steps
- **Cause**: Simple tasks finish in one LLM turn
- **Solution**: This is normal. Check journal for details:
  ```bash
  # Get latest run ID
  RUN_ID=$(cat examples/hello-world/workspaces/LAST_USED/.delta/LATEST)

  # View journal
  tail -20 examples/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/journal.jsonl
  ```

**Issue**: "Command not found: delta"
- **Cause**: Delta Engine not installed or not in PATH
- **Solution**: Build and link:
  ```bash
  npm run build
  npm link
  ```

### Debugging Commands

**View execution history**:
```bash
# See all runs
ls -lt examples/hello-world/workspaces/LAST_USED/.delta/

# View latest run's journal
RUN_ID=$(cat examples/hello-world/workspaces/LAST_USED/.delta/LATEST)
cat examples/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/journal.jsonl | jq .
```

**Check run status**:
```bash
cat examples/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/metadata.json
```

**View LLM invocations**:
```bash
ls -lht examples/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/io/invocations/
```

**View tool execution logs**:
```bash
ls -lht examples/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/io/tool_executions/
```

## Try It Yourself

This is a great starting point for learning Delta Engine. Try modifying:

### Beginner Exercises
1. **Add a new tool**: Define `delete_file` in `config.yaml`
2. **Modify system prompt**: Make the agent more verbose
3. **Chain tasks**: "Create a file, write to it, then read it back"

### Intermediate Exercises
4. **Add parameter validation**: Make agent check if filename is safe
5. **Add a hook**: Log all tool executions to a separate file
6. **Use interactive mode**: Run with `-i` flag for step-by-step approval

### Advanced Exercises
7. **Implement undo**: Create a tool to reverse the last action
8. **Add error recovery**: Handle tool failures gracefully
9. **Multi-step workflow**: Orchestrate a complex file organization task

## See Also

- [Agent Development Guide](../../docs/guides/agent-development.md) - Deep dive into building agents
- [Tool Configuration Reference](../../docs/guides/agent-development.md#tool-configuration) - Complete tool syntax
- [System Prompt Best Practices](../../docs/guides/agent-development.md#system-prompts) - Writing effective prompts
- [Interactive Shell Example](../interactive-shell/) - Next level: persistent sessions