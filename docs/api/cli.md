# CLI Reference

## Overview

Delta Engine provides a command-line interface for running AI agents. The CLI can be used directly via `npx tsx` or after building via the `delta` command.

## Installation

```bash
# Development (no build required)
npx tsx src/index.ts [command] [options]

# Production (after building)
npm run build
npm link  # Optional: install globally
delta [command] [options]
```

## Commands

### `run`

Execute an agent with a specific task.

#### Syntax

```bash
delta run --agent <path> --task <description> [options]
```

#### Required Options

- `--agent <path>`, `-a <path>`
  - Path to the agent directory
  - Can be relative or absolute
  - Must contain `config.yaml` and `system_prompt.md` (or `.txt`)

- `--task <description>`, `-t <description>`
  - Task description for the agent to execute
  - Should be clear and specific
  - Enclose in quotes if contains spaces

#### Optional Options

- `--interactive`, `-i` **(v1.2)**
  - Enable interactive mode for human-in-the-loop
  - Synchronous CLI interaction for ask_human tool
  - Agent pauses and waits for input in terminal
  - Default: false (async mode with file-based interaction)

- `--work-dir <path>`, `-w <path>`
  - Custom working directory path
  - If specified: uses the provided path (creates if doesn't exist)
  - If not specified: prompts for workspace selection (existing or new)
  - Default workspace naming: W001, W002, W003, etc.
  - Use to resume or share workspace between runs

- `--yes`, `-y` **(v1.2.1)**
  - Skip interactive workspace selection
  - Auto-creates new workspace with sequential naming (W001, W002, etc.)
  - Useful for CI/CD and automated workflows
  - Default: false (shows interactive selection)

- `--max-iterations <number>`
  - Maximum Think-Act-Observe iterations
  - Overrides `max_iterations` setting in `config.yaml`
  - Must be a positive integer
  - Prevents infinite loops

- `--verbose`, `-v`
  - Enable verbose output
  - Shows detailed execution information

- `--help`, `-h`
  - Display help information

#### Examples

```bash
# Basic usage - prompts for workspace selection
delta run --agent ./my-agent --task "List all Python files"

# Short form with options
delta run -a ./my-agent -t "Create a README file"

# Silent mode - auto-creates new workspace W001, W002, etc.
delta run -y --agent ./my-agent --task "Quick task"

# Interactive mode (v1.2) - synchronous CLI interaction
delta run -i --agent ./my-agent --task "Get user preferences"

# Async mode (v1.2) - file-based interaction (default)
delta run --agent ./my-agent --task "Deploy after confirmation"

# Resume after async pause (v1.2)
# After providing response in .delta/interaction/response.txt
delta run --agent ./my-agent

# Custom working directory with short option
delta run -a ./my-agent -t "Continue analysis" -w ./workspace

# Limit iterations
delta run --agent ./my-agent --task "Complex task" --max-iterations 10

# Verbose output
delta run --agent ./my-agent --task "Debug this" --verbose
```

### Version Information

Display Delta Engine version using the `--version` or `-V` flag.

```bash
delta --version
# Output: 0.0.7

delta -V
# Output: 0.0.7
```

### `help`

Display help information.

```bash
delta help
delta help run
delta --help
delta -h
```

## Environment Variables

### Required

- `OPENAI_API_KEY`
  - OpenAI API key for LLM access
  - Required for all agents

```bash
export OPENAI_API_KEY="sk-..."
```

### Optional

- `OPENAI_API_URL`
  - Custom OpenAI-compatible API endpoint
  - Default: `https://api.openai.com/v1`
  - Use for proxies or alternative providers

```bash
export OPENAI_API_URL="https://your-proxy.com/v1"
```

- `DELTA_LOG_LEVEL`
  - Logging verbosity
  - Values: `debug`, `info`, `warn`, `error`
  - Default: `info`

```bash
export DELTA_LOG_LEVEL=debug
```

- `TMPDIR`
  - Temporary directory for workspaces
  - Default: System temp directory

```bash
export TMPDIR=/custom/tmp
```

## Working Directory Structure

Each workspace has the following structure:

```
$AGENT_HOME/workspaces/
├── LAST_USED           # v1.2.1: Tracks last used workspace
├── W001/                     # v1.2.1: Sequential workspace naming
│   ├── .delta/              # Control plane
│   │   ├── VERSION    # v1.2
│   │   ├── interaction/          # v1.2: Human interaction directory
│   │   │   ├── request.json     # Pending interaction request
│   │   │   └── response.txt     # User's response
│   │   └── runs/
│   │       ├── <run_id>/         # Single run data
│   │       │   ├── execution/
│   │       │   │   ├── journal.jsonl    # Execution log
│   │       │   │   ├── metadata.json    # Run metadata
│   │       │   │   └── engine.log       # Engine diagnostics
│   │       │   ├── io/
│   │       │   │   ├── invocations/     # LLM I/O
│   │       │   │   ├── tool_executions/ # Tool I/O
│   │       │   │   └── hooks/           # Hook I/O
│   │       │   └── configuration/
│   │       │       ├── resolved_config.yaml
│   │       │       └── system_prompt.md
│   │       └── LATEST                   # Text file containing latest run ID
│   └── [workspace files]          # Files created by agent
├── W002/                     # Additional workspace
└── workspace_20250930_123456/ # Legacy format (still supported)
```

### Workspace Selection (v1.2.1)

When no `--work-dir` is specified:

1. **Interactive Mode (default)**: Shows a selection menu
   - Lists all existing workspaces (W001, W002, etc.)
   - Highlights last-used workspace
   - Options to select existing or create new workspace

2. **Silent Mode (`-y` flag)**: Auto-creates next sequential workspace
   - Automatically generates W001, W002, W003, etc.
   - No user interaction required
   - Ideal for automation and CI/CD

3. **Explicit Path (`--work-dir`)**: Uses specified directory
   - Creates directory if it doesn't exist
   - Logs creation action explicitly

## Output Format

### Standard Output

```
────────────────────────────────────────────────────────────
[INFO] Starting Delta Engine...
[INFO] Agent Path: ./my-agent
[INFO] Task: Your task description
────────────────────────────────────────────────────────────
[INFO] Initializing engine context...
[SUCCESS] Engine context initialized successfully!
────────────────────────────────────────────────────────────
[INFO] Run ID: 20240926_120000_abc123
[INFO] Work Directory: /path/to/workspace
[INFO] Agent Name: my-agent
[INFO] Number of Tools: 5
[INFO] LLM Model: gpt-4
────────────────────────────────────────────────────────────
[INFO] 🚀 Starting Delta Engine...
────────────────────────────────────────────────────────────

[Iteration 1/30]
🤔 Thinking...
🛠️  Executing 2 tool call(s)...
  → Executing: list_files
  ✓ Success (exit code: 0)
  → Executing: read_file
  ✓ Success (exit code: 0)

[Iteration 2/30]
🤔 Thinking...
✅ Agent completed task (no tool calls)

────────────────────────────────────────────────────────────
[SUCCESS] ✨ Agent completed successfully!
────────────────────────────────────────────────────────────
[INFO] Final Response:
Task completed successfully. Created 3 files.
────────────────────────────────────────────────────────────
[INFO] Execution Summary:
[INFO]   • Iterations: 2
[INFO]   • Total Events: 8
[INFO]   • Status: COMPLETED
[INFO]   • Duration: 5.2s
────────────────────────────────────────────────────────────
[INFO] Work directory: /path/to/workspace
[INFO] Journal log: /path/to/journal.jsonl
```

### Exit Codes

- `0` - Success (agent completed task)
- `1` - General error (initialization failure, engine error, missing API key, etc.)
- `101` - Waiting for user input (v1.2, async mode only)
- `130` - Interrupted (Ctrl+C or SIGTERM)

## Debugging

### View Execution Journal

```bash
# Pretty print journal
cat workspaces/*/delta/runs/*/journal.jsonl | jq

# Filter by event type
cat workspaces/*/delta/runs/*/journal.jsonl | jq 'select(.type == "THOUGHT")'

# View only tool executions
cat workspaces/*/delta/runs/*/journal.jsonl | jq 'select(.type == "ACTION_REQUEST")'
```

### View Tool Outputs

```bash
# List all tool executions
ls -la workspaces/*/delta/runs/*/io/tool_executions/

# View specific tool output
cat workspaces/*/delta/runs/*/io/tool_executions/*/stdout.log
```

### View LLM Interactions

```bash
# List all LLM invocations
ls -la workspaces/*/delta/runs/*/io/invocations/

# View LLM request
cat workspaces/*/delta/runs/*/io/invocations/*/request.json | jq

# View LLM response
cat workspaces/*/delta/runs/*/io/invocations/*/response.json | jq
```

### View Hook Executions

```bash
# List all hook executions
ls -la workspaces/*/delta/runs/*/io/hooks/

# View hook output
cat workspaces/*/delta/runs/*/io/hooks/*/execution_meta/stdout.log
```

## Human-in-the-Loop Interaction (v1.2)

### Interactive Mode

Use the `-i` flag for synchronous CLI interaction:

```bash
# Agent will pause and wait for input in terminal
delta run -i --agent ./my-agent --task "Configure settings"

# Example interaction:
# [Agent]: Please enter your API key:
# [User types]: sk-abc123...
# [Agent continues with the provided key]
```

### Async Mode (Default)

Without the `-i` flag, agent uses file-based interaction:

```bash
# Step 1: Start the agent
delta run --agent ./my-agent --task "Deploy application"

# Agent pauses with exit code 101
# Creates .delta/interaction/request.json:
# {
#   "prompt": "Confirm deployment to production (yes/no):",
#   "input_type": "text"
# }

# Step 2: Provide response
echo "yes" > workspaces/workspace_*/delta/interaction/response.txt

# Step 3: Resume execution
delta run --agent ./my-agent
# Agent automatically resumes from where it paused
```

### Automation Example

```bash
#!/bin/bash
# Automated script handling async interaction

WORKSPACE="./my-workspace"

# Run agent
if delta run --agent ./my-agent --task "Setup project" --work-dir "$WORKSPACE"; then
  echo "Agent completed successfully"
else
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 101 ]; then
    # Agent needs input
    REQUEST=$(cat "$WORKSPACE/.delta/interaction/request.json")
    echo "Agent requesting: $(echo $REQUEST | jq -r .prompt)"

    # Provide automated response
    echo "default-value" > "$WORKSPACE/.delta/interaction/response.txt"

    # Resume execution
    delta run --agent ./my-agent --work-dir "$WORKSPACE"
  fi
fi
```

## Advanced Usage

### Workspace Reuse

```bash
# First run - interactive workspace selection
delta run --agent ./my-agent --task "Create files"
# User selects "Create new" → W001 is created

# Second run - automatically suggests W001 (last used)
delta run --agent ./my-agent --task "Modify files"
# User presses Enter to use W001, or selects different workspace

# Silent mode - always creates new workspace
delta run -y --agent ./my-agent --task "Another task"
# Auto-creates W002

# Explicit workspace path
delta run --agent ./my-agent --task "Specific workspace" --work-dir ./my-workspace
```

### Batch Processing

```bash
# Process multiple tasks
for task in "Task 1" "Task 2" "Task 3"; do
  delta run --agent ./my-agent --task "$task"
done

# Process tasks from file
while IFS= read -r task; do
  delta run --agent ./my-agent --task "$task"
done < tasks.txt
```

### Parallel Execution

```bash
# Run multiple agents in parallel
delta run --agent ./agent1 --task "Task 1" &
delta run --agent ./agent2 --task "Task 2" &
delta run --agent ./agent3 --task "Task 3" &
wait
```

### Output Parsing

```bash
# Extract final response
delta run --agent ./my-agent --task "Task" 2>&1 |
  grep -A 100 "Final Response:" |
  head -n -5

# Extract run ID
RUN_ID=$(delta run --agent ./my-agent --task "Task" 2>&1 |
  grep "Run ID:" |
  awk '{print $3}')

# Extract workspace path
WORKSPACE=$(delta run --agent ./my-agent --task "Task" 2>&1 |
  grep "Work directory:" |
  cut -d: -f2- |
  xargs)
```

## Error Handling

### Common Errors

#### Agent Not Found
```
Error: config.yaml not found at: /path/to/agent
```
**Solution:** Verify agent path contains `config.yaml` and `system_prompt.md`

#### Missing API Key
```
Error: OpenAI API key not found
```
**Solution:** Set `OPENAI_API_KEY` environment variable

#### Invalid Configuration
```
Error: Configuration validation failed
```
**Solution:** Check `config.yaml` syntax and required fields

#### LLM API Error
```
Error: OpenAI API error: 429 Rate limit exceeded
```
**Solution:** Wait and retry, or implement rate limiting hooks

#### Maximum Iterations Reached
```
Warning: Maximum iterations (30) reached
```
**Solution:** Increase `--max-iterations` CLI option or `max_iterations` in `config.yaml`, or improve agent efficiency

## Tips and Tricks

### 1. Use Shell Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias de='npx tsx /path/to/delta-engine/src/index.ts run'

# Usage
de --agent ./my-agent --task "Quick task"
```

### 2. Default Agent Path

```bash
# Create wrapper script
#!/bin/bash
delta run --agent ~/agents/my-default-agent --task "$*"
```

### 3. Task Templates

```bash
# Create task template
TASK_TEMPLATE="Analyze the file {file} and create a summary"

# Use with substitution
FILE="data.csv"
delta run --agent ./analyst --task "${TASK_TEMPLATE//\{file\}/$FILE}"
```

### 4. Persistent Workspace

```bash
# Create named workspace
WORKSPACE="$HOME/.delta-workspaces/my-project"
mkdir -p "$WORKSPACE"

# Always use same workspace
alias my-agent="delta run --agent ~/agents/my-agent --work-dir $WORKSPACE --task"

# Usage
my-agent "Do something"
```

### 5. JSON Output

```bash
# Extract structured data from journal
delta run --agent ./my-agent --task "Task" 2>/dev/null
cat workspaces/*/delta/runs/*/journal.jsonl |
  jq -c 'select(.type == "ACTION_RESULT") | {tool: .payload.tool_name, status: .payload.status}'
```

## See Also

- [Configuration Reference](./config.md) - Agent configuration details
- [Agent Development Guide](../guides/agent-development.md) - Building agents
- [Hooks Guide](../guides/hooks.md) - Extending with hooks