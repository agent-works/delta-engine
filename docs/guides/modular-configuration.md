# Modular Configuration Guide

## Overview

Delta Engine v1.9 introduces the **imports mechanism**, allowing you to organize tool definitions into reusable modules. This guide shows you how to create modular, maintainable agent configurations.

## Why Modular Configuration?

### Problems with Monolithic Configuration

Before v1.9, all tools had to be defined in a single `config.yaml`:

```yaml
# config.yaml - 500 lines of tool definitions
tools:
  # File operations (50 tools)
  - name: read_file
    exec: "cat ${filename}"
  # ... 49 more file tools ...

  # Web operations (30 tools)
  - name: fetch_url
    exec: "curl ${url}"
  # ... 29 more web tools ...

  # Database operations (40 tools)
  - name: query_db
    exec: "psql -c ${query}"
  # ... 39 more database tools ...

  # Agent-specific tools (20 tools)
  # ...
```

**Problems:**
- 📦 **Hard to maintain** - 500+ lines in one file
- 🔄 **No reuse** - Copy-paste tools across agents
- 🤝 **Poor collaboration** - Merge conflicts on shared file
- 🧪 **Hard to test** - Can't test tool modules independently
- 📖 **Poor discoverability** - Hard to find specific tools

### Benefits of Modular Configuration

v1.9 solves these problems:

```yaml
# agent.yaml - Clean and focused (30 lines)
imports:
  - modules/file-ops.yaml      # 50 file tools
  - modules/web-tools.yaml     # 30 web tools
  - modules/db-tools.yaml      # 40 database tools

tools:
  # Only agent-specific tools here (20 tools)
  - name: custom_analysis
    exec: "python tools/analyze.py ${data}"
```

**Benefits:**
- ✅ **Maintainable** - Small, focused files (50-100 lines each)
- ✅ **Reusable** - Share tool modules across agents
- ✅ **Collaborative** - Team members work on different modules
- ✅ **Testable** - Test each module independently
- ✅ **Discoverable** - Clear module names indicate purpose

## Basic Usage

### Step 1: Create a Module

Create `modules/file-ops.yaml` with reusable file tools:

```yaml
# modules/file-ops.yaml
tools:
  - name: read_file
    exec: "cat ${filename}"

  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  - name: append_file
    exec: "tee -a ${filename}"
    stdin: content

  - name: list_directory
    exec: "ls -la ${directory}"

  - name: create_directory
    exec: "mkdir -p ${path}"

  - name: remove_file
    exec: "rm ${path}"
```

### Step 2: Import the Module

Reference it in your `agent.yaml`:

```yaml
# agent.yaml
name: my-agent
version: 1.0.0

llm:
  model: gpt-4
  temperature: 0.7

imports:
  - modules/file-ops.yaml    # Import file tools

tools:
  # Agent-specific tools
  - name: custom_tool
    exec: "bash tools/custom.sh ${arg}"
```

### Step 3: Run Your Agent

The agent now has all tools from both the module and local definitions:

```bash
delta run --agent ./my-agent -m "List files in /tmp and read README.md"

# Agent can use:
# - list_directory (from modules/file-ops.yaml)
# - read_file (from modules/file-ops.yaml)
# - custom_tool (from agent.yaml)
```

## Advanced Patterns

### Pattern 1: Multiple Modules

Organize tools by category:

```
my-agent/
├── agent.yaml
├── modules/
│   ├── file-ops.yaml         # File system operations
│   ├── web-tools.yaml        # HTTP/API tools
│   ├── db-tools.yaml         # Database operations
│   ├── text-processing.yaml  # Text manipulation
│   └── system-tools.yaml     # System commands
└── tools/
    └── custom.sh
```

```yaml
# agent.yaml
imports:
  - modules/file-ops.yaml
  - modules/web-tools.yaml
  - modules/db-tools.yaml
  - modules/text-processing.yaml
  - modules/system-tools.yaml

tools:
  - name: custom_workflow
    exec: "bash tools/custom.sh ${task}"
```

### Pattern 2: Nested Imports

Modules can import other modules:

```
my-agent/
├── agent.yaml
└── modules/
    ├── core.yaml           # Core utilities
    ├── advanced.yaml       # Imports core.yaml
    └── expert.yaml         # Imports advanced.yaml
```

```yaml
# modules/core.yaml
tools:
  - name: read_file
    exec: "cat ${filename}"
  - name: write_file
    exec: "tee ${filename}"
    stdin: content
```

```yaml
# modules/advanced.yaml
imports:
  - modules/core.yaml      # Inherit core tools

tools:
  - name: search_in_file
    shell: "grep ${pattern} ${filename}"
  - name: replace_in_file
    shell: "sed -i 's/${pattern}/${replacement}/g' ${filename}"
```

```yaml
# modules/expert.yaml
imports:
  - modules/advanced.yaml  # Inherit advanced + core tools

tools:
  - name: batch_process
    shell: "find ${directory} -name '*.txt' -exec sed -i 's/${pattern}/${replacement}/g' {} \\;"
```

```yaml
# agent.yaml
imports:
  - modules/expert.yaml    # Gets all tools from expert, advanced, and core

tools:
  - name: custom_analysis
    exec: "python tools/analyze.py ${data}"
```

**Result:** Agent has tools from expert.yaml, advanced.yaml, core.yaml, and agent.yaml (in that import order).

### Pattern 3: Last Write Wins Override

Later definitions override earlier ones with the same name:

```yaml
# modules/base-tools.yaml
tools:
  - name: log
    exec: "echo ${message}"  # Simple logging
```

```yaml
# agent.yaml
imports:
  - modules/base-tools.yaml

tools:
  - name: log
    exec: "echo '[CUSTOM]' ${message}"  # Override with custom prefix
```

**Result:** The `log` tool from `agent.yaml` overrides the one from `base-tools.yaml`.

**Use cases:**
- Customize imported tools for specific agents
- Override default implementations with optimized versions
- Add agent-specific behavior to common tools

### Pattern 4: Shared Module Library

Create a library of reusable modules across multiple agents:

```
my-project/
├── shared-modules/              # Shared across all agents
│   ├── file-ops.yaml
│   ├── web-tools.yaml
│   └── db-tools.yaml
├── agent-a/
│   ├── agent.yaml               # Imports ../shared-modules/file-ops.yaml
│   └── modules/
│       └── agent-a-specific.yaml
└── agent-b/
    ├── agent.yaml               # Imports ../shared-modules/web-tools.yaml
    └── modules/
        └── agent-b-specific.yaml
```

```yaml
# agent-a/agent.yaml
imports:
  - ../shared-modules/file-ops.yaml    # Shared library
  - modules/agent-a-specific.yaml      # Agent-specific
```

**⚠️ Security Note:** Import paths are validated to prevent path traversal. The `../` example above works because `shared-modules/` is still within the project boundary, but imports cannot escape the repository root.

## Module Design Best Practices

### 1. Single Responsibility

Each module should focus on one category of tools:

```yaml
# ✅ Good: modules/file-ops.yaml (focused)
tools:
  - name: read_file
  - name: write_file
  - name: list_directory

# ❌ Bad: modules/misc-tools.yaml (unfocused)
tools:
  - name: read_file
  - name: fetch_url
  - name: query_db
  - name: send_email
```

### 2. Clear Naming

Use descriptive module names that indicate purpose:

```
# ✅ Good naming
modules/
├── file-operations.yaml
├── http-api-tools.yaml
├── postgres-queries.yaml
└── text-processing.yaml

# ❌ Bad naming
modules/
├── tools1.yaml
├── utils.yaml
├── misc.yaml
└── other.yaml
```

### 3. Documentation

Add comments to modules explaining their purpose:

```yaml
# modules/web-tools.yaml
# HTTP/API tools for web scraping and API integration
# Dependencies: curl must be installed
# Usage: Import this module to enable web operations

tools:
  - name: fetch_url
    description: Fetch content from a URL
    exec: "curl -s ${url}"

  - name: post_json
    description: POST JSON data to an API endpoint
    shell: "curl -X POST -H 'Content-Type: application/json' -d ${data:raw} ${url}"
```

### 4. Consistent Naming Conventions

Use consistent tool naming across modules:

```yaml
# ✅ Good: Consistent verb_noun pattern
tools:
  - name: read_file
  - name: write_file
  - name: delete_file
  - name: list_directory
  - name: create_directory

# ❌ Bad: Inconsistent naming
tools:
  - name: file_read
  - name: write_to_file
  - name: rm_file
  - name: ls_dir
  - name: mkdir
```

### 5. Module Size

Keep modules focused and manageable:

```
# ✅ Good: Focused modules (10-30 tools each)
modules/
├── file-ops.yaml           # 15 tools
├── text-processing.yaml    # 12 tools
└── web-scraping.yaml       # 20 tools

# ❌ Bad: One giant module (100+ tools)
modules/
└── all-tools.yaml          # 150 tools
```

## Security Considerations

### Path Validation

Import paths are validated for security:

```yaml
# ✅ Allowed: Relative paths within agent directory
imports:
  - modules/file-ops.yaml
  - modules/nested/tools.yaml

# ❌ Rejected: Path traversal attempts
imports:
  - ../../../etc/passwd          # Error: Contains ../
  - /etc/shadow                   # Error: Absolute path

# ❌ Rejected: Outside agent boundary
imports:
  - ../../other-agent/tools.yaml  # Error: Outside agent directory
```

**Protection:**
- No `../` sequences allowed (prevents path traversal)
- No absolute paths (prevents arbitrary file access)
- Paths must resolve within agent directory boundary

### Circular Import Detection

Circular imports are detected and rejected:

```yaml
# agent.yaml
imports:
  - modules/a.yaml

# modules/a.yaml
imports:
  - modules/b.yaml

# modules/b.yaml
imports:
  - modules/a.yaml    # Error: Circular import (A → B → A)
```

**Error message:**
```
Error: Circular import detected: modules/a.yaml
Import chain: agent.yaml → modules/a.yaml → modules/b.yaml → modules/a.yaml
```

## Migration from Monolithic Configuration

### Step 1: Analyze Your Tools

Group tools by category:

```bash
# Count tools by prefix/category
grep "^  - name:" agent.yaml | cut -d: -f2 | sed 's/^ //' | sort

# Example output:
# file_read, file_write, file_delete, file_list
# db_query, db_insert, db_update
# web_fetch, web_post, web_scrape
```

### Step 2: Create Module Files

Extract each category into its own module:

```bash
mkdir -p modules

# Create modules (manually or with script)
# Extract file-related tools → modules/file-ops.yaml
# Extract db-related tools → modules/db-tools.yaml
# Extract web-related tools → modules/web-tools.yaml
```

### Step 3: Update agent.yaml

Add imports and remove extracted tools:

```yaml
# agent.yaml (before)
tools:
  - name: read_file
    # ... (150 lines of file tools)
  - name: query_db
    # ... (100 lines of DB tools)
  - name: fetch_url
    # ... (80 lines of web tools)
  - name: custom_tool
    # ... (20 lines of custom tools)

# agent.yaml (after)
imports:
  - modules/file-ops.yaml
  - modules/db-tools.yaml
  - modules/web-tools.yaml

tools:
  # Only custom tools remain
  - name: custom_tool
    exec: "bash tools/custom.sh ${arg}"
```

### Step 4: Verify

Test that all tools still work:

```bash
# Test run
delta run --agent . -m "Test all tool categories"

# Check logs for any missing tools
grep "Tool not found" .delta/$(cat .delta/LATEST)/engine.log
```

## Testing Modular Configurations

### Test Individual Modules

Create test agents for each module:

```
my-project/
├── modules/
│   └── file-ops.yaml
└── tests/
    └── test-file-ops/
        ├── agent.yaml              # Test agent
        └── test-cases.md           # Test scenarios
```

```yaml
# tests/test-file-ops/agent.yaml
name: test-file-ops
version: 1.0.0

llm:
  model: gpt-4
  temperature: 0

imports:
  - ../../modules/file-ops.yaml   # Module under test

tools: []  # No additional tools needed
```

Run tests:

```bash
cd tests/test-file-ops

# Test read_file
delta run -m "Read the file test-data/sample.txt"

# Test write_file
delta run -m "Write 'Hello World' to output.txt"

# Test list_directory
delta run -m "List all files in test-data/"
```

### Integration Testing

Test that modules work together:

```bash
# Test file + web tools
delta run --agent . -m "Fetch https://example.com and save to output.html"

# Test file + database tools
delta run --agent . -m "Query the database and save results to report.csv"
```

## Troubleshooting

### Import File Not Found

**Error:**
```
Error: Import file not found: modules/file-ops.yaml
```

**Solution:**
```bash
# Check file exists
ls -la modules/file-ops.yaml

# Check path is relative to agent.yaml location
# If agent.yaml is in /path/to/agent/
# Then modules/ should be at /path/to/agent/modules/
```

### Circular Import Error

**Error:**
```
Error: Circular import detected: modules/a.yaml
```

**Solution:**
- Review import chain in error message
- Break the circular dependency by restructuring modules
- Extract common tools into a base module

### Tool Name Conflicts

**Behavior:** Later tools silently override earlier ones (Last Write Wins)

**Debug:**
```bash
# Check which tools are loaded
delta run --agent . -m "List all available tools"

# If a tool behaves unexpectedly, check import order
# Later imports override earlier ones
```

**Solution:**
- Rename conflicting tools
- Document override intention with comments
- Use descriptive tool names to avoid conflicts

### Path Validation Errors

**Error:**
```
Error: Invalid import path: ../other-agent/tools.yaml
```

**Solution:**
- Use paths relative to agent.yaml
- Keep all modules within agent directory
- For shared modules, use imports within the project boundary

## Examples

### Example 1: Data Processing Agent

```
data-processor/
├── agent.yaml
├── modules/
│   ├── file-io.yaml          # Read/write CSV, JSON, XML
│   ├── data-cleaning.yaml    # Clean, filter, transform
│   ├── data-analysis.yaml    # Statistical analysis
│   └── data-export.yaml      # Export to various formats
└── tools/
    └── custom-analysis.py
```

```yaml
# agent.yaml
name: data-processor
version: 1.0.0

llm:
  model: gpt-4
  temperature: 0.3

imports:
  - modules/file-io.yaml
  - modules/data-cleaning.yaml
  - modules/data-analysis.yaml
  - modules/data-export.yaml

tools:
  - name: custom_analysis
    exec: "python3 tools/custom-analysis.py ${input_file}"
```

### Example 2: DevOps Automation Agent

```
devops-agent/
├── agent.yaml
├── modules/
│   ├── docker-ops.yaml       # Docker commands
│   ├── k8s-ops.yaml          # Kubernetes operations
│   ├── git-ops.yaml          # Git operations
│   ├── aws-ops.yaml          # AWS CLI commands
│   └── monitoring.yaml       # Metrics and alerts
└── tools/
    └── deploy.sh
```

```yaml
# agent.yaml
name: devops-agent
version: 1.0.0

llm:
  model: gpt-4
  temperature: 0.5

imports:
  - modules/docker-ops.yaml
  - modules/k8s-ops.yaml
  - modules/git-ops.yaml
  - modules/aws-ops.yaml
  - modules/monitoring.yaml

tools:
  - name: deploy_application
    exec: "bash tools/deploy.sh ${environment} ${version}"
```

### Example 3: Document Analysis Agent with Nested Imports

```
doc-analyzer/
├── agent.yaml
├── modules/
│   ├── base/
│   │   ├── file-ops.yaml
│   │   └── text-ops.yaml
│   ├── web-tools.yaml        # Imports base/file-ops.yaml
│   ├── text-analysis.yaml    # Imports base/text-ops.yaml
│   └── report-tools.yaml     # Imports text-analysis.yaml
└── tools/
    └── analyze.py
```

```yaml
# modules/web-tools.yaml
imports:
  - modules/base/file-ops.yaml

tools:
  - name: fetch_document
    exec: "curl -s ${url}"
  - name: download_file
    exec: "wget -O ${output} ${url}"
```

```yaml
# agent.yaml
name: doc-analyzer
version: 1.0.0

llm:
  model: gpt-4
  temperature: 0.7

imports:
  - modules/web-tools.yaml      # Includes base/file-ops.yaml
  - modules/text-analysis.yaml  # Includes base/text-ops.yaml
  - modules/report-tools.yaml   # Includes text-analysis.yaml

tools:
  - name: analyze_document
    exec: "python3 tools/analyze.py ${document_file}"
```

## See Also

- [Configuration Reference](../api/config.md) - Complete configuration syntax
- [Agent Development Guide](./agent-development.md) - Building agents from scratch
- [v1.9 Architecture](../architecture/v1.9-unified-agent-structure.md) - Design philosophy

---

**Version:** v1.9
**Last Updated:** 2025-10-13
