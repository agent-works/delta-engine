# Delta Engine Architecture

## Overview

Delta Engine is a minimalist platform for AI Agent development, following Unix philosophy and emphasizing simplicity, transparency, and composability.

## Current Version: v1.9.1

The current architecture implements these core principles:

1. **Stateless Core** - No in-memory conversation state
2. **Environment as Interface** - CWD as the physical embodiment
3. **I/O Separation** - Clear separation between execution flow and I/O details
4. **Human-in-the-Loop** - Interactive and asynchronous user input support (v1.2)
5. **Simplified Sessions** - Command-based execution model (v1.5)
6. **Context Composition** - Declarative context building with memory folding (v1.6, required in v1.9.1)
7. **Tool Simplification** - Syntax sugar for intuitive tool configuration (v1.7)
8. **Unified Agent Structure** - Compositional configuration with imports mechanism (v1.9)

## Architecture Documents

### Complete Design Reference (v1.1-v1.9)
- **[Complete Design Specification (v1.1-v1.9)](./complete-design-v1.1-v1.9.md)** - Comprehensive technical reference consolidating all design specifications for knowledge base integration
  - Organized by feature domain (not chronologically)
  - 100% technical content coverage (all schemas, APIs, data structures)
  - Includes all design decisions and rationale
  - Recommended for: knowledge base ingestion, team discussions, system understanding
- [Coverage Report](./complete-design-v1.1-v1.9-coverage-report.md) - Verification of completeness and accuracy

### Core Philosophy
- [Delta Engine Philosophy](./philosophy-02-whitepaper.md) - Complete whitepaper: manifesto and architectural philosophy

### Design Specifications (Chronological)
- [v1.1 Design Specification](./v1.1-design.md) - Stateless core architecture
- [v1.2 Human Interaction Specification](./v1.2-human-interaction.md) - Human-in-the-loop feature
- [v1.3 Design Specification](./v1.3-design.md) - Directory structure simplification
- [v1.4 PTY Deprecation](./v1.4-pty-deprecation.md) - PTY session deprecation rationale
- [v1.5 Simplified Sessions](./v1.5-sessions-simplified.md) - Command-based execution model
- [v1.6 Context Composition](./v1.6-context-composition.md) - Declarative context management
- [v1.7 Tool Simplification](./v1.7-tool-simplification.md) - Intuitive tool configuration with exec/shell syntax
- [v1.7 Implementation Plan](./v1.7-implementation-plan.md) - Development roadmap for v1.7 features
- [v1.8 Unified CLI API](./v1.8-unified-cli-api.md) - CLI improvements and `delta continue` command
- [v1.9 Unified Agent Structure](./v1.9-unified-agent-structure.md) - Compositional configuration with imports mechanism and v1.9.1 context.yaml requirement

**Note**: v1.7 is fully backward compatible (syntax sugar only), so no migration guide is needed. Old `command:` array syntax continues to work alongside new `exec:`/`shell:` syntax.

## Design Principles

### 1. Everything is a Command
All capabilities are implemented through executing external command-line programs.

### 2. The Environment is the Interface
Agent interaction with the environment occurs only through the current working directory (CWD).

### 3. Composition Defines Intelligence
Complexity emerges through composing simple Agents (processes).

## Evolution

- **v1.0** (MVP) - Basic Think-Act-Observe loop with trace.jsonl
- **v1.1** - Stateless core with journal.jsonl and runtime I/O separation
- **v1.2** - Human-in-the-loop interaction support (interactive & async modes)
- **v1.3** - Directory structure simplification and `delta init` command
- **v1.4** - PTY-based sessions (deprecated, moved to experimental)
- **v1.5** - Command-based simplified sessions (production-ready)
- **v1.6** - Context composition layer with memory folding
- **v1.7** - Tool configuration syntax sugar (exec/shell modes)
- **v1.8** - CLI improvements (`--task` → `-m/--message`, `delta continue` command)
- **v1.9** - Unified agent structure (config.yaml → agent.yaml, hooks.yaml, imports)
- **v1.9.1** (Current) - context.yaml now required (breaking change)
- **v2.0** (Planned) - Multi-agent orchestration and ecosystem features

