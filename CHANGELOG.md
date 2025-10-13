# Changelog

All notable changes to Delta Engine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Unified CLI API Improvements (v1.8)

**Breaking Change: Simplified and semantic CLI interface:**

- **Parameter Rename: `--task` → `-m/--message`**
  - **Breaking**: `--task` flag removed, replaced with `-m/--message`
  - **Rationale**: Semantic clarity - "message" is more accurate for conversational agents
  - **Impact**: All `delta run` commands must update to use `-m` or `--message`
  - **Before**: `delta run --agent <path> --task "Do something"`
  - **After**: `delta run --agent <path> -m "Do something"`

- **New Command: `delta continue`**
  - Resume or extend existing runs with smart state machine logic
  - Automatically detects run status and applies appropriate behavior:
    - **INTERRUPTED**: Resume with optional message (graceful continuation)
    - **WAITING_FOR_INPUT**: Require message, write to `response.txt` (async human-in-the-loop)
    - **COMPLETED**: Require message to extend conversation (continue after success)
    - **FAILED**: Require message to retry with new context (recovery workflow)
    - **RUNNING**: Error (prevent concurrent execution)
  - Syntax: `delta continue --work-dir <path> [-m "Message"]`
  - Enables explicit conversation continuation vs implicit auto-resume

- **Backward Compatibility**:
  - `delta run` auto-resume behavior preserved for INTERRUPTED/WAITING_FOR_INPUT states
  - No changes to existing workspace structure or journal format
  - New `checkForAnyRun()` function for detecting runs in any state
  - Extended `resumeContext()` with optional `userMessage` parameter for message injection

### Changed - CLI Architecture Improvements (v1.8)

**Code quality and maintainability enhancements:**

- **New Helper Functions**:
  - `runEngineWithLogging()` - Extracted engine execution logic (reduces duplication)
  - `checkForAnyRun()` - Detects runs in ANY status (vs `checkForResumableRun()` limited to specific states)

- **State Machine Implementation**:
  - Explicit state handling in `handleContinueCommand()`
  - Clear error messages for invalid state transitions
  - User guidance for required parameters per state

- **Modified Files**:
  - `src/cli.ts` - Added continue command, refactored run command (~200 lines added)
  - `src/context.ts` - Added `checkForAnyRun()`, extended `resumeContext()` signature
  - All test files updated to use `-m` flag (9 E2E tests)
  - All example READMEs updated (12 files)
  - All documentation updated (20+ files)
  - Templates and configs updated (5 files)

### Documentation - Comprehensive Updates (v1.8)

**Documentation reflects new CLI interface:**

- **Updated References**:
  - CLAUDE.md - Quick reference with `delta continue` examples
  - README.md, README.zh-CN.md - Updated quick start
  - All guides updated: getting-started.md, session-management.md, agent-development.md
  - API docs updated: cli.md, config.md
  - Example READMEs updated (12 files)

- **Architecture Documentation**:
  - `docs/architecture/v1.8-unified-cli-api.md` - Complete design specification
  - `docs/architecture/v1.8-implementation-plan.md` - Implementation roadmap
  - `.story/incidents/2025-10-13-v1.8-data-loss.md` - Data loss incident report

- **Safety Charters Added to CLAUDE.md**:
  - Version Iteration Charter - Mandatory docs-first approach
  - Git Dangerous Operations Charter - Prevents data loss disasters

### Breaking Changes

**Migration Required for All Users:**

1. **Update all `delta run` commands**:
   ```bash
   # OLD (v1.7 and earlier)
   delta run --agent my-agent --task "Task description"

   # NEW (v1.8+)
   delta run --agent my-agent -m "Task description"
   ```

2. **Update scripts and automation**:
   - Replace `--task` with `-m` or `--message` in all invocations
   - No changes needed to config.yaml or agent files

3. **Use `delta continue` for explicit continuation**:
   - Replaces manual editing of response.txt for completed/failed runs
   - State-aware continuation vs blanket auto-resume

### Added - Tool Configuration Simplification (v1.7)

**Major feature: 77% reduction in tool configuration verbosity:**

- **New Simplified Syntax:**
  - `exec:` mode - Direct execution using execvp() for maximum safety
  - `shell:` mode - Shell execution with safe parameter passing via argv
  - Placeholder syntax: `${param}` for automatic quoting, `${param:raw}` for unquoted
  - stdin parameter: `stdin: content` for data piping

- **77% Configuration Reduction:**
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

- **Security-First Design:**
  - **exec: mode** rejects ALL shell metacharacters (`|`, `>`, `<`, `&`, `;`, etc.)
  - **shell: mode** uses POSIX argv-based parameterization (no string interpolation)
  - Automatic quoting: `${param}` → `"$1"` prevents command injection
  - :raw modifier available for expert use (`${flags:raw}`)

- **Parameter Intelligence:**
  - Automatic parameter inference from template placeholders
  - Three injection modes: `argument` (default), `stdin`, `option` (legacy)
  - Parameter type inference defaults to `string`
  - Position tracking for multi-parameter tools

- **Backward Compatibility:**
  - Legacy `command:` syntax 100% preserved
  - Mixed syntax supported in same config file
  - Automatic mode detection with clear error messages
  - Existing agents continue to work without changes

- **New CLI Command:**
  - `delta tool:expand <config-path>` - Shows how syntax sugar is expanded
  - Displays internal ToolDefinition format for transparency
  - Useful for debugging and understanding security guarantees

- **Example Tools:**
  ```yaml
  # exec: mode - Direct execution (safest)
  - name: list_files
    exec: "ls -F ${directory}"

  # shell: mode - Pipes and redirection
  - name: count_lines
    shell: "cat ${file} | wc -l"

  # stdin parameter - Data piping
  - name: write_file
    exec: "tee ${filename}"
    stdin: content

  # :raw modifier - Unquoted arguments (expert)
  - name: run_docker
    shell: "docker run ${flags:raw} ${image}"
  ```

- **Implementation Details:**
  - **ToolExpander** module (`src/tool-expander.ts`, ~470 lines) handles syntax expansion
  - Configuration-time expansion (before Zod validation)
  - Shell placeholder protection prevents variable expansion issues
  - Comprehensive test suite (20 tests) covering security scenarios

- **New Files:**
  - `src/tool-expander.ts` - Core expansion logic with security validation
  - `src/commands/tool-expand.ts` - CLI command implementation
  - `tests/unit/tool-expander.test.ts` - Comprehensive test suite
  - `docs/decisions/005-tool-syntax-simplification.md` - Architecture Decision Record
  - `examples/1-basics/tool-syntax/` - Complete demonstration of all features

- **Modified Files:**
  - `src/types.ts` - Added v1.7 schemas and detection utilities
  - `src/config.ts` - Integration with config loading pipeline
  - `src/cli.ts` - Command registration
  - Updated documentation and guides

- **Testing & Validation:**
  - 20/20 tool-expander unit tests passing ✅
  - 6/6 v1.7 integration tests passing ✅
  - 8/8 v1.7 E2E tests passing ✅
  - 5 critical security tests preventing command injection ✅
  - Manual CLI testing completed ✅
  - Example agent validated (8/8 tools expanding correctly) ✅

- **Performance Impact:**
  - Config loading overhead: ~10ms per tool (negligible)
  - Runtime performance: No impact (expansion at config load time)
  - Memory usage: Minimal (~1KB per expanded tool)

### Migrated - Examples and Templates to v1.7 Syntax

**Comprehensive migration of existing codebase to simplified syntax:**

- **Examples Migration (5/8 strategically selected):**
  - ✅ **hello-world** (Level 1) - 5 tools → v1.7 exec: syntax
  - ✅ **memory-folding** (Level 2) - 3 tools → v1.7 exec: syntax
  - ✅ **research-agent** (Level 3) - 4 tools → v1.7 exec:/shell: syntax, 1 legacy
  - ✅ **code-reviewer** (Level 3) - 6 tools → v1.7 exec: syntax
  - ✅ **experience-analyzer** (subagent) - 4 tools → v1.7 exec:/shell:, 1 legacy
  - ⏭️ **delta-agent-generator** - Kept legacy (complex bash scripting)
  - ⏭️ **interactive-shell, python-repl** - Skipped (use session tools)

- **Templates Migration (4/4 complete):**
  - ✅ **minimal** - 2 tools → v1.7 exec: syntax
  - ✅ **hello-world** - 5 tools → v1.7 exec: syntax
  - ✅ **file-ops** - 7 tools → v1.7 exec: syntax
  - ✅ **api-tester** - 5 tools → v1.7 exec:, 2 kept legacy (option injection)

- **Migration Statistics:**
  - **40 tools** migrated to v1.7 syntax (91% adoption rate)
  - **4 tools** kept in legacy format (complex features: option_name, variable expansion)
  - **~270 lines** of configuration removed (60% reduction)
  - **5 config backup files** created (*.yaml.v1.6.backup)

- **E2E Test Suite Created:**
  - `tests/e2e/v1.7-examples-validation.test.ts` - 8 comprehensive scenarios
  - Tests real user workflows: file operations, pipelines, lifecycle hooks, templates
  - All 8/8 scenarios passing with real CLI execution
  - Validates security (injection prevention), functionality, and backward compatibility

- **Documentation Updates:**
  - `CLAUDE.md` - Updated example agents section with v1.7 migration status
  - `V1.7-MIGRATION-COMPLETE.md` - Comprehensive migration report
  - Migration decisions documented (what we migrated, what we kept, why)

### Changed - Examples Structure and Improvements

**Restructured examples into 3-tier learning path:**

- **Examples Reorganization:**
  - Moved examples into 3 directories: `1-basics/`, `2-core-features/`, `3-advanced/`
  - Updated all documentation to reflect new structure
  - Removed outdated examples (api-tester, doc-generator, file-organizer, git-analyzer, test-runner)
  - Archive directory (`.archive/`) removed

- **New Advanced Examples:**
  - **code-reviewer** - Demonstrates lifecycle hooks with complete audit trail (pre_llm_req, post_tool_exec)
  - **research-agent** - Demonstrates v1.6 context composition with memory folding for long-running research tasks

- **Model Standardization:**
  - Updated all 8 examples to use `gpt-5-mini` model
  - Consistent model configuration across all examples
  - Examples: hello-world, interactive-shell, memory-folding, python-repl, code-reviewer, delta-agent-generator (including experience-analyzer sub-agent), research-agent

- **Documentation Improvements:**
  - Enhanced README files with progressive examples (Simple → Medium → Complex)
  - Removed unnecessary CLI parameters (`--work-dir`, `-y`) from examples
  - Updated all cross-references to use new example paths
  - Added comprehensive troubleshooting sections

- **Quality Standards:**
  - All 7 active examples meet ⭐⭐⭐⭐+ quality standard
  - Average quality: 4.76/5
  - Complete learning path from basics to production patterns

---

## [1.6.0] - 2025-10-08

### Added - Context Composition Layer

**New declarative system for building LLM context from multiple sources:**

- **Core Concept:**
  - Replaces hardcoded context construction with flexible, composable sources
  - Context defined via `context.yaml` manifest (or `DEFAULT_MANIFEST` when absent)
  - Three source types: `file`, `computed_file`, `journal`
  - Variable substitution support: `${AGENT_HOME}`, `${CWD}`, `${RUN_ID}`

- **Source Types:**

  1. **File Sources** (`type: file`):
     - Static file content (e.g., `system_prompt.md`, `DELTA.md`)
     - Path with variable substitution
     - `on_missing` behavior: `error` (default) or `skip`
     - Optional `id` for source identification

  2. **Computed File Sources** (`type: computed_file`):
     - Dynamic content generation via external commands
     - Generator command executed at context build time
     - Timeout support (default: 30s)
     - Output written to `output_path`, then read as content
     - Use cases: memory summarization, metrics collection, dynamic documentation

  3. **Journal Sources** (`type: journal`):
     - Reconstructs conversation history from journal events
     - Returns OpenAI-format messages (user, assistant, tool)
     - `max_iterations` parameter to limit conversation history (undefined = unlimited)
     - Processes USER_MESSAGE, THOUGHT, ACTION_RESULT events
     - Skips SYSTEM_MESSAGE and other non-conversational events

- **Default Manifest (Zero-Config):**
  ```yaml
  sources:
    - type: file
      id: system_prompt
      path: ${AGENT_HOME}/system_prompt.md
      on_missing: error

    - type: file
      id: workspace_guide
      path: ${CWD}/DELTA.md
      on_missing: skip

    - type: journal
      id: conversation_history
      # max_iterations: undefined (unlimited - rebuild all)
  ```

- **Context Builder API:**
  - `ContextBuilder` class orchestrates source processing
  - Processes sources sequentially, combines results
  - Variable substitution: `AGENT_HOME`, `CWD`, `RUN_ID`
  - Type-safe with Zod schemas for all configs
  - Exported processors for testing: `processFileSource`, `processComputedFileSource`, `processJournalSource`

- **New Files:**
  - `src/context/builder.ts` - Main orchestration logic
  - `src/context/types.ts` - Schemas and DEFAULT_MANIFEST
  - `src/context/sources/file-source.ts` - Static file processor
  - `src/context/sources/computed-source.ts` - Dynamic generator processor
  - `src/context/sources/journal-source.ts` - Conversation reconstructor
  - `src/context/index.ts` - Public API exports

- **Documentation:**
  - `docs/architecture/v1.6-context-composition.md` - Technical design document
  - `docs/guides/context-management.md` - User guide with examples
  - `docs/implementation/v1.6-context-layer.md` - Implementation details

- **Example Use Cases:**
  - **Memory Folding**: `computed_file` generators that summarize long conversations
  - **Dynamic Context**: Real-time metrics, current time, environment info
  - **Token Budget Control**: `journal` source with `max_iterations` to limit history
  - **Custom System Prompts**: Different prompts per workspace via DELTA.md

### Fixed - Initial Task Placement Bug

**Critical bug in conversation history reconstruction:**

- **Problem:**
  - Initial task was added AFTER conversation history (when journal source exists)
  - LLM interpreted initial task as a repeated instruction at each iteration
  - Example: "Create 5 files" agent created 30 files instead of stopping at 5

- **Root Causes:**
  1. Initial task was NOT recorded in journal.jsonl
  2. Engine had dual logic: journal source path + fallback path (architectural flaw)
  3. Initial task treated specially instead of as first user message

- **Design Philosophy Clarification:**
  - "Initial task 也是 journal 的一部分，而且是开始的部分" (Initial task is part of journal, at the beginning)
  - "不存在没有 journal source 的情况，只有缺省 journal source" (Journal source ALWAYS exists, just defaults to unlimited)
  - "永远只有重建 journal source 的逻辑" (Always only ONE rebuild logic through journal source)
  - No special treatment for initial task - it's just the first user message

- **Solution:**
  - Added `USER_MESSAGE` event type to journal schema
  - Record initial task as `USER_MESSAGE` at journal start (seq 2, after RUN_START)
  - Journal source processor handles `USER_MESSAGE` → OpenAI user message
  - Updated `DEFAULT_MANIFEST` to ALWAYS include journal source (unlimited by default)
  - Removed all fallback logic from engine (single rebuild path)

### Changed - Engine Context Building

**Simplified engine architecture with Context Composition Layer:**

- **Before (v1.5):**
  - Hardcoded context construction in `rebuildConversationFromJournal()`
  - System prompt injected manually in engine
  - Dual logic for journal source presence vs absence
  - Initial task added separately from conversation
  - ~60 lines of complex logic

- **After (v1.6):**
  - Delegates all context building to `ContextBuilder`
  - Engine calls `buildContext()` which returns complete message array
  - Single rebuild path through journal source (always present)
  - Initial task is first USER_MESSAGE in journal
  - ~15 lines of simple delegation

- **Architectural Benefits:**
  - ✅ Eliminated dual rebuild logic
  - ✅ Single source of truth: `ContextBuilder` + `DEFAULT_MANIFEST`
  - ✅ Initial task correctly placed at conversation start
  - ✅ Simplified engine.ts (removed 45+ lines)
  - ✅ Better separation of concerns

### Added - Journal Event Type

**New USER_MESSAGE event for recording user messages:**

- `USER_MESSAGE` event type in journal schema
- `UserMessagePayloadSchema`: `{ content: string }`
- `journal.logUserMessage(content)` method
- Recorded at journal start (seq 2, after RUN_START)
- Processed by journal source into OpenAI user messages

### Technical Implementation

- **Modified Files:**
  - `src/journal-types.ts` - Added USER_MESSAGE event type
  - `src/journal.ts` - Added logUserMessage() method
  - `src/engine.ts` - Replaced rebuildConversationFromJournal() with buildContext()
  - `docs/guides/agent-development.md` - Updated with context.yaml examples

- **New Tests:**
  - `tests/unit/context/types.test.ts` - Schema validation tests
  - `tests/unit/context/sources/file-source.test.ts` - File source processing
  - `tests/unit/context/sources/computed-source.test.ts` - Generator execution
  - `tests/unit/context/sources/journal-source.test.ts` - Conversation reconstruction
  - All tests passing ✅

- **Verification:**
  - Memory-folding example creates exactly 5 files (not 30) ✅
  - Journal structure: USER_MESSAGE at seq 2 ✅
  - Conversation order: user → assistant → tool → ... ✅

### Breaking Changes

None. This is backward compatible:
- Agents without `context.yaml` use `DEFAULT_MANIFEST` (same behavior as v1.5)
- Existing journal files work unchanged
- New USER_MESSAGE events added automatically for new runs

### Documentation Updates

- Added Context Composition Layer architecture docs
- Updated CLAUDE.md with v1.6 context management
- Moved v1.5 docs to `docs/implementation/` directory
- Updated agent development guide with context.yaml examples

---

## [1.4.3] - 2025-10-02

### Improved - CLI Output Visibility

**Enhanced iteration output with detailed information:**

- **LLM Thinking Display:**
  - Show LLM reasoning content when present (💭 prefix)
  - Multi-line content automatically indented for readability
  - Helps users understand agent's decision-making process

- **Tool Parameter Display:**
  - Show actual parameters passed to tools: `tool_name(param1="value", param2=123)`
  - Long string values truncated to 40 characters with "..." suffix
  - Makes it immediately clear what the agent is doing

- **Output Preview:**
  - Display first 80 characters of tool output
  - Show total character count: `(120 chars, exit 0)`
  - Clean ANSI escape codes and compress whitespace
  - Users can quickly see results without checking journal

- **Before:** `→ Executing: shell_read` / `✓ Success (exit code: 0)`
- **After:** `→ shell_read(session_id="sess_abc", timeout_ms=1000)` / `✓ Output: "pwd\n/tmp/test\nbash-3.2$" (45 chars, exit 0)`

### Technical Changes

- Added `formatOutputPreview()` method in `engine.ts` for output summarization
- Modified tool execution display logic (engine.ts:480, 658-665)
- Added LLM content display after thought logging (engine.ts:436-441)

## [1.4.2] - 2025-10-01

### Changed - Session Management Architecture

**Migrated from GNU Screen to Unix Domain Sockets:**

- **Architecture Improvements:**
  - Replaced screen-based implementation with Unix Socket + node-pty architecture
  - Each session now runs in its own detached holder process (no centralized daemon)
  - Direct socket communication between CLI and holder processes
  - Better cross-process session access support
  - Simpler and more reliable implementation

- **Key Technical Changes:**
  - Added `holder.ts` - Standalone detached process that manages PTY and socket server
  - Added `socket-utils.ts` - Socket communication utilities (stale detection, cleanup)
  - Added `Session.reconnect()` - Support for connecting to sessions from different processes
  - Removed GNU Screen dependency entirely
  - Added stale socket detection and cleanup

- **New Features:**
  - Sessions now persist across CLI process exits (holder process stays alive)
  - Multiple CLI processes can connect to the same session
  - Automatic cleanup of dead sessions via `cleanup` command
  - Better error handling for holder process crashes

- **Implementation Details:**
  - Holder process spawned with `detached: true` and `unref()`
  - JSON protocol over Unix Socket for IPC
  - 100KB output buffer per session
  - Socket path: `<sessions_dir>/<session_id>/session.sock`
  - Metadata includes both PTY PID and holder PID

- **Validation:**
  - Comprehensive POC testing in `investigation/` directory
  - 9 validation tests covering robustness scenarios
  - Manual testing of all CLI commands
  - Integration tests for persistence and cross-process communication

### Breaking Changes

None. All CLI commands remain the same. This is an internal architecture change only.

---

## [1.4.0] - 2025-10-01

### Added - Session Management

**New `delta-sessions` CLI tool for persistent PTY interactions:**

- **Core Features:**
  - Manage persistent, stateful command-line sessions (bash, Python, psql, ssh, etc.)
  - Real PTY (pseudo-terminal) support via node-pty
  - Process-agnostic design - support ANY interactive CLI program
  - Sessions stored in `~/.sessions/`, separate from `.delta/`
  - Non-persistent by design (sessions don't survive process restarts)

- **8 CLI Commands:**
  - `start <command> [args...]` - Start new session
  - `write <session_id>` - Send input (from stdin)
  - `write-key <session_id> <key>` - Send semantic keyboard keys
  - `read <session_id> [options]` - Read output (with timeout, wait, follow, lines modes)
  - `end <session_id>` - Terminate session
  - `list` - List all sessions
  - `status <session_id>` - Check session health
  - `cleanup` - Remove dead sessions

- **Read/Write Separation:**
  - Asynchronous interaction patterns (write → wait → read)
  - Multiple read modes: immediate, timeout, wait, follow (streaming), limited lines
  - Prompt detection for automatic completion (shell, Python, psql prompts)

- **Dual Interface:**
  - `write-key` command for semantic clarity (50+ supported keys: arrows, ctrl+c, function keys, etc.)
  - `write` command with escape sequence support (`\n`, `\t`, `\xNN`, `\uNNNN`)
  - Balance between LLM capability and journal readability

- **Session Features:**
  - I/O buffering (1MB in-memory)
  - Output/input logging (`output.log`, `input.log`)
  - Dead session detection
  - Lazy cleanup strategy (manual control)
  - Metadata persistence (JSON)

- **New Example Agents:**
  - `examples/2-core-features/interactive-shell/` - Persistent bash shell with multi-command execution
  - `examples/2-core-features/python-repl/` - Python REPL with multi-line code, state persistence, error handling

- **Comprehensive Documentation:**
  - `docs/guides/session-management.md` - 500+ line user guide with patterns and troubleshooting
  - `docs/api/delta-sessions.md` - Complete CLI reference with examples
  - `docs/architecture/v1.4-sessions-design.md` - Technical design document
  - Updated README.md and CLAUDE.md

- **Testing:**
  - Unit tests for escape parser, storage, key codes
  - Integration tests for full workflow

### Technical Implementation

- **New Source Files:**
  - `src/sessions/session.ts` - Core Session class (PTY process, I/O handling)
  - `src/sessions/manager.ts` - SessionManager API (CRUD operations)
  - `src/sessions/storage.ts` - Metadata persistence
  - `src/sessions/key-codes.ts` - 50+ semantic key mappings
  - `src/sessions/escape-parser.ts` - Escape sequence parsing
  - `src/sessions/types.ts` - Type definitions and Zod schemas
  - `src/sessions-cli.ts` - CLI entry point (8 commands)

- **New Dependencies:**
  - `node-pty@^1.0.0` - PTY (pseudo-terminal) support
  - `@types/node-pty` (dev) - TypeScript definitions

- **Key Design Decisions:**
  - Separation of concerns: sessions completely independent from engine core
  - "Everything is a Command" principle maintained
  - Stateless engine core preserved (sessions managed externally)
  - Process-agnostic: no hardcoded session types
  - Lazy cleanup: no automatic session termination

### Breaking Changes

None. This is an additive feature. Existing agents work unchanged.

---

## [1.3.0] - 2025-09-30

### Added
- **`delta init` Command** - Initialize new agents from built-in templates
  - 4 templates: minimal, hello-world, file-ops, api-tester
  - Interactive template selection by default
  - `-y` flag for silent mode (uses minimal template)
  - `-t <template>` flag to specify template directly
  - Empty directory validation (allows empty, rejects non-empty)
  - Automatic agent name substitution in config

### Improved
- **Interactive Mode Resume for `ask_human`** - Enhanced human-in-the-loop workflow
  - Resume paused runs with `-i` flag to provide input directly in terminal
  - No need to manually edit `response.txt` file
  - Automatically cleans up interaction directory after response
  - Seamless transition from async mode to interactive mode

### Changed - Directory Structure Simplification

**Major refactoring for better UX and maintainability:**

- **Directories Renamed:**
  - `work_runs/` → `workspaces/` (semantic clarity)
  - `runtime_io/` → `io/` (shorter, context-implicit)

- **Metadata Files Renamed:**
  - `.last_workspace` → `LAST_USED` (consistent with LATEST/VERSION)
  - `schema_version.txt` → `VERSION` (Unix-style, no extension)

- **Directory Structure Simplified:**
  - Removed `runs/` directory (unnecessary nesting: `.delta/runs/{id}` → `.delta/{id}`)
  - Removed `execution/` directory (files moved to run root)
  - Removed `configuration/` directory (unused config snapshots)

**New Structure:**
```
workspaces/
├── LAST_USED
└── W001/
    └── .delta/
        ├── VERSION
        ├── LATEST
        └── {run_id}/
            ├── journal.jsonl
            ├── metadata.json
            ├── engine.log
            ├── io/
            │   ├── invocations/
            │   ├── tool_executions/
            │   └── hooks/
            └── interaction/
```

**Benefits:**
- Reduced path depth: 5 layers → 3 layers
- Consistent metadata naming (all uppercase, no extension)
- Removed redundant directories
- Better semantic alignment

### Breaking Changes
- Schema version: 1.1 → 1.2
- **No backward compatibility** with v1.2.x directory structures
- All existing workspaces need migration (suitable for pre-release)

## [1.2.1] - 2025-09-27

### Added
- **Interactive Workspace Selection** - Prompts user to select or create workspaces
- **Silent Mode (`-y`)** - Auto-create new workspace without prompts
- **Sequential Workspace Naming** - W001, W002, W003 format instead of timestamps
- **Workspace Tracking** - `.last_workspace` file remembers last used workspace

### Changed
- Default behavior now shows interactive workspace selector
- Workspace IDs changed from timestamp format to W### format

## [1.2.0]

### Added
- **Human-in-the-Loop Interaction** - New `ask_human` built-in tool for requesting user input
- **Interactive Mode (`-i`)** - Synchronous CLI interaction for immediate user feedback
- **Async Mode** - File-based interaction through `.delta/interaction/` directory for automation
- **Smart Resume** - Automatic detection and resumption of paused runs
- **Exit Code 101** - Special exit code indicating waiting for user input

### Changed
- Updated `metadata.json` to include run status tracking (`RUNNING`, `WAITING_FOR_INPUT`, `COMPLETED`, `FAILED`, `INTERRUPTED`)
- Enhanced `delta run` command to automatically resume interrupted or paused runs
- Improved workspace structure with new `.delta/interaction/` directory

### Technical Details
- Request format: `.delta/interaction/request.json` with prompt, input_type, and sensitive fields
- Response format: `.delta/interaction/response.txt` with user-provided content
- Status management through `metadata.json` for intelligent run resumption

## [1.1.0] 

### Added
- **Stateless Architecture** - Complete execution state persisted to disk
- **Lifecycle Hooks** - Extensible hook system for customization
- **Resumable Execution** - Perfect recovery from any interruption
- **Journal-based Logging** - Complete execution visibility via JSONL journal

### Changed
- Restructured workspace with `.delta` control plane
- Improved error handling and recovery mechanisms
- Enhanced logging with structured journal events

## [1.0.0] 

### Added
- Initial release of Delta Engine
- Core Think-Act-Observe loop implementation
- Tool execution framework
- Agent configuration system
- CLI interface
- Basic workspace management