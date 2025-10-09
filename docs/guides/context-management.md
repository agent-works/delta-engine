# Context Management Guide

> **v1.6 Feature**: Learn how to manage LLM context windows with memory folding, dynamic content injection, and workspace-specific guidance.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Zero-Config Operation](#zero-config-operation)
- [Creating context.yaml](#creating-contextyaml)
- [Source Types](#source-types)
  - [file: Static Content](#file-static-content)
  - [computed_file: Dynamic Generation](#computed_file-dynamic-generation)
  - [journal: Recent Conversation](#journal-recent-conversation)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

---

## Overview

**Context composition** is the process of building the LLM's context window from multiple sources. In Delta Engine v1.6, this process is explicit, declarative, and completely customizable.

### Why Context Management Matters

Context window management is not an optimization—it's a **feasibility problem**. Without proper context management, agents hit hard limits:

```
Real-world scenarios:
- Code review: 3000 lines + 100 commits → Out of context by iteration 8
- Documentation: 50 API files → Agent loses track of structure
- Debugging: 10 log files → Enters "amnesia loops"
```

**v1.6 solves this** by enabling:
- **Memory folding**: Compress old journal entries into summaries
- **Knowledge injection**: Load workspace guides, documentation
- **Dynamic context**: Generate content on-the-fly (RAG, vector search)
- **Token efficiency**: Only include what's needed for the current task

### When to Use Context Composition

Use `context.yaml` when your agent needs:
- **Long-running tasks** (>10 iterations)
- **Large knowledge bases** (API docs, codebase context)
- **Multi-file operations** (refactoring, testing)
- **Workspace-specific guidance** (project conventions, task context)

For simple agents (≤5 iterations, basic file ops), the default context strategy is sufficient.

---

## Quick Start

### 1. Zero-Config Operation (Default)

Without `context.yaml`, Delta Engine uses a sensible default:

```typescript
// Automatic behavior:
1. Load system_prompt.md
2. Load DELTA.md from workspace (if exists) ← Auto-injected!
3. Include full journal history
```

**Try it now:**
```bash
# Create a workspace guide
echo "# Project Context\n\nThis is a TypeScript project." > DELTA.md

# Run any agent - DELTA.md is automatically loaded
delta run --agent examples/1-basics/hello-world --task "Tell me about this project"
```

The agent will see the DELTA.md content without any configuration!

### 2. Custom Context Strategy

Create `context.yaml` in your agent directory to customize:

```yaml
sources:
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"

  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
    output_path: "${CWD}/.delta/context_artifacts/summary.md"

  - type: journal
    id: recent_conversation
    max_iterations: 5  # Only last 5 turns
```

---

## Zero-Config Operation

### Default Behavior

When no `context.yaml` exists, Delta Engine uses this strategy:

```yaml
# Implicit default (hardcoded in src/context/types.ts)
sources:
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"
    on_missing: error  # Required

  - type: file
    id: workspace_guide
    path: "${CWD}/DELTA.md"
    on_missing: skip  # Optional

  # No journal source in default!
  # Engine falls back to rebuilding ALL conversation (v1.5 behavior)
```

**Important**: The default manifest does NOT include a `journal` source. When no `journal` source is present, the engine automatically rebuilds the **entire conversation** from journal.jsonl (v1.5 behavior). This ensures zero-config agents have full context without token limits.

### DELTA.md: Workspace-Level Context

`DELTA.md` is a special file that lives in the workspace root (not agent directory). Use it for:

- **Project-specific instructions**: "This is a React project using TypeScript"
- **Task context**: "We're migrating from v1 to v2 API"
- **Conventions**: "Use snake_case for file names"
- **Dynamic notes**: Agent can update DELTA.md during execution

**Example DELTA.md:**
```markdown
# Project Context

## Stack
- TypeScript 5.0
- Node.js 20+
- Jest for testing

## Current Task
Refactoring authentication module to use JWT tokens.

## Important Notes
- DO NOT modify database schema without migration script
- All API endpoints must have OpenAPI docs
```

The agent sees this content in every LLM call—providing persistent workspace memory.

---

## Creating context.yaml

### Basic Structure

Create `${AGENT_HOME}/context.yaml`:

```yaml
sources:
  - type: file
    # ... file source config

  - type: computed_file
    # ... computed source config

  - type: journal
    # ... journal source config
```

**Key concepts:**
- **sources**: Array of context sources (processed in order)
- **id**: Optional identifier for debugging
- **Path variables**: `${AGENT_HOME}`, `${CWD}` expand at runtime

### Minimal Example

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  - type: journal
```

This replaces the default and loads only system prompt + full journal (no DELTA.md).

---

## Source Types

### file: Static Content

Load static text files into context.

**Schema:**
```yaml
- type: file
  id: optional_identifier           # For debugging
  path: "${AGENT_HOME}/docs/api.md" # Absolute or with variables
  on_missing: error                 # 'error' or 'skip'
```

**Path Variables:**
- `${AGENT_HOME}`: Agent directory (where config.yaml lives)
- `${CWD}`: Current working directory (workspace root)

**Example: Load API Documentation**
```yaml
sources:
  - type: file
    id: api_docs
    path: "${AGENT_HOME}/knowledge/api-reference.md"
    on_missing: error

  - type: file
    id: examples
    path: "${AGENT_HOME}/knowledge/examples.md"
    on_missing: skip  # Won't fail if missing
```

**Use cases:**
- API documentation
- Code style guides
- Project-specific knowledge
- Templates and examples

---

### computed_file: Dynamic Generation

Execute an external command to generate context on-the-fly.

**Schema:**
```yaml
- type: computed_file
  id: optional_identifier
  generator:
    command: ["python3", "tools/generate.py"]  # Command to run
    timeout_ms: 30000                          # Max execution time
  output_path: "${CWD}/.delta/context_artifacts/output.md"
  on_missing: skip  # If generator fails or output not found
```

**How it works:**
1. Before each LLM call, Delta Engine executes the generator command
2. Generator receives environment variables:
   - `DELTA_RUN_ID`: Current run ID
   - `DELTA_AGENT_HOME`: Agent directory path
   - `DELTA_CWD`: Workspace directory path
3. Generator writes output to `output_path`
4. Delta Engine reads and injects the output into context

**Example: Memory Folding (Compression)**

Create `tools/summarize.py`:
```python
#!/usr/bin/env python3
import json, os
from pathlib import Path

run_id = os.environ['DELTA_RUN_ID']
cwd = os.environ['DELTA_CWD']

# Read journal
journal_path = Path(cwd) / '.delta' / run_id / 'journal.jsonl'
events = []
with open(journal_path, 'r') as f:
    for line in f:
        events.append(json.loads(line))

# Extract key facts
facts = []
for event in events:
    if event['type'] == 'ACTION_REQUEST':
        tool = event['payload']['tool_name']
        facts.append(f"- Used {tool}")

# Write summary
output_dir = Path(cwd) / '.delta' / 'context_artifacts'
output_dir.mkdir(parents=True, exist_ok=True)

summary = f"# Compressed Memory\n\n" + "\n".join(facts[-10:])
(output_dir / 'summary.md').write_text(summary)
```

Configure context.yaml:
```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
      timeout_ms: 10000
    output_path: "${CWD}/.delta/context_artifacts/summary.md"
    on_missing: skip

  - type: journal
    max_iterations: 5  # Only last 5 turns (older history is in summary)
```

**Use cases:**
- **Memory folding**: Compress old journal entries
- **RAG systems**: Vector search for relevant documents
- **Knowledge graphs**: Extract entities and relationships
- **Dynamic documentation**: Generate context based on current task
- **External APIs**: Fetch real-time data (weather, stock prices, etc.)

---

### journal: Recent Conversation

**The original conversation rebuilding logic from v1.5**, now configurable as a context source.

**Schema:**
```yaml
- type: journal
  id: optional_identifier
  max_iterations: 10  # Optional: limit to N most recent iterations
```

**Behavior:**
- Reads journal events: `THOUGHT`, `ACTION_RESULT`
- Reconstructs as native OpenAI messages (assistant/tool roles)
- If `max_iterations` is omitted, includes **all** conversation
- Unlike `file`/`computed_file`, returns message array (not system message text)

**When NOT to use**: If you omit `journal` source from `context.yaml`, the engine automatically falls back to full conversation rebuilding (v1.5 behavior). Only add `journal` source when you want to **limit** conversation to recent N iterations.

**Example: Token-Efficient Journal**
```yaml
sources:
  - type: journal
    id: recent_conversation
    max_iterations: 3  # Only last 3 iterations (save tokens)
```

**Iteration counting:**
- 1 iteration = 1 THOUGHT event + associated ACTION_RESULT events
- `max_iterations: 5` = Last 5 reasoning cycles (aligns with engine's `--max-iterations`)

**Use cases:**
- **Short tasks**: Omit journal source entirely (full conversation via engine fallback)
- **Long tasks + memory folding**: Use `journal` with `max_iterations` + `computed_file` summary
- **Token optimization**: Limit to recent iterations only

---

## Common Patterns

### Pattern 1: Memory Folding (Token Efficiency)

**Problem**: Long tasks exceed context window.

**Solution**: Compress old history, keep recent details.

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  # Compressed summary of ALL history
  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
    output_path: "${CWD}/.delta/context_artifacts/summary.md"
    on_missing: skip

  # Full details of last 5 turns only
  - type: journal
    max_iterations: 5
```

**Result**: Agent remembers 100 iterations but only uses tokens for recent 5 + summary.

See `examples/memory-folding/` for complete implementation.

---

### Pattern 2: RAG Integration (Knowledge Injection)

**Problem**: Agent needs access to large knowledge base.

**Solution**: Vector search for relevant documents.

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  # Retrieve relevant docs based on current task
  - type: computed_file
    id: relevant_docs
    generator:
      command: ["node", "${AGENT_HOME}/tools/rag-search.js"]
    output_path: "${CWD}/.delta/context_artifacts/docs.md"

  - type: journal
    max_iterations: 10
```

**Generator (rag-search.js):**
```javascript
// Read current task/journal, perform vector search
// Write top-K relevant documents to output_path
const task = process.env.DELTA_TASK;
const docs = await vectorSearch(task, k=5);
fs.writeFileSync(outputPath, docs.join('\n\n'));
```

---

### Pattern 3: Workspace Guide + Minimal History

**Problem**: Agent needs project context but tasks are short.

**Solution**: Static workspace guide + recent journal.

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  - type: file
    id: project_guide
    path: "${CWD}/DELTA.md"
    on_missing: skip

  - type: file
    id: api_reference
    path: "${AGENT_HOME}/docs/api.md"

  - type: journal
    max_iterations: 10
```

**Use case**: Code review agent that needs project conventions + API docs.

---

### Pattern 4: Multi-Stage Context (Task-Specific)

**Problem**: Different task phases need different context.

**Solution**: Generator selects content based on task phase.

```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  - type: computed_file
    id: task_context
    generator:
      # Reads journal, determines task phase, loads relevant docs
      command: ["python3", "${AGENT_HOME}/tools/adaptive-context.py"]
    output_path: "${CWD}/.delta/context_artifacts/context.md"

  - type: journal
    max_iterations: 5
```

**Generator logic:**
```python
# If task is "code review" → load review checklist
# If task is "testing" → load test templates
# If task is "documentation" → load doc examples
```

---

## Troubleshooting

### Generator Timeout

**Error**: `Generator command timed out after 30000ms`

**Solutions:**
1. Increase timeout:
   ```yaml
   generator:
     command: ["python3", "slow-script.py"]
     timeout_ms: 60000  # 1 minute
   ```

2. Optimize generator performance:
   - Cache results when possible
   - Use incremental processing
   - Limit data processing scope

---

### Path Variable Not Expanding

**Error**: `File not found: ${AGENT_HOME}/docs/api.md`

**Cause**: Path variables only work in context.yaml fields, not in generator scripts.

**Solution**: Use environment variables in generators:
```python
# In generator script:
agent_home = os.environ['DELTA_AGENT_HOME']
api_path = os.path.join(agent_home, 'docs', 'api.md')
```

---

### Generator Output Not Found

**Error**: `Failed to read computed file output: ENOENT`

**Debugging steps:**

1. Check generator errors:
   ```bash
   # Generator stderr is logged to engine.log
   tail -f .delta/{run_id}/engine.log
   ```

2. Test generator manually:
   ```bash
   export DELTA_RUN_ID="test"
   export DELTA_AGENT_HOME="/path/to/agent"
   export DELTA_CWD="/path/to/workspace"
   python3 tools/summarize.py
   ```

3. Verify output_path is writable:
   ```yaml
   output_path: "${CWD}/.delta/context_artifacts/summary.md"
   # Creates .delta/context_artifacts/ automatically
   ```

---

### Context Too Large

**Symptom**: LLM API returns "context length exceeded" error.

**Solutions:**

1. Reduce journal history:
   ```yaml
   - type: journal
     max_iterations: 3  # Instead of 10
   ```

2. Implement memory folding (see Pattern 1)

3. Trim static files:
   - Load only relevant sections
   - Use generator to extract key parts

4. Monitor context size:
   ```bash
   # Check invocation logs for token counts
   cat .delta/{run_id}/io/invocations/*.json | jq '.messages | length'
   ```

---

## Advanced Topics

### Context Source Ordering

Sources are processed **in order**. This affects how the LLM perceives information:

```yaml
sources:
  - type: file  # System prompt (highest priority)
  - type: computed_file  # Summary/knowledge (context)
  - type: journal  # Recent conversation (lowest priority)
```

**Best practice**: Put critical information first (system prompt), context second (summaries/docs), conversation last (journal).

---

### Debugging Context Composition

**View actual context sent to LLM:**

```bash
# Find latest invocation
RUN_ID=$(cat .delta/LATEST)
INVOCATION=$(ls -t .delta/$RUN_ID/io/invocations/*.json | head -1)

# View system messages (context blocks)
cat $INVOCATION | jq -r '.messages[] | select(.role == "system") | .content'
```

Each context source is wrapped with a header:
```markdown
# Context Block: system_prompt

[content here]

# Context Block: compressed_memory

[content here]
```

---

### Generator Error Handling

Generators can exit with non-zero codes to signal errors:

```python
import sys

try:
    # Generate content
    result = generate_summary()
    output_path.write_text(result)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)  # Non-zero exit = error
```

**With `on_missing: skip`**: Error is ignored, source is skipped
**With `on_missing: error`**: Error fails the entire run

---

### Environment Variables Available to Generators

```bash
DELTA_RUN_ID          # Current run ID (e.g., "20251008_123456_abc123")
DELTA_AGENT_HOME      # Agent directory path (absolute)
DELTA_CWD             # Workspace directory path (absolute)
```

**Access in scripts:**

Python:
```python
import os
run_id = os.environ['DELTA_RUN_ID']
```

Node.js:
```javascript
const runId = process.env.DELTA_RUN_ID;
```

Bash:
```bash
#!/bin/bash
echo "Run ID: $DELTA_RUN_ID"
```

---

### Token Budget Management (Future: v1.6.1)

**Planned feature**: Explicit token budgets per source.

```yaml
# Future syntax (not implemented yet)
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"
    token_budget: 500

  - type: computed_file
    id: summary
    generator: [...]
    output_path: [...]
    token_budget: 2000  # Max 2000 tokens

  - type: journal
    max_iterations: 5
    token_budget: 3000
```

**Current workaround**: Control token usage by limiting content size in generators.

---

### Context Caching

Generators run before **every** LLM call. For expensive operations (vector search, API calls), implement caching:

```python
import hashlib
from pathlib import Path

# Cache based on run_id + task hash
cache_key = hashlib.md5(task.encode()).hexdigest()
cache_file = Path(f'/tmp/delta-cache-{cache_key}.md')

if cache_file.exists():
    output_path.write_text(cache_file.read_text())
else:
    result = expensive_operation()
    cache_file.write_text(result)
    output_path.write_text(result)
```

---

## Best Practices

### 1. Start Simple, Add Complexity as Needed

Begin with default context, add `context.yaml` only when you hit limits:
- Task >10 iterations? → Add memory folding
- Need project docs? → Add file sources
- Token limits? → Add computed_file compression

### 2. Test Generators Independently

Always test generators manually before using in context.yaml:
```bash
export DELTA_RUN_ID="test"
export DELTA_AGENT_HOME="."
export DELTA_CWD="."
python3 tools/summarize.py
cat .delta/context_artifacts/summary.md
```

### 3. Monitor Context Size

Check invocation logs to see actual token usage:
```bash
# View message count and sizes
cat .delta/{run_id}/io/invocations/*.json | \
  jq '{messages: (.messages | length), total_chars: (.messages | map(.content | length) | add)}'
```

### 4. Use Descriptive IDs

ID fields help with debugging:
```yaml
sources:
  - type: file
    id: api_reference  # Clear what this is
    path: "${AGENT_HOME}/docs/api.md"

  - type: computed_file
    id: compressed_memory_last_50_turns  # Describes content
    # ...
```

### 5. Graceful Degradation

Use `on_missing: skip` for optional content:
```yaml
- type: file
  id: project_readme
  path: "${CWD}/README.md"
  on_missing: skip  # Won't fail if README doesn't exist
```

---

## Next Steps

- **Architecture details**: See [v1.6 design doc](../architecture/v1.6-context-composition.md)
- **Complete example**: Explore `examples/memory-folding/`
- **Agent development**: Read [agent development guide](./agent-development.md)
- **API reference**: Check [delta CLI docs](../api/delta.md)

---

**Questions or issues?** File an issue at [Delta Engine repository](https://github.com/your-org/delta-engine/issues).
