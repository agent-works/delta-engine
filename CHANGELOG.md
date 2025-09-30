# Changelog

All notable changes to Delta Engine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-09-30

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