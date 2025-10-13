# Configuration Reference

## Overview

Agent configuration is defined in `agent.yaml` using YAML format (v1.9+). This document describes all available configuration options.

**✨ v1.9**: Delta Engine introduces unified agent structure with `agent.yaml`, `hooks.yaml`, and modular tool imports.

**✨ v1.7**: Delta Engine uses simplified tool syntax with `exec:` and `shell:` modes. See [v1.7 Syntax](#v17-simplified-syntax) below.

**Backward Compatibility**: `config.yaml` is still supported but deprecated. See [Migration from v1.8](#migration-from-v18-to-v19).

## v1.9 Unified Agent Structure

Delta Engine v1.9 introduces a cleaner agent structure with three key improvements:

### 1. agent.yaml (Renamed from config.yaml)

The main configuration file is now `agent.yaml` for better clarity:

```yaml
name: my-agent
version: 1.0.0
description: A modular agent

llm:
  model: gpt-4
  temperature: 0.7

# NEW: Import tool definitions from external modules
imports:
  - modules/file-tools.yaml
  - modules/web-tools.yaml

tools:
  - name: custom_tool
    exec: "echo ${message}"
```

### 2. hooks.yaml (Separated from agent.yaml)

Lifecycle hooks now have their own configuration file for better organization:

```yaml
# hooks.yaml - Separate file for lifecycle hooks
pre_llm_req:
  command: [./hooks/pre_request.sh]
  timeout_ms: 5000

post_tool_exec:
  command: [./hooks/audit.sh]

on_run_end:  # v1.9 NEW: Cleanup on run completion
  command: [./hooks/cleanup.sh]
```

If `hooks.yaml` exists, it takes priority. For backward compatibility, `lifecycle_hooks` in `agent.yaml` still works but is deprecated.

### 3. imports Mechanism (NEW)

Organize tools into reusable modules:

```yaml
# agent.yaml
imports:
  - modules/file-ops.yaml    # Import file operation tools
  - modules/web-search.yaml  # Import web search tools

tools:
  - name: custom_tool
    exec: "echo ${message}"
```

```yaml
# modules/file-ops.yaml
tools:
  - name: read_file
    exec: "cat ${filename}"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content
```

**How imports work:**
- Imports are processed recursively (modules can import other modules)
- Tools are merged using **Last Write Wins** strategy (later definitions override earlier ones)
- Circular imports are detected and rejected
- Security: Import paths must be relative and within agent directory (no `../` or absolute paths)

**Complete directory structure:**

```
my-agent/
├── agent.yaml              # Main config (v1.9+)
├── hooks.yaml              # Lifecycle hooks (v1.9+, optional)
├── system_prompt.md        # System prompt
├── context.yaml            # Context composition (optional)
├── modules/                # Reusable tool modules (v1.9+, optional)
│   ├── file-ops.yaml
│   └── web-search.yaml
├── tools/                  # Custom tool scripts
│   └── helper.sh
└── workspaces/             # Execution workspaces
```

## v1.7 Simplified Syntax

Delta Engine v1.7 introduces `exec:` and `shell:` modes as syntax sugar over the explicit `command:` array format.

### Quick Start

```yaml
# v1.7 Syntax (Recommended)
tools:
  - name: list_files
    exec: "ls -la ${directory}"

  - name: count_lines
    shell: "cat ${file} | wc -l"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content
```

### exec: Mode (Direct Execution)

**Syntax**: `exec: "command ${param1} ${param2}"`

**Use when**: Simple commands without shell features

**Security**: Zero shell involvement → Zero injection risk

**Behavior**:
- Parameters automatically inferred from `${param}` placeholders
- Expanded to `command: [cmd, arg1, arg2, ...]`
- Shell metacharacters (`|`, `>`, `<`, `&`, `;`) rejected with error
- Parameters automatically quoted at runtime

**Example**:
```yaml
- name: copy_file
  exec: "cp ${source} ${destination}"

# Expands to:
# command: [cp]
# parameters:
#   - name: source, inject_as: argument
#   - name: destination, inject_as: argument
```

### shell: Mode (Shell Interpretation)

**Syntax**: `shell: "shell command with ${param}"`

**Use when**: Need pipes, redirects, or shell features

**Security**: Automatic parameter quoting prevents injection

**Behavior**:
- Template wrapped in `sh -c "..." --`
- Parameters passed via `$1`, `$2`, etc. (automatically quoted)
- Supports pipes, redirects, conditional execution
- `:raw` modifier available for expert use

**Example**:
```yaml
- name: analyze_logs
  shell: 'grep "ERROR" ${logfile} | tail -20 | sort | uniq -c'

# Expands to:
# command: [sh, -c, 'grep "ERROR" "$1" | tail -20 | sort | uniq -c', --]
# parameters:
#   - name: logfile, inject_as: argument
```

### stdin Parameter Declaration

**Syntax**: `stdin: param_name`

**Declares** which parameter should be piped to stdin:

```yaml
- name: write_content
  exec: "tee ${filename}"
  stdin: content

# Expands to:
# command: [tee]
# parameters:
#   - name: filename, inject_as: argument
#   - name: content, inject_as: stdin
```

### :raw Modifier (Expert Feature)

**Syntax**: `${param:raw}` (only allowed in `shell:` mode)

**Use when**: Need unquoted arguments (flags, multiple options)

**Example**:
```yaml
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"

# Usage by LLM:
# run_docker(flags="-p 8080:80 -d --name web", image="nginx")
# Executes: docker run -p 8080:80 -d --name web nginx
```

**⚠️ Security Warning**: `:raw` disables automatic quoting. Only use when necessary.

### Parameter Inference

Parameters are **automatically extracted** from `${param}` placeholders:

```yaml
# Input:
- name: move_file
  exec: "mv ${source} ${destination}"

# Automatically inferred:
parameters:
  - name: source
    type: string
    inject_as: argument
  - name: destination
    type: string
    inject_as: argument
```

### Mixed Syntax

Both syntaxes can coexist in the same `agent.yaml`:

```yaml
tools:
  # v1.7 simplified
  - name: read_file
    exec: "cat ${filename}"

  # Legacy explicit (for option injection)
  - name: curl_post
    command: [curl, -X, POST]
    parameters:
      - name: url
        inject_as: option
        option_name: --url
```

### Tool Expansion Command

Use `delta tool:expand` to see how v1.7 syntax expands:

```bash
delta tool:expand agent.yaml

# Output shows internal ToolDefinition format:
# exec: "ls -la ${directory}"
# ↓
# command: [ls, -la]
# parameters:
#   - name: directory
#     type: string
#     inject_as: argument
```

### When to Use Legacy Syntax

Use explicit `command:` array for:

1. **Option injection** (`inject_as: option` with `option_name`)
2. **Variable expansion** (`${AGENT_HOME}`, `${CWD}`)
3. **Complex bash scripting** (heredocs, multi-line scripts)

See [Legacy Syntax Reference](#legacy-tool-syntax-v10-v16) below for details.

---

## Complete Example (v1.9 Structure)

### agent.yaml

```yaml
# Required: Agent metadata
name: my-agent
version: 1.0.0
description: A comprehensive example agent (v1.9)

# Required: LLM configuration
llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000
  top_p: 0.9
  frequency_penalty: 0.0
  presence_penalty: 0.0

# v1.9: Import shared tool modules
imports:
  - modules/file-tools.yaml    # File operations
  - modules/shell-tools.yaml   # Shell utilities

# Local tool definitions (v1.7 simplified syntax)
tools:
  # exec: mode - Direct execution
  - name: list_files
    exec: "ls -la"

  - name: custom_script
    exec: "bash tools/custom.sh ${arg}"

  # shell: mode - With pipes
  - name: count_lines
    shell: "cat ${file} | wc -l"

  # Note: For option injection, use explicit syntax (see Legacy Syntax section below)

max_iterations: 30
```

### hooks.yaml (v1.9: Separate file)

```yaml
# v1.9: Lifecycle hooks in dedicated file
pre_llm_req:
  command: [./hooks/pre_request.sh]
  timeout_ms: 5000

post_llm_resp:
  command: [python3, hooks/log_response.py]

pre_tool_exec:
  command: [./hooks/validate_tool.sh]
  timeout_ms: 2000

post_tool_exec:
  command: [node, hooks/process_output.js]

on_error:
  command: [./hooks/handle_error.sh]

on_run_end:  # v1.9 NEW: Cleanup on run completion
  command: [./hooks/cleanup.sh]
```

### modules/file-tools.yaml

```yaml
# Reusable file operation tools
tools:
  - name: read_file
    exec: "cat ${filename}"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  - name: append_file
    exec: "tee -a ${filename}"
    stdin: content
```

**Note**: If `hooks.yaml` doesn't exist, you can still use `lifecycle_hooks` in `agent.yaml` (deprecated but supported).

## Root Fields

### `name` (required)
- **Type:** string
- **Description:** Agent identifier
- **Constraints:** Alphanumeric, hyphens, underscores
- **Example:** `my-agent`, `data_processor`, `web-scraper`

### `version` (required)
- **Type:** string
- **Description:** Agent version
- **Format:** Semantic versioning recommended
- **Example:** `1.0.0`, `2.1.3-beta`

### `description` (required)
- **Type:** string
- **Description:** Agent purpose and capabilities
- **Example:** `"An agent that processes CSV files and generates reports"`

### `imports` (optional, v1.9+)
- **Type:** array of strings
- **Description:** Paths to external tool definition files (relative to agent directory)
- **Format:** Must be relative paths within agent directory (no `../` or absolute paths)
- **Processing:** Recursive (imported modules can import other modules)
- **Merge Strategy:** Last Write Wins (later tools override earlier ones with same name)
- **Example:**
  ```yaml
  imports:
    - modules/file-tools.yaml
    - modules/web-tools.yaml
  ```
- **Security:** Circular imports are detected and rejected
- **See:** [imports Mechanism](#3-imports-mechanism-new) for details

## LLM Configuration

### `llm` (required)
Configuration for the language model.

#### `llm.model` (required)
- **Type:** string
- **Description:** Model identifier
- **Options:**
  - OpenAI: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
  - Custom: Any model supported by your API endpoint
- **Example:** `gpt-4`

#### `llm.temperature` (required)
- **Type:** number
- **Description:** Sampling temperature
- **Range:** 0.0 to 2.0
- **Default behavior:**
  - 0.0 = Deterministic
  - 0.7 = Balanced
  - 1.0+ = Creative
- **Example:** `0.7`

#### `llm.max_tokens` (optional)
- **Type:** number
- **Description:** Maximum tokens in response
- **Range:** 1 to model limit
- **Example:** `2000`

#### `llm.top_p` (optional)
- **Type:** number
- **Description:** Nucleus sampling parameter
- **Range:** 0.0 to 1.0
- **Example:** `0.9`

#### `llm.frequency_penalty` (optional)
- **Type:** number
- **Description:** Reduce repetition of token sequences
- **Range:** -2.0 to 2.0
- **Example:** `0.0`

#### `llm.presence_penalty` (optional)
- **Type:** number
- **Description:** Reduce repetition of topics
- **Range:** -2.0 to 2.0
- **Example:** `0.0`

## Tool Definitions

### `tools` (required)
Array of tool configurations.

#### Tool Object Structure

##### `name` (required)
- **Type:** string
- **Description:** Tool identifier used by LLM
- **Constraints:** Alphanumeric and underscores
- **Example:** `list_files`, `run_script`

##### `command` (required)
- **Type:** array of strings
- **Description:** Command and fixed arguments
- **Example:** `[ls, -la]`, `[python3, scripts/process.py]`

##### `parameters` (required)
- **Type:** array of parameter objects
- **Description:** Dynamic parameters from LLM
- **Can be empty:** `[]` for parameterless tools

## Parameter Configuration

### Parameter Object Structure

#### `name` (required)
- **Type:** string
- **Description:** Parameter identifier
- **Example:** `filename`, `search_query`

#### `type` (required)
- **Type:** string
- **Options:** `string`, `number`, `boolean`
- **Description:** Parameter data type
- **Example:** `string`

#### `description` (required)
- **Type:** string
- **Description:** Parameter purpose for LLM
- **Example:** `"Name of the file to process"`

#### `inject_as` (required)
- **Type:** string
- **Options:** `argument`, `stdin`, `option`
- **Description:** How to pass parameter to command

##### Injection Methods

**`argument`** - Pass as command argument
```yaml
- name: filename
  type: string
  inject_as: argument
# Result: command filename_value
```

**`stdin`** - Pass via standard input
```yaml
- name: content
  type: string
  inject_as: stdin
# Result: echo "content_value" | command
```

**`option`** - Pass as command option
```yaml
- name: pattern
  type: string
  inject_as: option
  option_flag: -e
# Result: command -e pattern_value
```

#### `option_flag` (required for `inject_as: option`)
- **Type:** string
- **Description:** Option flag to use
- **Example:** `-e`, `--file`, `-n`

#### `option_value_template` (optional)
- **Type:** string
- **Description:** Template for option value
- **Variables:** `${value}` for parameter value
- **Example:** `s/${value}//g`

## Lifecycle Hooks

### v1.9: hooks.yaml (Recommended)

In v1.9+, lifecycle hooks should be defined in a separate `hooks.yaml` file:

```yaml
# hooks.yaml - Dedicated file for lifecycle hooks
pre_llm_req:
  command: [./hooks/pre_request.sh]
  timeout_ms: 5000

post_tool_exec:
  command: [./hooks/audit.sh]

on_run_end:  # v1.9 NEW: Cleanup on run completion
  command: [./hooks/cleanup.sh]
```

**Benefits:**
- Cleaner separation of concerns
- Easier to manage complex hook configurations
- Optional: If `hooks.yaml` doesn't exist, agent runs without hooks

### `lifecycle_hooks` (deprecated, backward compatibility)

For backward compatibility, `lifecycle_hooks` in `agent.yaml` still works but is deprecated:

```yaml
# agent.yaml (v1.8 and earlier style)
lifecycle_hooks:
  pre_llm_req:
    command: [./hooks/pre_request.sh]
```

**⚠️ Deprecation Notice:** Use `hooks.yaml` instead. If both exist, `hooks.yaml` takes priority.

#### Hook Types

Each hook type accepts a hook configuration object:

##### Hook Configuration Object

###### `command` (required)
- **Type:** array of strings
- **Description:** Command to execute
- **Variables:** `${AGENT_HOME}` for agent directory
- **Example:** `[./hooks/my_hook.sh]`, `[python3, ${AGENT_HOME}/hooks/hook.py]`

###### `timeout_ms` (optional)
- **Type:** number
- **Description:** Execution timeout in milliseconds
- **Default:** 30000 (30 seconds)
- **Range:** 100 to 600000 (10 minutes)
- **Example:** `5000`

#### Available Hooks

##### `pre_llm_req`
- **When:** Before LLM request
- **Purpose:** Modify or validate requests
- **Input:** Proposed LLM payload
- **Output:** Final payload or original

##### `post_llm_resp`
- **When:** After LLM response
- **Purpose:** Process responses
- **Input:** LLM response
- **Output:** Control directives

##### `pre_tool_exec`
- **When:** Before tool execution
- **Purpose:** Validate or block tools
- **Input:** Tool name, args, command
- **Output:** Control directives (can skip)

##### `post_tool_exec`
- **When:** After tool execution
- **Purpose:** Process tool results
- **Input:** Tool output and exit code
- **Output:** Control directives

##### `on_error`
- **When:** On any error
- **Purpose:** Error handling
- **Input:** Error details
- **Output:** Control directives

##### `on_run_end` (v1.9+)
- **When:** After run completes (success, failure, or interruption)
- **Purpose:** Cleanup, finalization, reporting
- **Input:** Run status and metadata
- **Output:** None (cleanup only)
- **Example:**
  ```yaml
  on_run_end:
    command: [./hooks/cleanup.sh]
  ```

## Validation Rules

### Required Fields
- `name` must be present and non-empty
- `version` must be present and non-empty
- `description` must be present and non-empty
- `llm` section must be present
- `llm.model` must be specified
- `llm.temperature` must be between 0 and 2
- `tools` array must be present (can be empty)

### Tool Validation
- Each tool must have a unique `name` (after imports are merged)
- `command` array must not be empty
- First element of `command` must be executable
- Parameter names must be unique within a tool
- `inject_as` must be valid option
- `option_flag` required when `inject_as: option`

### Import Validation (v1.9+)
- Import paths must be relative (no absolute paths)
- Import paths must not contain `../` (no path traversal)
- Import paths must be within agent directory boundary
- Circular imports are detected and rejected
- Imported files must exist and be valid YAML
- Imported files must contain a `tools` array

### Type Validation
- String parameters accept any text
- Number parameters must be numeric
- Boolean parameters accept true/false

## Best Practices

### Tool Naming
```yaml
# Good: Descriptive, snake_case
tools:
  - name: list_files
  - name: create_directory
  - name: run_analysis

# Bad: Unclear, inconsistent
tools:
  - name: ls
  - name: mkDir
  - name: proc
```

### Parameter Descriptions
```yaml
# Good: Clear, specific
parameters:
  - name: filename
    description: Path to the CSV file to analyze

# Bad: Vague
parameters:
  - name: file
    description: The file
```

### Command Safety
```yaml
# Good: Controlled, specific
command: [grep, -E]

# Bad: Shell injection risk
command: [sh, -c]
```

### Hook Paths
```yaml
# Good: Relative to agent or absolute
lifecycle_hooks:
  pre_llm_req:
    command: [${AGENT_HOME}/hooks/validate.sh]

# Bad: Assumes PATH
lifecycle_hooks:
  pre_llm_req:
    command: [validate.sh]
```

## Common Patterns (v1.7 Syntax)

### File Operations
```yaml
tools:
  # Basic file operations
  - name: read_file
    exec: "cat ${path}"

  - name: write_file
    exec: "tee ${path}"
    stdin: content

  - name: append_file
    exec: "tee -a ${path}"
    stdin: content

  # Directory operations
  - name: list_directory
    exec: "ls -la ${directory}"

  - name: create_directory
    exec: "mkdir -p ${path}"

  - name: remove_file
    exec: "rm ${path}"
```

### Script Execution
```yaml
tools:
  - name: run_python
    exec: "python3 ${script} ${args}"

  - name: run_inline_python
    exec: "python3 -c ${code}"

  - name: run_bash_script
    exec: "bash ${script_path} ${arg1} ${arg2}"
```

### Search Operations
```yaml
tools:
  # File search (legacy syntax needed for option injection)
  - name: search_files
    command: [find]
    parameters:
      - name: directory
        inject_as: argument
      - name: pattern
        inject_as: option
        option_name: -name

  # Content search with shell: mode
  - name: search_content
    shell: 'grep -rn "${pattern}" ${directory} || echo "No matches"'

  # Complex pipeline
  - name: find_recent_errors
    shell: 'find ${directory} -name "*.log" -mtime -1 -exec grep "ERROR" {} \\; | head -50'
```

### Docker Integration
```yaml
tools:
  # Simple execution
  - name: docker_run
    exec: "docker run --rm ${image} ${command}"

  # With flags (use shell: + :raw)
  - name: docker_run_advanced
    shell: "docker run ${flags:raw} ${image}"

  # Compose operations
  - name: docker_compose_up
    exec: "docker-compose -f ${compose_file} up -d"
```

### API Testing
```yaml
tools:
  # GET request
  - name: curl_get
    exec: "curl -s ${url}"

  # POST with data (legacy syntax for option injection)
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
```

## Troubleshooting

### Schema Validation Errors

#### Missing Required Field
```
Error: Configuration validation failed:
  - name: Required
```
**Solution:** Add missing `name` field

#### Invalid Type
```
Error: Configuration validation failed:
  - llm.temperature: Expected number, received string
```
**Solution:** Remove quotes from number values

#### Invalid Enum Value
```
Error: Configuration validation failed:
  - tools.0.parameters.0.inject_as: Invalid enum value
```
**Solution:** Use one of: `argument`, `stdin`, `option`

### Tool Execution Errors

#### Command Not Found
```
Error: Command not found: my_script.sh
```
**Solution:** Use absolute path or ensure in PATH

#### Parameter Injection Failed
```
Error: Failed to inject parameter: filename
```
**Solution:** Check `inject_as` configuration

## Legacy Tool Syntax (v1.0-v1.6)

The explicit `command:` array syntax remains fully supported and is required for certain features.

### Full Syntax Reference

```yaml
tools:
  - name: tool_name
    command: [executable, fixed_arg1, fixed_arg2]
    parameters:
      - name: param_name
        type: string  # or number, boolean
        description: "Parameter description"
        inject_as: argument  # or stdin, option
        # For inject_as: option:
        option_name: --flag  # e.g., --url, -d, -H
        option_value_template: "template"  # Optional
```

### When Legacy Syntax is Required

#### 1. Option Injection
```yaml
# cURL with named options
- name: curl_post
  command: [curl, -X, POST]
  parameters:
    - name: url
      inject_as: option
      option_name: --url
    - name: data
      inject_as: option
      option_name: -d
```

#### 2. Variable Expansion
```yaml
# Access agent/workspace directories
- name: run_agent_tool
  command: [python3, "${AGENT_HOME}/tools/helper.py"]
  parameters:
    - name: task
      inject_as: argument

- name: read_workspace_config
  command: [cat, "${CWD}/.config.json"]
  parameters: []
```

#### 3. Complex Options
```yaml
- name: sed_replace
  command: [sed]
  parameters:
    - name: pattern
      inject_as: option
      option_name: -e
      option_value_template: "s/${value}//g"
```

### Migration from Legacy to v1.7

```yaml
# Before (v1.0-v1.6):
- name: list_files
  command: [ls, -la]
  parameters:
    - name: directory
      type: string
      inject_as: argument

# After (v1.7):
- name: list_files
  exec: "ls -la ${directory}"

---

# Before:
- name: count_words
  command: [sh, -c, "wc -w \"$1\"", --]
  parameters:
    - name: file
      inject_as: argument

# After:
- name: count_words
  shell: "wc -w ${file}"

---

# Before:
- name: write_file
  command: [tee]
  parameters:
    - name: filename
      inject_as: argument
    - name: content
      inject_as: stdin

# After:
- name: write_file
  exec: "tee ${filename}"
  stdin: content
```

## Migration Guide

### v1.0 → v1.7

**Step 1**: Identify migration candidates
- Simple commands without option injection → Use `exec:`
- Commands with pipes/redirects → Use `shell:`
- Commands with option injection → Keep legacy

**Step 2**: Convert syntax
```bash
# Use tool:expand to verify conversion
delta tool:expand config.yaml
```

**Step 3**: Test thoroughly
```bash
# Test converted tools
delta run -m "Test all tools"
```

### Backward Compatibility

- v1.0-v1.6 configs work unchanged
- Both syntaxes can coexist
- No breaking changes

### Migration from v1.8 to v1.9

v1.9 introduces the unified agent structure. Here's how to migrate:

#### Step 1: Rename config.yaml to agent.yaml

```bash
cd my-agent
mv config.yaml agent.yaml
```

**What changes:**
- File name only - content remains identical
- All existing `config.yaml` features work in `agent.yaml`

#### Step 2: Separate lifecycle_hooks to hooks.yaml (optional)

If you have `lifecycle_hooks` in `agent.yaml`, you can optionally move them to a dedicated file:

**Before (agent.yaml):**
```yaml
name: my-agent
# ... other config ...

lifecycle_hooks:
  pre_llm_req:
    command: [./hooks/pre_request.sh]
  post_tool_exec:
    command: [./hooks/audit.sh]
```

**After:**

`agent.yaml`:
```yaml
name: my-agent
# ... other config ...
# Remove lifecycle_hooks section
```

`hooks.yaml` (NEW):
```yaml
pre_llm_req:
  command: [./hooks/pre_request.sh]
post_tool_exec:
  command: [./hooks/audit.sh]
on_run_end:  # v1.9 NEW: Take advantage of new hook
  command: [./hooks/cleanup.sh]
```

**Benefits:**
- Cleaner separation of concerns
- Easier to manage complex hook configurations
- Can add new `on_run_end` hook for cleanup

**Note:** This step is optional. If you keep `lifecycle_hooks` in `agent.yaml`, everything still works (with deprecation warning).

#### Step 3: Organize tools with imports (optional)

If you have many tools, consider extracting them into reusable modules:

**Before (agent.yaml with 20+ tools):**
```yaml
tools:
  - name: read_file
    exec: "cat ${filename}"
  - name: write_file
    exec: "tee ${filename}"
    stdin: content
  - name: search_web
    exec: "curl ${url}"
  # ... 17 more tools ...
```

**After:**

`agent.yaml`:
```yaml
imports:
  - modules/file-ops.yaml
  - modules/web-tools.yaml

tools:
  # Only agent-specific tools here
  - name: custom_tool
    exec: "bash tools/custom.sh ${arg}"
```

`modules/file-ops.yaml`:
```yaml
tools:
  - name: read_file
    exec: "cat ${filename}"
  - name: write_file
    exec: "tee ${filename}"
    stdin: content
```

`modules/web-tools.yaml`:
```yaml
tools:
  - name: search_web
    exec: "curl ${url}"
```

**Benefits:**
- Better organization for complex agents
- Tool reuse across multiple agents
- Easier to maintain and test individual modules

#### Step 4: Test the migrated agent

```bash
# Test run
delta run --agent ./my-agent -m "Test migration"

# Verify all tools still work
# Check .delta/journal.jsonl for any errors
```

#### Migration Checklist

- [ ] Rename `config.yaml` to `agent.yaml`
- [ ] (Optional) Move `lifecycle_hooks` to `hooks.yaml`
- [ ] (Optional) Organize tools into modules using `imports`
- [ ] Add `on_run_end` hook if you need cleanup functionality
- [ ] Test agent with a simple task
- [ ] Verify all tools work as expected
- [ ] Check for deprecation warnings in logs

#### Backward Compatibility

**You don't have to migrate immediately:**
- v1.9 fully supports `config.yaml` (with deprecation warning)
- `lifecycle_hooks` in main config still works
- No breaking changes - migrate at your own pace

**When to migrate:**
- When starting new agents (use v1.9 structure from the start)
- When refactoring existing agents
- When you need the new `on_run_end` hook
- When you want better organization through imports

## See Also

- [Agent Development Guide](../guides/agent-development.md)
- [Hooks Guide](../guides/hooks.md)
- [CLI Reference](./cli.md)