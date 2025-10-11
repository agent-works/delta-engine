# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
# Build
npm run build              # TypeScript → dist/
npm run clean              # Clean dist/

# Development
npm run dev                # Watch mode with tsx

# Testing
npm test                   # All tests (unit + integration)
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:stateless     # Test stateless core
npm run test:hooks         # Test lifecycle hooks
npm run test:io            # Test I/O audit

# Run the CLI
node dist/index.js run --agent <path> --task "Task description"
# or after build/link:
delta run --agent <path> --task "Task description"
delta run -i --agent <path> --task "Task"  # Interactive mode (v1.2)
delta run -y --agent <path> --task "Task"  # Silent mode - auto-create workspace (v1.2.1)
delta --version            # Show version

# Session management (v1.5 - Simplified)
delta-sessions start [shell]               # Create session (default: bash)
delta-sessions exec <session_id>           # Execute command (from stdin)
delta-sessions end <session_id>            # Terminate session
delta-sessions list                        # List all sessions

# For PTY features (experimental):
delta-sessions-pty start <command> [args...]  # PTY session (vim, top, etc.)
```

## Quick Debug Commands

```bash
# Get the latest run ID (LATEST is a text file, not a symlink)
RUN_ID=$(cat .delta/LATEST)

# View recent journal events
tail -20 .delta/$RUN_ID/journal.jsonl

# Check run status (see context.ts for LATEST file implementation)
cat .delta/$RUN_ID/metadata.json

# View LLM invocations
ls -lht .delta/$RUN_ID/io/invocations/ | head -5

# Check for pending human interaction
ls -la .delta/interaction/

# View tool execution logs
ls -lht .delta/$RUN_ID/io/tool_executions/ | head -5

# One-liner alternatives (bash/zsh)
tail -20 .delta/$(cat .delta/LATEST)/journal.jsonl

# Session debugging (v1.5)
delta-sessions list                         # List all sessions
cat .sessions/sess_abc123/metadata.json     # Inspect session metadata
cat .sessions/sess_abc123/state.json        # View session state (CWD, env)
cat .sessions/sess_abc123/history.log       # View execution history
```

## Architecture Overview

Delta Engine follows Unix philosophy applied to AI agents. The core design is **stateless** - no in-memory state preserved across iterations. All state is rebuilt from the journal on disk.

### Core Philosophy (Three Pillars)

1. **Everything is a Command** - All agent capabilities are external CLI programs, no built-in functions
2. **Environment as Interface** - Agents interact only through their working directory (CWD)
3. **Stateless Core** - Perfect resumability through journal-based state reconstruction

### Control Plane Structure (`.delta/`)

```
<AGENT_HOME>/workspaces/
├── LAST_USED                # v1.3: Tracks last used workspace
├── W001/                    # v1.2.1: Sequential workspace naming
│   └── .delta/
│       ├── VERSION          # v1.3: Schema version (was VERSION)
│       ├── LATEST           # Latest run ID
│       └── {run_id}/
│           ├── journal.jsonl      # Core execution log (SSOT)
│           ├── metadata.json      # Run metadata (status field)
│           ├── engine.log         # Engine process logs
│           ├── io/                # I/O audit logs
│           │   ├── invocations/   # LLM invocation records
│           │   ├── tool_executions/  # Tool execution details
│           │   └── hooks/         # Hook execution records
│           └── interaction/       # v1.2 human interaction (async mode)
│               ├── request.json   # Interaction request
│               └── response.txt   # User response
└── W002/                    # Additional workspaces
```

### Key Components

- **engine.ts** - Core Think-Act-Observe loop. `buildContext()` rebuilds state from journal and context sources. Max iterations: `MAX_ITERATIONS = 30`
- **journal.ts** - JSONL-based event logging (append-only, line-by-line)
- **executor.ts** - Tool execution with three injection modes: `argument`, `stdin`, `option`
- **ask-human.ts** - v1.2 human-in-the-loop support (two modes: `-i` CLI sync, async file-based)
- **hook-executor.ts** - Lifecycle hooks: `pre_llm_req`, `post_llm_resp`, `pre_tool_exec`, `post_tool_exec`, `on_llm_response`
- **workspace-manager.ts** - v1.2.1 workspace selection and management (interactive/silent modes)
- **types.ts** - Zod schemas for all configs and types (strict validation)
- **context/** - v1.6 context composition layer:
  - **builder.ts** - ContextBuilder orchestrates context assembly from multiple sources
  - **types.ts** - Context manifest schemas and DEFAULT_MANIFEST
  - **sources/** - Source processors: file-source, computed-source, journal-source
- **sessions/** - v1.5 simplified session management (command-based execution):
  - **manager.ts** - SessionManager (CRUD, execution)
  - **executor.ts** - Command execution with state preservation
  - **storage.ts** - Metadata and state persistence
  - **types.ts** - TypeScript types and Zod schemas
- **sessions-pty/** - v1.4 PTY sessions (experimental, deprecated):
  - See `docs/architecture/v1.4-pty-deprecation.md` for details
- **sessions-cli.ts** - v1.5 delta-sessions CLI (3 commands: start, exec, end)
- **sessions-pty-cli.ts** - v1.4 delta-sessions-pty CLI (experimental)

### Run States (metadata.json status field)

- `RUNNING` - Normal execution
- `WAITING_FOR_INPUT` - Paused, waiting for user input (v1.2)
- `COMPLETED` - Task completed successfully
- `FAILED` - Unrecoverable error
- `INTERRUPTED` - External interrupt (e.g., Ctrl+C)

The `delta run` command auto-detects `WAITING_FOR_INPUT` or `INTERRUPTED` and resumes intelligently.

### Journal Event Types (journal-types.ts)

- `ENGINE_START` - Engine startup
- `THOUGHT` - LLM thinking + tool call decisions
- `ACTION_RESULT` - Tool execution results
- `ENGINE_END` - Engine termination
- `ERROR` - Error events

### Tool Parameter Injection

Three modes defined in `inject_as`:
1. **argument** - Passed as CLI argument
2. **stdin** - Piped via standard input (max 1 per tool)
3. **option** - Passed as named flag (requires `option_name`)

Example `config.yaml` structure (v1.0-v1.6 full syntax):
```yaml
name: my-agent
version: 1.0.0
description: Agent description

llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 2000

tools:
  - name: tool_name
    command: [executable, arg1, arg2]
    parameters:
      - name: param_name
        type: string
        description: Parameter description
        inject_as: argument    # or stdin, option
        option_name: --flag    # required only when inject_as: option

hooks:  # Optional lifecycle hooks
  pre_llm_req:
    command: [script.sh]
    timeout_ms: 5000
```

**v1.7 Simplified Syntax:**

For common cases (80% of tools), use simplified `exec:` or `shell:` syntax:

```yaml
tools:
  # exec: mode - Direct execution (safest, no shell)
  - name: list_files
    exec: "ls -F ${directory}"

  # shell: mode - For pipes and redirection
  - name: count_lines
    shell: "cat ${file} | wc -l"

  # stdin: parameter (both modes)
  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  # :raw modifier (shell: only, for flag lists)
  - name: run_docker
    shell: "docker run ${flags:raw} ${image}"
```

**Simplified vs Full Syntax Comparison:**

```yaml
# OLD (v1.0-v1.6): 9 lines
- name: count_lines
  command: [sh, -c, "cat \"$1\" | wc -l", --]
  parameters:
    - name: file
      type: string
      inject_as: argument
      position: 0

# NEW (v1.7): 2 lines ✨
- name: count_lines
  shell: "cat ${file} | wc -l"
```

Use `delta tool expand config.yaml` to see how simplified syntax is expanded to full format.

### Context Composition (v1.6)

Delta Engine supports **declarative context building** through `context.yaml`. This enables memory folding, dynamic context generation, and fine-grained control over what the LLM sees.

#### Zero-Config Operation

Without `context.yaml`, the engine uses a sensible default strategy:
1. `system_prompt.md` (required)
2. `DELTA.md` in workspace (optional, auto-loaded if exists)
3. Full journal history

#### Custom Context Manifest

Create `${AGENT_HOME}/context.yaml` to customize context sources:

```yaml
sources:
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"
    on_missing: error  # or 'skip'

  - type: file
    id: workspace_guide
    path: "${CWD}/DELTA.md"
    on_missing: skip  # Won't fail if missing

  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
      timeout_ms: 10000
    output_path: "${CWD}/.delta/context_artifacts/summary.md"
    on_missing: skip

  - type: journal
    id: recent_conversation
    max_iterations: 5  # Only last 5 turns (for token efficiency)
```

#### Source Types

1. **`file`** - Static file content
   - Supports `${AGENT_HOME}` and `${CWD}` variable expansion
   - `on_missing`: `error` (fail) or `skip` (ignore if missing)

2. **`computed_file`** - Dynamic content via external generator
   - Generator receives env vars: `DELTA_RUN_ID`, `DELTA_AGENT_HOME`, `DELTA_CWD`
   - Use for memory folding, RAG, knowledge graph queries, etc.
   - Output written to `output_path` before LLM invocation

3. **`journal`** - Recent conversation history
   - `max_iterations`: Limit to N most recent turns (optional)
   - Omit `max_iterations` for full history

#### DELTA.md Auto-Loading

If a file named `DELTA.md` exists in the workspace root, it's automatically injected into context (when using default manifest). This file can contain:
- Workspace-specific instructions
- Project conventions
- Task context
- Dynamic notes for the agent

The agent can update `DELTA.md` during execution to persist knowledge across runs.

#### Memory Folding Example

See `examples/2-core-features/memory-folding/` for a complete demonstration:
- Uses Python script to compress journal history into summary
- Keeps only last 5 turns in full detail
- Maintains context window efficiency over long tasks

**Key files**:
- `context.yaml` - Defines computed_file source
- `tools/summarize.py` - Extracts key facts from journal
- Output: `.delta/context_artifacts/summary.md`

## Critical Development Conventions

### Known Traps (Must Avoid)

#### ESM Import Must Include .js Extension
**Symptom**: `import { Engine } from './engine'` compiles but fails at runtime
**Root Cause**: TypeScript doesn't validate ESM paths, Node.js runtime requires extension
**Solution**: All imports must explicitly use `.js`: `import { Engine } from './engine.js'`
**Detection**: Runtime error "Cannot find module"

#### File Descriptor Leak
**Symptom**: After long runs "Too many open files" / "EMFILE"
**Root Cause**: FileHandle not properly closed
**Solution**:
```typescript
// ✅ Correct
const handle = await fs.open(path);
try {
  // ... operations
} finally {
  await handle.close();
}
```
**High-risk areas**: `journal.ts`, `ask-human.ts` (frequent file operations)
**Detection**: `lsof -p <pid> | wc -l` continuously growing

#### Journal Format Corruption
**Symptom**: Resume fails with parse errors; file renamed to `journal.json`
**Root Cause**: External tools (VSCode JSONL viewer plugins) can auto-convert format
**Impact**: 🔴 CRITICAL - All state reconstruction fails
**Prevention**:
- ❌ DON'T open `journal.jsonl` files in VSCode with JSONL viewer plugins
- ✅ DO use `cat`, `less`, `jq` for inspection
- ✅ Runtime validation in `journal.ts:validateJournalFormat()`

**See**: `.story/incidents/2025-10-09-journal-corruption.md` for full post-mortem

#### Unix Socket Path Length Limit (104 bytes)
**Symptom**: Socket file truncated, connection timeout
**Platform**: macOS and most Unix systems
**Root Cause**: POSIX `sockaddr_un` defines `sun_path[104]`
**Solution**: Use `/tmp/` for socket files (short path), keep metadata in project dir

#### LLM Real-time Interaction Mismatch
**Symptom**: Agent spends excessive time polling/waiting
**Root Cause**: LLMs operate in request-response model, cannot monitor real-time PTY output
**Solution**: Use command-based execution (v1.5 sessions) instead of PTY
**See**: `docs/architecture/v1.4-pty-deprecation.md`

### Code Patterns to Follow ✅
```typescript
// Correct: ESM imports with .js extension
import { Engine } from './engine.js';
import type { EngineContext } from './types.js';

// Correct: Async file I/O
import { promises as fs } from 'node:fs';
await fs.readFile(path, 'utf-8');

// Correct: Stateless - rebuild from journal
private async rebuildConversationFromJournal(): Promise<Message[]> {
  const events = await this.journal.readJournal();
  // ... rebuild state from events
}

// Correct: Zod validation
const config = AgentConfigSchema.parse(rawConfig);
```

### Code Patterns to Avoid ❌
```typescript
// Wrong: Missing .js extension (ESM requirement)
import { Engine } from './engine';  // ❌ Will fail at runtime

// Wrong: Synchronous file I/O
fs.readFileSync(path);  // ❌ Use fs.promises instead

// Wrong: Storing state in memory
class Engine {
  private conversationHistory: Message[] = [];  // ❌ Violates stateless core
}

// Wrong: Unhandled file descriptors
const handle = await fs.open(path);
// ... forgot to close  // ❌ Causes file descriptor leak
```

### TypeScript Configuration
- Target: ES2022, NodeNext modules
- Strict mode enabled (all strict flags on)
- **Must use `.js` extensions in imports** (ESM requirement)
- Type-safe with Zod validation everywhere

### File I/O
- All persistence via `fs.promises` (async)
- JSONL format for journal (line-by-line append)
- Strict file descriptor management (see v1.1 fixes for leak prevention)
- Use `uuid v4` for ID generation

### Error Handling
- Tool failures don't break the loop - errors become observations
- All async operations wrapped in try-catch
- Errors logged to both journal and io/

### Stateless Core Implementation
- Never store state in memory between iterations
- Always rebuild from journal via `buildContext()` (v1.6+) or `rebuildConversationFromJournal()` (legacy)
- Journal is Single Source of Truth (SSOT)

### Context Composition Implementation (v1.6)
- **ContextBuilder** orchestrates context assembly from multiple sources
- All context sources injected as `system` role messages
- Sources processed in order (sequence matters for LLM perception)
- Path variables `${AGENT_HOME}` and `${CWD}` expanded at runtime
- Generators executed synchronously before LLM invocation
- Default manifest provides zero-config operation

### Session Management (v1.5)
- **Command-based execution**: Synchronous `exec` returns complete output immediately
- **State preservation**: Working directory persists across commands via wrapper scripts
- **File-based storage**: Sessions in `.sessions/` directory (stateless, debuggable)
- **Simple API**: 3 commands (start, exec, end) vs 8 PTY commands in v1.4
- **LLM-optimized**: No timing guesses, no escape sequences, single call per command
- **Process-agnostic**: Supports bash, Python, any shell/REPL

**Deprecated v1.4 PTY Sessions** (experimental):
- PTY-based real-time interaction moved to `delta-sessions-pty` (experimental)
- Use only for interactive TUI apps (vim, htop, tmux) that require PTY
- See `docs/architecture/v1.4-pty-deprecation.md` for details and migration guide

## Adding New Features

### Adding Tool Parameter Type
1. Update `ToolParameterSchema` in `types.ts`
2. Modify injection logic in `executor.ts`
3. Update OpenAI schema conversion in `tool_schema.ts`
4. Add tests in `tests/unit/`

### Adding Lifecycle Hook
1. Define hook type in `hook-executor.ts`
2. Call `executeHook()` at target location
3. Update schema in `types.ts` → `LifecycleHooksSchema`

### Modifying Journal Format
**Danger**: Consider backward compatibility
1. Update event types in `journal-types.ts`
2. Modify read/write logic in `journal.ts`
3. Update rebuild logic in `engine.ts`
4. Migration path needed for existing runs

## Testing Strategy

- **Unit tests** (`tests/unit/`) - Core logic (journal, executor, config)
- **Integration tests** (`tests/integration/`) - End-to-end workflows
- Focus areas: stateless rebuild, parameter injection, hook execution, error recovery, human interaction

When modifying core features:
1. Run relevant test suite first (`npm run test:stateless`, `test:hooks`, etc.)
2. Make changes
3. Run full test suite (`npm test`)
4. Test manually with example agents in `examples/`

## Version Context

Current: **v1.7** (Tool Configuration Simplification)
- v1.0: MVP with basic Think-Act-Observe
- v1.1: Stateless core + journal.jsonl + I/O separation
- v1.2: Human interaction (`ask_human` tool, interactive/async modes)
- v1.2.1: Interactive workspace selection with W001-style naming, `-y` silent mode
- v1.3: Directory structure simplification and `delta init` command
- v1.4: PTY-based sessions (deprecated, moved to experimental)
- v1.5: Command-based simplified sessions (production-ready)
- v1.6: Context composition layer with memory folding and dynamic context
- v1.7: Tool configuration simplification with `exec:` and `shell:` syntax sugar
- v2.0 (planned): Multi-agent orchestration

## Key Documentation Locations

### Core Philosophy
- **Design Philosophy Whitepaper**: `docs/architecture/PHILOSOPHY.md` (complete manifesto)
- **Philosophy Summary**: `docs/PHILOSOPHY_SUMMARY.md` (5-minute overview)
- **Core Principles & Code Mapping**: `docs/architecture/core-principles.md` (philosophy → implementation)

### Getting Started
- **Quick Start**: `docs/QUICKSTART.md` (5-minute tutorial)
- **Getting Started Guide**: `docs/guides/getting-started.md` (comprehensive)
- **Agent Development Guide**: `docs/guides/agent-development.md`

### Architecture Decisions
- **ADR Index**: `docs/decisions/README.md` - Architecture Decision Records
- **ADR-001**: Stateless Core Architecture
- **ADR-002**: Journal Format - JSONL
- **ADR-003**: Two-Mode Human Interaction
- **ADR-004**: POC-First Architecture Validation

### Architecture Specifications
- **v1.1 Stateless Core**: `docs/architecture/v1.1-design.md`
- **v1.2 Human Interaction**: `docs/architecture/v1.2-human-interaction.md`
- **v1.3 Workspace Structure**: `docs/architecture/v1.3-design.md`
- **v1.5 Session Design**: `docs/architecture/v1.5-sessions-simplified.md`
- **v1.6 Context Composition**: `docs/architecture/v1.6-context-composition.md`
- **v1.7 Tool Simplification**: `docs/architecture/v1.7-tool-simplification.md`
- **v1.7 Implementation Plan**: `docs/architecture/v1.7-implementation-plan.md`
- **v1.4 PTY Deprecation**: `docs/architecture/v1.4-pty-deprecation.md`

### Incident Reports & Experiments
- **Index**: `.story/README.md` - Real-world incidents and validation experiments
- **Incident**: 2025-10-09 Journal Corruption (VSCode plugin)
- **Incident**: 2025-10-01 Unix Socket Path Limit
- **Experiment**: 2025-10-01 POC-First Validation (v1.4.2 sessions)

### User Guides
- **Session Management**: `docs/guides/session-management.md`
- **Context Management**: `docs/guides/context-management.md`
- **Lifecycle Hooks**: `docs/guides/hooks.md`

### API References
- **CLI Reference**: `docs/api/cli.md`
- **Configuration Reference**: `docs/api/config.md`
- **delta-sessions CLI**: `docs/api/delta-sessions.md`

### Migration Guides
- **v1.0 → v1.1**: `docs/migration/v1.0-to-v1.1.md`
- **v1.4 → v1.5**: `docs/migration/v1.4-to-v1.5.md` (PTY → Simplified sessions)

## Environment Variables

```bash
OPENAI_API_KEY=<required>
OPENAI_BASE_URL=<optional>  # Custom API endpoint
```

## Example Agents

Located in `examples/` - organized by learning progression:

### Level 1: Basics (Quick Start)
- `1-basics/hello-world/` - ⭐⭐⭐⭐⭐ Entry point, demonstrates Three Pillars (**v1.7** migrated)

### Level 2: Core Features
- `2-core-features/interactive-shell/` - ⭐⭐⭐⭐⭐ **v1.5** Persistent bash sessions (uses session tools, not migrated)
- `2-core-features/python-repl/` - ⭐⭐⭐⭐.5 **v1.5** Python REPL with state preservation (uses session tools, not migrated)
- `2-core-features/memory-folding/` - ⭐⭐⭐⭐⭐ **v1.6 + v1.7** Memory folding with simplified tool syntax ✨ MIGRATED

### Level 3: Advanced (Production-Grade)
- `3-advanced/delta-agent-generator/` - ⭐⭐⭐⭐⭐ AI orchestrating AI with sub-agent architecture (v3.0, uses complex bash scripting)
  - **experience-analyzer** subagent - ⭐⭐⭐⭐⭐ Data analysis with **v1.7** syntax ✨ MIGRATED
- `3-advanced/code-reviewer/` - ⭐⭐⭐⭐⭐ Lifecycle hooks demonstration (**v1.7** migrated) ✨ MIGRATED
- `3-advanced/research-agent/` - ⭐⭐⭐⭐⭐ Context composition for long-running research (**v1.7** migrated) ✨ MIGRATED

**v1.7 Migration Status**: 5/8 examples migrated (40 tools converted, 77% reduction in verbosity)

**Quality Standard**: All examples meet ⭐⭐⭐⭐ (4/5) threshold

## Design Philosophy Reminders

When adding features, always ask:
1. Can this be implemented through external commands? (Everything is a Command)
2. Does this add unnecessary complexity? (Simplicity over features)
3. Does this violate stateless core? (Journal is SSOT)
4. Can agents discover this through CWD? (Environment as Interface)

**Project emphasis**: Simplicity and Unix philosophy over feature completeness.

---

## Maintaining CLAUDE.md Accuracy

**Problem**: Documentation can drift from implementation (e.g., LATEST file implementation details).

**Solutions**:

### 1. Source-of-Truth References (✅ Recommended)
When documenting implementation details, always link to the source code:
```markdown
# ✅ Good: Points to source of truth
Check run status (see context.ts:183 for LATEST file implementation)

# ❌ Bad: Can become stale
LATEST is a symlink to the latest run
```

### 2. Focus on Stable Interfaces
Document **what** (API contracts) over **how** (implementation):
```markdown
# ✅ Stable: Interface-level
.delta/LATEST contains the latest run ID

# ❌ Fragile: Implementation-level
LATEST is created via fs.writeFile() with utf-8 encoding
```

### 3. Verification Commands
When adding debug commands, test them first:
```bash
# Before documenting, run:
npm run build
node dist/index.js run --agent examples/hello-world --task "test" --work-dir /tmp/test
# Then verify the debug command works
```

### 4. Update Checklist for Code Changes
When modifying core behaviors, check if CLAUDE.md needs updates:
- [ ] Changed `.delta/` directory structure? → Update "Control Plane Structure"
- [ ] Modified journal events? → Update "Journal Event Types"
- [ ] Added/removed CLI commands? → Update "Build and Test Commands"
- [ ] Changed file formats (LATEST, metadata.json)? → Update "Quick Debug Commands"

### 5. Use Dynamic References
Instead of hardcoding file paths, use pattern references:
```markdown
# ✅ Pattern-based (resilient)
.delta/{run_id}/journal.jsonl

# ❌ Example-based (can confuse)
.delta/20250930_112833_ddbdb0/journal.jsonl
```

---

## Documentation Verification Protocol

> **Critical**: After the `@delta-engine/core` hallucination incident (2025-10-10), all documentation MUST follow strict verification protocols.

### Mandatory Pre-Flight Checks

Before writing ANY documentation containing factual claims, you MUST:

**1. Package Names & npm Commands**
```bash
# ✅ ALWAYS read package.json first
cat package.json | grep '"name"'
# Then use exact name: npm install -g delta-engine
```

**2. File & Directory Paths**
```bash
# ✅ ALWAYS verify paths exist
ls -la examples/1-basics/hello-world/
# Then document: examples/1-basics/hello-world
```

**3. Code References**
```bash
# ✅ ALWAYS grep source code
grep -rn "buildContext" src/
# Then reference: src/engine.ts:buildContext()
```

**4. CLI Commands**
```bash
# ✅ ALWAYS test commands
node dist/index.js --help
# Then document verified flags
```

**5. External URLs**
```bash
# ✅ ALWAYS check existing docs or ask user
grep -r "github.com" docs/ README.md
# NEVER invent GitHub URLs
```

### Verification Checklist

**Reference**: `docs/FACT_CHECK.md`
- Comprehensive verification guide for all factual claims
- AI-specific guidance for avoiding hallucinations
- Manual verification commands for each fact type
- Tracking system for known issues

### If Verification Fails

**DO**:
- Mark unverified facts as `[TODO: Verify]`
- Explain what you couldn't verify
- Ask user for confirmation

**DON'T**:
- Make up plausible-sounding values
- Assume based on common patterns (e.g., `@scope/package`)
- Skip verification to "save time"

### Example: Correct Workflow

```markdown
<!-- Task: Document installation -->

<!-- Step 1: Verify package name -->
$ cat package.json | grep '"name"'
"name": "delta-engine"

<!-- Step 2: Write documentation -->
Install the package:
\`\`\`bash
npm install -g delta-engine
\`\`\`

<!-- ✅ Verified before writing -->
```

### Hallucination Incident Log

| Date | Issue | Impact | Fix |
|------|-------|--------|-----|
| 2025-10-10 | Used fictional `@delta-engine/core` | 🔴 Critical - blocked user onboarding | Fixed + added verification protocol |

**Root Cause**: Over-confidence in common patterns (`@scope/package` format) without verification.

**Prevention**: Mandatory pre-flight checks for all factual claims.

### Related Documentation

- **Verification Checklist**: `docs/FACT_CHECK.md` - Complete fact-checking guide
- **Incident Log**: See "Hallucination Incident Log" above
