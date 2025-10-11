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
- ✨ **Simplified Tool Syntax** - 77% reduction in configuration verbosity with exec:/shell: modes (v1.7)


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

# Initialize a new agent
delta init my-agent -t hello-world      # Specify template

# Run your agent
delta run --agent ./my-agent --task "Create a greeting file"

# Or run the hello-world example directly
delta run --agent examples/1-basics/hello-world --task "Create a greeting file"
```

### Tool Configuration

```yaml
tools:
  - name: list_files
    exec: "ls -la ${directory}"
  - name: read_file
    exec: "cat ${filename}"
```

**Two execution modes**:
- `exec:` - Direct execution (safest, no shell involvement)
- `shell:` - Shell interpretation for pipes/redirects (`cat ${file} | wc -l`)

See [Tool Configuration](docs/api/config.md#v17-simplified-syntax) for complete syntax.


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

Current: **v1.7** - Tool configuration simplification (77% verbosity reduction)

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Examples

Organized by learning progression - see [examples/README.md](examples/README.md) for detailed documentation.

### Level 1: Basics (Quick Start)
- **[hello-world](examples/1-basics/hello-world/)** ⭐⭐⭐⭐.3 - 5-minute introduction to Delta's Three Pillars (v1.7 ✨)

### Level 2: Core Features
- **[interactive-shell](examples/2-core-features/interactive-shell/)** ⭐⭐⭐⭐⭐ - v1.5 persistent bash sessions
- **[python-repl](examples/2-core-features/python-repl/)** ⭐⭐⭐⭐.5 - v1.5 Python REPL with state preservation
- **[memory-folding](examples/2-core-features/memory-folding/)** ⭐⭐⭐⭐⭐ - v1.6 context composition & memory folding (v1.7 ✨)

### Level 3: Advanced (Production Patterns)
- **[delta-agent-generator](examples/3-advanced/delta-agent-generator/)** ⭐⭐⭐⭐⭐ - AI-powered agent generator with sub-agent architecture
- **[code-reviewer](examples/3-advanced/code-reviewer/)** ⭐⭐⭐⭐⭐ - Lifecycle hooks demonstration with complete audit trail (v1.7 ✨)
- **[research-agent](examples/3-advanced/research-agent/)** ⭐⭐⭐⭐⭐ - Long-running research with incremental summarization (v1.7 ✨)

**v1.7 Migration Status**: 5/8 examples migrated to simplified syntax (40 tools converted, 91% adoption rate)

All active examples meet ⭐⭐⭐⭐+ quality standard. Average quality: 4.76/5