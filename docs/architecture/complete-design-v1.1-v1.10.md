# Delta Engine Complete Design Specification (v1.1-v1.10)

**Document Purpose**: Comprehensive technical reference consolidating all design specifications from v1.1 to v1.10 for knowledge base integration and team discussion.

**Versioning**: This document represents the complete state as of v1.10.0
**Last Updated**: October 15, 2025
**Maintained By**: Delta Engine Team

**Source Documents**: v1.1-design.md, v1.2-human-interaction.md, v1.3-design.md, v1.4-pty-deprecation.md, v1.5-sessions-simplified.md, v1.6-context-composition.md, v1.7-tool-simplification.md, v1.8-unified-cli-api.md, v1.9-unified-agent-structure.md, v1.10-frontierless-workspace.md

---

## Table of Contents

- [Part I: System Overview (Current State)](#part-i-system-overview-current-state)
- [Part II: Feature Specifications](#part-ii-feature-specifications)
- [Part III: Version Evolution Timeline](#part-iii-version-evolution-timeline)
- [Part IV: Design Rationale & Trade-offs](#part-iv-design-rationale--trade-offs)

---

## Part I: System Overview (Current State)

### 1.1 Current Architecture (v1.10.0)

Delta Engine is an AI agent execution framework built on three core philosophical principles:

**Core Principles:**
1. **Everything is a Command** - All agent capabilities are external CLI programs
2. **Environment as Interface** - Agents interact only through working directory (CWD)
3. **Composition Defines Intelligence** - Complex behaviors emerge from composing simple agents

**System Components:**

```
User Input
    ↓
CLI (delta run / delta continue)
    ↓
Engine Core (Think-Act-Observe Loop)
    ↓ ↙ ↘
LLM API   Tool Executor   Context Builder
    ↓         ↓               ↓
OpenAI   External Tools   journal.jsonl
              ↓               ↓
          CWD (Workspace) ←─┘
```

**Key Characteristics:**
- **Stateless Core** [v1.1]: Engine retains no state; rebuilds from journal every iteration
- **File-Based State** [v1.1]: All state stored in CWD's `.delta/` directory
- **Resumable Execution** [v1.2]: Runs can be interrupted and resumed from any state
- **Declarative Context** [v1.6, v1.9.1]: Context construction defined via `context.yaml` (required)
- **Compositional Configuration** [v1.9]: Agent capabilities assembled via `imports` mechanism
- **Frontierless Workspace** [v1.10]: No shared mutable state; enables concurrent multi-agent execution
- **Explicit Run Identification** [v1.10]: All operations require explicit `run_id` specification
- **Robust Recovery** [v1.10]: Janitor mechanism + Client-generated IDs ensure safe crash recovery

### 1.2 Directory Structure (v1.10.0)

#### Agent Project Structure

```
/path/to/MyAgent/
├── agent.yaml          # [Required] Core configuration (replaces config.yaml)
├── system_prompt.md    # [Required] Agent instructions
├── context.yaml        # [Required] Context composition strategy (v1.9.1+)
├── hooks.yaml          # [Optional] Lifecycle hooks (v1.9)
├── tools/              # [Optional] Custom tool scripts
│   └── *.yaml         # Importable tool definitions (v1.9)
└── workspaces/         # [Runtime] Execution workspaces (v1.3)
    ├── LAST_USED       # Tracks last used workspace
    ├── W001/           # Sequential workspace naming
    │   ├── [data plane: agent's work artifacts]
    │   └── .delta/    # [control plane: engine's exclusive domain]
    │       ├── VERSION
    │       └── {run_id}/    # [v1.10: LATEST file removed for concurrency]
    │           ├── journal.jsonl     # [v1.1] SSOT: execution history
    │           ├── metadata.json     # [v1.2] Run status and metadata
    │           ├── engine.log        # Engine process logs
    │           ├── io/               # [v1.1] I/O audit logs
    │           │   ├── invocations/  # LLM invocation records
    │           │   ├── tool_executions/  # Tool execution details
    │           │   └── hooks/        # Hook execution records
    │           └── interaction/      # [v1.2] Human-in-the-loop (async mode)
    │               ├── request.json
    │               └── response.txt
    └── W002/
```

**Key Design Decisions:**
- **Data Plane vs Control Plane** [v1.1]: Clear separation of workspace artifacts (visible to agent) from execution history (engine-only)
- **Sequential Workspace Naming** [v1.3]: W001, W002... for simplicity
- **No LATEST File** [v1.10]: Removed to enable concurrent execution; explicit run IDs required
- **Unified io/ Directory** [v1.3]: Simplified from `runtime_io/` for clarity
- **Flat .delta/ Structure** [v1.10]: Direct {run_id}/ directories without intermediate `runs/` subdirectory

#### Workspace Detail: .delta/{run_id}/ Contents

```
{run_id}/
├── journal.jsonl          # Append-only event log (SSOT)
├── metadata.json          # Run status + [v1.10] PID tracking (pid, hostname, start_time, process_name)
├── engine.log             # Engine process logs (stdout/stderr)
├── io/
│   ├── invocations/
│   │   └── {timestamp}_{iteration}.json    # LLM request/response pairs
│   ├── tool_executions/
│   │   └── {timestamp}_{tool_name}.json    # Tool input/output/errors
│   └── hooks/
│       └── {hook_name}_{timestamp}.json    # Hook execution details
└── interaction/                             # Only exists when ask_human is active
    ├── request.json                         # Human input request
    └── response.txt                         # Human response (created by user)
```

### 1.3 Core Mechanisms Summary

**Stateless Core** [v1.1]
- Engine retains no in-memory state across reasoning cycles
- All state reconstructed from `journal.jsonl` via `buildContext()`
- Pure function behavior: same input → same output
- **Benefit**: Perfect resumability, simplified debugging, no memory leaks

**Journal as Single Source of Truth (SSOT)** [v1.1]
- All thoughts, actions, and observations logged to `journal.jsonl`
- JSONL format (one JSON object per line, append-only)
- **Critical Rule**: NEVER open with VSCode JSONL plugins (causes corruption); use `cat`, `less`, `jq`

**Think-Act-Observe Loop** [v1.1]
```
LOOP (until MAX_ITERATIONS or finish):
  1. THINK:   buildContext() → callLLM() → reasoning
  2. ACT:     Parse tool call → executeTool() → capture output
  3. OBSERVE: Return result to LLM → next iteration
```

**Status-Based Resumption** [v1.2, v1.8, v1.10]
- Run status tracked in `metadata.json`
- States: `RUNNING`, `WAITING_FOR_INPUT`, `COMPLETED`, `FAILED`, `INTERRUPTED`
- Resumption via `delta continue --run-id <id>` (v1.10: explicit ID required)

**Declarative Context Composition** [v1.6, v1.9.1]
- Context construction defined in `context.yaml` (required as of v1.9.1)
- Three source types: `file`, `computed_file`, `journal`
- Enables memory folding, workspace guides (DELTA.md), dynamic knowledge injection

**Compositional Configuration** [v1.9]
- Agent capabilities assembled via `imports` mechanism in `agent.yaml`
- Tools can be defined locally or imported from modules
- **Conflict Resolution**: Last-write-wins (local tools override imported)

**Client-Generated Run IDs** [v1.10]
- Caller can specify run ID via `delta run --run-id <ID>`
- Ensures tracking even in catastrophic failure (e.g., `kill -9`)
- Engine validates uniqueness within workspace
- **Recommendation**: Use UUID v4 for automated orchestration

**Janitor Mechanism** [v1.10]
- Automatic cleanup of orphaned RUNNING processes
- Triggered on `delta continue` when status is RUNNING
- PID-based liveness check with process name verification
- Cross-host detection with `--force` escape hatch
- Safe state transition: RUNNING → INTERRUPTED

---

## Part II: Feature Specifications

### 2.1 Core Architecture & Runtime

#### 2.1.1 Stateless Core [v1.1]

**Design Philosophy**: The engine must retain no state across reasoning cycles. All state is reconstructed from the journal on every iteration.

**Key Implementation Pseudo-code**:
```typescript
function runEngine(workDir, config) {
  while (iterations < MAX_ITERATIONS) {
    context = buildContext(journal);  // Stateless rebuild every iteration
    thought = callLLM(context);
    toolResult = executeTool(thought.action);
    journal.append({ thought, action, result });
  }
}
```

**Rationale**:
- ✅ **Perfect Resumability**: Crash-safe; can resume from any point
- ✅ **Simplified Debugging**: State fully visible in journal
- ✅ **No Memory Leaks**: No accumulated in-memory state
- ⚠️ **Trade-off**: Rebuild overhead (mitigated by efficient journal parsing)

**MAX_ITERATIONS**: Default 30 (v1.1), configurable via `--max-iterations` flag (v1.8)

#### 2.1.2 Journal Format [v1.1]

**File**: `.delta/{run_id}/journal.jsonl`
**Format**: JSONL (JSON Lines) - One JSON object per line, append-only

**Event Types** (Complete List):

1. **ENGINE_START** - Run initialization
   ```json
   {
     "type": "ENGINE_START",
     "run_id": "uuid",
     "timestamp": "ISO8601",
     "agent_home": "/path/to/agent",
     "work_dir": "/path/to/workspace",
     "config": { ... }
   }
   ```

2. **THOUGHT** - LLM reasoning output
   ```json
   {
     "type": "THOUGHT",
     "iteration": 1,
     "timestamp": "ISO8601",
     "content": "Agent's reasoning text"
   }
   ```

3. **ACTION_REQUEST** - Tool invocation request
   ```json
   {
     "type": "ACTION_REQUEST",
     "iteration": 1,
     "timestamp": "ISO8601",
     "tool_name": "list_files",
     "tool_args": { "directory": "." }
   }
   ```

4. **ACTION_RESULT** - Tool execution result (observation)
   ```json
   {
     "type": "ACTION_RESULT",
     "iteration": 1,
     "timestamp": "ISO8601",
     "tool_name": "list_files",
     "observation_content": "file1.txt\nfile2.txt",
     "exit_code": 0
   }
   ```

5. **ENGINE_END** - Run completion
   ```json
   {
     "type": "ENGINE_END",
     "run_id": "uuid",
     "timestamp": "ISO8601",
     "status": "COMPLETED",
     "final_iteration": 15
   }
   ```

6. **ERROR** - Error events
   ```json
   {
     "type": "ERROR",
     "timestamp": "ISO8601",
     "error_message": "Tool execution failed",
     "error_details": { ... }
   }
   ```

7. **HUMAN_INPUT_REQUEST** [v1.2] - ask_human invocation
   ```json
   {
     "type": "HUMAN_INPUT_REQUEST",
     "timestamp": "ISO8601",
     "prompt": "Please provide API key",
     "input_type": "password"
   }
   ```

8. **HUMAN_INPUT_RECEIVED** [v1.2] - Human response
   ```json
   {
     "type": "HUMAN_INPUT_RECEIVED",
     "timestamp": "ISO8601",
     "response": "sk-abc123..."
   }
   ```

**Schema** (TypeScript/Zod):
```typescript
export const JournalEventSchema = z.discriminatedUnion('type', [
  EngineStartEventSchema,
  ThoughtEventSchema,
  ActionRequestEventSchema,
  ActionResultEventSchema,
  EngineEndEventSchema,
  ErrorEventSchema,
  HumanInputRequestEventSchema,   // v1.2
  HumanInputReceivedEventSchema,  // v1.2
]);
```

**Critical Rules**:
- ❌ **NEVER** open with VSCode JSONL plugins → causes file corruption (incident: 2025-10-09)
- ✅ **ALWAYS** use `cat`, `less`, `jq` for inspection
- ✅ **Append-only** writes (no modifications to existing lines)
- ✅ Runtime validation in `journal.ts:validateJournalFormat()`

**File Descriptor Management** [Critical]:
- Always close file handles in `finally` block
- High-risk areas: `journal.ts`, `ask-human.ts`
- Symptom if violated: "Too many open files" / "EMFILE" errors

#### 2.1.3 Think-Act-Observe Loop [v1.1]

**Workflow**:
```
LOOP (while iterations < MAX_ITERATIONS and not finished):
  1. THINK Phase:
     - buildContext() from journal
     - Call LLM with context
     - Receive reasoning + tool call

  2. ACT Phase:
     - Parse tool call
     - Validate parameters
     - Execute tool (external process)
     - Capture stdout/stderr/exit_code

  3. OBSERVE Phase:
     - Format tool result as observation
     - Append to journal
     - Return to LLM for next iteration

  4. Journal Update:
     - Write THOUGHT event
     - Write ACTION_REQUEST event
     - Write ACTION_RESULT event
```

**Termination Conditions**:
- LLM returns `finish` signal (task complete)
- MAX_ITERATIONS reached (default: 30)
- Unrecoverable error (tool execution failure marked as critical)
- User interrupt (Ctrl+C) → status changes to `INTERRUPTED`
- `ask_human` invoked in async mode → status changes to `WAITING_FOR_INPUT`

**Error Handling Philosophy** [v1.1]:
- Tool failures **do not break the loop** by default
- Errors become observations that the LLM sees and can reason about
- Agent can choose to retry, work around, or fail gracefully
- Only unrecoverable engine-level errors terminate execution

#### 2.1.4 Run Metadata [v1.2, v1.10]

**File**: `.delta/{run_id}/metadata.json`
**Purpose**: Single source of truth for run state and status

**Complete Schema**:
```json
{
  "run_id": "20251013_143522_a1b2c3",
  "workspace_id": "W001",
  "agent_name": "code-reviewer",
  "status": "RUNNING | WAITING_FOR_INPUT | COMPLETED | FAILED | INTERRUPTED",
  "created_at": "2025-10-13T14:35:22.123Z",
  "updated_at": "2025-10-13T14:40:15.456Z",
  "end_time": "2025-10-13T14:40:15.456Z",  // null if still running
  "initial_message": "Review auth.ts for security issues",
  "iterations": 15,
  "max_iterations": 30,
  "error": null,  // String if status is FAILED
  "agent_home": "/path/to/agent",
  "work_dir": "/path/to/workspace",

  // [v1.10] Process tracking fields for Janitor mechanism
  "pid": 12345,                              // Process ID
  "hostname": "host-a",                      // Hostname where process started
  "start_time_unix": 1697207722123,          // Unix timestamp for process start
  "process_name": "node"                     // Process name (e.g., "node", "delta")
}
```

**Status State Machine** [v1.2, v1.8]:

```
[Initial] → RUNNING

RUNNING ──┬──> COMPLETED     (LLM signals finish)
          ├──> FAILED        (unrecoverable error)
          ├──> INTERRUPTED   (user Ctrl+C)
          └──> WAITING_FOR_INPUT (ask_human in async mode)

WAITING_FOR_INPUT ──> RUNNING  (after human provides response)
INTERRUPTED ──> RUNNING         (via delta continue)
COMPLETED ──> RUNNING           (via delta continue -m "new task")
FAILED ──> RUNNING              (via delta continue -m "retry info")
```

**Status Field Values** (TypeScript Enum):
```typescript
export enum RunStatus {
  RUNNING = 'RUNNING',
  WAITING_FOR_INPUT = 'WAITING_FOR_INPUT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  INTERRUPTED = 'INTERRUPTED'
}
```

**Usage Patterns**:
- Engine checks status before resuming to determine behavior
- `delta run` auto-resumes if status is `INTERRUPTED` or `WAITING_FOR_INPUT`
- `delta continue` explicitly handles all five states (v1.8)

#### 2.1.5 Janitor Mechanism [v1.10]

**Purpose**: Automatically clean up orphaned RUNNING processes to enable safe recovery after crashes

**Trigger**: Activated during `delta continue` when run status is `RUNNING`

**Algorithm**:
```typescript
async function janitorCheck(metadata: RunMetadata, force?: boolean): Promise<void> {
  if (metadata.status !== 'RUNNING') return;

  // Step 1: Cross-host detection
  if (metadata.hostname !== os.hostname() && !force) {
    throw new Error(`Run started on different host ${metadata.hostname}`);
  }

  // Step 2: PID liveness check
  const isAlive = await isProcessAlive(metadata.pid);  // kill -0 on Unix

  if (!isAlive) {
    // Process is dead, safe to clean up
    metadata.status = 'INTERRUPTED';
    return;
  }

  // Step 3: Process name verification (prevent PID reuse false positive)
  const processName = await getProcessName(metadata.pid);
  if (!processName.includes('node') && !processName.includes('delta')) {
    // PID was reused by different process
    metadata.status = 'INTERRUPTED';
    return;
  }

  // Process still alive
  throw new Error(`Run ${metadata.run_id} is still active (PID ${metadata.pid})`);
}
```

**Safety Features**:
- **PID Verification**: Uses `kill -0` (Unix) to check process existence
- **Process Name Check**: Prevents false positives from PID reuse
- **Cross-Host Detection**: Refuses automatic cleanup across hosts
- **Force Flag**: `--force` allows manual override for cross-host scenarios
- **State Transition**: Safe RUNNING → INTERRUPTED transition

**Error Messages**:
```bash
# Cross-host scenario
Error: Run 20251014_0430_aaaa was started on host 'host-a'.
Cannot verify process status from host 'host-b'.
If you're certain the original process is dead, use --force.

# Process still running
Error: Run 20251014_0430_aaaa is still active (PID 12345).
Cannot continue while original process is running.
```

---

### 2.2 Tool System

#### 2.2.1 Tool Definition Evolution

**v1.1 Original Format** (Still Supported):
```yaml
tools:
  - name: list_files
    description: "List files in directory"
    command: ["ls", "-la"]
    parameters:
      - name: directory
        type: string
        description: "Target directory"
        required: false
        inject_as: argument
```

**v1.7 Simplified Format** (Syntax Sugar):
```yaml
tools:
  # Mode 1: exec (direct execution, safest)
  - name: list_files
    description: "List files in directory"
    exec: "ls -la ${directory}"

  # Mode 2: shell (shell interpreted, powerful)
  - name: count_lines
    description: "Count lines in file"
    shell: "cat ${file} | wc -l"

  # Mode 3: stdin parameter
  - name: write_file
    description: "Write content to file"
    exec: "tee ${filename}"
    stdin: content
```

**v1.9 Import Mechanism**:
```yaml
# agent.yaml
imports:
  - ./tools/file-ops.yaml
  - ./tools/web-search.yaml

tools:
  - name: local_tool
    exec: "echo ${message}"

# tools/file-ops.yaml
tools:
  - name: read_file
    exec: "cat ${path}"
  - name: write_file
    exec: "tee ${path}"
    stdin: content
```

#### 2.2.2 Execution Modes [v1.7]

**Mode 1: `exec` (Direct Execution)** ✅ Recommended for 80% of cases

**Characteristics**:
- Direct process spawn (e.g., `execvp`), no shell interpreter
- Safe tokenization via shell-like lexical parsing (like Python's `shlex.split`)
- All `${param}` values passed as independent, safe arguments
- **Forbidden**: Shell metacharacters (`|`, `>`, `<`, `&`, `;`, `&&`, `||`)

**Example**:
```yaml
- name: search_pattern
  exec: 'grep "fixed pattern" ${file}'
  # Tokenizes to: ["grep", "fixed pattern", "${file}"]
  # After injection: ["grep", "fixed pattern", "actual_file.txt"]
```

**Security**:
- ✅ Fundamentally eliminates command injection
- ✅ Parameter values treated as literal strings (no interpretation)
- ✅ Even malicious input like `"; rm -rf /"` is harmless

**Validation** (at configuration load time):
- Engine must reject templates containing shell metacharacters
- Error message: "Shell metacharacter '|' not allowed in exec: mode. Use shell: mode instead."

---

**Mode 2: `shell` (Shell Interpreted)** ⚠️ Use when pipes/redirects needed

**Characteristics**:
- Entire template wrapped with `sh -c "..."`
- **Default Safe**: Parameters automatically replaced with **quoted** positional parameters (`"$1"`, `"$2"`, ...)
- Values passed through `sh -c`'s argv array (NOT string concatenation)

**Example**:
```yaml
- name: count_matches
  shell: "grep ${pattern} ${file} | wc -l"

# Expands to:
# command: ["sh", "-c", "grep \"$1\" \"$2\" | wc -l", "--"]
# parameters:
#   - name: pattern (position: 0, corresponds to $1)
#   - name: file (position: 1, corresponds to $2)
```

**Safety Mechanism** (POSIX Standard):
```c
// Actual system call (pseudocode)
execvp("sh", [
  "sh",                              // argv[0]
  "-c",                              // argv[1]
  "grep \"$1\" \"$2\" | wc -l",     // argv[2]: script (immutable)
  "--",                              // argv[3]: options terminator
  "\" ; rm -rf / ; \"",             // argv[4]: value for $1 (via argv, safe)
  "data.txt"                         // argv[5]: value for $2 (via argv, safe)
]);
```

**Why This is Secure**:
1. **No text substitution**: Parameters never undergo string interpolation
2. **Argv-based passing**: Isolated from script string via OS kernel
3. **Quote protection**: `"$1"` treats entire value as atomic string
4. **Option terminator**: `--` prevents parameter misinterpretation as flags

**Attack Scenario (Prevented)**:
```yaml
shell: "grep ${pattern} ${file} | wc -l"
# Attacker: pattern = "\" ; rm -rf /tmp/test ; \""
# Execution: sh -c 'grep "$1" "$2" | wc -l' -- '" ; rm -rf /tmp/test ; "' 'data.txt'
# Result: grep searches for literal string '" ; rm -rf /tmp/test ; "'
# ✅ NO command injection occurs
```

---

**Mode 3: `:raw` Modifier** (Shell-only) 🔥 Expert Use Only

**Purpose**: Unquoted parameter expansion (for flag lists, glob patterns)

**Syntax**:
```yaml
- name: run_docker
  shell: "docker run ${options:raw} ${image}"
  # With options = "-d -p 80:80", expands to:
  # sh -c 'docker run $1 "$2"' -- '-d -p 80:80' 'ubuntu:latest'
  # Result: docker run -d -p 80:80 ubuntu:latest
```

**Behavior**:
- Parameters marked `:raw` are replaced with **unquoted** positional parameters (`$1` instead of `"$1"`)
- Shell parses the raw value (splits on whitespace, expands globs)
- ⚠️ **Security Risk**: Vulnerable to injection if parameter comes from untrusted source

**Restrictions**:
- ❌ Only valid in `shell:` mode (error in `exec:`)
- ❌ Cannot be added via explicit `parameters` block (must be in template: `${param:raw}`)

**Use Cases**:
```yaml
# Flag lists (legitimate use)
- name: docker_run
  shell: "docker run ${flags:raw} ${image}"

# Glob patterns (requires :raw to prevent quote-induced blocking)
- name: list_logs
  shell: "ls ${pattern:raw}"
  # pattern = "*.log" → shell expands glob
```

**Security Warning**:
```yaml
# ⚠️ VULNERABLE if pattern from LLM or user
- name: risky_search
  shell: "grep ${pattern:raw} ${file}"
  # If pattern = ". /etc/passwd ; #"
  # Result: COMMAND INJECTION OCCURS
```

#### 2.2.3 Parameter Injection Modes [v1.1, v1.7]

**1. `argument` (default)**:
```yaml
parameters:
  - name: directory
    inject_as: argument
# Result: Appended as CLI argument
# Example: ls -la /tmp
```

**2. `stdin`**:
```yaml
parameters:
  - name: content
    inject_as: stdin
# Result: Piped to command's stdin
# Limit: Max 1 stdin parameter per tool
```

**Shorthand (v1.7)**:
```yaml
- name: write_file
  exec: "tee ${filename}"
  stdin: content  # External keyword (equivalent to inject_as: stdin)
```

**3. `option` (named flags)**:
```yaml
parameters:
  - name: port
    inject_as: option
    option_name: "--port"
# Result: --port 8080
```

#### 2.2.4 Parameter Merging Algorithm [v1.7]

When both template placeholders (`${param}`) and explicit `parameters` block exist:

**Step 1: Inference** (from template)
- Extract all `${param}` or `${param:raw}` placeholders
- Infer for each:
  - `name`: Extracted from placeholder
  - `type`: Default `"string"` (MVP only)
  - `inject_as`: Inferred (`exec:` → `argument`, external `stdin:` → `stdin`)
  - `position`: Sequential order (0-indexed)
  - `:raw` modifier: Captured if present

**Step 2: Merge and Override**
- For each parameter in explicit `parameters` block:
  - If name exists in inferred set:
    - **Override**: `description`, `default`, custom metadata
    - **Preserve**: `inject_as`, `position`, `:raw` (inferred values are immutable)
  - If name doesn't exist: **ERROR** (undefined parameter)

**Step 3: Consistency Validation**
- ✅ Injection mode immutability
- ✅ Position immutability
- ✅ `:raw` consistency (can't add/remove via explicit params)
- ✅ `stdin` uniqueness (max 1 parameter)

**Example - Valid Override**:
```yaml
- name: search_tool
  exec: "grep ${pattern} ${file}"
  parameters:
    - name: file
      description: "File to search in"
      default: "./data.txt"
    - name: pattern
      description: "Search pattern (regex)"
# ✅ Both parameters get descriptions, file gets default
```

**Example - Invalid Override**:
```yaml
- name: bad_tool
  shell: "cat ${file} | wc -l"
  parameters:
    - name: file
      inject_as: stdin  # ❌ ERROR
# Error: "Cannot override inject_as for parameter 'file' (inferred: argument, explicit: stdin)"
```

#### 2.2.5 Tokenization Algorithm [v1.7]

**For `exec:` Mode**:

Uses **shell-like lexical parsing** (e.g., Python's `shlex.split`, Go's `shlex`, Node.js `shell-quote`).

**Principles**:
- **Static parts**: Template text supports quotes for whitespace
- **Dynamic parts**: `${param}` placeholders are safely injected

**Examples**:
```yaml
# ✅ Valid: Quoted static argument
exec: 'grep "fixed pattern" ${file}'
# Tokenizes to: ["grep", "fixed pattern", "${file}"]

# ✅ Valid: Multiple placeholders
exec: "ls -la ${dir1} ${dir2}"
# Tokenizes to: ["ls", "-la", "${dir1}", "${dir2}"]

# ❌ Invalid: Shell metacharacter
exec: "cat ${file} | wc -l"
# Rejected at validation: Pipe operator not allowed
```

**Validation Requirements**:
- Use POSIX-compliant tokenization library
- Preserve quotes in static arguments
- Reject tokens containing shell metacharacters
- Support escaped quotes within static strings

#### 2.2.6 Complete Tool Schema (TypeScript/Zod)

```typescript
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),

  // Execution mode (mutually exclusive)
  exec: z.string().optional(),       // v1.7 syntax sugar
  shell: z.string().optional(),      // v1.7 syntax sugar
  command: z.array(z.string()).optional(),  // v1.1 original format

  // Parameters
  parameters: z.array(ToolParameterSchema).optional(),
  stdin: z.string().optional(),      // v1.7 shorthand for stdin parameter

}).refine(
  (data) => {
    // Mutual exclusivity: only one of exec, shell, command
    const modes = [data.exec, data.shell, data.command].filter(Boolean);
    return modes.length === 1;
  },
  { message: "Tool must specify exactly one of: exec, shell, or command" }
);

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string']),  // MVP: only string supported
  description: z.string().optional(),
  required: z.boolean().default(true),
  inject_as: z.enum(['argument', 'stdin', 'option']).default('argument'),
  option_name: z.string().optional(),  // Required if inject_as === 'option'
  default: z.string().optional(),
  position: z.number().optional(),     // Auto-inferred in v1.7 syntax
});
```

#### 2.2.7 Tool Expansion (`delta tool expand`)

**Purpose**: Transparency tool to show how syntax sugar expands to internal representation.

**Command**:
```bash
delta tool expand <path/to/agent.yaml>
```

**Example**:
```bash
# Input (agent.yaml)
tools:
  - name: count_lines
    shell: "cat ${file} | wc -l"

# Output (expanded internal representation)
tools:
  - name: count_lines
    command: ["sh", "-c", "cat \"$1\" | wc -l", "--"]
    parameters:
      - name: file
        type: string
        inject_as: argument
        position: 0
```

**Use Cases**:
- Learning how simplified syntax works
- Debugging tool configuration
- Validating security (checking quote placement)

---

### 2.3 Session Management

#### 2.3.1 Design Evolution [v1.4 → v1.5]

**v1.4 PTY-based Approach** (Deprecated, moved to experimental):

**Architecture**:
- PTY (pseudo-terminal) for real-time interaction
- Holder process + Unix socket IPC
- 8 commands: `start`, `write`, `read`, `write-key`, `end`, `attach`, `detach`, `list`
- 1800+ lines of code

**Why Deprecated**:
1. ❌ **LLM Real-time Mismatch**: LLMs operate in request-response cycles, cannot monitor PTY output in real-time
2. ❌ **Required Polling Pattern**: write → sleep → read → analyze → repeat (10-60 second delays)
3. ❌ **ANSI Escape Sequences**: Not LLM-friendly (e.g., `\x1b[A` for arrow up)
4. ❌ **Limited Use Cases**: PTY needed for vim, top, ncurses apps - unsuitable for LLM automation
5. ❌ **High Complexity**: Holder process, socket IPC, escape parsing, key-code mapping

**Lesson from ADR-004**: Validate **LLM interaction patterns**, not just technical feasibility. PTY was technically sound but failed the usage pattern test.

**Current Status**: Moved to `src/sessions-pty/` and `delta-sessions-pty` CLI as experimental reference.

---

**v1.5 Simplified Approach** (Current, Production):

**Architecture**:
- **Command-based execution** (synchronous request-response)
- **File-based state** (no long-running process)
- 3 core commands: `start`, `exec`, `end`
- ~600 lines of code (67% reduction)

**Core Concepts**:

**Session**: A persistent execution context with:
- Working directory (preserved across commands)
- Environment variables (preserved across commands)
- Execution history (optional, for debugging)
- State metadata

**Execution Model**:
```
Input: Session ID + Command string
    ↓
Execute command in session context
    ↓
Output: { stdout, stderr, exit_code, execution_time_ms }
```

#### 2.3.2 Simplified Sessions API [v1.5]

**Command 1: `start` - Create Session**

```bash
delta-sessions start [shell_command]
```

**Examples**:
```bash
# Default bash
delta-sessions start

# Specific shell
delta-sessions start bash

# Python REPL
delta-sessions start python3
```

**Output (JSON)**:
```json
{
  "session_id": "sess_abc123",
  "command": "bash",
  "work_dir": "/current/directory",
  "status": "active"
}
```

---

**Command 2: `exec` - Execute Command**

```bash
delta-sessions exec <session_id> [command]
# or stdin:
echo "command" | delta-sessions exec <session_id>
```

**Examples**:
```bash
# Single command
delta-sessions exec sess_abc123 "ls -la"

# Multi-line script (stdin)
echo "cd /tmp && ls -la && pwd" | delta-sessions exec sess_abc123

# Heredoc
delta-sessions exec sess_abc123 << 'EOF'
for i in 1 2 3; do
  echo "Number: $i"
done
EOF
```

**Output (JSON)**:
```json
{
  "stdout": "total 48\ndrwxr-xr-x  12 user  staff  384 Oct  2 10:30 .\n...",
  "stderr": "",
  "exit_code": 0,
  "execution_time_ms": 42
}
```

---

**Command 3: `end` - Terminate Session**

```bash
delta-sessions end <session_id>
```

**Output**:
```json
{
  "status": "terminated",
  "session_id": "sess_abc123"
}
```

---

**Command 4: `list` - List Sessions** (Debugging)

```bash
delta-sessions list
```

**Output**:
```json
[
  {
    "session_id": "sess_abc123",
    "command": "bash",
    "status": "active",
    "created_at": "2025-10-02T10:30:00Z"
  }
]
```

#### 2.3.3 State Preservation [v1.5]

**Session Directory Structure**:
```
<AGENT_WORKSPACE>/.sessions/
└── sess_abc123/
    ├── metadata.json      # Session info
    ├── env.sh            # Environment variables (export -p output)
    ├── work_dir.txt      # Current working directory (pwd output)
    └── history.log       # Execution log (optional)
```

**Session Metadata Format**:
```json
{
  "session_id": "sess_abc123",
  "command": "bash",
  "created_at": "2025-10-02T10:30:00Z",
  "last_executed_at": "2025-10-02T10:35:00Z",
  "status": "active",
  "work_dir": "/path/to/workspace",
  "execution_count": 12
}
```

**State Preservation Mechanism** (Wrapper Script):
```bash
#!/bin/bash
# delta-session-wrapper.sh

# 1. Load session state
source /path/to/session/env.sh
cd "$(cat /path/to/session/work_dir.txt)"

# 2. Execute user command
eval "$USER_COMMAND"
EXIT_CODE=$?

# 3. Save new state
pwd > /path/to/session/work_dir.txt
export -p > /path/to/session/env.sh

exit $EXIT_CODE
```

**How It Works**:
- Each `exec` call loads state, executes command, saves new state
- Working directory persists: `cd /tmp` in one command → next command starts in `/tmp`
- Environment variables persist: `export VAR=value` in one command → `$VAR` available in next

#### 2.3.4 Agent Integration Example

**Tool Configuration** (`agent.yaml`):
```yaml
tools:
  - name: session_start
    description: "Start a persistent bash session"
    exec: "delta-sessions start"

  - name: session_exec
    description: "Execute a bash command in the session. Returns JSON with stdout, stderr, exit_code."
    exec: "delta-sessions exec ${session_id}"
    stdin: command

  - name: session_end
    description: "Terminate the session"
    exec: "delta-sessions end ${session_id}"
```

**Agent Workflow Example**:
```
Thought: I need a bash session to run multiple commands.

Action: session_start()
Result: {"session_id": "sess_abc123", "status": "active"}

---

Thought: Check disk usage in current directory.

Action: session_exec("sess_abc123", "df -h .")
Result: {
  "stdout": "Filesystem  Size  Used  Avail  Use%  Mounted on\n/dev/sda1   50G   30G   18G   63%  /",
  "stderr": "",
  "exit_code": 0
}

---

Thought: Find files larger than 100MB.

Action: session_exec("sess_abc123", "find . -type f -size +100M -exec ls -lh {} \\;")
Result: {
  "stdout": "-rw-r--r-- 1 user group 150M Oct  2 10:30 ./large-file.dat\n...",
  "stderr": "",
  "exit_code": 0
}

---

Thought: Task complete, clean up session.

Action: session_end("sess_abc123")
Result: {"status": "terminated"}
```

#### 2.3.5 Comparison: PTY vs Simplified

| Aspect | PTY (v1.4) | Simplified (v1.5) |
|--------|------------|-------------------|
| **Code size** | 1800+ lines | ~600 lines |
| **Interaction model** | write → read (async) | exec → response (sync) |
| **LLM cognitive load** | High (escape sequences, timing) | Low (command in/output out) |
| **Real-time support** | Yes (streaming) | No (batch) |
| **State management** | PTY process | File-based |
| **Use cases** | vim, top, menus | bash, Python, SQL |
| **Implementation complexity** | High (holder, socket, PTY) | Low (spawn + wrapper) |
| **Error handling** | Complex (socket failures, crashes) | Simple (exit codes) |
| **Debugging** | Hard (cross-process, PTY logs) | Easy (stdout/stderr capture) |

**When to use PTY** (experimental `delta-sessions-pty`):
- Interactive terminal apps requiring real-time feedback (rare)
- Human-operated workflows (not LLM-automated)

**When to use Simplified** (production `delta-sessions`):
- Command execution (bash, Python, etc.)
- LLM-automated workflows
- Production agent deployments

---

### 2.4 Context & Memory Management

#### 2.4.1 The Context Management Challenge [v1.6]

**Core Bottleneck**: Context window management is a **feasibility problem**, not an optimization problem.

**Real-world scenarios that hit limits**:
```
- Code review agent: 3000 lines of code + 100 git commits
- Documentation agent: 50 API files + usage examples
- Debug agent: 10 log files + Stack Overflow results

Current approach (raw journal):
→ Runs out of context by iteration 8
→ Loses critical information
→ Enters "amnesia loops"
```

**Quote from agent developer**: *"Context management is more critical than tools. It's the difference between toy demos and production agents."*

**v1.5 Limitations**:
- **Inflexible**: No way to inject static knowledge (workspace guides, docs)
- **No compression**: Journal grows linearly, consuming entire context window
- **Opaque**: Context construction strategy buried in engine code
- **Not composable**: Can't reuse strategies across agents

#### 2.4.2 Solution: Context Composition Layer [v1.6]

**Core Idea**: Transform context construction from an **implicit, hardcoded process** into an **explicit, composable protocol**.

**Before v1.6**:
```
Engine → Read journal.jsonl → Build context → Call LLM
         ↑ (Hidden, hardcoded)
```

**After v1.6**:
```
Engine → Read context.yaml → Execute sources → Build context → Call LLM
         ↑ (Visible, declarative)
```

**Philosophy**:
- **Explicit over implicit**: Context construction is now visible configuration
- **Context as data**: All context components are file-based artifacts
- **Composition over built-in**: Complex strategies (memory folding, RAG) are external tools

#### 2.4.3 context.yaml Schema [v1.6, v1.9.1]

**Status in v1.9.1**: ⚠️ **REQUIRED** (breaking change from v1.6)

**Location**: `${AGENT_HOME}/context.yaml`

**Complete Schema**:
```yaml
# Root element
sources:
  - type: file | computed_file | journal
    # ... type-specific fields (see below)
```

---

**Source Type 1: `file` (Static Content)**

```yaml
- type: file
  id: workspace_guide               # Optional. Used in debug logs
  path: "${CWD}/DELTA.md"           # Required. Supports ${AGENT_HOME}, ${CWD}
  on_missing: skip                  # Optional. Default: error
                                    # skip = ignore if not found
                                    # error = throw error if not found
```

**Path Variables**:
- `${AGENT_HOME}`: Absolute path to agent project directory
- `${CWD}`: Absolute path to current working directory (workspace)

**Use Cases**:
- System prompts: `${AGENT_HOME}/system_prompt.md`
- Workspace guides: `${CWD}/DELTA.md` (project-specific context)
- Documentation: `${AGENT_HOME}/docs/api-reference.md`

---

**Source Type 2: `computed_file` (Dynamic Content)**

```yaml
- type: computed_file
  id: knowledge_summary             # Optional
  generator:
    command: ["python3", "${AGENT_HOME}/tools/summarize.py"]  # Required
    timeout_ms: 30000               # Optional. Default: 30000 (30 seconds)
  output_path: "${CWD}/.delta/context_artifacts/summary.md"  # Required
  on_missing: error                 # Optional. Default: error
```

**Execution Protocol**:
1. Engine spawns `generator.command` with CWD = workspace root
2. Command writes output to `output_path`
   - **Important**: Generator is responsible for creating output directory if needed
3. Engine reads `output_path` and injects content into context

**Environment Variables Passed to Generator**:
```bash
DELTA_RUN_ID=/path/to/.delta/{run_id}
DELTA_AGENT_HOME=/path/to/agent
DELTA_CWD=/path/to/workspace
JOURNAL_PATH=/path/to/.delta/{run_id}/journal.jsonl
```

**Use Cases**:
- **Memory folding**: Summarize old journal entries
- **Vector retrieval**: Find relevant docs based on current task
- **Knowledge graphs**: Extract entities from conversation
- **LLM-based summarization**: Use Claude Haiku to compress history

**Example Generator** (Memory Folding):
```python
#!/usr/bin/env python3
import os
import json

journal_path = os.environ['JOURNAL_PATH']
output_path = ".delta/context_artifacts/summary.md"

# Read journal
with open(journal_path) as f:
    events = [json.loads(line) for line in f]

# Extract key decisions
decisions = [
    e['content'] for e in events
    if e['type'] == 'THOUGHT' and 'decided' in e['content'].lower()
]

# Write summary
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, 'w') as f:
    f.write("## Memory Summary\n\n")
    for i, decision in enumerate(decisions, 1):
        f.write(f"{i}. {decision}\n\n")
```

---

**Source Type 3: `journal` (Conversation History)**

```yaml
- type: journal
  id: recent_conversation           # Optional
  max_iterations: 15                # Optional. Omit for all conversation
```

**Behavior**:
- Reads `journal.jsonl` from the current run
- Reconstructs conversation as `ChatCompletionMessageParam[]` (OpenAI format)
- `max_iterations: N` limits to the most recent N reasoning cycles
- Without `max_iterations`: Includes **all** conversation (v1.5 behavior)

**Return Type** (Different from other sources):
```typescript
// file/computed_file return wrapped system message:
{role: 'system', content: '# Context Block: id\n\n...'}

// journal returns native OpenAI conversation (NOT wrapped):
[
  {role: 'assistant', content: null, tool_calls: [...]},
  {role: 'tool', content: '...', tool_call_id: '...'},
  // ... more assistant/tool messages
]
```

**Why "max_iterations" not "max_turns"**:
- Aligns with engine terminology (iteration counter in engine.ts)
- One iteration = one complete Think-Act-Observe cycle

**Terminology**:
- **Iteration**: One T-A-O cycle (1 THOUGHT + N tool calls + N results)
- **Turn**: Conversational concept (1 user message + 1 assistant response)

---

**Complete Example** (Code Review Agent):
```yaml
# context.yaml for code review agent
sources:
  # Priority 1: Core instructions
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"

  # Priority 2: Workspace context (auto-skip if missing)
  - type: file
    id: workspace_guide
    path: "${CWD}/DELTA.md"
    on_missing: skip

  # Priority 3: Compressed knowledge (dynamic)
  - type: computed_file
    id: codebase_summary
    generator:
      command: ["tree-sitter-summarize", "--repo", "${CWD}"]
    output_path: "${CWD}/.delta/context_artifacts/codebase.md"

  # Priority 4: Recent conversation (fills remaining space)
  - type: journal
    id: recent_dialogue
    max_iterations: 20
```

**Key Insight**: Source order = priority order. Top sources are included first.

#### 2.4.4 Default context.yaml Template [v1.9.1]

**Generated by `delta init`** (when creating new agent):

```yaml
# Delta Engine Context Strategy (v1.6+)
# This file defines HOW the Agent's attention window (LLM context) is constructed.
# It is the explicit "recipe" for what the Agent sees.

sources:
  # 1. Core Instructions (The System Prompt)
  # This is the primary definition of the Agent's role, rules, and goals.
  # Note: System Prompt must be explicitly declared here to ensure recipe completeness.
  - type: file
    id: system_prompt
    path: '${AGENT_HOME}/system_prompt.md'

  # 2. Workspace Guide (Optional: DELTA.md)
  # If a DELTA.md file exists in the workspace (CWD), it is automatically loaded.
  # Use this to provide workspace-specific context, rules, or documentation.
  - type: file
    id: workspace_guide
    path: '${CWD}/DELTA.md'
    on_missing: skip  # Skip if DELTA.md does not exist

  # 3. Conversation History (The Journal)
  # Includes the history of Thoughts, Actions, and Observations.
  - type: journal
    id: conversation_history
    # By default, the full history is included.
    # To limit history length (save tokens or manage attention), uncomment and adjust:
    # max_iterations: 20
```

**Design Principle**: The template serves dual purposes:
1. **Immediate functionality**: Replicates previous default behavior exactly
2. **Educational value**: Clear comments explain components and customization

#### 2.4.5 DELTA.md: Workspace Guide Pattern [v1.6]

**Problem**: Agent enters complex codebase. How does it understand project conventions?

**Solution**: Create `DELTA.md` in workspace root (CWD).

**Example**:
```markdown
# Project Guide

## Architecture
This is a microservices project. Key services:
- auth-service: Port 3001 (authentication and authorization)
- api-gateway: Port 3000 (main entry point)
- data-service: Port 3002 (PostgreSQL access)

## Running Tests
Use `npm test` in each service directory.
Integration tests: `npm run test:integration` (requires Docker)

## Database Migrations
Run manually: `npx sequelize-cli db:migrate`
Always create migration before schema changes.

## Common Pitfalls
- Redis must be running for auth-service (use `docker-compose up redis`)
- Database migrations are NOT automatic
- Use `.env.local` for local overrides (not committed)
```

**Result**: Every LLM invocation includes this guide. Agent "knows" the workspace.

**Configuration**: No configuration needed! Default `context.yaml` includes:
```yaml
- type: file
  path: "${CWD}/DELTA.md"
  on_missing: skip
```

#### 2.4.6 Memory Folding Pattern [v1.6]

**Use Case**: Long conversations (100+ iterations) exceed token limits.

**Pattern**:
```yaml
sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  # Compressed summary of old history
  - type: computed_file
    generator:
      command: ["${AGENT_HOME}/tools/fold-memory.sh"]
    output_path: "${CWD}/.delta/context_artifacts/summary.md"

  # Only recent conversation
  - type: journal
    max_iterations: 10
```

**fold-memory.sh Example**:
```bash
#!/bin/bash
JOURNAL=$JOURNAL_PATH
CUTOFF=$(($(wc -l < $JOURNAL) - 20))  # Skip last 20 iterations

echo "## Memory Summary (Iterations 1-${CUTOFF})"
echo ""
echo "### Actions Taken:"
grep ACTION_RESULT $JOURNAL | head -n $CUTOFF | \
  jq -r '.tool_name' | sort | uniq -c

echo ""
echo "### Key Decisions:"
grep THOUGHT $JOURNAL | head -n $CUTOFF | \
  jq -r '.content' | grep -i 'decided\|chose\|will' | head -10
```

**Result**: Context = instructions + compressed old history + recent 10 iterations.

**Extensibility**: Replace bash script with:
- **Vector retrieval**: Find relevant past observations
- **LLM summarization**: Use Claude Haiku for intelligent compression
- **Knowledge graph**: Extract and persist entities/relationships

**Reference Example**: `examples/2-core-features/memory-folding/`

#### 2.4.7 Context Builder Implementation [v1.6]

**Workflow**:
```typescript
class ContextBuilder {
  async build(): Promise<Message[]> {
    // 1. Load manifest (or use default)
    const manifest = await this.loadManifest();

    // 2. Process sources in order
    const messages: Message[] = [];
    for (const source of manifest.sources) {
      const content = await this.processSource(source);
      if (content) {
        // Note: journal source returns raw messages (not wrapped)
        if (source.type === 'journal') {
          messages.push(...content);  // Array of assistant/tool messages
        } else {
          messages.push({ role: 'system', content });  // Wrapped string
        }
      }
    }

    return messages;
  }

  private async processSource(source: ContextSource) {
    switch (source.type) {
      case 'file':
        return this.processFileSource(source);
      case 'computed_file':
        return this.processComputedFile(source);
      case 'journal':
        return this.processJournalSource(source);
    }
  }
}
```

**Module Structure**:
```
src/context/
├── types.ts                  # Zod schemas for context.yaml
├── builder.ts                # ContextBuilder class
├── sources/
│   ├── file-source.ts        # FileSource processor
│   ├── computed-source.ts    # ComputedFileSource processor
│   └── journal-source.ts     # JournalSource processor
└── index.ts                  # Public API exports
```

**Engine Integration**:
```typescript
// src/engine.ts (modified)
private async rebuildConversationFromJournal(): Promise<Message[]> {
  const builder = new ContextBuilder(
    this.ctx.agentHome,
    this.ctx.cwd,
    this.journal
  );

  return await builder.build();
}
```

**Design Decision**: All context construction logic is **extracted from engine.ts** into dedicated `src/context/` module. This keeps engine core clean and makes context logic independently testable.

#### 2.4.8 Future Extensions (Out of Scope for v1.6)

**Token Budget System (v1.6.1)**:
```yaml
total_max_tokens: 8000  # Global budget

sources:
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"
    # No max_tokens = must include fully

  - type: computed_file
    max_tokens: 2000  # Hard limit
    generator:
      command: ["summarize.py", "--target-tokens", "2000"]
    output_path: "${CWD}/.delta/context_artifacts/summary.md"

  - type: journal
    # Uses remaining budget
```

**Conditional Loading (v1.6.2)**:
```yaml
- type: file
  path: "${CWD}/api-docs.md"
  condition:
    when: task_contains
    pattern: "API|endpoint|REST"
```

**Caching (v1.6.2)**:
```yaml
- type: computed_file
  generator:
    command: ["expensive-analysis.py"]
  output_path: "${CWD}/.delta/context_artifacts/analysis.md"
  cache:
    strategy: file_hash
    invalidate_on: ["src/**/*.py"]  # Recompute if source files change
```

**Context Pipelines (v1.7)**:
```yaml
- type: pipeline
  stages:
    - generator: ["retrieve-docs.py"]  # Stage 1: Retrieve
      output: "${CWD}/.delta/tmp/docs.json"
    - generator: ["rank-docs.py"]      # Stage 2: Rerank
      output: "${CWD}/.delta/tmp/ranked.json"
    - generator: ["format-docs.py"]    # Stage 3: Format
      output: "${CWD}/.delta/context_artifacts/final.md"
```

---

### 2.5 Human Interaction

#### 2.5.1 ask_human Tool [v1.2]

**Purpose**: Pause agent execution to request human input.

**Built-in Tool Definition**:
```typescript
{
  name: "ask_human",
  description: "Request input from human user. Execution pauses until response received.",
  parameters: [
    {
      name: "prompt",
      type: "string",
      required: true,
      description: "Question or instruction to display to user"
    },
    {
      name: "input_type",
      type: "string",
      required: false,
      description: "Input type: text | password | confirmation"
    },
    {
      name: "sensitive",
      type: "boolean",
      required: false,
      description: "Whether input is sensitive (should hide input characters)"
    }
  ]
}
```

**Note**: `ask_human` is a **built-in tool** provided by the engine. Agents don't need to define it in `tools:` section; it's automatically available.

#### 2.5.2 Interaction Modes [v1.2]

**Mode 1: Interactive Mode (`-i` flag)**

```bash
delta run -i -m "Task requiring user input"
```

**Behavior**:
1. Agent invokes `ask_human(prompt="Please provide API key")`
2. Engine detects `-i` flag → activates synchronous interaction
3. Engine **prints prompt directly to terminal**
4. Engine **blocks** waiting for user input (stdin)
5. User types response + Enter
6. Engine captures response as tool execution result
7. Engine **continues immediately** (no status change, stays RUNNING)

**Key Characteristics**:
- ✅ Synchronous (blocking CLI prompts)
- ✅ No `.delta/interaction/` directory used
- ✅ No status change (stays RUNNING throughout)
- ✅ No exit code 101
- ✅ Fast feedback loop

**Use Case**: Development/debugging where human is present at terminal.

---

**Mode 2: Asynchronous Mode (default, no `-i` flag)**

```bash
delta run -m "Task requiring user input"
```

**Behavior (Pause Execution)**:
1. Agent invokes `ask_human(prompt="Please provide API key")`
2. Engine detects **no `-i` flag** → activates asynchronous interaction
3. Engine creates `.delta/{run_id}/interaction/request.json`:
   ```json
   {
     "request_id": "uuid",
     "timestamp": "ISO8601",
     "prompt": "Please provide API key",
     "input_type": "password",
     "sensitive": true
   }
   ```
4. Engine updates `metadata.json` status to `WAITING_FOR_INPUT`
5. Engine prints guidance:
   ```
   Agent paused. Provide response in .delta/{run_id}/interaction/response.txt
   Or use: delta continue -w <workspace> -m <response>
   ```
6. Engine **exits** with **code 101** (signals "interaction needed")

**Behavior (Resume Execution)**:
1. User creates `.delta/{run_id}/interaction/response.txt`:
   ```
   sk-abc123-my-api-key
   ```
2. User runs `delta continue -w <workspace> -m "sk-abc123-my-api-key"` (v1.8) or `delta run` (legacy)
3. Engine detects status `WAITING_FOR_INPUT` → smart resume
4. Engine reads `response.txt` content
5. Engine **deletes** both `request.json` and `response.txt` (cleanup)
6. Engine updates status back to `RUNNING`
7. Engine generates `ACTION_RESULT` event for `ask_human` with response content
8. Engine continues Think-Act-Observe loop

**Key Characteristics**:
- ✅ Asynchronous (engine exits, user responds later)
- ✅ Uses `.delta/interaction/` directory
- ✅ Status changes to `WAITING_FOR_INPUT`
- ✅ Exit code 101 signals need for interaction
- ✅ File-based communication (response.txt)

**Use Case**: Production/automation where agent runs unattended, human responds asynchronously.

#### 2.5.3 Interaction Protocol [v1.2]

**request.json Schema**:
```json
{
  "request_id": "uuid",
  "timestamp": "2025-10-13T14:35:22.123Z",
  "prompt": "Please provide API key:",
  "input_type": "password",  // text | password | confirmation
  "sensitive": true
}
```

**response.txt Format**:
```
[plain text user response]
```

**File Lifecycle**:
1. **Creation**: Engine creates both files when `ask_human` is called (async mode)
2. **User Action**: User fills in `response.txt`
3. **Cleanup**: Engine deletes both files after reading response
4. **Location**: `.delta/{run_id}/interaction/`

**Status Transitions**:
```
RUNNING → ask_human (async) → WAITING_FOR_INPUT → user response → RUNNING
```

#### 2.5.4 Journal Events [v1.2]

**When `ask_human` is called**:
```json
{
  "type": "HUMAN_INPUT_REQUEST",
  "iteration": 5,
  "timestamp": "2025-10-13T14:35:22.123Z",
  "prompt": "Please provide API key",
  "input_type": "password",
  "sensitive": true
}
```

**When response is received**:
```json
{
  "type": "HUMAN_INPUT_RECEIVED",
  "iteration": 5,
  "timestamp": "2025-10-13T14:40:15.456Z",
  "response": "sk-abc123..." // Note: logged even if sensitive=true
}
```

**Then standard ACTION_RESULT**:
```json
{
  "type": "ACTION_RESULT",
  "iteration": 5,
  "timestamp": "2025-10-13T14:40:15.456Z",
  "tool_name": "ask_human",
  "observation_content": "sk-abc123...",
  "exit_code": 0
}
```

#### 2.5.5 Comparison: Interactive vs Async

| Aspect | Interactive (`-i`) | Asynchronous (default) |
|--------|-------------------|------------------------|
| **User presence** | Required at terminal | Can respond later |
| **Response mechanism** | stdin (blocking) | File (response.txt) |
| **Engine behavior** | Blocks and waits | Exits (code 101) |
| **Status change** | No (stays RUNNING) | Yes (→ WAITING_FOR_INPUT) |
| **Interaction directory** | Not used | Creates files |
| **Cleanup** | Not needed | Deletes files after read |
| **Use case** | Development/debugging | Production/automation |
| **Latency** | Instant | Async (user-paced) |

---

### 2.6 CLI & User Interface

#### 2.6.1 delta run Command [v1.1, v1.8, v1.10]

**Evolution**:
- v1.1: Original command with `--task` parameter
- v1.8: Renamed to `-m/--message` for semantic clarity (breaking change)
- v1.10: Added `--run-id` and `--format` options; removed auto-resume logic

**Current Signature** (v1.10):
```bash
delta run
  --agent <path>          # Required: Agent directory (default: .)
  -m, --message <text>    # Required: Task description or user message
  [-w, --work-dir <path>] # Optional: Workspace directory
  [--max-iterations <n>]  # Optional: Max iterations (default: 30)
  [-v, --verbose]         # Optional: Verbose logging
  [-i, --interactive]     # Optional: Interactive mode (sync CLI prompts)
  [-y, --yes]             # Optional: Skip workspace selection prompt
  [--run-id <id>]         # [v1.10] Optional: Client-generated run ID (must be unique)
  [--format <format>]     # [v1.10] Optional: Output format (text|json|raw, default: text)
```

**Examples**:
```bash
# Basic usage
delta run --agent ./my-agent -m "Analyze sales data"

# Short form (agent defaults to current directory)
delta run -m "Create API documentation"

# Interactive mode (for ask_human)
delta run -i -m "Deploy to production"

# Silent mode (auto-create workspace, no prompts)
delta run -y -m "Run tests"

# Custom workspace
delta run -w ./existing-workspace -m "Continue analysis"

# [v1.10] Client-generated run ID (robust orchestration)
RUN_ID=$(uuidgen)
delta run --run-id "$RUN_ID" -m "Process batch job" --format json

# [v1.10] JSON output for automation
OUTPUT=$(delta run -m "Generate report" --format json 2>/dev/null)
RESULT=$(echo "$OUTPUT" | jq -r '.result')

# [v1.10] Raw output for Unix pipes
delta run -m "List files" --format raw | grep ".txt"
```

**Smart Resume Logic** [v1.2-v1.9, REMOVED in v1.10]:
```
1. Check if .delta/LATEST exists in work-dir
2. Read metadata.json status
3. If WAITING_FOR_INPUT or INTERRUPTED → auto-resume
4. Otherwise → create new run
```

**v1.10 Breaking Change**:
- ❌ **Auto-resume removed** to enable concurrent execution
- ❌ **LATEST file removed** from workspace structure
- ✅ **Explicit resumption required** via `delta continue --run-id <id>`
- ✅ **Rationale**: Eliminates race conditions in concurrent workflows

#### 2.6.2 delta continue Command [v1.8, v1.10]

**Purpose**: Explicit continuation of existing runs with state-aware semantics.

**Evolution**:
- v1.8: Introduced as explicit continuation alternative to auto-resume
- v1.10: `--run-id` now required; Janitor mechanism added for orphan cleanup

**Signature** (v1.10):
```bash
delta continue
  --run-id <id>           # [v1.10] Required: Specific run ID to continue
  -w, --work-dir <path>   # Required: Workspace containing run to continue
  [-m, --message <text>]  # Optional/Required: Depends on state (see below)
  [--max-iterations <n>]  # Optional: Max iterations (default: 30)
  [-v, --verbose]         # Optional: Verbose logging
  [-i, --interactive]     # Optional: Interactive mode
  [--force]               # [v1.10] Optional: Skip cross-host check for Janitor
  [--format <format>]     # [v1.10] Optional: Output format (text|json|raw)
```

**State Machine Logic**:

| State | Semantics | Message Required? | Behavior |
|-------|-----------|-------------------|----------|
| `INTERRUPTED` | Resume execution | **No** (optional) | Direct continuation or append USER_MESSAGE then resume |
| `WAITING_FOR_INPUT` | Provide response | **Yes** (required) | Write to `interaction/response.txt` then resume |
| `COMPLETED` | Extend conversation | **Yes** (required) | Append USER_MESSAGE then continue execution |
| `FAILED` | Retry after error | **Yes** (required) | Append USER_MESSAGE then retry |
| `RUNNING` | [v1.10] Janitor check | N/A | **Janitor activates**: Check PID liveness, clean if dead, error if alive |

**Examples**:

```bash
# [v1.10] All operations require --run-id

# INTERRUPTED: Simple resume
delta continue --run-id 20251014_0430_aaaa -w ./workspace

# INTERRUPTED: Resume with additional instruction
delta continue --run-id 20251014_0430_aaaa -w ./workspace -m "Skip validation step"

# WAITING_FOR_INPUT: Provide response
delta continue --run-id 20251014_0430_bbbb -w ./workspace -m "yes, proceed"

# COMPLETED: Extend conversation
delta continue --run-id 20251014_0430_cccc -w ./workspace -m "Now create summary report"

# FAILED: Retry with corrected info
delta continue --run-id 20251014_0430_dddd -w ./workspace -m "API key is in ~/.api-key"

# [v1.10] Orphaned RUNNING process (Janitor cleanup)
delta continue --run-id 20251014_0430_eeee -w ./workspace  # Auto-cleans if process dead

# [v1.10] Cross-host scenario with --force
delta continue --run-id 20251014_0430_ffff -w ./workspace --force
```

**Error Handling**:

**No run found**:
```
Error: No existing run found in the work directory
Hint: Use `delta run` to start a new run
```

**Missing required message**:
```
Error: Run is COMPLETED. To continue, provide a message using -m/--message
Example: delta continue -w <workspace> -m "Now do something else"
```

**Running process**:
```
Error: Run is currently executing. Wait for completion or interrupt first.
```

**Design Decisions**:
- ❌ No `--agent` parameter (agent info stored in run metadata)
- ✅ `-w/--work-dir` required (explicit over implicit)
- ✅ State-aware semantics (message optional/required depends on state)
- ✅ Complementary to `delta run` (not replacement)

#### 2.6.3 Comparison: run vs continue [v1.10 Updated]

| Aspect | `delta run` | `delta continue` |
|--------|------------|------------------|
| **Purpose** | Start new run only | Explicit continuation |
| **Agent parameter** | Required (`--agent`) | Not needed (from metadata) |
| **Workspace** | Optional (auto-select) | Required (`-w`) |
| **Message** | Always required | State-dependent |
| **Auto-resume** | [v1.10] **Removed** | N/A (always explicit) |
| **Run ID** | [v1.10] Optional (`--run-id`) | [v1.10] **Required** (`--run-id`) |
| **State handling** | Creates new run only | Complete (5 states + Janitor) |
| **Mental model** | "Start new task" | "Continue specific run" |
| **Use case** | New tasks only | Extend/retry/resume existing work |

**Recommendation** (v1.10+):
- Use `delta run` for starting new tasks
- Use `delta list-runs` to find run IDs
- Use `delta continue --run-id <id>` for explicit continuation

#### 2.6.4 delta list-runs Command [v1.10]

**Purpose**: List runs in a workspace with filtering and formatting options

**Signature**:
```bash
delta list-runs
  [-w, --work-dir <path>] # Optional: Workspace path (default: current directory)
  [--resumable]           # Optional: Filter to resumable runs only
  [--status <status>]     # Optional: Filter by specific status
  [--first]               # Optional: Return only most recent run
  [--format <format>]     # Optional: Output format (text|json, default: text)
```

**Filter Logic**:
- `--resumable`: Shows INTERRUPTED, WAITING_FOR_INPUT, FAILED, COMPLETED
- `--status`: Filter by exact status match
- `--first`: Returns single most recent run (useful for scripting)

**Output Formats**:

**Text Format** (default):
```bash
$ delta list-runs -w W001 --resumable
20251014_0430_aaaa  INTERRUPTED       "Analyze data"     2m ago
20251014_0435_bbbb  WAITING_FOR_INPUT "Process report"   1m ago
20251014_0440_cccc  FAILED            "Generate chart"   30s ago
```

**JSON Format**:
```json
[
  {
    "run_id": "20251014_0430_aaaa",
    "status": "INTERRUPTED",
    "task_summary": "Analyze data",
    "last_updated": "2025-10-14T10:30:00Z"
  }
]
```

**Common Patterns**:
```bash
# List all runs
delta list-runs

# Find resumable runs
delta list-runs --resumable

# Get most recent resumable run ID (for scripting)
RUN_ID=$(delta list-runs --resumable --first --format json | jq -r '.[0].run_id')

# Quick continue pattern
delta continue --run-id $(delta list-runs --resumable --first)
```

#### 2.6.5 Output Formats [v1.10]

**Purpose**: Standardized output for human readability and machine processing

**Available Formats**:
1. `text` (default) - Human-readable summaries
2. `json` - Structured data for automation (RunResult v2.0 schema)
3. `raw` - Pure data for Unix pipes

**I/O Separation**:
- **stderr**: Real-time execution logs, Think-Act-Observe stream
- **stdout**: Final result based on format

**Format Specifications**:

**Text Format** (`--format text`):
```text
--- Run Summary ---
Run ID:     20251014_0430_aaaa
Status:     COMPLETED
Duration:   2m 30s
-------------------
Result:
{
  "summary": "Analysis complete.",
  "report_file": "W001/report.pdf"
}
-------------------
```

**JSON Format** (`--format json`):
```json
{
  "schema_version": "2.0",
  "run_id": "20251014_0430_aaaa",
  "status": "COMPLETED",
  "result": {
    "summary": "Analysis complete.",
    "report_file": "W001/report.pdf"
  },
  "metrics": {
    "iterations": 15,
    "duration_ms": 150000,
    "usage": { /* token usage */ }
  }
}
```

**Raw Format** (`--format raw`):
- **COMPLETED** (exit 0): Pure result data on stdout
- **Other statuses** (exit != 0): Empty stdout, error in stderr
- **Use case**: Unix pipeline composition

**Exit Codes**:
| Code | Status | Meaning |
|------|--------|---------|
| 0 | COMPLETED | Success |
| 1 | FAILED | General failure |
| 101 | WAITING_FOR_INPUT | Interaction required |
| 126 | FAILED | Config/permission error |
| 130 | INTERRUPTED | User interrupt (Ctrl+C) |

#### 2.6.6 RunResult v2.0 Schema [v1.10]

**Purpose**: Structured output contract for `--format json`

**Schema**:
```typescript
interface RunResult {
  schema_version: "2.0";
  run_id: string;
  status: "COMPLETED" | "FAILED" | "WAITING_FOR_INPUT" | "INTERRUPTED";

  // Conditional fields (only one present based on status)
  result?: any;        // When COMPLETED
  error?: {            // When FAILED or INTERRUPTED
    type: string;
    message: string;
    details?: string;
  };
  interaction?: {      // When WAITING_FOR_INPUT
    prompt: string;
    input_type: string;
    sensitive: boolean;
  };

  metrics: {
    iterations: number;
    duration_ms: number;
    start_time: string;
    end_time: string;
    usage: {
      total_cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      model_usage: Record<string, any>;
    };
  };

  metadata: {
    agent_name: string;
    workspace_path: string;
  };
}
```

#### 2.6.7 Environment Variables [v1.8]

**Supported Variables**:
```bash
# API Key (choose one naming style)
DELTA_API_KEY=<your-key>              # Recommended (v1.8+)
DELTA_API_KEY=<your-key>             # Legacy, still supported

# Base URL (choose one)
DELTA_BASE_URL=<custom-endpoint>      # Recommended (v1.8+)
DELTA_BASE_URL=<custom-endpoint>     # Alternative (v1.8+)
DELTA_BASE_URL=<custom-endpoint>      # Legacy, still supported
```

**Loading Priority** (local overrides global):
```
1. {workDir}/.env          (highest priority - workspace-specific)
2. {agentPath}/.env        (agent-specific)
3. Project root .env       (search upward for .git, use .env if found)
4. process.env             (system environment, lowest priority)
```

**Example Priority Resolution**:
```bash
# Project root: .env (global default)
DELTA_API_KEY=sk-default-key

# Agent directory: my-agent/.env (agent-specific)
DELTA_API_KEY=sk-agent-key

# Workspace: W001/.env (workspace-specific, overrides all)
DELTA_API_KEY=sk-workspace-key

# Result: Engine uses sk-workspace-key
```

**Design Rationale**:
- **Local overrides global**: Matches developer expectations
- **Search upward for project root**: Finds .git directory, uses .env if exists
- **System env lowest priority**: Explicit file configuration preferred

---

### 2.7 Agent Structure & Composition

#### 2.7.1 Agent Project Structure Evolution [v1.1, v1.9, v1.9.1]

**v1.1 Structure** (Still valid):
```
MyAgent/
├── config.yaml           # Core configuration
├── system_prompt.md      # Agent instructions
└── tools/               # Optional custom tools
    └── my-tool.sh
```

**v1.9 Unified Structure** (Current, Recommended):
```
MyAgent/
├── agent.yaml           # [Required] Core + metadata (replaces config.yaml)
├── system_prompt.md     # [Required] Agent instructions
├── context.yaml         # [Required] Context composition (v1.9.1+)
├── hooks.yaml           # [Optional] Lifecycle hooks (separated from agent.yaml)
├── tools/              # [Optional] Custom tool scripts
│   ├── file-ops.yaml   # Importable tool definitions (v1.9)
│   └── web-search.sh   # Tool implementations
└── workspaces/         # [Runtime] Generated during execution
    ├── LAST_USED
    ├── W001/
    └── W002/
```

**Key Changes in v1.9**:
- ✅ `config.yaml` → `agent.yaml` (semantic clarity)
- ✅ Lifecycle hooks moved to separate `hooks.yaml` (separation of concerns)
- ✅ Imports mechanism for tool composition
- ✅ `context.yaml` now required (v1.9.1 breaking change)

#### 2.7.2 agent.yaml Schema [v1.9]

**Complete Schema**:
```yaml
# === 1. Metadata ===
name: my-agent
version: 1.0.0
description: Agent description

# === 2. Core Configuration (Thinking) ===
llm:
  model: gpt-4o
  temperature: 0.7
  max_tokens: 4096
  # Other OpenAI-compatible parameters

system_prompt: system_prompt.md  # Path to prompt file (relative to agent root)

# === 3. Capability Composition (v1.9 new) ===
imports:
  - ./tools/file-ops.yaml
  - ./tools/web-search.yaml
  # Future: Support for remote imports
  # - npm:@delta/common-tools/v1.0.0/base.yaml

# === 4. Capability Definition (Tools) ===
tools:
  - name: local_tool
    description: "Local tool example"
    exec: "echo ${message}"

# === 5. Lifecycle Hooks (v1.9: moved to hooks.yaml) ===
# Deprecated: Define hooks in hooks.yaml instead
```

**TypeScript/Zod Schema**:
```typescript
export const AgentConfigSchema = z.object({
  // Metadata
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),

  // LLM Configuration
  llm: z.object({
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().optional(),
    // ... other OpenAI parameters
  }),

  // System Prompt
  system_prompt: z.string(),  // Path to file

  // Imports (v1.9)
  imports: z.array(z.string()).optional(),

  // Tools
  tools: z.array(ToolDefinitionSchema).optional(),

  // Deprecated in v1.9 (use hooks.yaml instead)
  lifecycle_hooks: LifecycleHooksSchema.optional(),
});
```

#### 2.7.3 hooks.yaml Schema [v1.9]

**Purpose**: Separation of concerns - lifecycle hooks are behavioral extensions, not core capabilities.

**Complete Schema**:
```yaml
# Define Agent's reaction patterns to engine lifecycle events.
# Root node: lifecycle_hooks object

# Execute before LLM call (context engineering)
pre_llm_request:
  command: ["python3", "${AGENT_HOME}/tools/context_optimizer.py"]

# Execute after LLM response (output filtering)
post_llm_response:
  command: ["${AGENT_HOME}/tools/format_response.sh"]

# Execute before tool execution (validation)
pre_tool_execution:
  command: ["${AGENT_HOME}/tools/validate_args.sh"]

# Execute after tool execution (logging)
post_tool_execution:
  command: ["${AGENT_HOME}/tools/log_tool_result.sh"]

# Execute on any error (notification)
on_error:
  command: ["${AGENT_HOME}/tools/notify_error.sh"]

# Execute at run end (cleanup, regardless of success/failure)
on_run_end:
  command: ["delta-sessions", "cleanup"]

# Execute at iteration start
on_iteration_start:
  command: ["${AGENT_HOME}/tools/log_iteration.sh"]

# Execute at iteration end
on_iteration_end:
  command: ["${AGENT_HOME}/tools/checkpoint.sh"]
```

**Available Hooks** (Complete List):

| Hook Name | Trigger Point | Use Cases |
|-----------|--------------|-----------|
| `pre_llm_request` | Before LLM API call | Context optimization, token management |
| `post_llm_response` | After LLM response | Output filtering, logging |
| `pre_tool_execution` | Before tool execution | Parameter validation, security checks |
| `post_tool_execution` | After tool execution | Result logging, metrics |
| `on_error` | On any error | Notification, error recovery |
| `on_run_end` | At run completion | Cleanup, final reporting |
| `on_iteration_start` | Start of T-A-O cycle | Iteration logging, checkpointing |
| `on_iteration_end` | End of T-A-O cycle | State snapshots, progress tracking |

**Hook Environment Variables**:
```bash
# Common variables (all hooks)
RUN_DIR=/path/to/.delta/{run_id}
JOURNAL_PATH=/path/to/journal.jsonl
ITERATION_COUNT=5

# Hook-specific variables
TOOL_NAME=list_files              (pre_tool_execution, post_tool_execution)
TOOL_RESULT=...                   (post_tool_execution)
ERROR_MESSAGE=...                 (on_error)
```

**Compatibility** (v1.9):
- ✅ Engine prioritizes loading from `hooks.yaml`
- ⚠️ If `hooks.yaml` doesn't exist but `agent.yaml` contains `lifecycle_hooks` field, load from there with deprecation warning
- 🔴 v2.0: Will remove support for `lifecycle_hooks` in `agent.yaml` (only `hooks.yaml`)

#### 2.7.4 Imports Mechanism [v1.9]

**Purpose**: Reusable tool libraries, DRY principle, compositional configuration.

**Syntax**:
```yaml
# agent.yaml
imports:
  - ./tools/file-ops.yaml
  - ./tools/web-search.yaml
  - ../shared-tools/database.yaml  # Relative paths supported
```

**Imported File Format** (`tools/file-ops.yaml`):
```yaml
# Must contain a 'tools' array
tools:
  - name: read_file
    description: "Read file contents"
    exec: "cat ${filepath}"

  - name: write_file
    description: "Write content to file"
    exec: "tee ${filepath}"
    stdin: content

  - name: list_files
    description: "List files in directory"
    exec: "ls -la ${directory}"
```

**Merging Logic**:
1. **Parse imports**: Read and parse all imported files in order (supports recursive imports with circular dependency detection)
2. **Merge tools**: Combine imported tools with local tools
   - Merge order: `imports[0]` + `imports[1]` + ... + local `tools`
3. **Conflict Resolution** (Last Write Wins):
   - If tools with same name appear, later-loaded definitions override earlier ones
   - **Local tools have highest priority** (allows overriding imported defaults)

**Example - Override Imported Tool**:
```yaml
# tools/defaults.yaml
tools:
  - name: greet
    exec: "echo Hello"

# agent.yaml
imports:
  - ./tools/defaults.yaml

tools:
  - name: greet  # Override imported definition
    exec: "echo Bonjour"

# Result: agent uses "echo Bonjour" (local overrides imported)
```

**Security Boundaries**:
- ❌ **Prohibited**: Path traversal (`../` beyond agent root)
- ✅ **Required**: Resolved absolute paths must reside within `${AGENT_HOME}`
- ✅ **Validation**: Engine validates paths at configuration load time

**Use Case - Shared Tool Libraries**:
```
project/
├── shared-tools/
│   ├── file-ops.yaml
│   ├── web-search.yaml
│   └── database.yaml
└── agents/
    ├── agent-a/
    │   └── agent.yaml  (imports: ../../shared-tools/file-ops.yaml)
    └── agent-b/
        └── agent.yaml  (imports: ../../shared-tools/file-ops.yaml)
```

**Future Extensions** (v2.0+):
```yaml
imports:
  # Remote imports (npm packages)
  - npm:@delta/common-tools/v1.0.0/base.yaml

  # URL imports (public repositories)
  - https://github.com/org/agent-tools/raw/main/tools.yaml

  # Imports with version pinning
  - ./tools/file-ops.yaml@v1.2.0
```

#### 2.7.5 Configuration Loader Workflow [v1.9]

**Engine Startup Sequence**:
```
1. Locate Main Config:
   - Look for ${AGENT_HOME}/agent.yaml
   - If not found, check for config.yaml (v1.9 compatibility)
   - If both exist, use agent.yaml and warn

2. Parse and Import (imports):
   - Parse main config file
   - If 'imports' field exists:
     - Validate paths (security check)
     - Recursively load imported files
     - Detect circular dependencies
     - Merge tools (last-write-wins)

3. Load hooks.yaml (convention loading):
   - Check if ${AGENT_HOME}/hooks.yaml exists
   - If exists, load and parse
   - If not, check main config for 'lifecycle_hooks' (legacy, warn)

4. Load context.yaml (explicit loading, v1.9.1+):
   - Require ${AGENT_HOME}/context.yaml to exist
   - If missing, error with helpful message and default template
   - Parse sources and configure Context Builder

5. Validate Complete Configuration:
   - All tools have unique names (after merging)
   - All referenced files exist (system_prompt.md, etc.)
   - All schemas valid (Zod validation)
```

#### 2.7.6 Migration Path [v1.9]

**Phase One: Compatibility Period (v1.9)**

**Filename Compatibility**:
- ✅ Engine prioritizes `agent.yaml`
- ⚠️ If not found, falls back to `config.yaml` with `[DEPRECATION WARNING]`
- ⚠️ If both exist, uses `agent.yaml` with warning about duplicate

**Hooks Compatibility**:
- ✅ Engine prioritizes `hooks.yaml`
- ⚠️ If not found but main config has `lifecycle_hooks`, load from there with `[DEPRECATION WARNING]`

**Tool Updates**:
- ✅ `delta init` generates `agent.yaml` structure by default
- ✅ All docs and examples updated to v1.9 spec

**Phase Two: Remove Compatibility (v2.0)**:
- 🔴 Remove support for `config.yaml`
- 🔴 Remove support for `lifecycle_hooks` in `agent.yaml`
- 🔴 Require `agent.yaml` and `hooks.yaml` (if hooks used)

#### 2.7.7 context.yaml Status Upgrade [v1.9.1]

**Breaking Change**: `context.yaml` upgraded from **optional** to **REQUIRED**.

**Rationale** (Philosophical):
- **Eliminates "implicit magic"**: No hidden default configuration
- **Explicit over implicit**: Context construction strategy must be visible
- **Physical contract**: File represents concrete configuration, not abstract convention
- **Complete agent definition**: Trinity of `agent.yaml` (capability) + `system_prompt.md` (instruction) + `context.yaml` (cognition)

**Migration**:
```bash
# Quick fix: Create context.yaml with default content
cat > context.yaml << 'EOF'
sources:
  - type: file
    id: system_prompt
    path: '${AGENT_HOME}/system_prompt.md'
  - type: file
    id: workspace_guide
    path: '${CWD}/DELTA.md'
    on_missing: skip
  - type: journal
    id: conversation_history
EOF
```

**Error Message** (when context.yaml missing):
```
Error: context.yaml not found in /path/to/agent

Delta Engine requires an explicit context.yaml file to define how
the agent's attention window is constructed.

Quick fix - Create context.yaml with default content:

sources:
  - type: file
    id: system_prompt
    path: '${AGENT_HOME}/system_prompt.md'
  - type: file
    id: workspace_guide
    path: '${CWD}/DELTA.md'
    on_missing: skip
  - type: journal
    id: conversation_history

For more information, see:
docs/architecture/v1.9-unified-agent-structure.md#9-addendum
```

**Implementation Changes** (v1.9.1):
- ✅ Removed `DEFAULT_MANIFEST` constant
- ✅ Removed fallback logic in `loadManifest()`
- ✅ Updated all 4 built-in templates
- ✅ Updated all 7 examples

---

### 2.8 Orchestration & Concurrency [v1.10]

#### 2.8.1 Frontierless Workspace Model

**Problem**: v1.x relied on `.delta/LATEST` file as a global pointer to track the "most recent" run, creating race conditions in concurrent scenarios.

**Solution**: Remove all shared mutable state from the workspace control plane.

**Architecture Changes**:
```
# v1.9 Structure (with contention)
.delta/
  ├── LATEST         # [Problem] Race condition source
  └── {run_id}/

# v1.10 Structure (frontierless)
.delta/
  └── {run_id}/      # [Solution] No shared state
```

**Contract**: The orchestrator (parent agent, script, CI/CD) is responsible for tracking specific `run_id` values, not the engine.

#### 2.8.2 Client-Generated Run IDs

**Purpose**: Ensure run tracking even in catastrophic failure scenarios

**Mechanism**:
```bash
# Generate ID client-side
RUN_ID=$(uuidgen)

# Pass to engine
delta run --run-id "$RUN_ID" -m "Task" --format json

# ID persists even if engine crashes (kill -9)
# Can always recover with:
delta continue --run-id "$RUN_ID"
```

**Uniqueness Guarantee**:
- Engine validates ID doesn't exist in workspace
- Exits immediately on conflict
- Recommended: Use UUID v4 for automated orchestration

#### 2.8.3 Concurrent Execution Patterns

**Plan-Execute Pattern**:
```bash
# Planner agent creates plan
PLAN_ID=$(uuidgen)
delta run --run-id "$PLAN_ID" --agent planner -m "Design system" --format json
PLAN=$(cat .delta/$PLAN_ID/io/tool_executions/finish_*.json | jq -r '.output')

# Execute plan steps concurrently
for STEP in $(echo "$PLAN" | jq -r '.steps[]'); do
  STEP_ID=$(uuidgen)
  delta run --run-id "$STEP_ID" --agent executor -m "$STEP" --format json &
done
wait
```

**Map-Reduce Pattern**:
```bash
# Map phase: Process items in parallel
for ITEM in data/*.json; do
  RUN_ID=$(uuidgen)
  delta run --run-id "$RUN_ID" --agent processor -m "Process $ITEM" &
done
wait

# Reduce phase: Aggregate results
REDUCE_ID=$(uuidgen)
delta run --run-id "$REDUCE_ID" --agent aggregator -m "Combine results"
```

#### 2.8.4 Explicit-Only Resumption

**v1.10 Breaking Change**: All resumption must be explicit

**Before (v1.9)**:
```bash
# Auto-resume based on LATEST
delta run -m "Task"  # Could auto-resume existing run
delta continue       # Implicit: uses LATEST
```

**After (v1.10)**:
```bash
# No auto-resume
delta run -m "Task"  # Always creates new run

# Explicit resumption required
delta continue --run-id 20251014_0430_aaaa

# Find run IDs with list-runs
delta list-runs --resumable
```

**Rationale**:
- Eliminates race conditions
- Makes intent explicit
- Enables safe concurrency
- Follows "Explicit over Implicit" principle

#### 2.8.5 Robust Recovery Patterns

**Pattern 1: Track and Recover**:
```bash
#!/bin/bash
RUN_ID=$(uuidgen)
echo "$RUN_ID" > current_run.txt

# Start run (may crash)
delta run --run-id "$RUN_ID" -m "Critical task" --format json || true

# Always able to recover
SAVED_ID=$(cat current_run.txt)
delta continue --run-id "$SAVED_ID"
```

**Pattern 2: Concurrent with Recovery**:
```bash
# Track all spawned runs
> run_ids.txt

for TASK in "${TASKS[@]}"; do
  RUN_ID=$(uuidgen)
  echo "$RUN_ID" >> run_ids.txt
  delta run --run-id "$RUN_ID" -m "$TASK" &
done

# Can recover any crashed run
for RUN_ID in $(cat run_ids.txt); do
  STATUS=$(delta list-runs --format json | jq -r ".[] | select(.run_id==\"$RUN_ID\") | .status")
  if [ "$STATUS" = "INTERRUPTED" ]; then
    delta continue --run-id "$RUN_ID"
  fi
done
```

#### 2.8.6 Janitor and Concurrent Safety

**Guarantee**: At most one active process per `run_id`

**Mechanism**:
1. Each run records PID in metadata.json
2. On `delta continue`, if status is RUNNING:
   - Check if PID exists (kill -0)
   - Check process name matches
   - If dead: Clean up (RUNNING → INTERRUPTED)
   - If alive: Reject continuation

**Cross-Host Safety**:
```bash
# Different host scenario
$ delta continue --run-id xxx
Error: Run xxx was started on host 'host-a'.
Cannot verify process status from host 'host-b'.
If you're certain the original process is dead, use --force.

# Force flag for manual override
$ delta continue --run-id xxx --force
[Janitor] Cleaned up orphaned run: Process 12345 no longer exists
```

---

## Part III: Version Evolution Timeline

### 3.1 Feature Map (v1.1 - v1.10)

| Version | Release Date | Key Features | Impact |
|---------|-------------|--------------|--------|
| **v1.1** | Sep 2025 | Stateless core, journal.jsonl, tool system, Think-Act-Observe loop | Foundation - MVP |
| **v1.2** | Sep 2025 | ask_human, status states (WAITING_FOR_INPUT/INTERRUPTED/COMPLETED/FAILED), interactive/async modes, metadata.json | Human-in-loop - Critical for production |
| **v1.3** | Sep 2025 | Directory structure simplification (io/ replaces runtime_io/), sequential workspace naming (W001, W002), delta init command | UX improvement - Simplification |
| **v1.4** | Oct 2025 | PTY-based sessions (experimental, later deprecated) | Experimental - Learning |
| **v1.5** | Oct 2025 | Simplified sessions (command-based, replaces PTY), file-based state, 3 commands (start/exec/end) | Session management - Production-ready |
| **v1.6** | Oct 2025 | Context composition layer, context.yaml (optional), memory folding pattern, DELTA.md support | Context management - Game-changer |
| **v1.7** | Oct 2025 | Tool simplification (exec/shell syntax), :raw modifier, parameter merging, delta tool expand | DX improvement - Massive productivity boost |
| **v1.8** | Oct 2025 | CLI improvements (--task → -m/--message), delta continue command, environment variables (.env support) | UX improvement - Semantic clarity |
| **v1.9** | Oct 2025 | Unified agent structure (config.yaml → agent.yaml), hooks.yaml separation, imports mechanism | Architecture - Composition and modularity |
| **v1.9.1** | Oct 2025 | context.yaml now REQUIRED (breaking change) | Breaking - Eliminates implicit magic |
| **v1.10** | Oct 2025 | Frontierless workspace (LATEST removed), client-generated run IDs, Janitor mechanism, delta list-runs, output formats (text/json/raw), explicit-only resumption | Concurrency - Production robustness |

### 3.2 Breaking Changes Log

#### v1.10: Frontierless Workspace

**Change 1**: `.delta/LATEST` file removed from workspace structure

**Impact**: Any tools or scripts relying on LATEST must update to either:
- Scan `.delta/` directory directly
- Use explicit `run_id` tracking
- Use `delta list-runs` command

**Change 2**: `delta continue` now requires `--run-id` parameter

**Impact**: Implicit continuation no longer possible

**Migration**:
```bash
# Before (v1.9)
delta continue -w ./workspace

# After (v1.10)
delta continue --run-id 20251014_0430_aaaa -w ./workspace

# Find run ID using list-runs
delta list-runs --resumable --first
```

**Change 3**: Auto-resume removed from `delta run`

**Impact**: `delta run` always creates new run, never resumes existing

**Rationale**: Eliminates race conditions, enables concurrent multi-agent workflows

**Timeline**: Direct breaking change (no deprecation period due to early adoption stage)

---

#### v1.9.1: context.yaml Required

**Change**: `context.yaml` upgraded from optional to mandatory

**Impact**: Agents without `context.yaml` will fail to start

**Migration**:
```bash
# Create context.yaml with default template
cat > context.yaml << 'EOF'
sources:
  - type: file
    id: system_prompt
    path: '${AGENT_HOME}/system_prompt.md'
  - type: file
    id: workspace_guide
    path: '${CWD}/DELTA.md'
    on_missing: skip
  - type: journal
    id: conversation_history
EOF
```

**Rationale**: Eliminates "implicit magic" - explicit over implicit

**Timeline**: Immediate (no compatibility period)

---

#### v1.8: --task Parameter Renamed

**Change**: `--task` parameter renamed to `-m/--message`

**Impact**: All scripts/commands using `--task` must update

**Migration**:
```bash
# Automated migration for scripts
sed -i 's/--task/-m/g' my-scripts/*.sh

# Manual migration
# Before: delta run --agent ./my-agent --task "Do something"
# After:  delta run --agent ./my-agent -m "Do something"
```

**Rationale**: Semantic clarity - "message" is more versatile than "task"

**Timeline**: Direct breaking change (no deprecation period)

---

#### v1.5: Session API Changed

**Change**: PTY API (start/write/read) → Simplified API (start/exec/end)

**Impact**: Agents using v1.4 sessions must update tool definitions

**Migration**:
```yaml
# Before (v1.4)
tools:
  - name: shell_start
    command: [delta-sessions, start, bash, "-i"]
  - name: shell_write
    command: [delta-sessions, write]
  - name: shell_read
    command: [delta-sessions, read]

# After (v1.5)
tools:
  - name: session_start
    exec: "delta-sessions start"
  - name: session_exec
    exec: "delta-sessions exec ${session_id}"
    stdin: command
  - name: session_end
    exec: "delta-sessions end ${session_id}"
```

**Rationale**: LLM request-response pattern mismatch with PTY real-time model

**Timeline**: v1.5 release (PTY moved to experimental `delta-sessions-pty`)

---

#### v1.3: Directory Structure

**Change**: `runtime_io/` directory renamed to `io/`

**Impact**: Existing runs compatible (automatic migration), new runs use new structure

**Migration**: Automatic (no action required)

**Rationale**: Simplified naming convention

**Timeline**: v1.3 release (seamless migration)

### 3.3 Deprecation History

| Feature | Deprecated | Replaced By | Current Status | Timeline |
|---------|-----------|-------------|----------------|----------|
| **PTY Sessions** | v1.5 | Simplified Sessions (v1.5) | Experimental (`delta-sessions-pty`) | Deprecated Oct 2025 |
| **`runtime_io/` directory** | v1.3 | `io/` directory | Automatic migration | Deprecated Sep 2025 |
| **`config.yaml` filename** | v1.9 | `agent.yaml` | Soft deprecation (still works with warning) | Deprecated Oct 2025, Removed v2.0 |
| **`lifecycle_hooks` in main config** | v1.9 | `hooks.yaml` | Soft deprecation (still works with warning) | Deprecated Oct 2025, Removed v2.0 |
| **`context.yaml` as optional** | v1.9.1 | `context.yaml` as required | Hard breaking change | Changed Oct 2025 (no compatibility) |
| **`--task` parameter** | v1.8 | `-m/--message` | Hard breaking change | Changed Oct 2025 (no compatibility) |

**Deprecation Policy**:
- **Soft Deprecation**: Feature still works but prints `[DEPRECATION WARNING]`
- **Hard Breaking Change**: Feature removed immediately, errors if used
- **Major Version Cleanup**: v2.0 will remove all soft-deprecated features

---

## Part IV: Design Rationale & Trade-offs

### 4.1 Key Architectural Decisions (ADRs)

#### ADR-001: Stateless Core [v1.1]

**Decision**: Engine retains no state; rebuild from journal every iteration

**Context**: Traditional agent architectures maintain complex in-memory state, causing:
- Difficult crash recovery
- Opaque debugging (can't see internal state)
- Memory leaks in long-running processes

**Rationale**:
- ✅ **Perfect Resumability**: Crash-safe; can resume from any point by replaying journal
- ✅ **Simplified Debugging**: State fully visible in journal (no hidden memory)
- ✅ **No Memory Leaks**: No accumulated in-memory state
- ✅ **Pure Function Behavior**: Same journal → same state (reproducible)
- ⚠️ **Trade-off**: Rebuild overhead for each iteration

**Mitigation**: Efficient journal parsing (JSONL format, streaming reads)

**Consequences**:
- Engine code simplified (no state management logic)
- Debugging becomes file inspection (`cat journal.jsonl`)
- Enables perfect reproducibility for research

---

#### ADR-002: File System as Interface [v1.1]

**Decision**: CWD as single communication channel between agents

**Context**: Agent frameworks typically use:
- Network APIs (HTTP/gRPC) for inter-agent communication
- Complex serialization protocols (JSON-RPC, Protocol Buffers)
- In-memory message passing

**Rationale**:
- ✅ **Language-Agnostic**: Any tool that can read/write files can participate
- ✅ **Zero-Copy Orchestration**: Shared file system, no data copying
- ✅ **Transparent**: All state visible in file system (inspectable with `ls`, `cat`)
- ✅ **Unix Philosophy**: Compose simple tools via files
- ⚠️ **Trade-off**: Not optimal for high-frequency, low-latency communication

**Use Cases**:
- ✅ File-based workflows (code review, document generation)
- ✅ Batch processing (data analysis, report generation)
- ❌ Real-time streaming (video processing, live chat) - not target use case

**Consequences**:
- Agent orchestration becomes filesystem manipulation
- Inter-agent communication is simple `delta run --agent sub-agent --work-dir ./subdir`
- Enables powerful patterns like "workspace handoff"

---

#### ADR-003: Composition Over Built-in [Core Philosophy]

**Decision**: Extend via external commands (tools, hooks), not engine modifications

**Context**: Feature requests inevitably arise:
- "Add RAG retrieval"
- "Add vector database"
- "Add code analysis"

**Rationale**:
- ✅ **Keep Core Simple**: Engine remains small, stable, auditable
- ✅ **Enable Ecosystem**: Community can build tools without forking engine
- ✅ **Language-Agnostic**: Tools can be Python, Bash, Rust, anything
- ✅ **Experimentation**: Try new ideas without touching core code
- ⚠️ **Trade-off**: External process spawning overhead

**Examples**:
- Memory folding → External script via `computed_file` source
- Code analysis → External tool (tree-sitter-summarize)
- Notifications → Lifecycle hook (on_error → send-email.sh)

**Consequences**:
- Core engine stayed <5000 LOC through v1.9
- Rich ecosystem possible (future: npm packages for common patterns)
- Users can customize without waiting for official features

---

#### ADR-004: POC-First Validation [v1.5]

**Decision**: Validate LLM interaction patterns before full implementation

**Context**: v1.4 PTY sessions were technically sound but failed in practice:
- LLMs cannot monitor real-time output
- Required artificial sleep delays
- ANSI escape sequences not LLM-friendly

**Rationale**:
- ✅ **Validate Usage Patterns**: Technical feasibility ≠ usability
- ✅ **Fail Fast**: POC takes days, full implementation takes weeks
- ✅ **Learn Before Committing**: Real-world testing reveals hidden assumptions
- ⚠️ **Trade-off**: Upfront POC time

**Lesson from PTY Failure**:
- Technical success (PTY works perfectly) ≠ User success (LLMs can't use it)
- Always validate with actual LLM workflows, not just human workflows

**Consequences**:
- v1.5 simplified sessions designed with POC validation
- Future features require POC before architecture design
- Documentation includes "validation strategy" section

---

#### ADR-005: Explicit Over Implicit [v1.7, v1.9.1]

**Decision**: Explicit configuration over implicit defaults

**Context**: Implicit behavior creates "magic" that expert users must reverse-engineer:
- v1.6: Default context.yaml was invisible (buried in code)
- Pre-v1.7: Tool execution mode auto-detected (unpredictable)

**Rationale**:
- ✅ **Transparency**: No hidden behavior (what you see is what you run)
- ✅ **Predictability**: Configuration fully determines behavior
- ✅ **Debuggability**: All behavior visible in config files
- ✅ **Expert-Friendly**: Power users get complete control
- ⚠️ **Trade-off**: Slightly higher initial learning curve

**Examples**:
- v1.7: `exec:` vs `shell:` (explicit execution mode declaration)
- v1.9.1: `context.yaml` required (explicit context strategy)
- v1.8: `delta continue` (explicit continuation intent vs auto-resume)

**Consequences**:
- Configuration files are "contracts" (precise, verifiable)
- No surprises (behavior fully specified in visible files)
- Documentation becomes "explain the contract" rather than "explain the magic"

---

#### ADR-006: Frontierless Workspace [v1.10]

**Decision**: Remove all shared mutable state from workspace control plane

**Context**: v1.x relied on `.delta/LATEST` file to track the "most recent" run, causing:
- Race conditions in concurrent execution
- Undefined behavior when multiple agents run simultaneously
- Inability to implement robust orchestration patterns (Plan-Execute, Map-Reduce)

**Rationale**:
- ✅ **Concurrency-Safe**: No shared state to contend over
- ✅ **Deterministic**: Each run has unique ID, no ambiguity
- ✅ **Orchestrator Control**: Caller manages run tracking (not engine)
- ✅ **Robust Recovery**: Client-generated IDs persist through crashes
- ⚠️ **Trade-off**: More explicit management required

**Implementation**:
- Remove `.delta/LATEST` file completely
- Require `--run-id` for `delta continue`
- Add `delta list-runs` for discovery
- Introduce Janitor mechanism for orphan cleanup

**Consequences**:
- Enables true concurrent multi-agent execution
- Scripts must track run IDs explicitly
- Recovery patterns become more robust
- Foundation for v2.0 multi-agent orchestration

### 4.2 Philosophy-to-Implementation Mapping

| Philosophy Principle | Implementation Mechanism | Code Location | Example |
|---------------------|--------------------------|---------------|---------|
| **Everything is a Command** | Tool system (exec/shell), external tool execution | `executor.ts`, `tool_schema.ts` | `delta-sessions exec` as tool |
| **Environment as Interface** | CWD as workspace, file-based state | `workspace-manager.ts`, `journal.ts` | `.delta/` control plane |
| **Composition Defines Intelligence** | Agent orchestration, imports mechanism, hooks | `hook-executor.ts`, v1.9 imports | Calling sub-agent is a tool call |
| **Stateless Core** | `buildContext()` rebuilds state from journal | `engine.ts:buildContext()` | No in-memory state between iterations |
| **Explicit Over Implicit** | context.yaml required, exec vs shell explicit | `context/builder.ts`, v1.7 expansion | No hidden defaults |
| **Simplicity Over Features** | Minimal core, extensions via composition | LOC count, `sessions/` module size | 600 lines vs 1800 lines (PTY) |

### 4.3 Key Trade-offs

#### Performance vs Transparency

**Trade-off**: File-based state (slow I/O) vs in-memory state (fast but opaque)

**Choice**: File-based (transparency prioritized)

**Rationale**: Delta Engine targets **research and prototyping**, not production high-throughput systems. For these use cases:
- Debugging time > Execution time
- Auditability > Raw speed
- Reproducibility > Latency

**Numbers**:
- Journal rebuild: ~10ms per 100 events (negligible in LLM-bound workflow)
- File I/O overhead: <1% of total execution time (dominated by LLM API calls)

**Mitigation**: Efficient JSONL parsing, streaming reads

---

#### Security vs Flexibility

**Trade-off**: Sandboxed execution (safe) vs arbitrary commands (flexible)

**Choice**: Flexible (no built-in sandbox)

**Rationale**: Target expert users who can implement custom sandboxes:
- Power users want control (can implement own security layers)
- One-size-fits-all sandbox rarely fits real needs
- Sandbox complexity doesn't belong in core

**Examples of User-Space Security**:
```yaml
# Use hooks for security
hooks:
  pre_tool_execution:
    command: ["./security/validate-tool-args.sh"]

# Use explicit allowlists
tools:
  - name: safe_read
    exec: "cat ${file}"
    # Validation in pre_tool_execution hook checks ${file} is in allowlist
```

**Future**: Optional sandbox layer (user-space extension, v2.0+)

---

#### Real-time vs Request-Response

**Trade-off**: PTY streaming (real-time) vs command exec (batch)

**Choice**: Command exec (request-response matches LLM pattern)

**Rationale** (from v1.5 design):
- LLMs cannot monitor real-time output (no callbacks/events)
- Request-response natural for LLM workflows
- Simplifies implementation (67% LOC reduction)

**When PTY is needed**:
- Human-operated workflows (vim, top, interactive menus)
- Real-time monitoring (progress bars, logs)
- **Solution**: Use experimental `delta-sessions-pty`

**When simplified sessions work**:
- LLM-automated workflows (95% of use cases)
- Batch command execution
- Script automation

---

#### Verbosity vs Clarity (Tool Syntax)

**Trade-off**: Concise syntax (short) vs explicit syntax (clear)

**Choice**: Both (v1.7 provides syntax sugar with explicit expansion)

**Rationale**:
- 80% of tools are simple → syntax sugar (exec/shell)
- 20% of tools are complex → full syntax (command array)
- Transparency via `delta tool expand`

**Example**:
```yaml
# Syntax sugar (concise)
- name: search
  exec: "grep ${pattern} ${file}"

# Expanded (explicit)
- name: search
  command: ["grep"]
  parameters:
    - name: pattern
      inject_as: argument
      position: 0
    - name: file
      inject_as: argument
      position: 1

# Users choose based on needs:
# - Simple tools: Use syntax sugar
# - Complex tools: Use full syntax
# - Learning: Use `delta tool expand` to understand
```

---

#### Implicit vs Explicit Resumption [v1.10]

**Trade-off**: Auto-resume convenience vs explicit control

**Choice**: Explicit-only resumption (v1.10 removes auto-resume)

**Rationale**:
- ✅ **Concurrency-Safe**: No race conditions from implicit state checks
- ✅ **Predictable**: Always know what operation will occur
- ✅ **Orchestration-Friendly**: Scripts have full control
- ✅ **Debug-Friendly**: Clear intent in command history
- ⚠️ **Trade-off**: More typing required

**Before (v1.9)**:
```bash
delta run -m "Task"  # Could auto-resume OR create new
delta continue       # Implicit: uses LATEST
```

**After (v1.10)**:
```bash
delta run -m "Task"  # Always creates new run
delta continue --run-id xxx  # Explicit: specify exact run
```

**Mitigation**:
- `delta list-runs` command for discovery
- Shell aliases/functions for convenience
- Client-generated IDs for robust tracking

**Consequences**:
- Scripts become more robust (explicit is better for automation)
- Enables concurrent execution patterns
- Slightly higher learning curve for interactive use
- Foundation for multi-agent orchestration

---

### 4.4 Design Principles Summary

**What Delta Engine Optimizes For**:
1. **Transparency** (observable behavior, inspectable state)
2. **Simplicity** (minimal core, composable extensions)
3. **Reproducibility** (perfect replay, no hidden state)
4. **Expert Control** (explicit configuration, no magic)
5. **Research Agility** (rapid prototyping, fast iteration)

**What Delta Engine Does Not Optimize For**:
1. ❌ **Production High-Throughput** (not optimized for millions of requests/sec)
2. ❌ **Real-Time Streaming** (batch-oriented, not event-driven)
3. ❌ **Beginner Hand-Holding** (explicit over implicit, configuration over convention)
4. ❌ **Feature Completeness** (composition over built-in)
5. ❌ **Maximum Abstraction** (files and processes, not complex frameworks)

**Target User**: Expert developers who value control, transparency, and Unix philosophy.

---

## Document Maintenance

### When to Update This Document

**New version released (e.g., v1.10)**:
1. Update Part I (System Overview) to reflect current state
2. Add/update relevant sections in Part II (Feature Specifications)
3. Add entry to Part III (Version Evolution Timeline)
4. Create separate `v1.10-xxx.md` for detailed design rationale

**Bug fixes or clarifications**:
- Update relevant section only
- Add note in document header

### Completeness Verification

This document consolidates **100% of technical specifications** from:

✅ **v1.1-design.md** - All schemas, architecture, tool system
✅ **v1.2-human-interaction.md** - All status states, interaction protocol
✅ **v1.3-design.md** - Directory structure, delta init
✅ **v1.4-pty-deprecation.md** - Deprecation rationale, lessons learned
✅ **v1.5-sessions-simplified.md** - Simplified sessions API, state preservation
✅ **v1.6-context-composition.md** - context.yaml schema, memory folding
✅ **v1.7-tool-simplification.md** - exec/shell modes, :raw modifier, safety mechanisms
✅ **v1.8-unified-cli-api.md** - CLI improvements, delta continue, environment variables
✅ **v1.9-unified-agent-structure.md** - agent.yaml, hooks.yaml, imports mechanism, v1.9.1 context.yaml requirement
✅ **v1.10-frontierless-workspace.md** - Frontierless workspace, client IDs, Janitor, output formats, delta list-runs

**Coverage Areas** (100% Complete):
- ✅ All schemas (Zod definitions)
- ✅ All APIs (CLI commands, parameters, return values)
- ✅ All data structures (JSON formats, field definitions)
- ✅ All state machines (status values, transitions)
- ✅ All event types (journal events)
- ✅ All design decisions (rationale, trade-offs)
- ✅ All breaking changes (migration paths)

---

**Document Status**: Complete and ready for knowledge base integration.

**Next Steps**:
1. Verify no missing specifications (coverage report)
2. Update `docs/architecture/README.md` to reference this document
3. Add to knowledge base with appropriate metadata
