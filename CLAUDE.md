# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Documentation Language**: All docs must be in English (README.md, CLAUDE.md, docs/, code comments, commits). Localized versions allowed: `README.{lang}.md` (e.g., README.zh-CN.md).

---

## 🚨 CRITICAL CHECKLISTS - READ FIRST

### ⚠️ Before Starting ANY Version Implementation

**Version Iteration Charter (MANDATORY)**

Every version release MUST complete these steps BEFORE writing any code:

- [ ] ✅ **Architecture design doc created**: `docs/architecture/vX.Y-feature-name.md`
  - Complete technical specification
  - Design decisions and rationale
  - API specifications and use cases

- [ ] ✅ **Implementation plan created**: `docs/architecture/vX.Y-implementation-plan.md`
  - Phase breakdown with detailed tasks
  - Risk assessment and mitigation strategies
  - Testing strategy and success criteria
  - Timeline and rollback plan

- [ ] ✅ **Both documents reviewed and approved**
  - Self-review completed
  - Technical accuracy verified

- [ ] 🔴 **If ANY checkbox is unchecked → STOP. Create these documents first.**

**Why This Matters:**
- 🔴 Risk of complete work loss (see `.story/incidents/2025-10-13-v1.8-data-loss.md`)
- 🔴 Days/weeks of effort may be permanently lost without recovery blueprint
- 🔴 Project momentum severely damaged

**Violation Consequences:**
- Implementation work cannot be recovered if lost
- No recovery path if work is interrupted
- Stakeholders cannot review decisions retroactively

---

### 🚨 Before ANY Git Dangerous Operation

**Git Safety Protocol (MANDATORY)**

NEVER execute these commands without ALL steps completed:

**Dangerous Commands:**
- `git checkout HEAD -- .` / `git checkout -- <file>` (discards uncommitted changes)
- `git reset --hard` (discards all uncommitted work)
- `git clean -fd` (deletes untracked files)
- `rm -rf <directory>` (recursive force delete)
- `git push --force` (overwrites remote history)

**Safety Checklist - ALL must be ✅:**

- [ ] ✅ **Explicit user request**: User asked for this operation by exact command name
- [ ] ✅ **Clear necessity**: No safer read-only alternative exists (git status, git diff, git stash)
- [ ] ✅ **Explicit risk warning**: Warned user about specific data loss (which files/changes)
- [ ] ✅ **User confirmation**: Got explicit "yes, proceed" confirmation
- [ ] 🔴 **If ANY checkbox is unchecked → STOP. Do NOT execute the command.**

**Example - WRONG ❌:**
```
User: "I want to check if tests pass without my changes"
Assistant: *silently runs git checkout HEAD -- .*
Result: DISASTER - 100+ files destroyed
```

**Example - RIGHT ✅:**
```
User: "I want to check if tests pass without my changes"
Assistant: "Safe options: 1) git stash, 2) new branch, 3) test current state. Which?"
```

**Incident Reference**: `.story/incidents/2025-10-13-v1.8-data-loss.md` - 100+ files destroyed, entire v1.8.0 work permanently lost.

---

## 🔥 Quick Reference

### Essential Commands
```bash
# Build & Test
npm run build                   # TypeScript → dist/
npm test                        # All tests
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests

# Run Agent (v1.8.1: --agent defaults to current directory)
delta run -m "Task description"                    # Use current dir as agent
delta run --agent <path> -m "..."                  # Or specify agent path
delta run -i -m "..."                              # Interactive mode
delta run -y -m "..."                              # Silent mode (auto-create workspace)

# Continue Existing Run (v1.8: new command)
delta continue --work-dir <path>                    # Resume INTERRUPTED run
delta continue --work-dir <path> -m "Response"      # Respond to WAITING_FOR_INPUT
delta continue --work-dir <path> -m "New task"      # Extend COMPLETED conversation

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

### Version Iteration Charter (MANDATORY)
⚠️ **CRITICAL**: Every version release MUST follow this process

**Before ANY implementation work begins:**
1. **Create Architecture Design Doc**: `docs/architecture/vX.Y-feature-name.md`
   - Complete technical specification
   - Design decisions and rationale
   - API specifications
   - Use cases and examples

2. **Create Implementation Plan**: `docs/architecture/vX.Y-implementation-plan.md`
   - Phase breakdown with detailed tasks
   - Risk assessment and mitigation
   - Testing strategy and success criteria
   - Timeline and rollback plan

**Why This Matters:**
- Documents serve as recovery blueprint if work is lost
- Forces thorough design thinking before coding
- Creates reviewable specification for stakeholders
- Enables parallel work and handoffs
- Prevents "lost work disasters"

**Violation Consequences:**
- Loss of implementation work cannot be recovered
- Days/weeks of effort may be permanently lost
- Project momentum severely damaged

**Incident Reference**: See `.story/incidents/2025-10-13-v1.8-data-loss.md` - Complete incident report of catastrophic data loss (100+ files) due to unnecessary `git checkout HEAD -- .`. **This charter exists because of that disaster.**

### Git Dangerous Operations Charter (CRITICAL SAFETY)
🚨 **EXTREME CAUTION**: These commands cause irreversible data loss

**Dangerous Commands** (require explicit user request + multi-step confirmation):
- `git checkout HEAD -- .` / `git checkout -- <file>` (discards uncommitted changes)
- `git reset --hard` (discards all uncommitted work)
- `git clean -fd` (deletes untracked files)
- `rm -rf <directory>` (recursive force delete)
- `git push --force` (overwrites remote history)

**Safety Protocol - MUST follow ALL steps:**
1. ✅ **Explicit User Request**: User must ask for the dangerous operation by exact command name
2. ✅ **Clear Necessity**: No safer read-only alternative exists
3. ✅ **Explicit Risk Warning**: Warn user about specific data loss (which files/changes will be lost)
4. ✅ **User Confirmation**: Get explicit "yes, proceed" confirmation
5. ✅ **Never Assume**: Never execute based on implied intent

**NEVER execute these commands if:**
- ❌ User did not explicitly request by name
- ❌ You're trying to "verify" or "test" something
- ❌ There's a safer read-only alternative (use `git status`, `git diff`, `git stash`)
- ❌ Working on implementing new features (uncommitted work exists)
- ❌ User said "check if..." or "see if..." (implies exploration, not destruction)

**Example - WRONG ❌:**
```
User: "I want to check if tests pass without my changes"
Assistant: *silently runs git checkout HEAD -- .*
Result: DISASTER - 100+ files of work destroyed
```

**Example - RIGHT ✅:**
```
User: "I want to check if tests pass without my changes"
Assistant: "I can help you test. Here are safe options:
  1. git stash (saves your changes, reversible)
  2. Create new branch and test there
  3. Run tests on the current state with your changes
  Which approach do you prefer?"
```

**If Accidentally Executed:**
1. STOP immediately
2. Inform user of data loss
3. Check if recovery possible (git reflog, IDE history, file system recovery)
4. Document incident in `.story/incidents/`

**Incident Reference**: See `.story/incidents/2025-10-13-v1.8-data-loss.md` - Complete incident report. 100+ files destroyed by unnecessary `git checkout HEAD -- .` executed without user request or necessity. Entire v1.8.0 implementation work permanently lost.

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

### Context Composition (v1.6, v1.9.1 update)
**Required**: `context.yaml` (v1.9.1+) defines the explicit recipe for constructing the agent's attention window.

**Default template** (created by `delta init`):
- `system_prompt.md` → DELTA.md (if exists) → full journal

**Custom**: Define `context.yaml` with sources:
- `file` - Static file content
- `computed_file` - Dynamic content via generator script (for memory folding, RAG, etc.)
- `journal` - Conversation history (optional `max_iterations` for token efficiency)

**Note**: In v1.9.1+, context.yaml is **required** (no implicit fallback). This ensures complete transparency and eliminates "magic" defaults.

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

---

## 🧪 Testing & Release Protocol

### CRITICAL: Testing Checklist

**⚠️ BEFORE saying "tests passed", you MUST:**

- [ ] Run `npm run test:all` and verify ALL pass:
  - Unit tests (330 tests)
  - Integration tests (15 tests)
  - E2E tests (6 core journeys minimum)

**NEVER say "tests passed" after only running `npm test` (which skips E2E).**

### Test Commands (Quick Reference)

```bash
# Complete test suite (required before release)
npm run test:all              # Unit + Integration + E2E (DEFINITIVE)
npm run test:pre-release      # Build + All Tests (use before releasing)

# Individual test suites
npm run test:unit             # 330 unit tests (fast, ~10s)
npm run test:integration      # 15 integration tests (~20s)
npm run test:e2e              # E2E tests (~45s)
npm run test:e2e -- --core    # Only core 6 E2E tests (P0+P1)

# Development
npm run test:quick            # Alias for test:unit (fast feedback)
npm run test:watch            # Watch mode for TDD
npm test                      # Unit + Integration only (⚠️ skips E2E)

# Specific integration tests
npm run test:stateless        # Stateless core test
npm run test:hooks            # Lifecycle hooks test
npm run test:io               # I/O audit test
```

### Test Architecture (3-Layer Pyramid)

```
        E2E Tests (6 core journeys)
       ─────────────────────────────
      Integration Tests (15 scenarios)
     ─────────────────────────────────────
    Unit Tests (330 tests, core modules)
   ───────────────────────────────────────────
```

**Test Strategy**:
- **Unit**: Module-level logic, fast feedback
- **Integration**: Component interactions, realistic scenarios
- **E2E**: Complete user journeys, validates actual workflows

**Documentation**: See `tests/TESTING_STRATEGY.md` for complete strategy.

### Release Checklist (MANDATORY)

**🔴 DO NOT RELEASE without completing `RELEASE_CHECKLIST.md`**

Before ANY release:
1. **Read**: `RELEASE_CHECKLIST.md` (in project root)
2. **Complete**: Every checkbox in the checklist
3. **Verify**: `npm run test:pre-release` passes
4. **Confirm**: All documentation updated

**The checklist includes**:
- ✅ All test suites passing
- ✅ Build successful
- ✅ Documentation synchronized
- ✅ Version bumped correctly
- ✅ Manual smoke tests
- ✅ Breaking change validation (if applicable)

**No shortcuts. No exceptions.**

### Testing Quality Standards

**Rules**:
- Tests must be independent (no shared state)
- Tests must be deterministic (no flaky tests)
- Test failures must provide clear error messages
- NEVER comment out failing tests

**Coverage Requirements**:
- Core modules (engine, journal, executor): ≥80%
- Support modules (context, config): ≥70%
- Overall: ≥60% (CLI/LLM covered by integration tests)

**Documentation**: See `docs/testing/TEST_QUALITY_STANDARDS.md`

### Development Testing Workflow

1. **Before coding**: Run relevant test suite
   ```bash
   npm run test:unit  # or specific: npm run test:hooks
   ```

2. **After changes**: Run impacted tests
   ```bash
   npm run test:quick  # Fast unit test feedback
   ```

3. **Before commit**: Run full test suite
   ```bash
   npm run test:all    # Ensure nothing broke
   ```

4. **Before PR/Release**: Complete validation
   ```bash
   npm run test:pre-release  # Build + All Tests
   ```

5. **Manual validation**: Test with examples
   ```bash
   cd examples/1-basics/hello-world
   delta run -m "Test message"
   ```

### Release Process Summary

1. **Complete** `RELEASE_CHECKLIST.md` (all checkboxes)
2. **Run** `npm run test:pre-release` (must pass)
3. **Update** version in `package.json`
4. **Commit** with conventional commits format
5. **Tag** with `git tag -a vX.Y.Z`
6. **Push** `git push origin main && git push origin vX.Y.Z`

**Detailed Process**: See `docs/testing/RELEASE_PROCESS.md`

---

## 🗂️ Reference

### Current Version
**v1.9.1** - context.yaml Required (Breaking Change)
- v1.0: MVP with Think-Act-Observe
- v1.1: Stateless core + journal.jsonl
- v1.2: Human-in-the-loop (`ask_human`)
- v1.3: Directory structure simplification
- v1.4: PTY-based sessions (deprecated)
- v1.5: Command-based simplified sessions
- v1.6: Context composition + memory folding
- v1.7: `exec:`/`shell:` syntax sugar
- v1.8: CLI improvements (`-m` flag, `delta continue` command)
- v1.9: Unified agent structure (agent.yaml, hooks.yaml, imports mechanism)
- v1.9.1: **Breaking** - context.yaml now required (eliminates implicit defaults)
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
