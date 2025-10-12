# Delta Engine

English | [简体中文](README.zh-CN.md)

**A minimalist AI Agent development platform - Build AI agents the Unix way**

Delta lets you create AI agents the simplest way possible: all capabilities are external commands, all interactions go through the file system, and all state can be resumed anytime.

---

## 5-Minute Quick Start

```bash
# 1. Install
npm install -g delta-engine

# 2. Create your first agent
delta init my-agent -t hello-world

# 3. Run it
delta run --agent ./my-agent --task "Create a greeting file"
```

**What just happened?**
- Agent read your task
- Used LLM to think about what to do
- Executed commands like `echo` and `ls` to complete the task
- Logged everything to `.delta/journal.jsonl`

**Try more:**
```bash
# Let the agent analyze data with Python
delta run --agent ./my-agent --task "Calculate the sum of squares from 1 to 100"

# Resume anytime after interruption (run after Ctrl+C)
delta run --agent ./my-agent --task "Same task"  # Auto-resume from checkpoint
```

---

## What Can You Build?

### 1. DevOps Automation
Let agents execute system commands, analyze logs, generate reports

**Example**: [hello-world](examples/1-basics/hello-world/) - Simple agent using basic Unix commands

### 2. Data Analysis & Processing
Iteratively explore data in Python REPL while agent maintains session state

**Example**: [python-repl](examples/2-core-features/python-repl/) - Persistent Python interactive environment

### 3. Code Review & Generation
Customize audit workflows with lifecycle hooks, generate complete review reports

**Example**: [code-reviewer](examples/3-advanced/code-reviewer/) - Code review tool with audit trail

### 4. Long-Running Research
Compress conversation history with memory folding to complete long tasks within token limits

**Example**: [research-agent](examples/3-advanced/research-agent/) - Research assistant with context compression

### 5. AI Orchestrating AI
Create meta-agents that can invoke other agents for complex multi-step workflows

**Example**: [delta-agent-generator](examples/3-advanced/delta-agent-generator/) - Agent that generates agents

---

## Why Choose Delta?

### Comparison with Traditional AI Agent Frameworks

| Feature | Delta Engine | Traditional Frameworks |
|---------|--------------|----------------------|
| **Capability Extension** | Write any shell script | Requires framework plugin code |
| **State Management** | Fully stateless, resumable | Memory-dependent, fails on interrupt |
| **Debugging** | Read `.delta/journal.jsonl` directly | Requires specialized debugging tools |
| **Learning Curve** | Command-line knowledge sufficient | Must learn framework APIs |
| **Tool Reuse** | All Unix tools work directly | Need to re-wrap existing tools |

### Core Advantages

1. **Ultimate Simplicity**: All agent capabilities are external commands (`ls`, `cat`, `python`, etc.) - no framework API to learn
2. **Complete Transparency**: All execution details logged in `.delta/` directory - inspect, analyze, trace anytime
3. **Perfect Resumability**: Resume from any interruption (Ctrl+C, power loss, crash)

### Ideal For You If...

- ✅ Comfortable with command-line tools, want to quickly build AI agents
- ✅ Need agents to execute long-running tasks that may be interrupted
- ✅ Require complete audit logs and execution records
- ✅ Want agents to invoke any existing command-line tools
- ✅ Need human-in-the-loop reviews during agent execution

---

## How Does It Work?

Delta is built on three core principles (Three Pillars):

### 1️⃣ Everything is a Command

All agent capabilities are implemented through external commands, with no built-in functions.

```yaml
# config.yaml - Define what your agent can do
tools:
  - name: list_files
    exec: "ls -la ${directory}"

  - name: analyze_data
    shell: "python analyze.py ${data_file} | tee report.txt"
```

Any command-line tool (`grep`, `awk`, `docker`, custom scripts) can directly become an agent capability.

### 2️⃣ Environment as Interface

Agents interact with the world through their working directory (CWD) - the file system is the universal interface.

```
my-agent/workspaces/W001/  ← Agent's working directory
├── input.txt              ← Input files
├── output.json            ← Agent-generated results
├── DELTA.md               ← Dynamic instructions for agent
└── .delta/                ← Control plane (logs, state)
    ├── journal.jsonl      ← Complete execution history
    └── metadata.json      ← Run status
```

All data is visible, modifiable, version-controllable - agent execution is completely transparent.

### 3️⃣ Composition Defines Intelligence

Complex agent behaviors emerge from composing simple, single-purpose agents - not from building monolithic systems.

```yaml
# Meta-agent that orchestrates other agents
tools:
  - name: research_agent
    exec: "delta run --agent ./research-agent --task ${task}"

  - name: writer_agent
    exec: "delta run --agent ./writer-agent --task ${task}"
```

Build sophisticated AI systems like LEGO blocks - each agent does one thing well, composition creates intelligence.

---

## Core Features

### 🔄 Checkpoint Resume
Resume seamlessly from any interruption (Ctrl+C, crash, shutdown):
```bash
delta run --agent ./my-agent --task "Long-running task"
# Execution interrupted...
delta run --agent ./my-agent --task "Long-running task"  # Auto-continue
```

### 👥 Human-in-the-Loop
Agent can ask you questions mid-execution and wait for your reply:
```bash
delta run -i --agent ./my-agent --task "Task requiring confirmation"
# Agent: "Delete these files? [yes/no]"
# You type answer, agent continues
```

### 🖥️ Persistent Sessions
Create persistent Shell/REPL environments with `delta-sessions`:
```bash
delta-sessions start bash           # Create bash session
echo "cd /data && ls" | delta-sessions exec <session_id>
# Working directory persists at /data
```

### 🧠 Memory Folding
Compress conversation history with external scripts for long-term tasks:
```yaml
# context.yaml - Define context composition strategy
sources:
  - type: computed_file
    generator:
      command: ["python", "tools/summarize.py"]  # Compress history
    output_path: ".delta/context_artifacts/summary.md"

  - type: journal
    max_iterations: 5  # Keep only last 5 full conversation rounds
```

### 🔌 Lifecycle Hooks
Inject custom logic at critical moments:
```yaml
hooks:
  pre_llm_req:
    command: ["./check-budget.sh"]  # Check budget before each LLM call
  post_tool_exec:
    command: ["./log-to-audit.sh"]  # Log to audit after each tool execution
```

---

## Learning Path

### 🎯 Beginner (5-15 minutes)
1. **[Quick Start](docs/QUICKSTART.md)** - 5-minute tutorial to create your first agent
2. **[hello-world example](examples/1-basics/hello-world/)** - Understand Delta's three pillars

### 📚 Intermediate (30-60 minutes)
3. **[Agent Development Guide](docs/guides/agent-development.md)** - Complete agent development guide
4. **[interactive-shell example](examples/2-core-features/interactive-shell/)** - Learn session management
5. **[memory-folding example](examples/2-core-features/memory-folding/)** - Learn context management

### 🚀 Advanced (1-2 hours)
6. **[code-reviewer example](examples/3-advanced/code-reviewer/)** - Learn lifecycle hooks
7. **[Architecture Overview](docs/architecture/README.md)** - Understand system design principles
8. **[delta-agent-generator example](examples/3-advanced/delta-agent-generator/)** - Advanced AI-orchestrating-AI patterns

### 📖 Complete Documentation
- **[All Examples](examples/README.md)** - 8 examples from beginner to advanced
- **[API Reference](docs/api/)** - Complete CLI commands and configuration format docs
- **[Architecture Docs](docs/architecture/)** - Design philosophy and technical details

---

## Quick Reference

### Common Commands

```bash
# Initialize
delta init <agent-name> -t <template>  # Create from template
delta init <agent-name>                # Blank agent

# Run
delta run --agent <path> --task "Task description"    # Basic run
delta run -i --agent <path> --task "..."              # Interactive mode
delta run -y --agent <path> --task "..."              # Silent mode (auto-create workspace)

# Version info
delta --version

# Session management
delta-sessions start [shell]         # Create session (default: bash)
delta-sessions exec <session_id>     # Execute command (read from stdin)
delta-sessions end <session_id>      # Terminate session
delta-sessions list                  # List all sessions
```

### Debug and Inspection

```bash
# View run status
RUN_ID=$(cat .delta/LATEST)
cat .delta/$RUN_ID/metadata.json

# View execution history
tail -50 .delta/$RUN_ID/journal.jsonl

# View LLM invocation logs
ls -lht .delta/$RUN_ID/io/invocations/ | head -5

# View tool execution logs
ls -lht .delta/$RUN_ID/io/tool_executions/ | head -5

# Check pending human interactions
ls -la .delta/interaction/
```

### Agent Directory Structure

```
my-agent/
├── config.yaml              # Required: Agent config (LLM, tools, hooks)
├── system_prompt.md         # Required: System prompt (can be .txt)
├── context.yaml             # Optional: Context composition strategy
├── tools/                   # Optional: Custom tool scripts
│   ├── analyze.py
│   └── summarize.sh
└── workspaces/              # Runtime generated: Execution workspaces
    ├── LAST_USED            # Tracks last used workspace
    ├── W001/                # Workspace 1 (sequential numbering)
    │   ├── DELTA.md         # Optional: Workspace-level context
    │   ├── [your files]     # Files agent operates on
    │   └── .delta/          # Control plane
    │       ├── VERSION      # Data format version
    │       ├── LATEST       # Latest run ID
    │       └── <run_id>/    # Single run records
    │           ├── journal.jsonl        # Execution log (core)
    │           ├── metadata.json        # Run metadata
    │           ├── engine.log           # Engine logs
    │           └── io/                  # I/O audit
    │               ├── invocations/     # LLM invocations
    │               ├── tool_executions/ # Tool executions
    │               └── hooks/           # Hook executions
    └── W002/                # Workspace 2
```

### Tool Configuration Syntax Cheatsheet

```yaml
# Method 1: exec - Direct execution (recommended, safest)
- name: list_files
  exec: "ls -F ${directory}"

# Method 2: shell - Shell interpretation (for pipes, redirects)
- name: count_lines
  shell: "cat ${file} | wc -l"

# Using stdin parameter
- name: write_file
  exec: "tee ${filename}"
  stdin: content  # content parameter injected via stdin

# :raw modifier (for passing flag lists)
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
  # LLM passes: flags="-p 8080:80 -d"
  # Actual execution: docker run -p 8080:80 -d nginx

# Full syntax (complex scenarios)
- name: search
  command: [grep, -r]
  parameters:
    - name: pattern
      type: string
      inject_as: argument
    - name: directory
      type: string
      inject_as: argument
```

See: [Configuration Reference](docs/api/config.md)

---

## Requirements

- **Node.js** 20+
- **TypeScript** 5+ (development only)
- **OS**: Linux / macOS / WSL

---

## Project Info

- **Current Version**: v1.7
- **License**: MIT
- **Repository**: [GitHub](https://github.com/agent-works/delta-engine)
- **Issue Tracker**: [Issues](https://github.com/agent-works/delta-engine/issues)
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)

---

## Community & Support

- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)
- **Discussions**: [GitHub Discussions](https://github.com/agent-works/delta-engine/discussions)
- **Blog**: See `docs/architecture/philosophy-02-whitepaper.md` for design philosophy

