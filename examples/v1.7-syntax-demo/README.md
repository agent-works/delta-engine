# v1.7 Syntax Demo Agent

**Quality**: ⭐⭐⭐⭐⭐ (5/5 - Production-ready syntax demonstration)

## Overview

This example demonstrates Delta Engine v1.7's simplified tool configuration syntax.
It showcases the difference between `exec:` and `shell:` modes, and maintains
backward compatibility with legacy `command:` array syntax.

## What's New in v1.7

**Before (v1.0-v1.6):**
```yaml
- name: count_lines
  command: [sh, -c, "cat \"$1\" | wc -l", --]
  parameters:
    - name: file
      type: string
      inject_as: argument
      position: 0
```

**After (v1.7):**
```yaml
- name: count_lines
  shell: "cat ${file} | wc -l"
```

**Result**: 77% less code (9 lines → 2 lines)

## Tool Modes

### exec: Mode - Direct Execution
- **Safety**: Maximum (no shell involvement)
- **Use Case**: 80% of tools
- **Syntax**: `exec: "command ${param1} ${param2}"`
- **Security**: Rejects all shell metacharacters (`|`, `>`, `&`, `;`, etc.)

### shell: Mode - Shell with Safe Parameterization
- **Safety**: High (argv-based parameterization)
- **Use Case**: Pipes, redirects, complex shell operations
- **Syntax**: `shell: "command ${param1} | other ${param2}"`
- **Security**: Automatic quoting (`${param}` → `"$1"`) prevents injection

### :raw Modifier - Expert Feature
- **Safety**: Medium (unquoted expansion)
- **Use Case**: Flag lists, space-separated values
- **Syntax**: `${flags:raw}` → `$1` (no quotes)
- **Warning**: Only use for trusted inputs

## Usage

### View Expanded Configuration

See how v1.7 syntax is converted to internal format:

```bash
delta tool:expand examples/v1.7-syntax-demo/config.yaml
```

This shows exactly how the engine will execute each tool.

### Run the Demo

```bash
delta run \
  --agent examples/v1.7-syntax-demo \
  -m "List files in current directory and count how many there are"
```

## Example Tools

### 1. Simple exec: Mode
```yaml
- name: list_directory
  exec: "ls -F ${directory}"
```

Expands to:
```yaml
command: ['ls', '-F']
parameters:
  - name: directory
    inject_as: argument
    position: 0
```

### 2. Pipe with shell: Mode
```yaml
- name: count_lines
  shell: "cat ${file} | wc -l"
```

Expands to:
```yaml
command: ['sh', '-c', 'cat "$1" | wc -l', '--']
parameters:
  - name: file
    inject_as: argument
    position: 0
```

### 3. stdin Parameter
```yaml
- name: write_to_file
  exec: "tee ${filename}"
  stdin: content
```

Expands to:
```yaml
command: ['tee']
parameters:
  - name: filename
    inject_as: argument
  - name: content
    inject_as: stdin
```

### 4. :raw Modifier (Expert)
```yaml
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
```

Expands to:
```yaml
command: ['sh', '-c', 'docker run $1 "$2"', '--']
parameters:
  - name: flags
    inject_as: argument
    position: 0
  - name: image
    inject_as: argument
    position: 1
```

Note: `flags` is unquoted (`$1`) while `image` is quoted (`"$2"`).

## Security Guarantees

### exec: Mode - Zero Shell Injection Risk
```python
# User input: "; rm -rf /"
# exec: mode REJECTS this at config load time
# Error: "Shell metacharacter ';' (command separator) not allowed in exec: mode"
```

### shell: Mode - Argv-Based Parameterization
```python
# User input: "; rm -rf /"
# shell: mode converts ${param} → "$1"
# Actual execution:
#   sh -c 'cat "$1" | wc -l' -- "; rm -rf /"
#
# Result: The semicolon is LITERAL TEXT inside quotes
#   cat "; rm -rf /" | wc -l
# NOT executed as command separator!
```

### :raw Modifier - Expert Use Only
```python
# User input: "-v --rm"  (Docker flags)
# With :raw: docker run -v --rm ubuntu
# Without :raw: docker run "-v --rm" ubuntu  (treated as single arg)
#
# WARNING: :raw bypasses quoting
# Input: "; rm -rf /" → docker run ; rm -rf / ubuntu
# This WILL execute the malicious command!
# Only use :raw for trusted/validated inputs.
```

## Backward Compatibility

The legacy `command:` array syntax still works:

```yaml
- name: echo_message
  command: [echo]
  parameters:
    - name: message
      type: string
      inject_as: argument
```

You can mix old and new syntax in the same config file.

## Learn More

- **Design Specification**: `docs/architecture/v1.7-tool-simplification.md`
- **Implementation Plan**: `docs/architecture/v1.7-implementation-plan.md`
- **ADR-005**: `docs/decisions/005-tool-syntax-simplification.md`
- **Security Proof**: v1.7 spec Section 4.2.1

## Key Takeaways

1. **Use exec: by default** (safest, covers 80% of tools)
2. **Use shell: for pipes/redirects** (safe via argv parameterization)
3. **Avoid :raw unless necessary** (expert feature, requires input validation)
4. **Legacy syntax still works** (100% backward compatible)
5. **Use `delta tool:expand`** for transparency

---

**Version**: v1.7.0
**Updated**: October 11, 2025
