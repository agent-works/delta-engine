# Configuration Reference

## Overview

Agent configuration is defined in `config.yaml` using YAML format. This document describes all available configuration options.

## Complete Example

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

# Required: Tool definitions
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

## Common Patterns

### File Operations
```yaml
tools:
  - name: read_file
    command: [cat]
    parameters:
      - name: path
        type: string
        description: File path to read
        inject_as: argument

  - name: write_file
    command: [tee]
    parameters:
      - name: path
        type: string
        description: File path to write
        inject_as: argument
      - name: content
        type: string
        description: Content to write
        inject_as: stdin

  - name: append_file
    command: [tee, -a]
    parameters:
      - name: path
        type: string
        description: File to append to
        inject_as: argument
      - name: content
        type: string
        description: Content to append
        inject_as: stdin
```

### Script Execution
```yaml
tools:
  - name: run_python
    command: [python3]
    parameters:
      - name: script
        type: string
        description: Python script path
        inject_as: argument
      - name: args
        type: string
        description: Script arguments
        inject_as: argument

  - name: run_inline_python
    command: [python3, -c]
    parameters:
      - name: code
        type: string
        description: Python code to execute
        inject_as: argument
```

### Search Operations
```yaml
tools:
  - name: search_files
    command: [find]
    parameters:
      - name: directory
        type: string
        description: Directory to search
        inject_as: argument
      - name: pattern
        type: string
        description: File name pattern
        inject_as: option
        option_flag: -name

  - name: search_content
    command: [grep]
    parameters:
      - name: pattern
        type: string
        description: Pattern to search
        inject_as: option
        option_flag: -e
      - name: file
        type: string
        description: File to search in
        inject_as: argument
```

### Docker Integration
```yaml
tools:
  - name: docker_run
    command: [docker, run, --rm]
    parameters:
      - name: image
        type: string
        description: Docker image name
        inject_as: argument
      - name: command
        type: string
        description: Command to run in container
        inject_as: argument
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

## Migration from v1.0

### Changes from v1.0
- Added `lifecycle_hooks` section
- Added `inject_as: option` with `option_flag`
- Added `option_value_template` for complex options
- Stricter validation with Zod schemas

### Backward Compatibility
- v1.0 configs without hooks still work
- Default `inject_as: argument` if not specified (deprecated)

## See Also

- [Agent Development Guide](../guides/agent-development.md)
- [Hooks Guide](../guides/hooks.md)
- [CLI Reference](./cli.md)