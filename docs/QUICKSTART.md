# Quick Start: 5 Minutes to Your First Agent

> **Goal**: Run Delta Engine in under 5 minutes and understand the core concepts.

## Prerequisites

- Node.js 18+ installed
- OpenAI API key (or compatible endpoint)

## Step 1: Install (30 seconds)

```bash
npm install -g delta-engine
```

## Step 2: Set API Key (15 seconds)

```bash
export DELTA_API_KEY="sk-..."
```

## 💡 v1.7 Simplified Tool Syntax

Delta Engine v1.7 introduces clean, intuitive tool configuration:

```yaml
# ✨ Simple and readable - just 2 lines!
- name: list_files
  exec: "ls -la ${directory}"
```

Parameters are automatically inferred from `${variable}` placeholders.

## Step 3: Try the Hello World Agent (2 minutes)

### Clone Examples
```bash
git clone https://github.com/agent-works/delta-engine.git
cd delta-engine/examples/1-basics/hello-world
```

### Examine the Agent Structure

```bash
ls -la
```

You'll see:
```
hello-world/
├── config.yaml          # Agent capabilities
├── system_prompt.md     # Agent instructions
└── tools/
    └── greet.sh         # A simple tool
```

**config.yaml** (tool definition):
```yaml
name: hello-world-agent
description: A minimal agent demonstrating the three pillars

tools:
  # Clean, intuitive v1.7 syntax
  - name: greet
    exec: "bash tools/greet.sh ${name}"
```

**system_prompt.md** (agent instructions):
```markdown
You are a friendly greeting agent.

When the user asks you to greet someone, use the `greet` tool.
```

### Run the Agent

```bash
delta run -m "Greet Alice"
```

**What happens**:
1. Engine loads `config.yaml` and `system_prompt.md`
2. LLM receives the task: "Greet Alice"
3. LLM decides to call `greet(name="Alice")`
4. Engine executes: `bash tools/greet.sh "Alice"`
5. Tool outputs: "Hello, Alice!"
6. LLM receives the result and responds

**Output**:
```
[Engine] Starting run: 20251010_143022_a1b2c3
[Thought] I'll use the greet tool to greet Alice.
[Action] greet(name="Alice")
[Result] Hello, Alice!
[Engine] Task completed successfully
```

### Inspect the Workspace

```bash
ls -la workspaces/W001/.delta/
```

You'll see:
```
.delta/
├── VERSION
├── LATEST               # Points to latest run
└── 20251010_143022_a1b2c3/
    ├── journal.jsonl    # Complete execution log
    ├── metadata.json    # Run status
    └── io/              # I/O audit trail
```

**View the journal**:
```bash
cat workspaces/W001/.delta/$(cat workspaces/W001/.delta/LATEST)/journal.jsonl | jq
```

This shows every thought, action, and observation—the **complete audit trail**.

## Step 4: Understand the Three Pillars (2 minutes)

### Pillar 1: Everything is a Command

Notice in `config.yaml`:
```yaml
# v1.7: Simple and readable
exec: "bash tools/greet.sh ${name}"
```

**Key Insight**: Delta Engine has no built-in functions. All capabilities are external commands.

**Try this**: Modify `tools/greet.sh`:
```bash
#!/bin/bash
echo "Hey there, $1! Welcome to Delta Engine!"
```

Run again:
```bash
delta run -m "Greet Bob"
```

The agent now uses your updated tool—no engine restart needed.

### Pillar 2: The Environment is the Interface

Notice the workspace structure:
```
workspaces/
└── W001/                # Your workspace (CWD)
    ├── (agent creates files here)
    └── .delta/          # Engine's audit log
```

**Key Insight**: The agent interacts with the world through the **Current Working Directory**. No complex APIs—just files.

**Try this**: Create a file for the agent to read:
```bash
echo "Remember to be polite!" > workspaces/W001/guidelines.txt
```

Update `system_prompt.md`:
```markdown
You are a friendly greeting agent.

Before greeting, read guidelines.txt for style guidance.
Use the greet tool to greet people.
```

Add a file-reading tool to `config.yaml`:
```yaml
tools:
  # ✨ v1.7: Simplified syntax
  - name: read_file
    exec: "cat ${filename}"

  - name: greet
    exec: "bash tools/greet.sh ${name}"
```

Run:
```bash
delta run -m "Greet Charlie"
```

The agent will read the guidelines first!

### Pillar 3: Composition Defines Intelligence

**Key Insight**: Complex intelligence emerges from **composing simple agents**, not from a bloated engine.

**Example**: One agent can call another agent as a tool:

```yaml
tools:
  # Shell mode for complex commands
  - name: run_sub_agent
    shell: "delta run --agent ${agent_path} -m ${task}"
```

This enables **multi-agent orchestration** with zero special code.

## What You Just Learned

✅ **Delta Engine agents are just directories** (config + prompt + tools)
✅ **Tools are external commands** (shell scripts, Python, anything)
✅ **Agents work through the file system** (read/write files in CWD)
✅ **Everything is auditable** (journal.jsonl records all events)
✅ **Agents can call other agents** (composition, not built-in features)

## Next Steps

### 📖 Learn More Concepts
- [Complete Philosophy](./architecture/philosophy-01-overview.md) - 5-minute philosophy overview
- [Getting Started Guide](./guides/getting-started.md) - Comprehensive tutorial

### 🛠️ Build Your Own Agent
- [Agent Development Guide](./guides/agent-development.md) - Step-by-step agent creation
- [Configuration Reference](./api/config.md) - Complete config.yaml syntax

### 🚀 Explore Advanced Examples
- [Interactive Shell Agent](../examples/2-core-features/interactive-shell/) - Persistent bash sessions
- [Memory Folding Agent](../examples/2-core-features/memory-folding/) - Context window management
- [Code Reviewer Agent](../examples/3-advanced/code-reviewer/) - Lifecycle hooks in action

### 🏗️ Understand the Architecture
- [Core Principles & Code](./architecture/philosophy-03-implementation.md) - How philosophy becomes code
- [Architecture Overview](./architecture/README.md) - System design deep dive

## Troubleshooting

### "Command not found: delta"
→ Install: `npm install -g delta-engine`

### "API key not found"
→ Export: `export DELTA_API_KEY="sk-..."`

### "Permission denied: tools/greet.sh"
→ Make executable: `chmod +x tools/greet.sh`

### Need Help?
- [Documentation Index](./README.md)
- [GitHub Issues](https://github.com/agent-works/delta-engine/issues)

---

**Congratulations!** You've just experienced the elegance of Delta Engine's three-pillar philosophy. Everything you need to know flows from these principles.

**Estimated Time**: 5 minutes
**Last Updated**: 2025-10-12 (v1.7 - Tool Syntax Simplification)
