# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Documentation Language**: All docs must be in English (README.md, CLAUDE.md, docs/, code comments, commits). Localized versions allowed: `README.{lang}.md` (e.g., README.zh-CN.md).

---

## 🔥 Quick Reference

### Essential Commands
```bash
# Build & Test
npm run build                   # TypeScript → dist/
npm test                        # All tests
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests

# Run Agent
delta run --agent <path> --task "Task description"
delta run -i --agent <path> --task "..."  # Interactive mode
delta run -y --agent <path> --task "..."  # Silent mode (auto-create workspace)

# Debug
RUN_ID=$(cat .delta/LATEST)
tail -20 .delta/$RUN_ID/journal.jsonl               # View recent events
cat .delta/$RUN_ID/metadata.json                    # Check run status
ls -lht .delta/$RUN_ID/io/invocations/ | head -5   # View LLM calls

# Sessions (v1.5)
delta-sessions start bash       # Create session
delta-sessions exec <id>        # Execute command (from stdin)
delta-sessions end <id>         # Terminate session
```

### 3 Critical Rules
1. **ESM imports MUST use `.js` extension**: `import { Engine } from './engine.js'` (not `'./engine'`)
2. **Never store state in memory**: Rebuild from journal every iteration (stateless core)
3. **Never open `journal.jsonl` with VSCode plugins**: Use `cat`, `less`, `jq` only

---

## ⚠️ Critical Rules - MUST FOLLOW

### ESM Import Must Include .js Extension
- **Symptom**: Compiles but fails at runtime with "Cannot find module"
- **Solution**: All imports must use `.js`: `import { Engine } from './engine.js'`
- **Why**: TypeScript doesn't validate ESM paths, Node.js runtime requires extension

### File Descriptor Leak
- **Symptom**: "Too many open files" / "EMFILE" after long runs
- **Solution**: Always close file handles in `finally` block
```typescript
const handle = await fs.open(path);
try { /* operations */ } finally { await handle.close(); }
```
- **High-risk areas**: `journal.ts`, `ask-human.ts`

### Journal Format Corruption
- **Symptom**: Resume fails with parse errors; file renamed to `journal.json`
- **Impact**: 🔴 CRITICAL - All state reconstruction fails
- **Prevention**:
  - ❌ DON'T open `journal.jsonl` with VSCode JSONL viewer plugins
  - ✅ DO use `cat`, `less`, `jq` for inspection
  - ✅ Runtime validation in `journal.ts:validateJournalFormat()`
- **See**: `.story/incidents/2025-10-09-journal-corruption.md`

### Stateless Core
- **Never** store state in memory between iterations
- **Always** rebuild from journal via `buildContext()` (v1.6+)
- **Journal is SSOT**: Single Source of Truth

### TypeScript/Node.js
- Target: ES2022, NodeNext modules, strict mode enabled
- Use `fs.promises` for all file I/O (async, never sync)
- Zod validation for all configs and types
- Use `uuid v4` for ID generation

### Error Handling
- Tool failures don't break the loop - errors become observations
- All async operations wrapped in try-catch
- Errors logged to both journal and `io/`

---

## 🏗️ Architecture Essentials

### Three Pillars (Core Philosophy)
1. **Everything is a Command** - All agent capabilities are external CLI programs
2. **Environment as Interface** - Agents interact only through working directory (CWD)
3. **Composition Defines Intelligence** - Complex behaviors emerge from composing simple agents

### Directory Structure
```
<AGENT_HOME>/workspaces/
├── LAST_USED                # Tracks last used workspace
├── W001/                    # Sequential workspace naming
│   └── .delta/
│       ├── VERSION          # Schema version
│       ├── LATEST           # Latest run ID (text file)
│       └── {run_id}/
│           ├── journal.jsonl      # SSOT - Core execution log
│           ├── metadata.json      # Run metadata (status field)
│           ├── engine.log         # Engine process logs
│           ├── io/                # I/O audit logs
│           │   ├── invocations/   # LLM invocation records
│           │   ├── tool_executions/  # Tool execution details
│           │   └── hooks/         # Hook execution records
│           └── interaction/       # Human interaction (async mode)
│               ├── request.json
│               └── response.txt
└── W002/
```

### Key Files
- **engine.ts** - Think-Act-Observe loop, `buildContext()` rebuilds state (MAX_ITERATIONS=30)
- **journal.ts** - JSONL event logging (append-only)
- **executor.ts** - Tool execution (injection modes: argument, stdin, option)
- **ask-human.ts** - Human-in-the-loop (two modes: CLI sync, async file-based)
- **hook-executor.ts** - Lifecycle hooks execution
- **workspace-manager.ts** - Workspace selection/management
- **types.ts** - Zod schemas for all configs
- **context/** - v1.6 context composition (builder.ts, sources/, types.ts)
- **sessions/** - v1.5 session management (manager.ts, executor.ts, storage.ts)

### Run States (metadata.json)
- `RUNNING` - Normal execution
- `WAITING_FOR_INPUT` - Paused for user input
- `COMPLETED` - Task completed successfully
- `FAILED` - Unrecoverable error
- `INTERRUPTED` - External interrupt (Ctrl+C)

### Journal Event Types
- `ENGINE_START`, `THOUGHT`, `ACTION_RESULT`, `ENGINE_END`, `ERROR`

### Tool Parameter Injection Modes
1. **argument** - CLI argument
2. **stdin** - Piped via stdin (max 1 per tool)
3. **option** - Named flag (requires `option_name`)

### v1.7 Simplified Tool Syntax
```yaml
# exec: Direct execution (safest)
- name: list_files
  exec: "ls -F ${directory}"

# shell: For pipes/redirects
- name: count_lines
  shell: "cat ${file} | wc -l"

# stdin parameter
- name: write_file
  exec: "tee ${filename}"
  stdin: content

# :raw modifier (unquoted parameters)
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
```

Use `delta tool expand config.yaml` to see expansion to full format.

### Context Composition (v1.6)
**Default (zero-config)**: system_prompt.md → DELTA.md (if exists) → full journal

**Custom**: Define `context.yaml` with sources:
- `file` - Static file content
- `computed_file` - Dynamic content via generator script (for memory folding, RAG, etc.)
- `journal` - Conversation history (optional `max_iterations` for token efficiency)

See `examples/2-core-features/memory-folding/` for complete example.

### Session Management (v1.5)
- **Command-based execution**: Synchronous, returns complete output immediately
- **State preservation**: CWD persists across commands via wrapper scripts
- **File-based storage**: Sessions in `.sessions/` (stateless, debuggable)
- **Simple API**: 3 commands (start, exec, end) vs 8 PTY commands in v1.4
- **LLM-optimized**: No timing guesses, no escape sequences

---

## 📋 Development Workflows

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
⚠️ **Danger**: Consider backward compatibility
1. Update event types in `journal-types.ts`
2. Modify read/write logic in `journal.ts`
3. Update rebuild logic in `engine.ts`
4. Provide migration path for existing runs

### Testing Workflow
1. Run relevant test suite first (`npm run test:stateless`, `test:hooks`, etc.)
2. Make changes
3. Run full test suite (`npm test`)
4. Test manually with example agents in `examples/`

---

## 🗂️ Reference

### Current Version
**v1.7** - Tool Configuration Simplification (77% verbosity reduction)
- v1.0: MVP with Think-Act-Observe
- v1.1: Stateless core + journal.jsonl
- v1.2: Human-in-the-loop (`ask_human`)
- v1.3: Directory structure simplification
- v1.4: PTY-based sessions (deprecated)
- v1.5: Command-based simplified sessions
- v1.6: Context composition + memory folding
- v1.7: `exec:`/`shell:` syntax sugar
- v2.0 (planned): Multi-agent orchestration

### Documentation Structure
- **Philosophy**: `docs/architecture/philosophy-02-whitepaper.md` (complete), `docs/architecture/philosophy-01-overview.md` (5-min)
- **Getting Started**: `docs/QUICKSTART.md`, `docs/guides/getting-started.md`
- **Architecture Specs**: `docs/architecture/v1.{1-7}-*.md`
- **ADRs**: `docs/decisions/` (001-005)
- **Guides**: `docs/guides/` (agent-development, session-management, context-management, hooks)
- **API**: `docs/api/` (cli.md, config.md, delta-sessions.md)
- **Incidents**: `.story/incidents/` (real-world debugging cases)

### Examples (Learning Progression)
- **Level 1 (Basics)**: `examples/1-basics/hello-world/` (⭐⭐⭐⭐⭐ Entry point, v1.7)
- **Level 2 (Core)**: `interactive-shell/`, `python-repl/`, `memory-folding/` (all ⭐⭐⭐⭐+)
- **Level 3 (Advanced)**: `delta-agent-generator/`, `code-reviewer/`, `research-agent/` (all ⭐⭐⭐⭐⭐)

**v1.7 Migration**: 5/8 examples migrated, 40 tools converted, 77% verbosity reduction

### Environment Variables (v1.8)

**Supported Variables**:
```bash
# Required (choose one naming style)
DELTA_API_KEY=<your-key>              # Recommended (v1.8+)
OPENAI_API_KEY=<your-key>             # Legacy, still supported

# Optional
DELTA_BASE_URL=<custom-endpoint>      # Recommended (v1.8+)
OPENAI_BASE_URL=<custom-endpoint>     # Alternative (v1.8+)
OPENAI_API_URL=<custom-endpoint>      # Legacy, still supported
```

**Loading Priority** (local overrides global):
```
workspace/.env > agent/.env > project root/.env > process.env
```

**How it works**:
1. Delta searches for `.env` files from most local to most global
2. Workspace: `{workDir}/.env` (if exists)
3. Agent: `{agentPath}/.env` (if exists)
4. Project root: Search upward from CWD for `.git` directory, use `.env` if found
5. System: `process.env` (lowest priority)

**Note**: Local variables override global ones. System environment variables (from shell) have lowest priority.

### Design Philosophy Check
When adding features, ask:
1. Can this be implemented through external commands? (Everything is a Command)
2. Does this add unnecessary complexity? (Simplicity over features)
3. Does this violate stateless core? (Journal is SSOT)
4. Can agents discover this through CWD? (Environment as Interface)

**Project emphasis**: Simplicity and Unix philosophy over feature completeness.

---

## 📝 Documentation Quality Standards

### Pre-Flight Verification (MUST DO)
Before documenting anything:
- **Package names**: `cat package.json | grep '"name"'` → Use exact name
- **File paths**: `ls -la <path>` → Verify exists before documenting
- **Code references**: `grep -rn "functionName" src/` → Verify before referencing
- **CLI commands**: Test command first, then document verified flags
- **URLs**: Check existing docs, NEVER invent GitHub URLs

### Documentation Best Practices
1. **Source-of-Truth References**: Link to code instead of duplicating implementation details
2. **Stable Interfaces**: Document **what** (API) not **how** (implementation)
3. **Pattern References**: Use `.delta/{run_id}/` not `.delta/20250930_112833_ddbdb0/`

### CLAUDE.md Maintenance
Update this file when:
- [ ] Directory structure changes → Update "Directory Structure"
- [ ] New journal events → Update "Journal Event Types"
- [ ] CLI commands added/removed → Update "Quick Reference"
- [ ] Critical bugs discovered → Add to "Critical Rules"

**Keep this file under 350 lines** to minimize token usage.
