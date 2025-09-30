# Delta Engine Examples

A collection of example agents demonstrating various capabilities of Delta Engine.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/delta-engine.git
cd delta-engine

# Install dependencies
npm install

# Run an example
delta run --agent examples/git-analyzer --task "Analyze this repository"
```

## 📚 Available Examples

### 1. [Hello World](./hello-world/) ⭐ Start Here
The simplest example to get started with Delta Engine.

**Use Cases:**
- Learning basic tool definition
- Understanding parameter injection
- First agent experience

```bash
delta run --agent examples/hello-world --task "Say hello and create a greeting file"
```

---

### 2. [Git Repository Analyzer](./git-analyzer/)
Analyzes git repositories and provides insights about code changes, contributors, and repository health.

**Use Cases:**
- Repository health checks
- Contributor activity analysis
- Large file detection
- Commit pattern analysis

```bash
delta run --agent examples/git-analyzer --task "Analyze this git repository"
```

---

### 3. [Automated Test Runner](./test-runner/)
Automatically detects and runs tests across multiple programming languages and frameworks.

**Use Cases:**
- CI/CD pipeline integration
- Cross-language test execution
- Coverage report generation
- Test framework detection

```bash
delta run --agent examples/test-runner --task "Find and run all tests"
```

---

### 4. [Documentation Generator](./doc-generator/)
Generates comprehensive documentation for codebases including README, API docs, and architecture overviews.

**Use Cases:**
- README generation
- API documentation
- Code structure analysis
- Usage examples creation

```bash
delta run --agent examples/doc-generator --task "Generate complete documentation"
```

---

### 5. [File Organizer](./file-organizer/)
Intelligently organizes files and directories based on type, date, or custom rules.

**Use Cases:**
- Downloads folder cleanup
- Project file organization
- Duplicate file detection
- Archive creation

```bash
delta run -i --agent examples/file-organizer --task "Organize my files by type"
```

---

### 6. [API Testing Client](./api-tester/)
Interactive API testing client with support for REST APIs, authentication, and test suite generation.

**Use Cases:**
- API endpoint testing
- Performance measurement
- Test suite creation
- API documentation

```bash
delta run -i --agent examples/api-tester --task "Test my REST API"
```

## 🎯 Choose by Use Case

### For Developers
- **Git Analyzer** - Understand your codebase
- **Test Runner** - Automate testing
- **Doc Generator** - Create documentation

### For DevOps
- **Test Runner** - CI/CD integration
- **API Tester** - Service validation

### For General Use
- **File Organizer** - Clean up directories
- **Doc Generator** - Document any project

## 🔧 Creating Your Own Agent

Each example demonstrates different Delta Engine features:

1. **Tool Configuration** - See how different tools are defined in `config.yaml`
2. **System Prompts** - Learn prompt engineering from `system_prompt.md`
3. **Human Interaction** - Examples using `ask_human` for user input
4. **Complex Workflows** - Multi-step task execution patterns

## 📖 Learning Path

1. **Start Simple**: Begin with `file-organizer` to understand basic tool usage
2. **Add Complexity**: Study `git-analyzer` for multiple tool coordination
3. **User Interaction**: Explore `api-tester` for interactive features
4. **Advanced Patterns**: Review `test-runner` for framework detection logic

## 💡 Tips

- Use `-i` flag for interactive mode when you want real-time feedback
- Combine agents for complex workflows
- Modify system prompts to customize behavior
- Check generated reports for detailed insights

## 🤝 Contributing

Have an interesting agent example? We welcome contributions!

1. Create a new directory under `examples/`
2. Include `config.yaml`, `system_prompt.md`, and `README.md`
3. Document clear use cases and usage examples
4. Submit a pull request

## 📝 License

All examples are provided under the same license as Delta Engine (MIT).