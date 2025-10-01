# Changelog

All notable changes to Delta Engine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - `examples/interactive-shell/` - Persistent bash shell with multi-command execution
  - `examples/python-repl/` - Python REPL with multi-line code, state persistence, error handling

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