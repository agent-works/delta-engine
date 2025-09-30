# Agent Development Guide

## Overview

This guide covers how to develop custom agents for Delta Engine, from basic file operations to complex multi-step workflows.

## Agent Anatomy

Every agent consists of two required files:

```
my-agent/
├── config.yaml         # Agent configuration
└── system_prompt.md    # System prompt (or .txt)
```

## Basic Agent Example

### Simple File Manager Agent

`config.yaml`:
```yaml
name: file-manager
version: 1.0.0
description: A file management assistant

llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: list_files
    command: [ls, -la]
    parameters: []

  - name: create_file
    command: [touch]
    parameters:
      - name: filename
        type: string
        description: Name of the file to create
        inject_as: argument

  - name: delete_file
    command: [rm]
    parameters:
      - name: filename
        type: string
        description: Name of the file to delete
        inject_as: argument

  - name: read_file
    command: [cat]
    parameters:
      - name: filename
        type: string
        description: File to read
        inject_as: argument

  - name: write_file
    command: [tee]
    parameters:
      - name: filename
        type: string
        description: File to write to
        inject_as: argument
      - name: content
        type: string
        description: Content to write
        inject_as: stdin

  # Human interaction tool (v1.2)
  - name: ask_human
    # Built-in tool for requesting user input
    # No command needed - handled by Delta Engine
```

`system_prompt.md`:
```markdown
# File Manager Assistant

You are a file management assistant that helps users organize and manipulate files.

## Capabilities
- List files and directories
- Create and delete files
- Read and write file contents

## Guidelines
- Always confirm before deleting files
- Provide clear feedback after operations
- Handle errors gracefully
- Use ask_human for user confirmation when needed
```

## Advanced Tool Configuration

### Parameter Injection Methods

1. **As Arguments** (`inject_as: argument`)
```yaml
- name: echo_message
  command: [echo]
  parameters:
    - name: message
      type: string
      inject_as: argument  # Becomes: echo "message content"
```

2. **As STDIN** (`inject_as: stdin`)
```yaml
- name: write_content
  command: [tee, output.txt]
  parameters:
    - name: content
      type: string
      inject_as: stdin  # Content piped to command
```

3. **As Options** (`inject_as: option`)
```yaml
- name: grep_pattern
  command: [grep]
  parameters:
    - name: pattern
      type: string
      inject_as: option
      option_flag: -e  # Becomes: grep -e "pattern"
```

### Complex Tool Example

```yaml
- name: search_and_replace
  command: [sed]
  parameters:
    - name: pattern
      type: string
      description: Pattern to search for
      inject_as: option
      option_flag: -e
      option_value_template: "s/${value}//"  # Custom formatting
    - name: file
      type: string
      description: File to process
      inject_as: argument
```

## Working with External Programs

### Python Scripts
```yaml
- name: run_analysis
  command: [python3, scripts/analyze.py]
  parameters:
    - name: data_file
      type: string
      inject_as: argument
```

### Shell Scripts
```yaml
- name: backup_files
  command: [bash, scripts/backup.sh]
  parameters:
    - name: source_dir
      type: string
      inject_as: argument
    - name: dest_dir
      type: string
      inject_as: argument
```

### Docker Containers
```yaml
- name: run_in_container
  command: [docker, run, --rm, my-image]
  parameters:
    - name: command
      type: string
      inject_as: argument
```

## System Prompt Best Practices

### Structure Your Prompt

```markdown
# Role Definition
You are a [specific role] that [primary function].

## Core Responsibilities
1. First responsibility
2. Second responsibility

## Available Tools
- `tool_name`: Description of what it does
- `another_tool`: Its purpose

## Workflow
1. Understand the request
2. Plan the approach
3. Execute using tools
4. Verify results

## Constraints
- Never do X
- Always do Y
- Prefer Z over W

## Output Format
- Be concise
- Use bullet points for lists
- Confirm completion
```

### Domain-Specific Examples

**Data Analysis Agent:**
```markdown
# Data Analysis Assistant

You are a data analyst specializing in CSV file processing.

## Workflow
1. Load data using `read_csv`
2. Analyze patterns using `analyze_data`
3. Generate visualizations with `plot_graph`
4. Save results using `write_results`
```

**DevOps Agent:**
```markdown
# DevOps Automation Assistant

You help with deployment and infrastructure tasks.

## Safety Rules
- Always dry-run before actual execution
- Confirm destructive operations
- Log all operations
```

## Testing Your Agent

### Manual Testing
```bash
# Test with a simple task
npx tsx src/index.ts run --agent ./my-agent --task "List all files"

# Test with complex task
npx tsx src/index.ts run --agent ./my-agent --task "Create three files named test1.txt, test2.txt, test3.txt with sequential numbers as content"
```

### Automated Testing
Create `test-tasks.txt`:
```
List all files
Create a file named test.txt
Write "Hello World" to test.txt
Read test.txt
Delete test.txt
```

Run tests:
```bash
while IFS= read -r task; do
  echo "Testing: $task"
  npx tsx src/index.ts run --agent ./my-agent --task "$task"
done < test-tasks.txt
```

## Debugging

### View Execution Journal
```bash
# Pretty print journal (adjust path for workspace naming: W001, W002, etc.)
cat workspaces/W*/delta/runs/*/journal.jsonl | jq

# Filter specific events
cat workspaces/W*/delta/runs/*/journal.jsonl | jq 'select(.type == "ACTION_REQUEST")'

# Legacy workspace format also supported
cat workspaces/workspace_*/delta/runs/*/journal.jsonl | jq
```

### Check Tool Execution
```bash
# View tool outputs
ls -la workspaces/W*/delta/runs/*/io/tool_executions/
```

### Common Issues

1. **Tool Not Found**
   - Ensure command exists in PATH
   - Use absolute paths for custom scripts

2. **Parameter Injection Errors**
   - Check `inject_as` configuration
   - Verify parameter types match

3. **LLM Not Using Tools**
   - Improve system prompt clarity
   - Add tool usage examples in prompt

## Human-in-the-Loop Interaction (v1.2)

### Using the ask_human Tool

The `ask_human` tool is a built-in tool that allows agents to request input from users:

```yaml
# In config.yaml
tools:
  - name: ask_human
    # No command needed - handled internally by Delta Engine
```

### Interactive Mode Example

```bash
# Run with interactive mode flag
delta run -i --agent ./my-agent --task "Configure application settings"
```

Agent code:
```python
# The agent can call ask_human like any other tool
user_preference = ask_human(
    prompt="What database would you prefer? (postgres/mysql/sqlite)",
    input_type="text"
)
```

### Async Mode Example

```bash
# Run in async mode (default)
delta run --agent ./my-agent --task "Deploy with user confirmation"
```

Workflow:
1. Agent calls `ask_human` tool
2. Engine creates `.delta/interaction/request.json`
3. Process exits with code 101
4. User creates `.delta/interaction/response.txt`
5. User runs `delta run` again to continue

### Request/Response Format

**request.json:**
```json
{
  "request_id": "uuid-here",
  "timestamp": "2024-01-01T00:00:00Z",
  "prompt": "Please confirm deployment to production (yes/no):",
  "input_type": "text",
  "sensitive": false
}
```

**response.txt:**
```
yes
```

### Use Cases

1. **Getting API Keys:**
```yaml
- name: setup_api
  system_prompt: |
    When setting up external services,
    use ask_human to get API keys:
    ask_human(prompt="Enter your API key:", sensitive=true)
```

2. **Confirmation for Destructive Operations:**
```yaml
- name: cleanup_agent
  system_prompt: |
    Before deleting files, always confirm:
    ask_human(prompt="Delete 10 files? (yes/no)")
```

3. **Gathering User Preferences:**
```yaml
- name: config_agent
  system_prompt: |
    Collect user preferences interactively:
    ask_human(prompt="Choose theme (dark/light):")
```

### Best Practices

1. **Clear Prompts:** Make prompts specific and actionable
2. **Input Validation:** Validate user input before proceeding
3. **Sensitive Data:** Mark passwords/keys as sensitive
4. **Fallback Logic:** Handle cases where user cancels
5. **Progress Indication:** Tell users what will happen next

## Advanced Patterns

### Multi-Step Workflows

```yaml
# In config.yaml
tools:
  - name: start_workflow
    command: [./scripts/workflow.sh, start]

  - name: check_status
    command: [./scripts/workflow.sh, status]

  - name: complete_workflow
    command: [./scripts/workflow.sh, complete]
```

### Conditional Execution

In system prompt:
```markdown
## Decision Logic
- If file exists, read it
- If file doesn't exist, create it first
- If operation fails, report error and suggest alternatives
```

### State Management

Since Delta Engine is stateless, use files for state:

```yaml
- name: save_state
  command: [tee, .agent_state.json]
  parameters:
    - name: state_data
      type: string
      inject_as: stdin

- name: load_state
  command: [cat, .agent_state.json]
  parameters: []
```

## Performance Optimization

### Reduce Tool Calls
- Combine operations where possible
- Use shell scripts for multi-step operations

### Optimize Prompts
- Be specific about when to use tools
- Provide clear completion criteria

### Workspace Management
```bash
# Interactive workspace selection (default)
npx tsx src/index.ts run --agent ./my-agent

# Silent mode - auto-create new workspace
npx tsx src/index.ts run -y --agent ./my-agent

# Explicit workspace for related tasks
npx tsx src/index.ts run --agent ./my-agent --work-dir ./persistent-workspace
```

## Security Considerations

### Restrict Dangerous Commands
Never include in production agents:
- `rm -rf`
- `sudo` commands
- System modification commands

### Validate Inputs
```yaml
- name: safe_delete
  command: [./scripts/safe_delete.sh]  # Add validation in script
  parameters:
    - name: filename
      type: string
      inject_as: argument
```

### Use Sandboxing
Run agents in containers or VMs for isolation:
```bash
docker run -v $(pwd):/workspace delta-engine run --agent /workspace/my-agent
```

## Next Steps

- Review [example agents](../../examples/) for inspiration
- Learn about [Lifecycle Hooks](./hooks.md) for advanced customization
- Check [Configuration Reference](../api/config.md) for all options