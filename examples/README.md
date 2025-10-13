# Delta Engine Examples

High-quality examples showcasing Delta Engine's unique capabilities and philosophy.

---

## 🎯 Philosophy

These examples demonstrate Delta's **Three Pillars**:
1. **Everything is a Command** - All capabilities are external CLI tools
2. **Environment as Interface** - Agents interact through their working directory
3. **Stateless Core** - Perfect resumability through journal-based state

**Quality > Quantity**: Each example meets strict standards (⭐⭐⭐⭐ 4/5) and teaches Delta-specific patterns.

---

## 📚 Examples by Level

### 1️⃣ Basics - Quick Start (5 minutes)

**[hello-world](./1-basics/hello-world/)** ⭐⭐⭐⭐.3 (4.3/5)
- **What**: Simplest agent with 5 basic tools
- **Teaches**: Think-Act-Observe loop, Three Pillars, journal-based resumability
- **Use When**: First time using Delta Engine
- **Highlights**: Educational focus, shows stateless core, interrupt/resume demo

```bash
delta run --agent examples/1-basics/hello-world -m "Create a greeting file"
```

**[tool-syntax](./1-basics/tool-syntax/)** ⭐⭐⭐⭐⭐ (5.0/5)
- **What**: Demonstrates v1.7 simplified tool configuration syntax
- **Teaches**: `exec:` vs `shell:` modes, `:raw` modifier, security guarantees
- **Use When**: Learning to configure tools or migrating from legacy syntax
- **Highlights**: 77% verbosity reduction, `delta tool expand` debugging, backward compatibility

```bash
delta tool expand examples/1-basics/tool-syntax/agent.yaml
```

---

### 2️⃣ Core Features - Delta's Strengths

**[interactive-shell](./2-core-features/interactive-shell/)** ⭐⭐⭐⭐⭐ (4.9/5)
- **What**: Persistent bash session with v1.5 simplified sessions
- **Teaches**: Command-based execution, state preservation, no timing complexity
- **Use When**: Need persistent shell environment across commands
- **Highlights**: 3 tools (start/exec/end), immediate output, working directory persists

```bash
delta run --agent examples/2-core-features/interactive-shell \
  -m "Navigate to /tmp, create 3 files, then count them"
```

**[python-repl](./2-core-features/python-repl/)** ⭐⭐⭐⭐.5 (4.7/5)
- **What**: Persistent Python REPL with v1.5 sessions
- **Teaches**: REPL state management, variables/imports persistence
- **Use When**: Need Python code execution with memory between calls
- **Highlights**: JSON output format, exit codes, stderr handling

```bash
delta run --agent examples/2-core-features/python-repl \
  -m "Calculate factorial of 10 using a recursive function"
```

**[memory-folding](./2-core-features/memory-folding/)** ⭐⭐⭐⭐⭐ (4.7/5) 🎓
- **What**: v1.6 context composition with computed_file generators
- **Teaches**: Memory folding, dynamic context generation, token efficiency
- **Use When**: Long-running tasks need context summarization
- **Highlights**: `context.yaml`, Python summarizer, keeps last N turns
- **New**: Enhanced docs (519 line README, 279 line system_prompt)

```bash
delta run --agent examples/2-core-features/memory-folding -m "Long research task with memory compression"
```

---

### 3️⃣ Advanced - Production Patterns

**[delta-agent-generator](./3-advanced/delta-agent-generator/)** ⭐⭐⭐⭐⭐ (5.0/5)
- **What**: AI-powered agent generator using Claude Code CLI (production-grade)
- **Teaches**: AI orchestrating AI, experience learning, cost prediction
- **Use When**: Need to quickly scaffold Delta agents with comprehensive docs
- **Highlights**: 8 tools, Phase 3 intelligence (pattern analysis), iterative refinement

```bash
delta run --agent examples/3-advanced/delta-agent-generator \
  -m "Generate a Delta agent that reads and writes files"
```

**[code-reviewer](./3-advanced/code-reviewer/)** ⭐⭐⭐⭐⭐ (4.7/5) 🔍
- **What**: Automated code review with lifecycle hooks for audit trail
- **Teaches**: pre_llm_req & post_tool_exec hooks, multi-file review patterns
- **Use When**: Need systematic code reviews with complete audit logging
- **Highlights**: 6 tools (git_diff, search_code, write_review), hooks demo, resumable reviews

```bash
delta run --agent examples/3-advanced/code-reviewer \
  -m "Review changes in last commit (HEAD~1..HEAD)" --work-dir /path/to/repo
```

**[research-agent](./3-advanced/research-agent/)** ⭐⭐⭐⭐⭐ (4.7/5) 🎓
- **What**: Long-running research with v1.6 context composition
- **Teaches**: Memory folding, incremental summarization, multi-day resumability
- **Use When**: Comprehensive research projects spanning hours/days/weeks
- **Highlights**: 5 tools, context.yaml with computed_file, constant context size

```bash
delta run --agent examples/3-advanced/research-agent \
  -m "Research RAG techniques comprehensively. Summarize when notes exceed 500 lines."
```

---

## 🚀 Quick Start

### 1. Install Delta Engine
```bash
npm install
npm run build
npm link
```

### 2. Run Your First Example
```bash
# Start with hello-world
delta run --agent examples/1-basics/hello-world -m "Say hello and create a file"
```

### 3. Explore the Three Pillars
```bash
# See the journal (stateless core)
RUN_ID=$(cat examples/1-basics/hello-world/workspaces/LAST_USED/.delta/LATEST)
cat examples/1-basics/hello-world/workspaces/LAST_USED/.delta/$RUN_ID/journal.jsonl | jq .

# See the workspace (environment as interface)
ls -la examples/1-basics/hello-world/workspaces/LAST_USED/

# See the tools (everything is a command)
cat examples/1-basics/hello-world/agent.yaml
```

---

## 📖 Learning Path

### For Beginners
1. **Start**: `hello-world` - Understand fundamentals
2. **Syntax**: `tool-syntax` - Learn v1.7 simplified tool configuration
3. **Explore**: Read generated journal to see Think-Act-Observe
4. **Experiment**: Try interrupt (Ctrl+C) and resume

### For Intermediate Users
5. **Sessions**: `2-core-features/interactive-shell` - Learn v1.5 session management
6. **REPLs**: `2-core-features/python-repl` - Persistent state across executions
7. **Context**: `2-core-features/memory-folding` - v1.6 context composition

### For Advanced Users
8. **Orchestration**: `3-advanced/delta-agent-generator` - AI-to-AI patterns, production tool
9. **Create Your Own**: Use quality checklist in `.quality-assessments/`

---

## 🎨 What Makes a Good Delta Example?

### ✅ Required Qualities

1. **Delta-Unique Value** (30%)
   - Showcases stateless core, sessions, or context composition
   - Can't be easily replicated with generic tools
   - Demonstrates at least one of the Three Pillars

2. **Documentation Quality** (25%)
   - Comprehensive README (100+ lines)
   - "How It Works" section with Think-Act-Observe
   - "Troubleshooting" section with debug commands
   - System prompt (100+ lines) with Delta concepts

3. **Working Out-of-Box** (20%)
   - Tested and functional
   - Clear expected outputs
   - Handles errors gracefully

4. **Real-World Applicability** (15%)
   - Solves actual problems
   - Production-ready patterns
   - Practical use cases

5. **Code Quality** (10%)
   - Clean config with comments
   - Well-structured tools
   - Appropriate LLM settings

**Threshold**: ⭐⭐⭐⭐ (4.0/5) to be included

### ❌ Anti-Patterns (Archived)

Examples archived to `.archive/` because they:
- Wrapped generic tools without Delta value
- Had minimal documentation
- Didn't teach Delta principles
- Could be done with any shell script

See [.archive/README.md](./.archive/README.md) for details.

---

## 🔍 Example Comparison Matrix

| Example | Complexity | Innovation | Delta Value | Docs Quality | Best For |
|---------|-----------|------------|-------------|--------------|----------|
| **hello-world** | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Learning fundamentals |
| **interactive-shell** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Bash automation |
| **python-repl** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Python scripting |
| **memory-folding** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Long tasks |
| **delta-agent-generator** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | AI orchestration |

---

## 🛠️ Creating Your Own Example

### Step 1: Check Quality Standards
Review `.quality-assessments/` for detailed criteria.

### Step 2: Use Template Structure
```
your-example/
├── agent.yaml           # Tool definitions, LLM settings
├── system_prompt.md      # Agent instructions (100+ lines)
├── README.md             # Usage guide (100+ lines)
├── context.yaml          # Optional: v1.6 context composition
└── tools/                # Optional: Helper scripts
```

### Step 3: Document Delta Value
- Explain which of the Three Pillars you demonstrate
- Show journal usage and resumability
- Include "How It Works" section
- Add troubleshooting guidance

### Step 4: Test Quality
Run against the checklist:
- [ ] ⭐⭐⭐⭐ (4/5) or higher score
- [ ] Showcases Delta-unique capability
- [ ] Comprehensive documentation
- [ ] Working examples
- [ ] Teaches Delta philosophy

---

## 📂 Directory Structure

```
examples/
├── README.md                    # This file
├── RESTRUCTURE_PLAN.md          # Restructure documentation
│
├── .archive/                    # Removed examples (reference only)
│   ├── README.md                # Why they were archived
│   ├── file-organizer/
│   ├── git-analyzer/
│   ├── test-runner/
│   ├── api-tester/
│   └── doc-generator/
│
├── .quality-assessments/        # Quality evaluation reports
│   ├── SUMMARY.md
│   ├── hello-world-IMPROVED.md
│   ├── interactive-shell.md
│   └── python-repl-FIXED.md
│
├── 1-basics/                    # Quick start (5 min)
│   ├── hello-world/             # ⭐⭐⭐⭐.3
│   └── tool-syntax/             # ⭐⭐⭐⭐⭐ (v1.7 syntax demo)
│
├── 2-core-features/             # Delta's key capabilities
│   ├── interactive-shell/       # ⭐⭐⭐⭐⭐ (v1.5 sessions)
│   ├── python-repl/             # ⭐⭐⭐⭐.5 (v1.5 REPL)
│   └── memory-folding/          # ⭐⭐⭐⭐⭐ (v1.6 context) ✨ ENHANCED
│
└── 3-advanced/                  # Production patterns
    └── delta-agent-generator/   # ⭐⭐⭐⭐⭐ (v3.0 production tool)
```

---

## 🔗 Related Documentation

- **Architecture**: [v1.1 Design](../docs/architecture/v1.1-design.md), [v1.5 Sessions](../docs/architecture/v1.5-sessions-simplified.md), [v1.6 Context](../docs/architecture/v1.6-context-composition.md)
- **Guides**: [Agent Development](../docs/guides/agent-development.md), [Session Management](../docs/guides/session-management.md)
- **API Reference**: [delta-sessions CLI](../docs/api/delta-sessions.md)

---

## 📞 Questions & Contributions

- **Found an issue?** Open a GitHub issue
- **Have an example idea?** Check quality standards first, then submit PR
- **Need help?** See documentation or ask in discussions

---

## 📊 Restructure History

**Date**: 2025-10-08
**Changes**:
- ✅ Archived 5 generic examples (file-organizer, git-analyzer, test-runner, api-tester, doc-generator)
- ✅ Created 3-tier structure (1-basics, 2-core-features, 3-advanced)
- ✅ Improved hello-world quality (⭐⭐⭐ → ⭐⭐⭐⭐.3)
- ✅ Fixed python-repl critical issue (⭐⭐ → ⭐⭐⭐⭐.5)
- ✅ Established quality standards (⭐⭐⭐⭐ 4/5 threshold)

**Result**: 5 high-quality examples showcasing Delta's unique value.

See [RESTRUCTURE_PLAN.md](./RESTRUCTURE_PLAN.md) for full details.
