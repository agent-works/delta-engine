# Hello World Example

The simplest Delta Engine agent to get you started.

## Features
- 👋 Print messages
- 📄 Create and write files
- 📁 List directory contents
- 📅 Show current date

## Usage

```bash
# Say hello
delta run --agent examples/hello-world --task "Say hello to the world"

# Create a file
delta run --agent examples/hello-world --task "Create a file called test.txt with 'Hello Delta Engine' inside"

# Multiple actions
delta run --agent examples/hello-world --task "Create three files: one.txt, two.txt, three.txt, then list all files"
```

## What This Example Teaches

1. **Basic Tool Definition**: How to define simple tools in `config.yaml`
2. **Parameter Types**: Using `argument` and `stdin` injection methods
3. **System Prompts**: Writing clear instructions for the agent
4. **Tool Orchestration**: How agents combine multiple tools

## Files

- `config.yaml` - Agent configuration with 5 simple tools
- `system_prompt.md` - Agent instructions and behavior
- `README.md` - This file

## Try It Yourself

This is a great starting point for learning Delta Engine. Try modifying:
- Add a new tool to `config.yaml`
- Change the system prompt to alter behavior
- Create more complex task chains