import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Template definition structure
 */
export interface Template {
  name: string;
  description: string;
  configYaml: string;
  systemPrompt: string;
  readme: string;
}

/**
 * Built-in template: Minimal
 * Bare minimum tools for basic agent functionality
 */
const MINIMAL_TEMPLATE: Template = {
  name: 'minimal',
  description: 'Minimal agent with basic echo and file operations',
  readme: `# Minimal Agent

A bare-bones Delta Engine agent with essential tools for basic operations.

## Quick Start

\`\`\`bash
# Run the agent
delta run --agent . --task "Echo hello world"

# Example tasks
delta run --agent . --task "Echo 'Hello, Delta Engine!'"
delta run --agent . --task "Write 'Test content' to output.txt"
\`\`\`

## Available Tools

- **echo** - Print messages to stdout
- **write_to_file** - Write content to files (via tee command)

## Use Cases

- Quick prototyping
- Simple file operations
- Learning Delta Engine basics
- Building custom agents from scratch

## Next Steps

- Add more tools to \`config.yaml\`
- Customize \`system_prompt.md\` for your use case
- Explore other templates: \`delta init -t hello-world\`

For more information, visit: https://github.com/deltathink/delta-engine
`,
  configYaml: `name: minimal-agent
version: 1.0.0
description: A minimal agent with basic capabilities

llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000

# Tools - v1.7 Simplified Syntax
tools:
  - name: echo
    description: Message to print
    exec: "echo \${message}"      # v1.7: Simplified syntax

  - name: write_to_file
    description: File to write to
    exec: "tee \${filename}"      # v1.7: Simplified syntax
    stdin: content                # Declare 'content' as stdin parameter
`,
  systemPrompt: `# Minimal Agent

You are a minimal assistant agent.

## Your Capabilities
- Echo messages
- Write content to files

## Guidelines
- Complete tasks efficiently
- Provide clear feedback
`,
};

/**
 * Built-in template: Hello World
 * Friendly agent demonstrating basic capabilities
 */
const HELLO_WORLD_TEMPLATE: Template = {
  name: 'hello-world',
  description: 'Friendly hello-world agent with file operations',
  readme: `# Hello World Agent

A friendly demonstration agent with common file operations and utilities.

## Quick Start

\`\`\`bash
# Run the agent
delta run --agent . --task "Create a greeting file"

# Example tasks
delta run --agent . --task "Say hello and show today's date"
delta run --agent . --task "Create hello.txt with 'Hello World' and list files"
delta run --agent . --task "Create three files: one.txt, two.txt, three.txt"
\`\`\`

## Available Tools

- **print_message** - Echo messages to stdout
- **create_file** - Create empty files (touch)
- **write_to_file** - Write content to files
- **list_files** - List directory contents (ls -la)
- **show_date** - Display current date and time

## Use Cases

- Learning Delta Engine basics
- File system demonstrations
- Teaching agent tool usage
- Simple automation tasks

## Example Workflows

### Create and populate a file
\`\`\`bash
delta run --agent . --task "Create report.txt and write 'Project completed successfully'"
\`\`\`

### Organize with timestamps
\`\`\`bash
delta run --agent . --task "Show current date, then create a timestamped log file"
\`\`\`

## Next Steps

- Review \`config.yaml\` to see tool definitions
- Modify \`system_prompt.md\` to change agent behavior
- Try more complex templates: \`delta init -t file-ops\`

For more information, visit: https://github.com/deltathink/delta-engine
`,
  configYaml: `name: hello-world
version: 1.0.0
description: A simple hello world agent to demonstrate basic Delta Engine capabilities

llm:
  model: gpt-5-mini
  temperature: 0.7
  max_tokens: 1000

# Tools - v1.7 Simplified Syntax
tools:
  - name: print_message
    description: Message to print
    exec: "echo \${message}"      # v1.7: Simplified syntax

  - name: create_file
    description: Name of file to create
    exec: "touch \${filename}"    # v1.7: Simplified syntax

  - name: write_to_file
    description: File to write to
    exec: "tee \${filename}"      # v1.7: Simplified syntax
    stdin: content                # Declare 'content' as stdin parameter

  - name: list_files
    description: List all files in current directory
    exec: "ls -la"                # v1.7: Parameterless tool

  - name: show_date
    description: Display current date and time
    exec: "date"                  # v1.7: Parameterless tool
`,
  systemPrompt: `# Hello World Agent

You are a friendly assistant that helps users with simple tasks.

## Your Capabilities
- Print messages
- Create files
- Write content to files
- List files
- Show the current date

## Guidelines
- Be friendly and helpful
- Complete tasks efficiently
- Provide clear feedback
- Use appropriate tools for each task

## Examples
When asked to "say hello":
1. Use print_message to print "Hello, World!"

When asked to "create a greeting file":
1. Use create_file to create "greeting.txt"
2. Use write_to_file to add content
3. Use list_files to confirm creation

Always confirm task completion with a friendly message.
`,
};

/**
 * Built-in template: File Operations
 * Agent specialized in file management and organization
 */
const FILE_OPS_TEMPLATE: Template = {
  name: 'file-ops',
  description: 'File operations agent for organizing and managing files',
  readme: `# File Operations Agent

A specialized agent for file management, organization, and batch operations.

## Quick Start

\`\`\`bash
# Run the agent
delta run --agent . --task "Organize files in current directory"

# Example tasks
delta run --agent . --task "List all files and their sizes"
delta run --agent . --task "Create directories: docs, images, videos"
delta run --agent . --task "Move all .txt files to docs/ folder"
delta run --agent . --task "Find all files larger than 1MB"
\`\`\`

## Available Tools

- **list_files** - List directory contents
- **create_directory** - Create directories (mkdir -p)
- **move_file** - Move/rename files
- **copy_file** - Copy files recursively
- **find_files** - Search for files by pattern
- **check_file_size** - Get file/directory sizes
- **write_to_file** - Create reports and summaries

## Use Cases

- File organization and cleanup
- Batch file operations
- Directory structure management
- File system audits
- Automated file sorting

## Example Workflows

### Organize by file type
\`\`\`bash
delta run --agent . --task "Create folders by type (docs, images, code) and organize files"
\`\`\`

### Clean up downloads
\`\`\`bash
delta run --agent . --task "Find and organize files by extension, create summary report"
\`\`\`

### Backup important files
\`\`\`bash
delta run --agent . --task "Copy all .md files to backup/ directory"
\`\`\`

## Tips

- Always verify operations before performing destructive actions
- Use find_files to locate specific file types
- Create reports to document what was organized
- Test with small sets before large batch operations

## Next Steps

- Add custom file type rules to system_prompt.md
- Try API testing: \`delta init -t api-tester\`
- Read the full guide: https://github.com/anthropics/delta-engine

For more information, visit: https://github.com/deltathink/delta-engine
`,
  configYaml: `name: file-organizer
version: 1.0.0
description: Intelligently organizes files and directories based on type, date, or custom rules

llm:
  model: gpt-5-mini
  temperature: 0.3
  max_tokens: 2000

# Tools - v1.7 Simplified Syntax
tools:
  - name: list_files
    description: List all files in current directory
    exec: "ls -la"                # v1.7: Parameterless tool

  - name: create_directory
    description: Directory name to create
    exec: "mkdir -p \${dirname}"  # v1.7: Simplified syntax

  - name: move_file
    description: Move/rename file or directory
    exec: "mv \${source} \${destination}"  # v1.7: Multiple parameters

  - name: copy_file
    description: Copy file or directory recursively
    exec: "cp -r \${source} \${destination}"  # v1.7: Multiple parameters

  - name: find_files
    description: Search for files by pattern
    exec: "find . -name \${pattern}"  # v1.7: Simplified syntax

  - name: check_file_size
    description: Check file or directory size
    exec: "du -sh \${path}"       # v1.7: Simplified syntax

  - name: write_to_file
    description: Write report or summary to file
    exec: "tee \${filename}"      # v1.7: Simplified syntax
    stdin: content                # Declare 'content' as stdin parameter
`,
  systemPrompt: `# File Operations Agent

You are a file management expert that helps users organize, search, and manipulate files efficiently.

## Your Capabilities
- List files and directories
- Create directories
- Move and copy files
- Search for files by name
- Check file sizes
- Write reports and summaries

## Guidelines
- Always verify operations before performing destructive actions
- Provide clear explanations of what you're doing
- Organize files logically (by type, date, or custom rules)
- Create summaries or reports when organizing large sets of files

## Best Practices
- Use descriptive directory names
- Preserve file attributes when moving/copying
- Check available space before large operations
- Document organization decisions
`,
};

/**
 * Built-in template: API Tester
 * Agent for testing and interacting with REST APIs
 */
const API_TESTER_TEMPLATE: Template = {
  name: 'api-tester',
  description: 'API testing agent for REST endpoints',
  readme: `# API Tester Agent

A specialized agent for testing and validating REST APIs with comprehensive HTTP support.

## Quick Start

\`\`\`bash
# Run the agent
delta run --agent . --task "Test the JSONPlaceholder API"

# Example tasks
delta run --agent . --task "GET https://jsonplaceholder.typicode.com/posts/1"
delta run --agent . --task "Test all endpoints of https://api.example.com"
delta run --agent . --task "Check response times for https://api.example.com/users"
delta run --agent . --task "POST new user data to https://api.example.com/users"
\`\`\`

## Available Tools

- **curl_get** - Make GET requests
- **curl_post** - Make POST requests with JSON data
- **curl_put** - Make PUT requests
- **curl_delete** - Make DELETE requests
- **check_status** - Check HTTP status codes
- **format_json** - Pretty-print JSON responses
- **save_response** - Save API responses to files

## Use Cases

- REST API testing and validation
- API endpoint discovery
- Performance testing (response times)
- Integration testing
- API documentation validation
- Debugging API issues

## Example Workflows

### Test a public API
\`\`\`bash
delta run --agent . --task "Test JSONPlaceholder API: get all posts, create new post, verify creation"
\`\`\`

### Check API health
\`\`\`bash
delta run --agent . --task "Check status codes for all endpoints in https://api.example.com"
\`\`\`

### Save API responses
\`\`\`bash
delta run --agent . --task "Fetch user data from API and save formatted JSON to users.json"
\`\`\`

### Performance testing
\`\`\`bash
delta run --agent . --task "Measure response times for 10 requests to /api/users endpoint"
\`\`\`

## Tips

- Start with GET requests to understand API structure
- Use check_status before processing responses
- Format JSON responses for better readability
- Save important responses for reference
- Document API behavior and edge cases

## Authentication

For APIs requiring authentication, you can:
1. Modify tool commands in \`config.yaml\` to add headers
2. Use environment variables for API keys
3. Add custom curl options as needed

Example:
\`\`\`yaml
- name: curl_auth_get
  command: [curl, -H, "Authorization: Bearer \${API_TOKEN}"]
\`\`\`

## Next Steps

- Review \`config.yaml\` to understand HTTP tools
- Customize headers and auth in tool definitions
- Create comprehensive test suites
- Try file operations: \`delta init -t file-ops\`

For more information, visit: https://github.com/deltathink/delta-engine
`,
  configYaml: `name: api-tester
version: 1.0.0
description: Interactive API testing client with support for REST APIs

llm:
  model: gpt-5-mini
  temperature: 0.2
  max_tokens: 3000

# Tools - v1.7 Simplified Syntax (mixed with legacy)
tools:
  - name: curl_get
    description: Make GET request to API endpoint
    exec: "curl -X GET \${url}"   # v1.7: Simplified syntax

  # curl_post and curl_put use option injection (-d flag)
  # Keep legacy syntax for option_name feature
  - name: curl_post
    description: Make POST request with JSON data
    command: [curl, -X, POST, -H, "Content-Type: application/json"]
    parameters:
      - name: url
        type: string
        description: API endpoint URL
        inject_as: argument
      - name: data
        type: string
        description: JSON data to send
        inject_as: option
        option_name: -d

  - name: curl_put
    description: Make PUT request with JSON data
    command: [curl, -X, PUT, -H, "Content-Type: application/json"]
    parameters:
      - name: url
        type: string
        description: API endpoint URL
        inject_as: argument
      - name: data
        type: string
        description: JSON data to send
        inject_as: option
        option_name: -d

  - name: curl_delete
    description: Make DELETE request to API endpoint
    exec: "curl -X DELETE \${url}"  # v1.7: Simplified syntax

  - name: check_status
    description: Check HTTP status code
    exec: "curl -o /dev/null -s -w \\"%{http_code}\\\\n\\" \${url}"  # v1.7: Simplified syntax with escaping

  - name: format_json
    description: Pretty-print JSON response
    exec: "python3 -m json.tool"  # v1.7: stdin parameter
    stdin: json_data

  - name: save_response
    description: Save API response to file
    exec: "tee \${filename}"      # v1.7: Simplified syntax
    stdin: content
`,
  systemPrompt: `# API Testing Agent

You are an API testing expert that helps users test and validate REST APIs.

## Your Capabilities
- Make HTTP requests (GET, POST, PUT, DELETE)
- Check response status codes
- Format and validate JSON responses
- Save responses to files

## Guidelines
- Always check status codes before processing responses
- Format JSON responses for better readability
- Save important responses for reference
- Report errors clearly with context

## Testing Workflow
1. Start with status check to verify endpoint availability
2. Make appropriate HTTP request based on operation
3. Validate and format response
4. Save results if needed
5. Provide clear summary of test results

## Best Practices
- Validate input data before sending requests
- Handle authentication requirements appropriately
- Document API behavior and edge cases
- Create comprehensive test reports
`,
};

/**
 * All available templates
 */
export const TEMPLATES: Template[] = [
  MINIMAL_TEMPLATE,
  HELLO_WORLD_TEMPLATE,
  FILE_OPS_TEMPLATE,
  API_TESTER_TEMPLATE,
];

/**
 * Get template by name
 */
export function getTemplate(name: string): Template | undefined {
  return TEMPLATES.find(t => t.name === name);
}

/**
 * Check if directory is empty
 * Returns true if directory doesn't exist or is empty (ignoring .git and hidden files)
 */
export async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return false; // Not a directory
    }

    const entries = await fs.readdir(dirPath);
    // Ignore .git directory and hidden files starting with .
    const visibleEntries = entries.filter(entry => entry !== '.git' && !entry.startsWith('.'));
    return visibleEntries.length === 0;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return true; // Directory doesn't exist, treat as empty
    }
    throw error;
  }
}

/**
 * Create agent from template
 */
export async function createAgentFromTemplate(
  agentPath: string,
  template: Template,
  agentName?: string
): Promise<void> {
  // Create agent directory if it doesn't exist
  await fs.mkdir(agentPath, { recursive: true });

  // Update agent name in config if provided
  let configYaml = template.configYaml;
  if (agentName) {
    configYaml = configYaml.replace(/^name: .*$/m, `name: ${agentName}`);
  }

  // Write config.yaml
  const configPath = path.join(agentPath, 'config.yaml');
  await fs.writeFile(configPath, configYaml, 'utf-8');

  // Write system_prompt.md
  const promptPath = path.join(agentPath, 'system_prompt.md');
  await fs.writeFile(promptPath, template.systemPrompt, 'utf-8');

  // Write README.md
  const readmePath = path.join(agentPath, 'README.md');
  await fs.writeFile(readmePath, template.readme, 'utf-8');
}
