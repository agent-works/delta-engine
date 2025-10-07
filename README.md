# Delta Engine

> A minimalist platform for AI Agent development - Everything is a Command, The Environment is the Interface

## Features

- 🎯 **Simple** - Unix philosophy applied to AI agents
- 🔧 **Transparent** - Complete execution visibility via journal
- 🔌 **Extensible** - Lifecycle hooks for customization
- 📦 **Portable** - Single directory contains everything
- 🔄 **Stateless** - Resumable from any interruption
- 👥 **Interactive** - Human-in-the-loop support for user input (v1.2)
- 🖥️ **Session Management** - Command-based persistent sessions for stateful workflows (v1.5)
- 🧠 **Context Composition** - Memory folding and dynamic context management (v1.6)


## Core Concepts

### Everything is a Command
All agent capabilities are implemented through external commands - no built-in functions, just Unix tools.

### Environment as Interface
Agents interact with the world through their working directory (CWD) - files are the universal interface.

### Stateless Core
No in-memory state - everything is persisted to disk immediately, enabling perfect resumability.


## Quick Start

```bash
npm install delta-engine -g

# Initialize a new agent (v1.3)
delta init my-agent                     # Interactive template selection
delta init my-agent -y                  # Use minimal template
delta init my-agent -t hello-world      # Specify template

# Run your agent
delta run --agent ./my-agent --task "Create a greeting file"

# Or run the hello-world example directly
delta run --agent examples/hello-world --task "Create a greeting file"
```


## Agent Structure

```
my-agent/
├── config.yaml         # Agent configuration
├── system_prompt.md    # System prompt (supports .txt)
├── context.yaml        # (Optional) Context composition strategy (v1.6)
└── workspaces/         # Execution workspaces (v1.3)
    ├── W001/           # v1.2.1: Sequential naming (W001, W002, etc.)
    │   ├── DELTA.md    # (Optional) Workspace-level context (v1.6)
    │   └── .delta/     # Control plane (logs, I/O)
    └── W002/
```

## Documentation

### Guides
- **[Getting Started](docs/guides/getting-started.md)** - Quick start guide
- **[Agent Development](docs/guides/agent-development.md)** - Build your own agents
- **[Context Management](docs/guides/context-management.md)** - Memory folding and dynamic context (v1.6)
- **[Session Management](docs/guides/session-management.md)** - Using persistent sessions (v1.5)

### Architecture
- **[Architecture Overview](docs/architecture/README.md)** - System design and principles

### API Reference
- **[delta CLI](docs/api/delta.md)** - Main CLI commands
- **[delta-sessions CLI](docs/api/delta-sessions.md)** - Session management CLI (v1.5)

### Migration
- **[v1.0 to v1.1 Migration](docs/migration/v1.0-to-v1.1.md)** - Stateless core upgrade
- **[v1.4 to v1.5 Migration](docs/migration/v1.4-to-v1.5.md)** - PTY to simplified sessions

## Development

```bash
# Run tests
npm test

# Development mode
npm run dev

# Build
npm run build
```

## Requirements

- Node.js 20+
- TypeScript 5+
- Unix-like environment (Linux, macOS, WSL)

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Version

Current: **v1.6** - Context composition layer with memory folding

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Examples

- **[hello-world](examples/hello-world/)** - Basic agent example
- **[memory-folding](examples/memory-folding/)** - Context compression with computed_file (v1.6)
- **[interactive-shell](examples/interactive-shell/)** - Persistent bash shell (v1.5)
- **[python-repl](examples/python-repl/)** - Python REPL session (v1.5)
- **[file-organizer](examples/file-organizer/)** - File operations
- **[test-runner](examples/test-runner/)** - Test automation
- **[doc-generator](examples/doc-generator/)** - Documentation generation