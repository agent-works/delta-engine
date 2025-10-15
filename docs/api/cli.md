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
delta run --agent <path> -m <description> [options]
```

#### Required Options

- `--agent <path>`, `-a <path>`
  - Path to the agent directory
  - Can be relative or absolute
  - Must contain `config.yaml` and `system_prompt.md` (or `.txt`)

- `-m <description>`, `-t <description>`
  - Task description for the agent to execute
  - Should be clear and specific
  - Enclose in quotes if contains spaces

#### Optional Options

- `--run-id <id>` **(v1.10)**
  - Client-generated run identifier
  - If provided: uses specified ID for this run
  - If not provided: engine auto-generates ID
  - **Robustness**: Orchestrator retains ID even if process crashes
  - **Uniqueness**: Errors immediately if ID already exists in workspace
  - Recommended: Use UUID v4 (`uuidgen`) for automation
  - Example: `delta run --run-id $(uuidgen) -m "Task"`

- `--format <text|json|raw>` **(v1.10)**
  - Output format for execution results
  - **text** (default): Human-readable summary with metadata
  - **json**: Structured JSON output (RunResult v2.0 schema) for automation
  - **raw**: Unix-friendly pure data output (composable with pipes)
  - See "Output Formats" section below for detailed specifications

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
delta run --agent ./my-agent -m "List all Python files"

# v1.10: Client-generated run ID (recommended for automation)
RUN_ID=$(uuidgen)
delta run --run-id "$RUN_ID" --agent ./my-agent -m "Process data"

# v1.10: JSON output for automation
OUTPUT=$(delta run --agent ./my-agent -m "Task" --format json)
RUN_ID=$(echo "$OUTPUT" | jq -r '.run_id')
RESULT=$(echo "$OUTPUT" | jq '.result')

# v1.10: Raw output for Unix pipes
delta run --agent ./my-agent -m "Generate summary" --format raw > summary.txt

# Silent mode - auto-creates new workspace W001, W002, etc.
delta run -y --agent ./my-agent -m "Quick task"

# Interactive mode (v1.2) - synchronous CLI interaction
delta run -i --agent ./my-agent -m "Get user preferences"

# Custom working directory with short option
delta run -a ./my-agent -m "Continue analysis" -w ./workspace

# Limit iterations
delta run --agent ./my-agent -m "Complex task" --max-iterations 10

# Verbose output
delta run --agent ./my-agent -m "Debug this" --verbose

# v1.10: Complete automation pattern
RUN_ID=$(uuidgen)
delta run --run-id "$RUN_ID" -m "Task" --format json 2> run.log > result.json
# RUN_ID available even if process crashes
```

### `list-runs` **(v1.10)**

Discover and filter execution runs within a workspace.

#### Syntax

```bash
delta list-runs [options]
```

#### Options

- `-w, --work-dir <path>`
  - Workspace path to search
  - Default: current directory
  - Searches `.delta/` directory for run histories

- `--resumable`
  - Filter to only resumable runs
  - Includes: INTERRUPTED, WAITING_FOR_INPUT, FAILED, COMPLETED
  - Excludes: RUNNING (active runs cannot be resumed)

- `--status <status>`
  - Filter by specific status
  - Values: RUNNING, INTERRUPTED, WAITING_FOR_INPUT, FAILED, COMPLETED

- `--first`
  - Return only the most recent run ID
  - Useful for scripting (single line output)
  - Returns empty string if no runs found

- `--format <text|json>`
  - Output format
  - text: Human-readable table (default)
  - json: Machine-readable JSON array

#### Examples

```bash
# List all runs in current workspace
delta list-runs

# List all runs in specific workspace
delta list-runs -w /path/to/workspace

# List only resumable runs
delta list-runs --resumable

# Filter by status
delta list-runs --status FAILED

# Get most recent run ID (for scripting)
RUN_ID=$(delta list-runs --first)
delta continue --run-id "$RUN_ID"

# Get most recent resumable run
RUN_ID=$(delta list-runs --resumable --first)

# JSON output for automation
delta list-runs --format json | jq '.[] | select(.status == "FAILED")'
```

#### Output Format

**Text Format (default)**:
```
20251014_0430_aaaa  INTERRUPTED       "Analyze data"     2m ago
20251014_0435_bbbb  WAITING_FOR_INPUT "Process report"   1m ago
20251014_0440_cccc  FAILED            "Generate chart"   30s ago
```

**JSON Format** (`--format json`):
```json
[
  {
    "run_id": "20251014_0430_aaaa",
    "status": "INTERRUPTED",
    "task_summary": "Analyze data",
    "last_updated": "2025-10-14T10:30:00Z"
  },
  {
    "run_id": "20251014_0435_bbbb",
    "status": "WAITING_FOR_INPUT",
    "task_summary": "Process report",
    "last_updated": "2025-10-14T10:35:00Z"
  }
]
```

#### Quick Resume Pattern

```bash
# One-liner: resume most recent resumable run
delta continue --run-id $(delta list-runs --resumable --first)

# Interactive script
RUN_ID=$(delta list-runs --resumable --first)
if [ -n "$RUN_ID" ]; then
  delta continue --run-id "$RUN_ID"
else
  echo "No resumable runs found"
fi
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

- `DELTA_API_KEY`
  - API key for LLM access (OpenAI or compatible providers)
  - Required for all agents

```bash
export DELTA_API_KEY="sk-..."
```

### Optional

- `DELTA_BASE_URL`
  - Custom API endpoint (for OpenAI-compatible services)
  - Default: `https://api.openai.com/v1`
  - Use for proxies, local models, or alternative providers

```bash
export DELTA_BASE_URL="https://your-endpoint.com/v1"
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
├── W001/               # v1.2.1: Sequential workspace naming
│   ├── .delta/         # Control plane
│   │   ├── VERSION     # v1.2: Schema version
│   │   ├── {run_id}/   # v1.10: Flat structure (no LATEST file)
│   │   │   ├── journal.jsonl      # Execution log (SSOT)
│   │   │   ├── metadata.json      # Run metadata (includes pid, hostname)
│   │   │   ├── engine.log         # Engine diagnostics
│   │   │   ├── io/                # I/O audit logs
│   │   │   │   ├── invocations/     # LLM request/response
│   │   │   │   ├── tool_executions/ # Tool stdout/stderr
│   │   │   │   └── hooks/           # Hook execution logs
│   │   │   └── interaction/       # v1.2: Human interaction (async mode)
│   │   │       ├── request.json     # Pending interaction request
│   │   │       └── response.txt     # User's response
│   │   └── {another_run_id}/      # Multiple runs coexist (v1.10 concurrency)
│   └── [workspace files]          # Files created by agent
├── W002/                          # Additional workspace
└── workspace_20250930_123456/    # Legacy format (still supported)
```

**v1.10 Changes:**
- **Removed**: `.delta/LATEST` file (eliminates race conditions)
- **Added**: Multiple runs can coexist in same workspace
- **Added**: `pid`, `hostname`, `process_name` fields in `metadata.json`
- **Result**: True concurrent multi-agent support

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

## Output Formats **(v1.10)**

Delta Engine v1.10 provides three output formats to balance human readability, automation support, and Unix composability.

### I/O Philosophy

- **`stderr`**: Real-time execution logs, Think-Act-Observe stream (always active, redirect with `2>`)
- **`stdout`**: Final execution results only (controlled by `--format`)
- **Exit Codes**: Standardized signals for script control flow

### Format Overview

| Format | Use Case | stdout Content | Ideal For |
|--------|----------|----------------|-----------|
| `text` (default) | Human readability | Human-readable summary with metadata | Interactive use, debugging |
| `json` | Automation | Structured JSON (RunResult v2.0) | CI/CD, orchestration, robust parsing |
| `raw` | Unix pipes | Pure data (no metadata) | Pipes, composition, stream processing |

### 1. Text Format (`--format text`, default)

Human-readable execution summary.

**Example Output**:
```
────────────────────────────────────
Run ID:     20251014_0430_aaaa
Status:     COMPLETED
Duration:   2m 30s
Iterations: 15
────────────────────────────────────
Result:
{
  "summary": "Analysis complete.",
  "report_file": "W001/report.pdf",
  "confidence_score": 0.95
}
────────────────────────────────────
```

**Usage**:
```bash
delta run -m "Analyze data" --format text
delta run -m "Analyze data"  # text is default
```

### 2. JSON Format (`--format json`)

Structured JSON output conforming to **RunResult v2.0 Schema** (see below).

**Example Output**:
```json
{
  "schema_version": "2.0",
  "run_id": "20251014_0430_aaaa",
  "status": "COMPLETED",
  "result": {
    "summary": "Analysis complete.",
    "report_file": "W001/report.pdf",
    "confidence_score": 0.95
  },
  "metrics": {
    "iterations": 15,
    "duration_ms": 150000,
    "start_time": "2025-10-14T10:30:00Z",
    "end_time": "2025-10-14T10:32:30Z"
  },
  "metadata": {
    "agent_name": "MyAgent",
    "workspace_path": "/path/to/W001"
  }
}
```

**Usage**:
```bash
OUTPUT=$(delta run -m "Task" --format json 2> run.log)
RUN_ID=$(echo "$OUTPUT" | jq -r '.run_id')
RESULT=$(echo "$OUTPUT" | jq '.result')
```

### 3. Raw Format (`--format raw`)

Pure data output for Unix composition. **Exit codes** must be used to determine status.

**Behavior**:
- **COMPLETED** (exit 0): stdout contains only pure `result` data
- **Other statuses** (exit != 0): stdout is empty, errors in stderr

**Example Output** (COMPLETED):
```json
{
  "summary": "Analysis complete.",
  "report_file": "W001/report.pdf",
  "confidence_score": 0.95
}
```

**Usage**:
```bash
# Pipe to jq
delta run -m "Analyze data" --format raw | jq '.report_file'

# Pipe to file
delta run -m "Generate summary" --format raw > summary.txt

# Check status via exit code
if delta run -m "Task" --format raw > output.txt; then
  echo "Success"
else
  echo "Failed with exit code: $?"
fi
```

### RunResult v2.0 Schema

Complete execution contract for `--format json`:

```typescript
{
  schema_version: "2.0",
  run_id: string,
  status: "COMPLETED" | "FAILED" | "WAITING_FOR_INPUT" | "INTERRUPTED",

  // Conditional fields (only one present based on status)
  result?: string | object,        // Only for COMPLETED
  error?: {                         // Only for FAILED/INTERRUPTED
    type: string,
    message: string,
    details?: string
  },
  interaction?: {                   // Only for WAITING_FOR_INPUT
    prompt: string,
    input_type: "text" | "password" | "confirmation",
    sensitive: boolean
  },

  // Always present
  metrics: {
    iterations: number,
    duration_ms: number,
    start_time: string,  // ISO 8601
    end_time: string,
    usage: {
      total_cost_usd: number,
      input_tokens: number,
      output_tokens: number,
      model_usage: Record<string, {
        calls: number,
        input_tokens: number,
        output_tokens: number,
        cost_usd: number
      }>
    }
  },

  metadata: {
    agent_name: string,
    workspace_path: string
  }
}
```

### Exit Codes

- `0` - Success (COMPLETED)
- `1` - General error (FAILED, initialization error, missing API key)
- `101` - Waiting for user input (WAITING_FOR_INPUT, async mode only)
- `126` - Cannot execute (config error, permission issue)
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
delta run -i --agent ./my-agent -m "Configure settings"

# Example interaction:
# [Agent]: Please enter your API key:
# [User types]: sk-abc123...
# [Agent continues with the provided key]
```

### Async Mode (Default)

Without the `-i` flag, agent uses file-based interaction:

```bash
# Step 1: Start the agent
delta run --agent ./my-agent -m "Deploy application"

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
if delta run --agent ./my-agent -m "Setup project" --work-dir "$WORKSPACE"; then
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
delta run --agent ./my-agent -m "Create files"
# User selects "Create new" → W001 is created

# Second run - automatically suggests W001 (last used)
delta run --agent ./my-agent -m "Modify files"
# User presses Enter to use W001, or selects different workspace

# Silent mode - always creates new workspace
delta run -y --agent ./my-agent -m "Another task"
# Auto-creates W002

# Explicit workspace path
delta run --agent ./my-agent -m "Specific workspace" --work-dir ./my-workspace
```

### Batch Processing

```bash
# Process multiple tasks
for task in "Task 1" "Task 2" "Task 3"; do
  delta run --agent ./my-agent -m "$task"
done

# Process tasks from file
while IFS= read -r task; do
  delta run --agent ./my-agent -m "$task"
done < tasks.txt
```

### Parallel Execution

```bash
# Run multiple agents in parallel
delta run --agent ./agent1 -m "Task 1" &
delta run --agent ./agent2 -m "Task 2" &
delta run --agent ./agent3 -m "Task 3" &
wait
```

### Output Parsing

```bash
# Extract final response
delta run --agent ./my-agent -m "Task" 2>&1 |
  grep -A 100 "Final Response:" |
  head -n -5

# Extract run ID
RUN_ID=$(delta run --agent ./my-agent -m "Task" 2>&1 |
  grep "Run ID:" |
  awk '{print $3}')

# Extract workspace path
WORKSPACE=$(delta run --agent ./my-agent -m "Task" 2>&1 |
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
Error: API key not found
```
**Solution:** Set `DELTA_API_KEY` environment variable

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
de --agent ./my-agent -m "Quick task"
```

### 2. Default Agent Path

```bash
# Create wrapper script
#!/bin/bash
delta run --agent ~/agents/my-default-agent -m "$*"
```

### 3. Task Templates

```bash
# Create task template
TASK_TEMPLATE="Analyze the file {file} and create a summary"

# Use with substitution
FILE="data.csv"
delta run --agent ./analyst -m "${TASK_TEMPLATE//\{file\}/$FILE}"
```

### 4. Persistent Workspace

```bash
# Create named workspace
WORKSPACE="$HOME/.delta-workspaces/my-project"
mkdir -p "$WORKSPACE"

# Always use same workspace
alias my-agent="delta run --agent ~/agents/my-agent --work-dir $WORKSPACE -m"

# Usage
my-agent "Do something"
```

### 5. JSON Output

```bash
# Extract structured data from journal
delta run --agent ./my-agent -m "Task" 2>/dev/null
cat workspaces/*/delta/runs/*/journal.jsonl |
  jq -c 'select(.type == "ACTION_RESULT") | {tool: .payload.tool_name, status: .payload.status}'
```

## See Also

- [Configuration Reference](./config.md) - Agent configuration details
- [Agent Development Guide](../guides/agent-development.md) - Building agents
- [Hooks Guide](../guides/hooks.md) - Extending with hooks