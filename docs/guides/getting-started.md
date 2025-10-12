# Getting Started with Delta Engine

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/delta-engine.git
cd delta-engine

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

### 1. Run an Example Agent

```bash
delta run --agent examples/1-basics/hello-world --task "Create a greeting file"
```

### 2. Create Your First Agent (v1.3)

Use the `delta init` command to quickly scaffold a new agent:

```bash
# Initialize with interactive template selection
delta init my-agent

# Or use silent mode with minimal template
delta init my-agent -y

# Or specify a template directly
delta init my-agent -t hello-world
```

**Available templates:**
- `minimal` - Basic echo and file operations
- `hello-world` - Friendly agent with common tools
- `file-ops` - File management and organization
- `api-tester` - REST API testing tools

### 3. Run Your Agent

```bash
cd my-agent
delta run -y --agent . --task "Your task here"
```

**Advanced options:**

```bash
# Interactive workspace selection (choose from existing or create new)
delta run --agent . --task "Your task here"

# Custom workspace location
delta run --agent . --task "Your task here" --work-dir ./my-workspace

# Interactive mode for human-in-the-loop
delta run -i --agent . --task "Your task here"
```

## Understanding the Output

After running, you'll find:

```
my-agent/
├── config.yaml              # Agent configuration
├── system_prompt.md         # Agent instructions
└── workspaces/              # Execution workspaces (v1.3)
    ├── LAST_USED            # Tracks last used workspace
    ├── W001/                # First workspace
    │   └── .delta/
    │       ├── VERSION      # Schema version
    │       ├── LATEST       # Latest run ID
    │       └── {run_id}/
    │           ├── journal.jsonl  # Execution log
    │           ├── metadata.json  # Run metadata
    │           ├── engine.log     # Engine debug log
    │           ├── io/            # I/O details (v1.3 renamed)
    │           │   ├── invocations/
    │           │   ├── tool_executions/
    │           │   └── hooks/
    │           └── interaction/   # Human-in-the-loop (v1.2)
    └── W002/                # Additional workspaces
```

**Workspace Selection**: When you run without `--work-dir`, Delta Engine shows an interactive menu to select an existing workspace or create a new one. The last-used workspace is highlighted as the default.

## Key Concepts

### Tools (v1.7 Simplified Syntax)

Tools are external commands that your agent can execute. **v1.7 introduces simplified syntax** that makes tool configuration 77% more concise:

```yaml
# ✨ v1.7: Simple and readable (Recommended)
tools:
  - name: read_file
    exec: "cat ${filename}"

  - name: count_lines
    shell: "cat ${file} | wc -l"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content
```

**Two execution modes:**
- `exec:` - Direct execution (safest, no shell involvement)
- `shell:` - Shell interpretation for pipes/redirects

**Legacy syntax (v1.0-v1.6) still fully supported:**
```yaml
# 📦 Legacy: Explicit command arrays
tools:
  - name: read_file
    command: [cat]
    parameters:
      - name: filename
        type: string
        inject_as: argument
```

**Key features:**
- Parameters automatically inferred from `${param}` placeholders
- Tool outputs captured and fed back to the LLM
- **ask_human** (v1.2) - Built-in tool for requesting user input
- Use `delta tool:expand config.yaml` to see internal expansion

See [Agent Development Guide](./agent-development.md) for complete v1.7 syntax documentation.

### Think-Act-Observe Loop
1. **Think** - LLM processes the current context
2. **Act** - Execute tools based on LLM decisions
3. **Observe** - Capture tool outputs for next iteration

### Workspaces
Each run creates an isolated workspace:
- Independent working directory
- Complete audit trail in `.delta/`
- Can be reused with `--work-dir` flag

### Context Management (v1.6)
Delta Engine provides flexible context composition for LLM calls:

**DELTA.md - Workspace Guide** (Auto-loaded):
- Create a `DELTA.md` file in your workspace root
- Automatically injected into every LLM call
- Perfect for project-specific instructions, conventions, task context

**Example:**
```bash
# In your workspace (W001/, W002/, etc.)
cat > DELTA.md << 'EOF'
# Project Context

## Tech Stack
- TypeScript, React, Jest

## Current Task
Refactoring authentication module

## Important
- Never modify schema without migration
- All API changes need OpenAPI docs
EOF

# Run agent - DELTA.md is automatically included
delta run --agent my-agent --task "Add new login endpoint"
```

**Custom Context Strategies**:
For advanced scenarios (long tasks, large knowledge bases), use `context.yaml` for:
- Memory folding (compress old history)
- RAG integration (vector search)
- Dynamic documentation
- Token optimization

See [Context Management Guide](./context-management.md) for details.

### Human-in-the-Loop (v1.2)
Two modes for human interaction:

1. **Interactive Mode (`-i`)** - Synchronous CLI interaction
   ```bash
   delta run -i --agent my-agent --task "Get user preferences"
   ```
   - Agent pauses and waits for input in terminal
   - Suitable for local development and debugging

2. **Async Mode (default)** - File-based interaction
   ```bash
   delta run --agent my-agent --task "Process with confirmation"
   ```
   - Agent writes request to `.delta/interaction/request.json`
   - User provides response in `.delta/interaction/response.txt`
   - Re-run `delta run` to continue execution
   - Suitable for automation and external integrations

## Next Steps

- [Agent Development Guide](./agent-development.md) - Learn to build complex agents
- [Context Management Guide](./context-management.md) - Memory folding and dynamic context (v1.6)
- [Hooks Guide](./hooks.md) - Extend agent behavior with lifecycle hooks
- [CLI Reference](../api/cli.md) - Complete command reference

## Troubleshooting

### Missing API Key
```bash
export DELTA_API_KEY="your-key-here"
```

### Custom API Endpoint
```bash
export DELTA_BASE_URL="https://your-endpoint.com/v1"
```

### Debug Mode
```bash
# View latest journal
cat workspaces/W001/.delta/$(cat workspaces/W001/.delta/LATEST)/journal.jsonl | jq

# Or use verbose mode
delta run -v --agent . --task "Your task"
```

## Getting Help

- Check the [Architecture Documentation](../architecture/README.md)
- Review [example agents](../../examples/)
- Open an issue on GitHub