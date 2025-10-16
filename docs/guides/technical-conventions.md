# Technical Conventions

This document contains technical implementation details and conventions for the Delta Engine project.

## ESM Import Convention

### The Rule
All imports MUST use `.js` extension in TypeScript files:
```typescript
// ✅ Correct
import { Engine } from './engine.js'

// ❌ Wrong - will fail at runtime
import { Engine } from './engine'
```

### Why This Matters
- TypeScript compiles but Node.js runtime fails without extension
- Error: "Cannot find module" at runtime
- TypeScript doesn't validate ESM paths

## File Descriptor Management

### The Problem
Long-running processes can leak file descriptors leading to "Too many open files" (EMFILE) errors.

### The Solution
Always close file handles in `finally` blocks:
```typescript
const handle = await fs.open(path);
try {
  // operations
} finally {
  await handle.close();
}
```

### High-Risk Areas
- `journal.ts` - Journal file operations
- `ask-human.ts` - Interaction file handling
- Any file streaming operations

## Journal Format Protection

### Critical Rule
NEVER open `journal.jsonl` with VSCode JSONL viewer plugins - they can corrupt the file format.

### Safe Inspection Methods
- `cat journal.jsonl` - View content
- `tail -f journal.jsonl` - Follow updates
- `jq '.' journal.jsonl` - Parse and format
- `less journal.jsonl` - Page through content

### Recovery
If corrupted, check for backup files or use git history to recover.

## TypeScript/Node.js Configuration

### Compiler Settings
- Target: ES2022
- Module: NodeNext
- Strict mode: Enabled
- ESM output

### Runtime Requirements
- Node.js 18+ required
- Use `fs.promises` for all file I/O (async only)
- Zod validation for all configurations
- UUID v4 for ID generation

## Tool Parameter Injection

### Three Injection Modes

1. **argument** - Passed as CLI argument
   ```yaml
   - name: list_files
     parameters:
       - name: directory
         type: string
         injection: argument
   ```

2. **stdin** - Piped via stdin (max 1 per tool)
   ```yaml
   - name: write_file
     parameters:
       - name: content
         type: string
         injection: stdin
   ```

3. **option** - Named flag (requires `option_name`)
   ```yaml
   - name: grep
     parameters:
       - name: case_insensitive
         type: boolean
         injection: option
         option_name: "-i"
   ```

## Tool Definition Syntax (v1.7)

### Simplified Syntax
```yaml
# Direct execution (safest)
- name: list_files
  exec: "ls -F ${directory}"

# Shell execution (for pipes/redirects)
- name: count_lines
  shell: "cat ${file} | wc -l"

# Stdin parameter
- name: write_file
  exec: "tee ${filename}"
  stdin: content

# Raw modifier (unquoted parameters)
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
```

### Expansion
Use `delta tool expand config.yaml` to see full format.

## Context Composition (v1.6+)

### Context Sources

1. **file** - Static file content
   ```yaml
   - type: file
     path: system_prompt.md
   ```

2. **computed_file** - Dynamic content via script
   ```yaml
   - type: computed_file
     generator: ./scripts/build-context.sh
   ```

3. **journal** - Conversation history
   ```yaml
   - type: journal
     max_iterations: 10  # Optional, for token efficiency
   ```

### Requirements (v1.9.1+)
- `context.yaml` is REQUIRED (no implicit fallback)
- Ensures transparency and eliminates "magic" defaults
- See [Context Management Guide](./context-management.md) for examples

## Session Management (v1.5)

### Architecture
- Command-based execution (not PTY)
- Synchronous, returns complete output
- State preserved via wrapper scripts
- File-based storage in `.sessions/`

### API
```bash
delta-sessions start bash       # Create session
delta-sessions exec <id>        # Execute command
delta-sessions end <id>         # Terminate session
```

### Benefits vs v1.4 PTY
- No timing issues
- No escape sequences
- Simpler API (3 vs 8 commands)
- LLM-optimized output

## Environment Variables

### Supported Variables
```bash
# API Configuration
DELTA_API_KEY=<your-key>
DELTA_BASE_URL=<custom-endpoint>
```

### Loading Priority
Local overrides global:
1. `{workspace}/.env` (highest priority)
2. `{agent}/.env`
3. `{project_root}/.env` (search upward for .git)
4. `process.env` (lowest priority)

### Discovery
Delta searches from most specific to most general location.

## Development Workflows

### Adding New Tool Parameter Type
1. Update `ToolParameterSchema` in `types.ts`
2. Modify injection logic in `executor.ts`
3. Update OpenAI schema conversion in `tool_schema.ts`
4. Add unit tests in `tests/unit/`

### Adding Lifecycle Hook
1. Define hook type in `hook-executor.ts`
2. Call `executeHook()` at appropriate location
3. Update schema in `types.ts` → `LifecycleHooksSchema`
4. Document in hooks guide

### Modifying Journal Format
⚠️ **Danger**: Breaking changes affect all existing runs

1. Update event types in `journal-types.ts`
2. Modify read/write in `journal.ts`
3. Update rebuild logic in `engine.ts`
4. Provide migration path for existing journals
5. Bump schema version

## Run States

Valid states in `metadata.json`:
- `RUNNING` - Active execution
- `WAITING_FOR_INPUT` - Paused for user input
- `COMPLETED` - Successfully finished
- `FAILED` - Unrecoverable error
- `INTERRUPTED` - User interrupted (Ctrl+C)

## Journal Event Types

Core events:
- `ENGINE_START` - Run initialization
- `THOUGHT` - LLM reasoning
- `ACTION_RESULT` - Tool execution result
- `ENGINE_END` - Run completion
- `ERROR` - Error occurrence

## Error Handling Principles

- Tool failures don't break the loop
- Errors become observations for the LLM
- All async operations wrapped in try-catch
- Errors logged to both journal and `io/` directory
- Graceful degradation over hard failure

## Version-Specific Details

### v1.10 Changes
- Removed LATEST file (use explicit run IDs)
- Added Janitor for cleanup
- Structured output formats (JSON, JSONL)
- Client-generated run IDs support

### v1.9 Changes
- Unified agent structure
- Required context.yaml
- Hooks mechanism
- Import system for composition

### Historical Versions
See git tags and version documentation in `docs/architecture/` for details.