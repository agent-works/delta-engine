# Agent Development Guide

## Overview

This guide covers how to develop custom agents for Delta Engine, from basic file operations to complex multi-step workflows.

**✨ v1.7 Update**: Delta Engine now supports simplified tool syntax with 77% less configuration! See [v1.7 Simplified Syntax](#v17-simplified-tool-syntax-recommended) below.

## Agent Anatomy

Every agent consists of two required files:

```
my-agent/
├── config.yaml         # Agent configuration
└── system_prompt.md    # System prompt (or .txt)
```

## v1.7 Simplified Tool Syntax (Recommended)

Delta Engine v1.7 introduces simplified syntax that reduces tool configuration verbosity by 77%. **This is now the recommended way to define tools.**

### Quick Comparison

```yaml
# ✨ NEW (v1.7): 2 lines - Clean and readable
tools:
  - name: list_files
    exec: "ls -la ${directory}"

# 📦 OLD (v1.0-v1.6): 9 lines - Verbose and complex
tools:
  - name: list_files
    command: [ls, -la]
    parameters:
      - name: directory
        type: string
        description: Directory to list
        inject_as: argument
```

### Two Execution Modes

#### 1. `exec:` Mode - Direct Execution (Recommended for Most Tools)

**Use when**: Simple commands without shell features (pipes, redirects)

**Security**: Zero shell involvement → Zero injection risk

```yaml
tools:
  # Basic command
  - name: create_file
    exec: "touch ${filename}"

  # Multiple parameters
  - name: copy_file
    exec: "cp ${source} ${destination}"

  # With flags
  - name: list_details
    exec: "ls -laht ${directory}"

  # stdin parameter
  - name: write_file
    exec: "tee ${filename}"
    stdin: content  # Declare 'content' as stdin parameter
```

#### 2. `shell:` Mode - Shell Interpretation (For Advanced Cases)

**Use when**: Need pipes, redirects, or shell features

**Security**: Automatic parameter quoting prevents injection

```yaml
tools:
  # Pipeline
  - name: count_lines
    shell: "cat ${file} | wc -l"

  # Grep with fallback
  - name: search_logs
    shell: 'grep "${pattern}" log.txt || echo "No matches"'

  # Redirection
  - name: append_note
    shell: "echo ${message} >> notes.txt"

  # Complex pipeline
  - name: analyze_errors
    shell: 'grep "ERROR" ${logfile} | tail -20 | sort | uniq -c'
```

#### 3. `:raw` Modifier (Expert Feature)

**Use when**: Need unquoted arguments (flags, options)

**Only allowed in `shell:` mode**

```yaml
tools:
  # Unquoted flags parameter
  - name: run_docker
    shell: "docker run ${flags:raw} ${image}"
  # LLM can pass: flags="-p 8080:80 -d", image="nginx"
  # Executes: docker run -p 8080:80 -d nginx
```

### Parameter Inference

Parameters are **automatically inferred** from `${param}` placeholders:

```yaml
# This simple definition:
- name: move_file
  exec: "mv ${source} ${destination}"

# Automatically creates these parameters:
# - name: source, type: string, inject_as: argument
# - name: destination, type: string, inject_as: argument
```

### stdin Parameters

Declare stdin parameters explicitly:

```yaml
- name: write_content
  exec: "tee ${filename}"
  stdin: content  # 'content' will be piped to stdin

# Usage by LLM:
# write_content(filename="output.txt", content="Hello World")
```

### When to Use Legacy Syntax

Keep using v1.0-v1.6 `command:` syntax for:
1. **Option injection** (`inject_as: option` with `option_name`)
2. **Variable expansion** (`${AGENT_HOME}`, `${CWD}`)
3. **Complex bash scripting** (heredocs, conditionals)

See [Legacy Syntax Reference](#legacy-syntax-reference-v10-v16) below.

### Tool Expansion

Use `delta tool:expand` to see how v1.7 syntax expands internally:

```bash
delta tool:expand config.yaml

# Shows:
# exec: "ls -la ${directory}"
# ↓
# command: [ls, -la]
# parameters: [{name: directory, inject_as: argument}]
```

## Basic Agent Example

### Simple File Manager Agent (v1.7 Syntax)

`config.yaml`:
```yaml
name: file-manager
version: 1.0.0
description: A file management assistant

llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000

# ✨ v1.7: Simplified tool definitions
tools:
  - name: list_files
    exec: "ls -la"

  - name: create_file
    exec: "touch ${filename}"

  - name: delete_file
    exec: "rm ${filename}"

  - name: read_file
    exec: "cat ${filename}"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  # Human interaction tool (v1.2)
  - name: ask_human
    # Built-in tool for requesting user input
    # No command needed - handled by Delta Engine
```

<details>
<summary>📦 Click to see v1.0-v1.6 legacy syntax</summary>

```yaml
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
```
</details>

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

### Working with Shell Features

Use `shell:` mode for pipes, redirects, and complex shell expressions:

```yaml
tools:
  # Pipeline
  - name: top_failures
    shell: 'grep "ERROR" ${logfile} | sort | uniq -c | sort -rn | head -10'

  # Conditional execution
  - name: safe_read
    shell: 'test -f ${file} && cat ${file} || echo "File not found"'

  # Process substitution
  - name: compare_dirs
    shell: 'diff <(ls ${dir1}) <(ls ${dir2})'

  # Background execution
  - name: start_server
    shell: 'nohup ${command} > server.log 2>&1 &'
```

### Multiple Parameters

Both `exec:` and `shell:` modes support multiple parameters:

```yaml
- name: copy_with_backup
  exec: "cp ${source} ${destination}.bak && mv ${source} ${destination}"

- name: search_replace
  shell: 'sed "s/${pattern}/${replacement}/g" ${file}'
```

### stdin + Arguments

Combine stdin with regular arguments:

```yaml
- name: filter_and_save
  shell: "grep ${pattern} > ${output}"
  stdin: input_data
  # Usage: filter_and_save(pattern="ERROR", output="errors.txt", input_data="<log content>")
```

## Working with External Programs

### Python Scripts
```yaml
# ✨ v1.7: Simple and clean
- name: run_analysis
  exec: "python3 scripts/analyze.py ${data_file}"

# Or with stdin
- name: process_json
  exec: "python3 scripts/processor.py ${output_format}"
  stdin: json_data
```

### Shell Scripts
```yaml
- name: backup_files
  exec: "bash scripts/backup.sh ${source_dir} ${dest_dir}"
```

### Docker Containers
```yaml
# Simple execution
- name: run_in_container
  exec: "docker run --rm my-image ${command}"

# With multiple flags (use :raw for flag lists)
- name: docker_advanced
  shell: "docker run ${flags:raw} ${image} ${command}"
  # Example: flags="-p 8080:80 -d --name web"
```

### Node.js Scripts
```yaml
- name: build_assets
  exec: "node build.js ${env} ${target}"

- name: run_tests
  shell: "npm test -- ${test_pattern}"
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
npx tsx src/index.ts run --agent ./my-agent -m "List all files"

# Test with complex task
npx tsx src/index.ts run --agent ./my-agent -m "Create three files named test1.txt, test2.txt, test3.txt with sequential numbers as content"
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
  npx tsx src/index.ts run --agent ./my-agent -m "$task"
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
delta run -i --agent ./my-agent -m "Configure application settings"
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
delta run --agent ./my-agent -m "Deploy with user confirmation"
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

## Advanced: Context Composition (v1.6)

### When to Use context.yaml

For most agents, the default context strategy is sufficient. However, you should consider custom context composition when:

- **Long-running tasks** (>10 iterations) - Risk of context window overflow
- **Large knowledge bases** - Need to inject documentation, API references
- **Multi-file operations** - Refactoring, testing across many files
- **Token optimization** - Want to compress history while maintaining memory

### Quick Start: DELTA.md Workspace Guide

The simplest way to add context is through `DELTA.md` in the workspace root:

```bash
# In your workspace (W001/, W002/, etc.)
cat > DELTA.md << 'EOF'
# Project Context

## Tech Stack
- TypeScript 5.0
- React 18
- Jest for testing

## Current Task
Migrating authentication to OAuth2

## Conventions
- Use camelCase for variables
- Prefix test files with .test.ts
EOF
```

**No configuration needed** - `DELTA.md` is automatically loaded into context!

The agent will see this content in every LLM call, providing persistent workspace memory.

### Custom Context with context.yaml

Create `${AGENT_HOME}/context.yaml` to customize context sources:

```yaml
sources:
  # 1. System prompt (always include)
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"

  # 2. API documentation (static knowledge)
  - type: file
    id: api_docs
    path: "${AGENT_HOME}/knowledge/api-reference.md"
    on_missing: skip  # Won't fail if missing

  # 3. Compressed memory (dynamic generation)
  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
      timeout_ms: 10000
    output_path: "${CWD}/.delta/context_artifacts/summary.md"
    on_missing: skip

  # 4. Recent conversation (last 5 turns only)
  - type: journal
    id: recent_conversation
    max_iterations: 5
```

### Example: Memory Folding

For long-running agents, implement memory folding to compress old history:

**1. Create summarizer script** (`tools/summarize.py`):
```python
#!/usr/bin/env python3
import json, os
from pathlib import Path

# Read journal from current run
run_id = os.environ['DELTA_RUN_ID']
cwd = os.environ['DELTA_CWD']
journal_path = Path(cwd) / '.delta' / run_id / 'journal.jsonl'

# Extract key facts
events = []
with open(journal_path, 'r') as f:
    for line in f:
        events.append(json.loads(line))

facts = []
for event in events:
    if event['type'] == 'ACTION_REQUEST':
        tool = event['payload']['tool_name']
        args = event['payload']['tool_args']
        facts.append(f"- Used {tool}: {args}")

# Write compressed summary
output_dir = Path(cwd) / '.delta' / 'context_artifacts'
output_dir.mkdir(parents=True, exist_ok=True)

summary = f"# Memory Summary\n\n{len(events)} events so far.\n\n" + "\n".join(facts[-20:])
(output_dir / 'summary.md').write_text(summary)
```

**2. Configure context.yaml** (as shown above)

**3. Run your agent:**
```bash
delta run --agent ./my-agent -m "Long complex task with many steps"
```

The agent will maintain memory across 100+ iterations while using tokens efficiently.

### Source Types Overview

1. **file**: Load static content (docs, guides, examples)
2. **computed_file**: Generate dynamic content (summaries, RAG, knowledge graphs)
3. **journal**: Include recent conversation (with optional turn limit)

### Path Variables

Use these variables in `context.yaml` paths:
- `${AGENT_HOME}`: Agent directory (where config.yaml lives)
- `${CWD}`: Current workspace directory

### Example: RAG Integration

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  # Retrieve relevant docs via vector search
  - type: computed_file
    id: relevant_knowledge
    generator:
      command: ["node", "${AGENT_HOME}/tools/vector-search.js"]
    output_path: "${CWD}/.delta/context_artifacts/knowledge.md"

  - type: journal
    max_iterations: 10
```

The generator receives environment variables:
- `DELTA_RUN_ID`: Current run ID
- `DELTA_AGENT_HOME`: Agent directory path
- `DELTA_CWD`: Workspace path

### Best Practices

1. **Start simple**: Use default context first, add complexity only when needed
2. **Test generators independently**: Debug outside of Delta Engine first
3. **Use descriptive IDs**: `id: compressed_memory_last_50_turns` is better than `id: memory`
4. **Monitor context size**: Check `.delta/{run_id}/io/invocations/*.json` for token usage
5. **Graceful degradation**: Use `on_missing: skip` for optional sources

### Complete Example

See `examples/2-core-features/memory-folding/` for a fully working implementation demonstrating:
- Custom context.yaml with all 3 source types
- Python-based journal summarizer
- Token-efficient context strategy
- Complete README with usage instructions

### Learn More

- **[Context Management Guide](./context-management.md)** - Comprehensive guide to context composition
- **[v1.6 Architecture](../architecture/v1.6-context-composition.md)** - Design details and philosophy
- **[memory-folding example](../../examples/2-core-features/memory-folding/)** - Working implementation

---

## Legacy Syntax Reference (v1.0-v1.6)

The explicit `command:` array syntax is fully supported and required for certain advanced features.

### When to Use Legacy Syntax

Use the v1.0-v1.6 syntax when you need:

1. **Option Injection** - Named flags with `option_name`
2. **Variable Expansion** - `${AGENT_HOME}`, `${CWD}` in command paths
3. **Complex Bash Scripting** - Heredocs, conditionals, multi-line scripts

### Option Injection (inject_as: option)

For tools requiring named flags (not supported in v1.7 exec:/shell:):

```yaml
tools:
  - name: curl_post
    command: [curl, -X, POST]
    parameters:
      - name: url
        inject_as: option
        option_name: --url
      - name: data
        inject_as: option
        option_name: -d
      - name: header
        inject_as: option
        option_name: -H
# Generates: curl -X POST --url <url> -d <data> -H <header>
```

### Variable Expansion

For accessing Delta Engine path variables:

```yaml
tools:
  - name: run_agent_script
    command: [python3, "${AGENT_HOME}/tools/helper.py"]
    parameters:
      - name: task
        inject_as: argument

  - name: read_workspace_config
    command: [cat, "${CWD}/.config.json"]
    parameters: []
```

### Full Parameter Configuration

The explicit format with all fields:

```yaml
tools:
  - name: search_and_replace
    command: [sed]
    parameters:
      - name: pattern
        type: string
        description: "Pattern to search for"
        inject_as: option
        option_name: -e
      - name: file
        type: string
        description: "File to process"
        inject_as: argument
```

### Parameter Injection Methods

1. **As Arguments** (`inject_as: argument`)
   - Passed as positional arguments
   - Example: `cat file.txt` → file: `{inject_as: argument}`

2. **As STDIN** (`inject_as: stdin`)
   - Piped to standard input
   - Only one stdin parameter per tool
   - Example: `tee output.txt < content` → content: `{inject_as: stdin}`

3. **As Options** (`inject_as: option`)
   - Named flags with `option_name`
   - Example: `grep -e "pattern" file` → pattern: `{inject_as: option, option_name: -e}`

### Migration Guide

Converting from legacy to v1.7 syntax:

```yaml
# BEFORE (v1.0-v1.6):
- name: list_files
  command: [ls, -la]
  parameters:
    - name: directory
      type: string
      inject_as: argument

# AFTER (v1.7):
- name: list_files
  exec: "ls -la ${directory}"

---

# BEFORE (v1.0-v1.6):
- name: count_lines
  command: [sh, -c, "cat \"$1\" | wc -l", --]
  parameters:
    - name: file
      type: string
      inject_as: argument

# AFTER (v1.7):
- name: count_lines
  shell: "cat ${file} | wc -l"

---

# BEFORE (v1.0-v1.6):
- name: write_file
  command: [tee]
  parameters:
    - name: filename
      type: string
      inject_as: argument
    - name: content
      type: string
      inject_as: stdin

# AFTER (v1.7):
- name: write_file
  exec: "tee ${filename}"
  stdin: content
```

**Note**: Both syntaxes can coexist in the same `config.yaml` file.

---

## Next Steps

- Review [example agents](../../examples/) for inspiration
- Learn about [Context Management](./context-management.md) for long-running tasks (v1.6)
- Learn about [Lifecycle Hooks](./hooks.md) for advanced customization
- Check [Configuration Reference](../api/config.md) for all options