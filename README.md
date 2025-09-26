# Delta Engine

> A minimalist platform for AI Agent development - Everything is a Command, The Environment is the Interface

## Features

- 🎯 **Simple** - Unix philosophy applied to AI agents
- 🔧 **Transparent** - Complete execution visibility via journal
- 🔌 **Extensible** - Lifecycle hooks for customization
- 📦 **Portable** - Single directory contains everything
- 🔄 **Stateless** - Resumable from any interruption

## Quick Start

```bash
# Install
npm install

# Run example agent
npx tsx src/index.ts run --agent examples/hello-agent --task "List files"

# Or build and run
npm run build
npx delta run --agent examples/hello-agent --task "Create a test file"
```

## Project Structure

```
delta-engine/
├── src/                 # Core engine source
├── examples/           # Example agents
├── tests/              # Test suites
└── docs/               # Documentation
    ├── architecture/   # Architecture design
    ├── guides/        # User guides
    └── api/           # API reference
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

## Core Concepts

### Everything is a Command
All agent capabilities are implemented through external commands - no built-in functions, just Unix tools.

### Environment as Interface
Agents interact with the world through their working directory (CWD) - files are the universal interface.

### Stateless Core
No in-memory state - everything is persisted to disk immediately, enabling perfect resumability.

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

Current: **v1.1** - Stateless architecture with lifecycle hooks

See [CHANGELOG.md](CHANGELOG.md) for version history.