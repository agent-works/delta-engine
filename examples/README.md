# Delta Engine Examples

Simple examples demonstrating Delta Engine's core capabilities.

## Quick Start

```bash
# Basic usage
delta run --agent examples/hello-world -m "Say hello"

# Tool configuration
delta run --agent examples/tool-syntax -m "Show tool syntax"

# Session management
delta run --agent examples/interactive-shell -m "Navigate and create files"

# Python scripting
delta run --agent examples/python-repl -m "Calculate something"

# AI orchestration (experimental)
delta run --agent examples/delta-agent-generator -m "Generate a simple agent"
```

## Directory Structure

```
examples/
├── hello-world/           # Basic agent with 5 tools
├── tool-syntax/           # Tool configuration examples
├── interactive-shell/     # Persistent bash session
├── python-repl/           # Python REPL with state
└── delta-agent-generator/ # AI-powered agent generator
```

## Documentation

See [docs/](../docs/) for complete documentation.