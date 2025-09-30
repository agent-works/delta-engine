# Delta Engine Architecture

## Overview

Delta Engine is a minimalist platform for AI Agent development, following Unix philosophy and emphasizing simplicity, transparency, and composability.

## Current Version: v1.2

The current architecture implements these core principles:

1. **Stateless Core** - No in-memory conversation state
2. **Environment as Interface** - CWD as the physical embodiment
3. **I/O Separation** - Clear separation between execution flow and I/O details
4. **Human-in-the-Loop** - Interactive and asynchronous user input support (v1.2)

## Architecture Documents

- [v1.1 Design Specification](./v1.1-design.md) - Complete v1.1 architecture design
- [v1.2 Human Interaction Specification](./v1.2-human-interaction.md) - Human-in-the-loop feature specification
- [Migration Guide](../migration/v1.0-to-v1.1.md) - Migration from v1.0 to v1.1

## Key Components

### Control Plane (.delta/)
```
.delta/
└── runs/
    └── {run_id}/
        ├── execution/      # High-level execution flow
        │   ├── journal.jsonl
        │   └── metadata.json
        └── runtime_io/     # Low-level I/O details
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
- **v1.2** (Current) - Human-in-the-loop interaction support
- **v2.0** (Future) - Multi-agent orchestration and distributed execution

## See Also

- [Getting Started Guide](../guides/getting-started.md)
- [Agent Development Guide](../guides/agent-development.md)
- [CLI Reference](../api/cli.md)