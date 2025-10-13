# Configuration Reference

## Overview

Agent configuration is defined in `config.yaml` using YAML format. This document describes all available configuration options.

**✨ v1.7 Update**: Delta Engine now supports simplified tool syntax that reduces verbosity by 77%. See [v1.7 Simplified Syntax](#v17-simplified-syntax) below.

## v1.7 Simplified Syntax

Delta Engine v1.7 introduces `exec:` and `shell:` modes as syntax sugar over the explicit `command:` array format.

### Quick Start

```yaml
# ✨ v1.7: Simplified (Recommended)
tools:
  - name: list_files
    exec: "ls -la ${directory}"

  - name: count_lines
    shell: "cat ${file} | wc -l"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content

# 📦 Legacy (v1.0-v1.6): Still fully supported
tools:
  - name: list_files
    command: [ls, -la]
    parameters:
      - name: directory
        type: string
        inject_as: argument
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

Both syntaxes can coexist in the same `config.yaml`:

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
delta tool:expand config.yaml

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

## Complete Example (v1.7 Syntax)

```yaml
# Required: Agent metadata
name: my-agent
version: 1.0.0
description: A comprehensive example agent

# Required: LLM configuration
llm:
  model: gpt-4
  temperature: 0.7
  max_tokens: 2000
  top_p: 0.9
  frequency_penalty: 0.0
  presence_penalty: 0.0

# Required: Tool definitions (v1.7 simplified syntax)
tools:
  # exec: mode - Direct execution
  - name: list_files
    exec: "ls -la"

  - name: read_file
    exec: "cat ${filename}"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  # shell: mode - With pipes
  - name: count_lines
    shell: "cat ${file} | wc -l"

  # Legacy syntax (for option injection)
  - name: grep_pattern
    command: [grep]
    parameters:
      - name: pattern
        type: string
        inject_as: option
        option_name: -e
      - name: file
        type: string
        inject_as: argument

# Optional: Lifecycle hooks
lifecycle_hooks:
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
```

<details>
<summary>📦 Click to see v1.0-v1.6 legacy format</summary>

```yaml
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

  - name: write_file
    command: [tee]
    parameters:
      - name: filename
        type: string
        description: File to write
        inject_as: argument
      - name: content
        type: string
        description: Content to write
        inject_as: stdin
```
</details>

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

### `lifecycle_hooks` (optional)
Hook configurations for extending behavior.

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
- Each tool must have a unique `name`
- `command` array must not be empty
- First element of `command` must be executable
- Parameter names must be unique within a tool
- `inject_as` must be valid option
- `option_flag` required when `inject_as: option`

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

## See Also

- [Agent Development Guide](../guides/agent-development.md)
- [Hooks Guide](../guides/hooks.md)
- [CLI Reference](./cli.md)