# Delta Agent Generator

**AI orchestration tool for generating Delta Engine agents using Claude Code CLI.**

---

## 🎯 What Is This?

A tool that demonstrates **AI orchestrating AI** - a Delta agent controlling Claude Code through command-line invocation to generate new agents.

### The Vision

> "Claude Code is powerful. Delta's advantage is quickly integrating powerful tools. This should be a practical tool for generating agents."

---

## ✨ Key Features

**AI-to-AI Orchestration**:
- Execute agent generation via `claude -p` with structured JSON output
- Resume conversations for iterative refinement
- Preview execution with plan mode

**Production Quality**:
- Command-line based (no PTY, no timing issues)
- Comprehensive validation (config, prompt, README)
- Cost tracking and budget awareness
- Error recovery and retry strategies

**Simplified Architecture**:
- **7 core tools** for agent generation
- Auto-initialization (no manual setup)
- Consolidated validation

---

## 🚀 Quick Start

### Prerequisites

```bash
# 1. Build Delta Engine
npm install delta-engine -g

# 2. Ensure Claude Code CLI is available
claude --version
# Should output: claude version X.X.X
```

### Generate Your First Agent

```bash
# From delta-engine root directory
delta run --agent examples/claude-code-workflow \
  -m "Generate a Delta agent that reads and writes files"
```

### What Happens

1. **Plans** execution using `claude -p --permission-mode plan`
2. **Generates** agent with agent.yaml, system_prompt.md, README.md
3. **Validates** all required files and structure
4. **Reports** success with cost and session ID

### Expected Output

```
=== Delta Agent Generator ===

Analyzing request...
- Agent type: file-tools
- Estimated cost: $0.15-$0.25
- Expected resumes: 1-2

Generating agent...
Session ID: abc-12345
Claude Code execution completed

Validation Report:
✓ agent.yaml (3 tools)
✓ system_prompt.md (142 lines)
✓ README.md (with examples)
✓ Valid YAML
✓ All checks passed

Agent generated successfully!
Location: examples/file-agent/
Cost: $0.18
Session ID: abc-12345

Next steps:
- Test: delta run --agent examples/file-agent -m "Read agent.yaml"
- Refine: Provide session ID abc-12345 for improvements
```

---

## 🏗️ How It Works

### Architecture: Command-Line Based

```
┌─────────────────────────────────────────┐
│     Delta Agent (Orchestrator)          │
│  - Composes claude commands             │
│  - Parses JSON responses                │
│  - Manages session IDs                  │
│  - Records experience                   │
└────────────┬────────────────────────────┘
             │ CLI invocation
             │ (not PTY!)
             ▼
┌─────────────────────────────────────────┐
│         Claude Code (Worker)            │
│  - Receives task via -p flag            │
│  - Returns structured JSON              │
│  - Preserves context via session_id     │
│  - Supports plan/execute modes          │
└─────────────────────────────────────────┘
```

**Why Command-Line** (not PTY):
- ✅ Structured JSON output (parseable)
- ✅ No timing guesses needed
- ✅ No escape sequence parsing
- ✅ Immediate, complete results
- ✅ Reliable error handling

---

### 2-Phase Workflow

#### Phase 1: Plan & Execute

**2.1 Preview (Plan Mode)**:
```bash
claude_plan(
  cmd: 'claude -p "Create Delta agent for file organization" \
        --permission-mode plan --output-format json'
)
```

**2.2 Generate**:
```bash
claude_task(
  cmd: 'claude -p "Create Delta Engine agent:
    - Name: file-organizer
    - Tools: list_files (ls), move_file (mv), create_directory (mkdir)
    - Include system_prompt.md with Delta concepts
    - Include README.md with examples
    - Follow Delta's Three Pillars" \
    --output-format json --permission-mode plan'
)
```

**2.3 Validate**:
```bash
validate_agent(script: 'cd examples/file-organizer && \
  test -f agent.yaml && \
  test -f system_prompt.md && \
  test -f README.md && \
  python3 -c "import yaml; yaml.safe_load(open(\"agent.yaml\"))"')
```

**2.4 Refine (if needed)**:
```bash
claude_resume(
  cmd: 'claude --resume "session-id" \
        -p "Add error handling to all tools" \
        --output-format json'
)
```

---

#### Phase 2: Complete

---

## 🛠️ Tools (v2.0 - Simplified)

### Core Tools (3)

| Tool | Purpose | Usage |
|------|---------|-------|
| **claude_task** | Initial generation | `claude -p "task" --output-format json` |
| **claude_resume** | Iterative refinement | `claude --resume "id" -p "fix" --output-format json` |
| **claude_plan** | Preview execution | `claude -p "task" --permission-mode plan --output-format json` |


### Validation Tools (2)

| Tool | Purpose | Usage |
|------|---------|-------|
| **validate_agent** | Comprehensive validation | Checks config, prompt, README, YAML validity |
| **inspect_file** | File inspection | Flexible bash commands (`cat`, `ls`, `wc`) |

**Removed from v1.0**:
- ❌ `init_lab` → Auto-created by hooks
- ❌ `create_lab_readme` → Not needed
- ❌ `run_tests` → Merged into validate_agent
- ❌ `file_exists` → Use inspect_file
- ❌ `list_files` → Use inspect_file

---

## 📚 Usage Examples

### Example 1: Simple Agent

**Request**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Create an agent with a single echo tool"
```

**Generated Agent**:
- `agent.yaml`: 1 tool (print_message: echo)
- `system_prompt.md`: Basic instructions
- `README.md`: Usage examples
- **Cost**: ~$0.08
- **Time**: 1-2 minutes

---

### Example 2: File Processing Agent

**Request**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Create a file processing agent with read, write, list, and organize capabilities. Include error handling and comprehensive documentation."
```

**Generated Agent**:
- `agent.yaml`: 4 tools (read_file, write_file, list_files, organize_files)
- `system_prompt.md`: Delta concepts, error handling, workflows
- `README.md`: Examples, troubleshooting, how it works
- **Cost**: ~$0.22
- **Time**: 3-5 minutes

---

### Example 3: Iterative Refinement

**Initial Generation**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Create API testing agent"
# Output: Session ID abc-123, Cost $0.15
```

**Refinement** (using session ID):
```bash
delta run --agent examples/claude-code-workflow \
  -m "Resume session abc-123: Add response validation and retry logic"
# Output: Session ID abc-123 (continued), Additional cost $0.08
```

**Total Cost**: $0.23 for fully-featured API testing agent

---

## ⚙️ Configuration

### Permission Modes (Safety)

**Default (Recommended)**:
```bash
--permission-mode plan
# Previews without making changes
```

**Alternative Modes**:
```bash
--permission-mode acceptEdits   # Selective approval
--permission-mode default       # Interactive prompts
--dangerously-skip-permissions  # No safety (use cautiously)
```

### Cost Management

**Budget Awareness**:
- Simple agent budget: <$0.30
- Medium agent budget: <$0.60
- Complex agent budget: <$1.50

**Cost Reduction Tips**:
- Use specific task descriptions
- Provide structure/examples upfront
- Break complex tasks into smaller chunks
- Limit resume iterations

---

## 🔍 Troubleshooting

### Issue 1: Claude Code Not Found

**Symptom**: `claude: command not found`

**Solution**:
```bash
# Check if Claude Code is installed
which claude

# If not found, install Claude Code CLI
# Visit: https://claude.ai/code
```

---

### Issue 2: Generation Fails

**Symptom**: Tool execution fails, no agent generated

**Common Causes**:
1. **Vague task description** → Be more specific
2. **Missing context** → Mention Delta, Three Pillars, tool specifics
3. **Too complex** → Break into smaller tasks
4. **Permission issues** → Check --permission-mode

**Debug Commands**:
```bash
# Check Delta agent's journal (v1.10: use list-runs)
WORKSPACE_DIR="examples/claude-code-workflow/workspaces/$(cat examples/claude-code-workflow/workspaces/LAST_USED)"
RUN_ID=$(cd $WORKSPACE_DIR && delta list-runs --first)
tail -20 $WORKSPACE_DIR/.delta/$RUN_ID/journal.jsonl

# Check tool execution logs
ls -lht $WORKSPACE_DIR/.delta/$RUN_ID/io/tool_executions/ | head -5

# View LLM invocations
ls -lht $WORKSPACE_DIR/.delta/$RUN_ID/io/invocations/ | head -5
```

---

### Issue 3: Validation Fails

**Symptom**: Agent generated but validation reports errors

**Common Issues**:
- `agent.yaml missing` → Agent not in expected location
- `Invalid YAML` → Syntax errors in config
- `Prompt too short` → system_prompt.md < 100 lines

**Fix**:
Use the session ID to refine:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Resume session SESSION_ID: Fix validation issues - [specific issue]"
```

---

### Issue 4: High Cost

**Symptom**: Agent generation costs more than expected

**Analysis**:
```bash
# Check cost breakdown in sessions.jsonl
cat .claude-lab/sessions.jsonl | jq 'select(.session_id=="SESSION_ID")'
```

**Solutions**:
- Simplify task description
- Provide more specific requirements
- Use plan mode to preview first
- Break complex agents into smaller parts

---

## 📊 Quality Standards

### A Good Generated Agent Has:

**Files**:
- ✅ `agent.yaml` (clear tools, inline comments)
- ✅ `system_prompt.md` (100+ lines, Delta concepts)
- ✅ `README.md` (examples, troubleshooting)

**Philosophy**:
- ✅ Everything is a Command (CLI tools)
- ✅ Environment as Interface (workspace-based)
- ✅ Stateless Core (journal-based)

**Documentation**:
- ✅ "How It Works" section in README
- ✅ "Troubleshooting" section in README
- ✅ Tool descriptions in config
- ✅ Example workflows

**Validation**:
- ✅ Valid YAML syntax
- ✅ All tools have descriptions
- ✅ System prompt explains Delta concepts
- ✅ Can be executed with `delta run`

---

## 🎯 Advanced Usage

### Generate from Template

```bash
# Use experience to generate similar agent
delta run --agent examples/claude-code-workflow \
  -m "Generate an agent similar to the successful file-organizer (session abc-123), but for log files instead of general files"
```

### Multi-Step Generation

**Step 1: Plan**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Create execution plan for: Multi-tool data processing agent with CSV input, transformation, and export capabilities"
# Review plan output
```

**Step 2: Execute**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Generate the data processing agent from previous plan"
```

**Step 3: Refine**:
```bash
delta run --agent examples/claude-code-workflow \
  -m "Resume session SESSION_ID: Add validation and error handling"
```

### Batch Generation

```bash
# Generate multiple agents (run sequentially)
for agent in "file-reader" "file-writer" "file-organizer"; do
  delta run --agent examples/claude-code-workflow \
    -m "Generate simple $agent agent"
  echo "Generated: $agent"
done

# View total cost
cat .claude-lab/sessions.jsonl | jq -s 'map(.cost_usd // 0) | add'
```

---

## 🔗 Related Examples

- **[hello-world](../hello-world/)** - Learn Delta basics
- **[interactive-shell](../interactive-shell/)** - Session management
- **[python-repl](../python-repl/)** - REPL state preservation

---

## 📝 Philosophy

This tool embodies Delta Engine's core philosophy:

### Everything is a Command
Claude Code is invoked via CLI (`claude -p`), not special integration.

### Environment as Interface
Generated agents are files in the workspace, inspectable with standard tools.

### Stateless Core
No session state is maintained - all context comes from Claude Code's session_id system and our experience log.

### AI Orchestrating AI
Demonstrates meta-level automation - AI controlling AI through structured interfaces (JSON, CLI).

---

## 🚀 Development

### v2.0 Improvements

**Simplification**:
- 11 tools → 7 tools (36% reduction)
- 205 lines → 144 lines config (32% reduction)
- Auto-initialization (no manual setup)

**Enhanced**:
- Comprehensive validation (consolidated from 4 tools)
- Production-grade system prompt (271 → 632 lines)
- Detailed workflow documentation
- Cost and pattern tracking
- Error recovery strategies

**Philosophy**:
- Safety first (default to plan mode)
- Experience learning (pattern recognition)
- Quality standards (Delta's Three Pillars)
- Production readiness (not just example)

---

## 📞 Questions & Contributions

### Feedback

- **Found an issue?** Open GitHub issue
- **Have suggestions?** Submit PR
- **Need help?** Check troubleshooting section above

### Future Enhancements

This is an experimental tool demonstrating AI-to-AI orchestration patterns.

---

## 📖 Documentation

- **[Architecture](../../docs/architecture/)** - Delta Engine design
- **[Agent Development](../../docs/guides/agent-development.md)** - Creating agents

---

## 🎉 Why This Is Awesome

**Validates Delta's Vision**:
- Real-world production tool (not just demo)
- AI orchestrating AI (meta-level automation)
- "Everything is a Command" in action

**Practical Value**:
- Delta team uses it internally
- Generates agents in minutes (vs hours manually)
- Learns from experience over time
- Reduces error rate and increases consistency

**Innovation**:
- Novel AI-to-AI orchestration pattern
- Experience-based learning system
- Self-improving tool

---

**Status**: **Experimental - Simplified**

A focused tool demonstrating AI-to-AI orchestration patterns.

---

**Start generating agents**: `delta run --agent examples/delta-agent-generator -m "Generate a simple agent"`
