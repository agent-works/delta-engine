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
  - Custom working directory
  - Default: `$AGENT_HOME/work_runs/workspace_<timestamp>`
  - Use to resume or share workspace between runs

- `--max-iterations <number>`
  - Maximum Think-Act-Observe iterations
  - Default: 30
  - Prevents infinite loops

- `--verbose`, `-v`
  - Enable verbose output
  - Shows detailed execution information

- `--help`, `-h`
  - Display help information

#### Examples

```bash
# Basic usage
delta run --agent ./my-agent --task "List all Python files"

# Short form
delta run -a ./my-agent -t "Create a README file"

# Interactive mode (v1.2) - synchronous CLI interaction
delta run -i --agent ./my-agent --task "Get user preferences"

# Async mode (v1.2) - file-based interaction (default)
delta run --agent ./my-agent --task "Deploy after confirmation"

# Resume after async pause (v1.2)
# After providing response in .delta/interaction/response.txt
delta run --agent ./my-agent

# Custom working directory
delta run --agent ./my-agent --task "Continue analysis" --work-dir ./workspace

# Limit iterations
delta run --agent ./my-agent --task "Complex task" --max-iterations 10

# Verbose output
delta run --agent ./my-agent --task "Debug this" --verbose
```

### `version`

Display Delta Engine version.

```bash
delta version
# Output: Delta Engine v1.2.0
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

Each run creates a workspace with the following structure:

```
$AGENT_HOME/work_runs/workspace_<timestamp>/
├── .delta/                    # Control plane
│   ├── schema_version.txt    # v1.2
│   ├── interaction/          # v1.2: Human interaction directory
│   │   ├── request.json     # Pending interaction request
│   │   └── response.txt     # User's response
│   └── runs/
│       ├── <run_id>/         # Single run data
│       │   ├── execution/
│       │   │   ├── journal.jsonl    # Execution log
│       │   │   ├── metadata.json    # Run metadata
│       │   │   └── engine.log       # Engine diagnostics
│       │   ├── runtime_io/
│       │   │   ├── invocations/     # LLM I/O
│       │   │   ├── tool_executions/ # Tool I/O
│       │   │   └── hooks/           # Hook I/O
│       │   └── configuration/
│       │       ├── resolved_config.yaml
│       │       └── system_prompt.md
│       └── LATEST -> <run_id>       # Symlink to latest run
└── [workspace files]          # Files created by agent
```

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

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Agent not found
- `4` - Configuration error
- `5` - LLM API error
- `101` - Waiting for user input (v1.2, async mode only)
- `130` - Interrupted (Ctrl+C)

## Debugging

### View Execution Journal

```bash
# Pretty print journal
cat work_runs/*/delta/runs/*/execution/journal.jsonl | jq

# Filter by event type
cat work_runs/*/delta/runs/*/execution/journal.jsonl | jq 'select(.type == "THOUGHT")'

# View only tool executions
cat work_runs/*/delta/runs/*/execution/journal.jsonl | jq 'select(.type == "ACTION_REQUEST")'
```

### View Tool Outputs

```bash
# List all tool executions
ls -la work_runs/*/delta/runs/*/runtime_io/tool_executions/

# View specific tool output
cat work_runs/*/delta/runs/*/runtime_io/tool_executions/*/stdout.log
```

### View LLM Interactions

```bash
# List all LLM invocations
ls -la work_runs/*/delta/runs/*/runtime_io/invocations/

# View LLM request
cat work_runs/*/delta/runs/*/runtime_io/invocations/*/request.json | jq

# View LLM response
cat work_runs/*/delta/runs/*/runtime_io/invocations/*/response.json | jq
```

### View Hook Executions

```bash
# List all hook executions
ls -la work_runs/*/delta/runs/*/runtime_io/hooks/

# View hook output
cat work_runs/*/delta/runs/*/runtime_io/hooks/*/execution_meta/stdout.log
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
echo "yes" > work_runs/workspace_*/delta/interaction/response.txt

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
# First run - creates workspace
delta run --agent ./my-agent --task "Create files"

# Find workspace path from output
WORKSPACE="/path/to/work_runs/workspace_xyz"

# Continue in same workspace
delta run --agent ./my-agent --task "Modify files" --work-dir "$WORKSPACE"
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
**Solution:** Increase `--max-iterations` or improve agent efficiency

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
cat work_runs/*/delta/runs/*/execution/journal.jsonl |
  jq -c 'select(.type == "ACTION_RESULT") | {tool: .payload.tool_name, status: .payload.status}'
```

## See Also

- [Configuration Reference](./config.md) - Agent configuration details
- [Agent Development Guide](../guides/agent-development.md) - Building agents
- [Hooks Guide](../guides/hooks.md) - Extending with hooks