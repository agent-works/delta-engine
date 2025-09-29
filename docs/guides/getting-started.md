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
npx delta run --agent examples/hello-agent --task "List files in current directory"
```

### 2. Create Your First Agent

Create a new directory for your agent:

```bash
mkdir my-agent
cd my-agent
```

Create `config.yaml`:

```yaml
name: my-agent
version: 1.0.0
description: My first Delta Engine agent

llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: list_files
    command: [ls, -la]
    parameters: []

  - name: read_file
    command: [cat]
    parameters:
      - name: filename
        type: string
        description: File to read
        inject_as: argument

  # Human interaction tool (v1.2)
  - name: ask_human
    # Built-in tool for requesting user input
```

Create `system_prompt.md`:

```markdown
# System Prompt

You are a helpful file system assistant.

## Guidelines
- Be concise and clear
- Use tools to complete tasks
- Provide feedback on completion
```

### 3. Run Your Agent

```bash
npx delta run --agent . --task "Your task here"
```

## Understanding the Output

After running, you'll find:

```
work_runs/
└── workspace_{timestamp}/
    └── .delta/
        └── runs/
            └── {run_id}/
                ├── execution/
                │   ├── journal.jsonl  # Execution log
                │   └── metadata.json  # Run metadata
                └── runtime_io/       # Detailed I/O logs
```

## Key Concepts

### Tools
Tools are external commands that your agent can execute:
- Each tool maps to a command-line program
- Parameters can be injected as arguments, stdin, or options
- Tool outputs are captured and fed back to the LLM
- **ask_human** (v1.2) - Built-in tool for requesting user input

### Think-Act-Observe Loop
1. **Think** - LLM processes the current context
2. **Act** - Execute tools based on LLM decisions
3. **Observe** - Capture tool outputs for next iteration

### Workspaces
Each run creates an isolated workspace:
- Independent working directory
- Complete audit trail in `.delta/`
- Can be reused with `--work-dir` flag

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
- [Hooks Guide](./hooks.md) - Extend agent behavior with lifecycle hooks
- [CLI Reference](../api/cli.md) - Complete command reference

## Troubleshooting

### Missing API Key
```bash
export OPENAI_API_KEY="your-key-here"
```

### Custom API Endpoint
```bash
export OPENAI_API_URL="https://your-endpoint.com/v1"
```

### Debug Mode
```bash
# View detailed logs
cat work_runs/workspace_*/delta/runs/*/execution/journal.jsonl | jq
```

## Getting Help

- Check the [Architecture Documentation](../architecture/README.md)
- Review [example agents](../../examples/)
- Open an issue on GitHub