# Documentation

Delta Engine documentation organized by purpose.

## Quick Start
- `QUICKSTART.md` - 5-minute tutorial to get started
- `TESTING.md` - Testing philosophy and methodology

## Architecture & Design
- `architecture/philosophy-01-overview.md` - 5-minute intro to three pillars
- `architecture/philosophy-02-whitepaper.md` - Complete design philosophy
- `architecture/v1.10-frontierless-workspace.md` - Latest version design
- `architecture/complete-design-v1.1-v1.10.md` - All versions reference

## How-To Guides
- `guides/getting-started.md` - Step-by-step first agent tutorial
- `guides/agent-development.md` - Build custom agents
- `guides/context-management.md` - Memory folding and dynamic context
- `guides/session-management.md` - Persistent bash/Python sessions
- `guides/hooks.md` - Lifecycle hooks for extensibility

## API Reference
- `api/cli.md` - Command-line interface reference
- `api/config.md` - Agent configuration syntax
- `api/delta-sessions.md` - Session management CLI

## Architecture Decisions
- `decisions/001-stateless-core.md` - Why stateless with journal.jsonl
- `decisions/002-journal-jsonl-format.md` - Why JSONL format
- `decisions/003-human-interaction-modes.md` - Interactive vs async modes
- `decisions/004-poc-first-validation.md` - POC-driven development
- `decisions/005-tool-syntax-simplification.md` - Tool config syntax sugar