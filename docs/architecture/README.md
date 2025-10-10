# Delta Engine Architecture

## Overview

Delta Engine is a minimalist platform for AI Agent development, following Unix philosophy and emphasizing simplicity, transparency, and composability.

## Current Version: v1.6

The current architecture implements these core principles:

1. **Stateless Core** - No in-memory conversation state
2. **Environment as Interface** - CWD as the physical embodiment
3. **I/O Separation** - Clear separation between execution flow and I/O details
4. **Human-in-the-Loop** - Interactive and asynchronous user input support (v1.2)
5. **Simplified Sessions** - Command-based execution model (v1.5)
6. **Context Composition** - Declarative context building with memory folding (v1.6)

## Architecture Documents

### Core Philosophy
- [Delta Engine Philosophy](./PHILOSOPHY.md) - Complete whitepaper: manifesto and architectural philosophy
- [Core Principles & Code Mapping](./core-principles.md) - How philosophy translates to implementation

### Design Specifications
- [v1.1 Design Specification](./v1.1-design.md) - Stateless core architecture
- [v1.2 Human Interaction Specification](./v1.2-human-interaction.md) - Human-in-the-loop feature
- [v1.3 Design Specification](./v1.3-design.md) - Directory structure simplification
- [v1.4 PTY Deprecation](./v1.4-pty-deprecation.md) - PTY session deprecation rationale
- [v1.5 Simplified Sessions](./v1.5-sessions-simplified.md) - Command-based execution model
- [v1.6 Context Composition](./v1.6-context-composition.md) - Declarative context management

### Migration Guides
- [Migration: v1.0 → v1.1](../migration/v1.0-to-v1.1.md) - Stateless core migration
- [Migration: v1.4 → v1.5](../migration/v1.4-to-v1.5.md) - PTY to simplified sessions

## Key Components

### Control Plane (.delta/)
```
.delta/
└── runs/
    └── {run_id}/
        ├── execution/      # High-level execution flow
        │   ├── journal.jsonl
        │   └── metadata.json
        └── io/     # Low-level I/O details
            ├── invocations/
            ├── tool_executions/
            └── hooks/
```

### Data Plane (Working Directory)
The working directory serves as the data plane where agents perform their actual work, creating and modifying files as needed.

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
- **v1.6** (Current) - Context composition layer with memory folding
- **v2.0** (Planned) - Multi-agent orchestration and ecosystem features

## See Also

- [Getting Started Guide](../guides/getting-started.md)
- [Agent Development Guide](../guides/agent-development.md)
- [CLI Reference](../api/cli.md)