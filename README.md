# Delta Engine

> A minimalist platform for AI Agent development - Everything is a Command, The Environment is the Interface

## Features

- 🎯 **Simple** - Unix philosophy applied to AI agents
- 🔧 **Transparent** - Complete execution visibility via journal
- 🔌 **Extensible** - Lifecycle hooks for customization
- 📦 **Portable** - Single directory contains everything
- 🔄 **Stateless** - Resumable from any interruption
- 👥 **Interactive** - Human-in-the-loop support for user input (v1.2)


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

# Run the hello-world example
delta run --agent examples/hello-world --task "Create a greeting file"
```


## Agent Structure

```
my-agent/
├── config.yaml         # Agent configuration
├── system_prompt.md    # System prompt (supports .txt)
└── work_runs/         # Execution workspaces
    └── workspace_*/
        └── .delta/    # Control plane (logs, I/O)
```

## Documentation

- **[Getting Started](docs/guides/getting-started.md)** - Quick start guide
- **[Architecture](docs/architecture/README.md)** - System design and principles
- **[Agent Development](docs/guides/agent-development.md)** - Build your own agents
- **[Migration Guide](docs/migration/v1.0-to-v1.1.md)** - Upgrade from v1.0

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

Current: **v1.2** - Human-in-the-loop interaction support

See [CHANGELOG.md](CHANGELOG.md) for version history.