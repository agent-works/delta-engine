# Delta Engine Documentation

> **Delta Engine**: A minimalist AI agent platform following Unix philosophy. Build intelligent systems through composition, not complexity.

---

## 🧭 Core Philosophy - Start Here

Delta Engine is not just another AI framework—it's a **paradigm shift** in how we think about AI systems.

### 10-Minute Introduction
1. **[Design Philosophy Summary](./PHILOSOPHY_SUMMARY.md)** ⚡ (5 min)
   - Understand the three pillars
   - See why Delta Engine is different
   - Learn the intentional trade-offs

2. **[Quick Start Tutorial](./QUICKSTART.md)** ⚡ (5 min)
   - Install and run your first agent
   - Experience the three pillars hands-on
   - Build intuition through examples

### Deep Dive
- **[Complete Whitepaper](./architecture/PHILOSOPHY.md)** 📖 (30 min)
  - 5-chapter manifesto
  - Strategic positioning and market analysis
  - Evolution roadmap and design principles

- **[Core Principles & Code Mapping](./architecture/core-principles.md)** 💻 (20 min)
  - How philosophy translates to implementation
  - Code locations for each principle
  - Anti-patterns and guardrails

---

## 🚀 Quick Navigation by Goal

### I Want to Get Started
→ **[Quick Start (5 min)](./QUICKSTART.md)** → **[Getting Started Guide](./guides/getting-started.md)**

### I Want to Build an Agent
→ **[Agent Development Guide](./guides/agent-development.md)** → **[Config Reference](./api/config.md)**

### I Want to Understand the Design
→ **[Philosophy Summary](./PHILOSOPHY_SUMMARY.md)** → **[Architecture Docs](./architecture/)**

### I Need to Upgrade Versions
→ **[Migration Guides](./migration/)**

### I'm Exploring Advanced Features
→ **[Sessions Guide](./guides/session-management.md)** | **[Context Management](./guides/context-management.md)** | **[Hooks](./guides/hooks.md)**

---

## 📚 Documentation Map

### 📖 By Document Type

| Category | Purpose | Typical Reader |
|----------|---------|----------------|
| **[Architecture](./architecture/)** | Design decisions, WHY & WHAT | Architects, Contributors |
| **[Guides](./guides/)** | How-to tutorials, best practices | Developers, Users |
| **[API Reference](./api/)** | CLI and config syntax | Daily users, IDE reference |
| **[Migration](./migration/)** | Version upgrade paths | Maintainers, Upgraders |
| **[Research](./research/)** | Experimental designs | Researchers, Early adopters |
| **[Archive](./archive/)** | Historical documents | Context seekers |

### 🗂️ By Feature Area

#### Core Concepts
- [Three Pillars Explained](./architecture/core-principles.md)
- [Stateless Core Architecture](./architecture/v1.1-design.md)
- [Control Plane vs Data Plane](./architecture/v1.1-design.md#control-plane-structure)

#### Agent Development
- [Agent Development Guide](./guides/agent-development.md) - Complete walkthrough
- [Configuration Reference](./api/config.md) - `config.yaml` syntax
- [Tool Parameter Injection](./architecture/core-principles.md#11-tool-definition-configyaml) - `argument`, `stdin`, `option` modes

#### Advanced Features
- [Session Management](./guides/session-management.md) - Persistent bash/Python sessions (v1.5)
- [Context Composition](./guides/context-management.md) - Memory folding, dynamic context (v1.6)
- [Lifecycle Hooks](./guides/hooks.md) - Extend engine without core changes
- [Human-in-the-Loop](./architecture/v1.2-human-interaction.md) - Interactive & async modes

#### CLI & API
- [delta CLI Reference](./api/cli.md) - `delta run`, `delta init`, flags
- [delta-sessions CLI](./api/delta-sessions.md) - `start`, `exec`, `end` (v1.5)

---

## 🎓 Learning Paths

### Path 1: New User (2 hours)
```
1. Philosophy Summary (5 min)
   ↓
2. Quick Start (5 min)
   ↓
3. Getting Started Guide (30 min)
   ↓
4. Try examples/1-basics/hello-world (15 min)
   ↓
5. Agent Development Guide (45 min)
   ↓
6. Build your first custom agent (20 min)
```

### Path 2: Experienced Developer (1 hour)
```
1. Philosophy Summary (5 min)
   ↓
2. Core Principles & Code (20 min)
   ↓
3. Architecture v1.1 Design (15 min)
   ↓
4. Try examples/2-core-features/* (20 min)
```

### Path 3: Contributor (3 hours)
```
1. Complete Whitepaper (30 min)
   ↓
2. Core Principles & Code Mapping (20 min)
   ↓
3. All Architecture Docs (60 min)
   ↓
4. Read src/ codebase (60 min)
   ↓
5. Explore tests/ (30 min)
```

---

## 📊 Document Status & Maintenance

### Actively Maintained (v1.7)
| Document | Status | Last Major Update |
|----------|--------|-------------------|
| [Philosophy](./architecture/PHILOSOPHY.md) | ✅ Stable | 2025-10-12 (v1.7) |
| [Core Principles](./architecture/core-principles.md) | ✅ Stable | 2025-10-10 |
| [Quick Start](./QUICKSTART.md) | ✅ Stable | 2025-10-12 (v1.7) |
| [Getting Started](./guides/getting-started.md) | ✅ Stable | 2025-10-12 (v1.7) |
| [Agent Development](./guides/agent-development.md) | ✅ Stable | 2025-10-12 (v1.7) |
| [Config Reference](./api/config.md) | ✅ Stable | 2025-10-12 (v1.7) |
| [Context Management](./guides/context-management.md) | ✅ Stable | 2024-10-09 (v1.6) |
| [Session Management](./guides/session-management.md) | ✅ Stable | 2024-10-02 (v1.5) |
| [v1.6 Context Composition](./architecture/v1.6-context-composition.md) | ✅ Stable | 2024-10-10 |

### Version-Specific Specs
| Version | Design Doc | Migration Guide |
|---------|------------|-----------------|
| v1.1 | [Stateless Core](./architecture/v1.1-design.md) | [v1.0→v1.1](./migration/v1.0-to-v1.1.md) |
| v1.2 | [Human Interaction](./architecture/v1.2-human-interaction.md) | - |
| v1.3 | [Workspace Simplification](./architecture/v1.3-design.md) | - |
| v1.4 | [PTY Deprecation](./architecture/v1.4-pty-deprecation.md) | [v1.4→v1.5](./migration/v1.4-to-v1.5.md) |
| v1.5 | [Simplified Sessions](./architecture/v1.5-sessions-simplified.md) | [v1.4→v1.5](./migration/v1.4-to-v1.5.md) |
| v1.6 | [Context Composition](./architecture/v1.6-context-composition.md) | - |
| v1.7 | [Tool Simplification](./architecture/v1.7-tool-simplification.md) | - |

---

## 🔍 Quick Reference

### Three Pillars Cheatsheet

#### 1️⃣ Everything is a Command
```yaml
# ✨ v1.7: Simple and expressive (Recommended)
tools:
  - name: search
    exec: "python3 tools/search.py"
    stdin: query
```

<details>
<summary>📦 Legacy syntax (v1.0-v1.6)</summary>

```yaml
tools:
  - name: search
    command: ["python3", "tools/search.py"]
    parameters:
      - name: query
        type: string
        inject_as: stdin
```
</details>

**Principle**: No built-in functions. All capabilities are external commands.

#### 2️⃣ The Environment is the Interface
```bash
workspaces/W001/          # Data Plane (agent's workspace)
├── data.csv
├── report.md
└── .delta/               # Control Plane (engine's audit log)
    └── {run_id}/
        └── journal.jsonl
```
**Principle**: File system is the universal API. Agent reads/writes files in CWD.

#### 3️⃣ Composition Defines Intelligence
```yaml
# ✨ v1.7: Simplified shell: mode for option flags
tools:
  - name: invoke_sub_agent
    shell: "delta run --agent ${agent_path} --task ${task}"
```

<details>
<summary>📦 Legacy syntax (v1.0-v1.6) - Required for complex option injection</summary>

```yaml
tools:
  - name: invoke_sub_agent
    command: ["delta", "run"]
    parameters:
      - name: agent_path
        type: string
        inject_as: option
        option_name: "--agent"
      - name: task
        type: string
        inject_as: option
        option_name: "--task"
```
</details>

**Principle**: Complex intelligence = composing simple agents. No bloated central engine.

### Essential Commands

```bash
# Run an agent
delta run --agent <path> --task "Do something"

# Interactive mode (select workspace)
delta run -i --agent <path> --task "Task"

# Silent mode (auto-create workspace)
delta run -y --agent <path> --task "Task"

# Resume interrupted run
delta run --resume --agent <path>

# Session management (v1.5)
delta-sessions start bash           # Create session
echo "pwd" | delta-sessions exec <id>  # Execute command
delta-sessions end <id>             # Terminate

# Initialize agent structure
delta init my-agent
```

### Troubleshooting Checklist

**Agent not responding?**
→ Check `workspaces/W001/.delta/{run_id}/engine.log`

**Tool execution failed?**
→ View `workspaces/W001/.delta/{run_id}/io/tool_executions/{tool}.json`

**Out of context?**
→ Implement [memory folding](./guides/context-management.md#memory-folding-pattern)

**Stateless core violated?**
→ Read [anti-patterns](./architecture/core-principles.md#violation-patterns-what-not-to-do)

---

## 🌐 Language Support

- **Primary**: English (all documentation)
- **Community Translations**: Welcome contributions

---

## 📝 Contributing to Documentation

When adding or updating documentation:

1. **Choose the Right Location**:
   - `architecture/` → Design decisions (WHY/WHAT)
   - `guides/` → Usage tutorials (HOW)
   - `api/` → Reference syntax (WHAT exactly)

2. **Follow the Pattern**:
   - Use clear headings and examples
   - Cross-reference related docs
   - Update this README's index

3. **Keep it Fresh**:
   - Update "Last Updated" dates
   - Mark deprecated sections clearly
   - Archive outdated docs to `archive/`

---

## 📖 External Resources

- **GitHub Repository**: [github.com/delta-engine/delta-engine](https://github.com/delta-engine/delta-engine)
- **Issue Tracker**: [GitHub Issues](https://github.com/delta-engine/delta-engine/issues)
- **Examples**: [examples/](../examples/) in repository

---

## 💡 Philosophy Reminder

> "Delta Engine's strength comes from saying NO to features and YES to simplicity.
> Every new capability should be an external composition, not a core addition."
>
> — From the [Design Philosophy](./architecture/PHILOSOPHY.md)

---

**Last Updated**: 2025-10-12
**Current Version**: v1.7 (Tool Configuration Simplification)
**Next Major Release**: v2.0 (Multi-Agent Orchestration) - Planned
