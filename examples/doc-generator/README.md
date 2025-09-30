# Documentation Generator

An AI-powered documentation generator that analyzes your codebase and creates comprehensive, professional documentation.

## Features
- 📚 Auto-generates README files
- 🔍 Analyzes code structure and patterns
- 📝 Creates API documentation
- 🏗️ Generates architecture overviews
- ✨ Enhances existing documentation

## Usage

```bash
# Generate complete documentation
delta run --agent examples/doc-generator --task "Generate comprehensive documentation for this project"

# Create README only
delta run --agent examples/doc-generator --task "Create a professional README.md file"

# Generate API docs
delta run --agent examples/doc-generator --task "Document all public APIs and functions"

# Interactive mode - asks for project details
delta run -i --agent examples/doc-generator --task "Generate docs and ask me for project description"
```

## What It Creates

### README.md
- Project overview and purpose
- Installation instructions
- Usage examples with code
- Feature list
- Contributing guidelines

### API.md (when applicable)
- Function/method documentation
- Parameter descriptions
- Return types
- Code examples

### ARCHITECTURE.md (for complex projects)
- System design overview
- Component relationships
- Data flow diagrams (as ASCII art)
- Technology stack

## Example Output

```markdown
# MyProject

A revolutionary tool that simplifies complex workflows.

## Features
- ⚡ Lightning fast performance
- 🔧 Easy configuration
- 🚀 Cloud-ready deployment

## Installation
\`\`\`bash
npm install myproject
\`\`\`

## Usage
\`\`\`javascript
const myProject = require('myproject');
myProject.initialize();
\`\`\`
```

## Supported Languages
- JavaScript/TypeScript
- Python
- Go
- And more...