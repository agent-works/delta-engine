# Core Principles & Implementation Mapping

> **Purpose**: This document connects Delta Engine's philosophical pillars to concrete code implementation.
> **Audience**: Contributors, architects, and developers who want to understand "how philosophy becomes code."

## Overview

Delta Engine's three philosophical pillars are not abstract ideals—they are directly encoded in the codebase. This document maps each principle to specific modules, design patterns, and code locations.

---

## Pillar 1: Everything is a Command

### Philosophy Recap
> The engine has no built-in tools. All capabilities are external command-line programs executed as OS processes.

### Code Implementation

#### 1.1 Tool Definition (`config.yaml`)

Agents declare tools as external commands in their configuration:

**File**: `<agent_home>/config.yaml`
```yaml
tools:
  - name: list_files
    description: "List files in directory"
    command: ["ls", "-lh"]

  - name: search_web
    description: "Search the web"
    command: ["python3", "tools/search.py"]
    parameters:
      - name: query
        type: string
        inject_as: stdin  # Piped to script via stdin
```

**Schema Validation**: `src/types.ts:ToolSchema`

#### 1.2 Tool Execution (`src/executor.ts`)

All tool invocations go through a single execution pathway:

**Key Function**: `executeToolCommand()` (`executor.ts:42-108`)

```typescript
// Simplified flow:
async function executeToolCommand(
  tool: Tool,
  args: Record<string, any>,
  cwd: string
): Promise<string> {
  // 1. Build command from tool definition
  const command = buildCommand(tool, args);

  // 2. Prepare stdin if needed
  const stdin = extractStdinParam(tool, args);

  // 3. Execute as child process
  const result = await execCommand(command, { cwd, stdin });

  // 4. Return stdout/stderr
  return result.stdout;
}
```

**Three Injection Modes** (defined in `types.ts:ToolParameter.inject_as`):

1. **`argument`**: Passed as positional CLI argument
   ```yaml
   inject_as: argument
   # Example: python script.py "value"
   ```

2. **`stdin`**: Piped to process via standard input (max 1 per tool)
   ```yaml
   inject_as: stdin
   # Example: echo "value" | python script.py
   ```

3. **`option`**: Passed as named flag
   ```yaml
   inject_as: option
   option_name: "--query"
   # Example: python script.py --query "value"
   ```

**Implementation**: `executor.ts:buildCommandArgs()` (`executor.ts:110-156`)

#### 1.3 Tool Schema Conversion (`src/tool_schema.ts`)

LLM-compatible tool schemas are generated from command definitions:

**Key Function**: `convertToolsToOpenAISchema()` (`tool_schema.ts:8-42`)

```typescript
// Converts config.yaml tools to OpenAI function calling format
const openaiSchema = {
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: convertParameters(tool.parameters),
      required: extractRequiredParams(tool.parameters)
    }
  }
};
```

#### 1.4 Sub-Agent Orchestration

Calling another agent is just defining a tool that invokes `delta run`:

**Example**: `examples/3-advanced/delta-agent-generator/config.yaml`
```yaml
tools:
  - name: invoke_generated_agent
    command: ["delta", "run"]
    parameters:
      - name: agent_path
        inject_as: option
        option_name: "--agent"
      - name: task
        inject_as: option
        option_name: "--task"
```

**Result**: Agent orchestration is a first-class, zero-special-case capability.

---

## Pillar 2: The Environment is the Interface

### Philosophy Recap
> Agents interact with the world solely through the Current Working Directory (CWD). The file system is the universal API.

### Code Implementation

#### 2.1 Workspace Management (`src/workspace-manager.ts`)

Workspace isolation and CWD setup:

**Key Function**: `selectOrCreateWorkspace()` (`workspace-manager.ts:45-120`)

```typescript
// Workflow:
// 1. List existing workspaces: W001, W002, W003...
// 2. Let user select or create new
// 3. Set process.cwd() to workspace directory
// 4. Return workspace path for .delta/ control plane

const workspace = await selectOrCreateWorkspace(agentHome, {
  interactive: true,  // -i flag: prompt user
  autoCreate: false   // -y flag: silent auto-create
});

// Result: CWD is now /path/to/agent/workspaces/W001/
```

**Directory Structure** (enforced by `workspace-manager.ts`):
```
<agent_home>/
└── workspaces/
    ├── LAST_USED       # Tracks default workspace
    ├── W001/           # Data Plane: agent's workspace
    │   ├── data.csv    # Agent-created files
    │   └── .delta/     # Control Plane (engine's domain)
    └── W002/
```

#### 2.2 Control Plane Structure (`src/context.ts`)

The `.delta/` directory is the engine's exclusive domain:

**Key Function**: `ensureControlPlane()` (`context.ts:98-145`)

```typescript
// Creates .delta/ structure:
.delta/
├── VERSION              # Schema version
├── LATEST               # Text file with latest run_id
└── {run_id}/
    ├── journal.jsonl    # SSOT: all events
    ├── metadata.json    # Run status
    ├── engine.log       # Engine process logs
    ├── io/              # I/O audit trail
    │   ├── invocations/
    │   ├── tool_executions/
    │   └── hooks/
    └── interaction/     # Human-in-the-loop (v1.2)
        ├── request.json
        └── response.txt
```

**LATEST File Implementation** (`context.ts:183-197`):
```typescript
// LATEST is a text file, not a symlink (for portability)
async function updateLatestLink(runId: string) {
  await fs.writeFile(
    path.join(controlPlane, 'LATEST'),
    runId,
    'utf-8'
  );
}

// Read latest run ID
const latestRunId = await fs.readFile(
  path.join(controlPlane, 'LATEST'),
  'utf-8'
);
```

#### 2.3 Context Composition (v1.6) (`src/context/`)

**New in v1.6**: Declarative context building from multiple sources, all expressed as files:

**Key Module**: `src/context/builder.ts`

```typescript
class ContextBuilder {
  async buildContext(): Promise<Message[]> {
    // 1. Load context.yaml manifest
    const manifest = await this.loadManifest();

    // 2. Process sources in order
    for (const source of manifest.sources) {
      if (source.type === 'file') {
        // Read file from CWD or AGENT_HOME
        const content = await this.fileSource.process(source);
        messages.push({ role: 'system', content });
      }

      if (source.type === 'computed_file') {
        // Execute generator command, write to output_path
        await this.computedSource.process(source);
        const content = await fs.readFile(source.output_path);
        messages.push({ role: 'system', content });
      }

      if (source.type === 'journal') {
        // Extract recent conversation from journal.jsonl
        const history = await this.journalSource.process(source);
        messages.push(...history);
      }
    }

    return messages;
  }
}
```

**Default Manifest** (when no `context.yaml` exists):
```yaml
sources:
  - type: file
    id: system_prompt
    path: "${AGENT_HOME}/system_prompt.md"

  - type: file
    id: workspace_guide
    path: "${CWD}/DELTA.md"
    on_missing: skip  # Optional workspace instructions

  - type: journal
    id: full_history
    # No max_iterations = full history
```

**Example: Memory Folding** (`examples/2-core-features/memory-folding/context.yaml`):
```yaml
sources:
  - type: computed_file
    id: compressed_memory
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
      timeout_ms: 10000
    output_path: "${CWD}/.delta/context_artifacts/summary.md"

  - type: journal
    id: recent_turns
    max_iterations: 5  # Only last 5 turns
```

#### 2.4 Tool Execution Context

All tools execute with CWD set to the workspace:

**Implementation**: `executor.ts:executeToolCommand()`
```typescript
const result = await execFile(command[0], command.slice(1), {
  cwd: workspaceDir,  // Always execute in workspace
  env: process.env,
  encoding: 'utf-8'
});
```

**Result**: Tools naturally read/write files in the workspace without needing paths as parameters.

---

## Pillar 3: Composition Defines Intelligence

### Philosophy Recap
> System intelligence emerges from composing simple agents, not from a bloated central engine.

### Code Implementation

#### 3.1 Self-Contained Agent Structure

Each agent is a directory with strict cohesion:

**Standard Structure**:
```
<agent_name>/
├── config.yaml          # Capability manifest (required)
├── system_prompt.md     # Agent instructions (required)
├── context.yaml         # Context manifest (optional, v1.6)
├── tools/               # Private tools (optional)
│   ├── search.py
│   └── analyze.sh
└── workspaces/          # Created at runtime
    ├── LAST_USED
    └── W001/
```

**Key Principle**: Agent is a self-contained unit that can be:
- Version-controlled (git)
- Distributed (npm package, future)
- Composed (called by other agents)

#### 3.2 Zero-Copy Orchestration Pattern

**Pattern**: Parent agent creates subdirectory → launches sub-agent → reads results

**Example**: `examples/3-advanced/delta-agent-generator/system_prompt.md`
```markdown
# Parent Agent Instructions

To create a specialized agent:
1. Create directory: `mkdir -p generated_agents/research_agent`
2. Write config: Write config.yaml to that directory
3. Invoke sub-agent:
   ```
   invoke_generated_agent(
     agent_path: "./generated_agents/research_agent",
     task: "Research AI safety papers"
   )
   ```
4. Read results: Files in `generated_agents/research_agent/` are now available
```

**No data copying**: Parent and child share file system, communicate through directories.

#### 3.3 Stateless Core Enables Composition

**Key Design**: Engine rebuilds all state from journal on each iteration.

**Implementation**: `engine.ts:buildContext()` (`engine.ts:145-180`)

```typescript
class Engine {
  // No instance variables for conversation state!

  async run() {
    while (iterationCount < MAX_ITERATIONS) {
      // 1. Rebuild state from disk on EVERY iteration
      const context = await this.buildContext();

      // 2. Call LLM
      const response = await this.llm.chat(context);

      // 3. Execute tools
      const results = await this.executor.execute(response.toolCalls);

      // 4. Log to journal
      await this.journal.append('ACTION_RESULT', results);

      // Loop: Next iteration rebuilds from updated journal
    }
  }

  private async buildContext(): Promise<Message[]> {
    // Uses ContextBuilder (v1.6) to assemble context from:
    // - system_prompt.md
    // - context.yaml sources
    // - journal.jsonl history
    return this.contextBuilder.buildContext();
  }
}
```

**Why This Matters for Composition**:
- Sub-agents can be interrupted/resumed independently
- No shared memory between parent and child
- Each agent's journal is its SSOT
- Perfect reproducibility across composition boundaries

#### 3.4 Lifecycle Hooks as Composition Primitive

**Pattern**: Inject external logic at engine lifecycle points without modifying core.

**Implementation**: `src/hook-executor.ts`

```typescript
// Hook types (from types.ts:LifecycleHooksSchema)
type HookType =
  | 'pre_llm_req'      // Before LLM invocation
  | 'post_llm_resp'    // After LLM response
  | 'pre_tool_exec'    // Before tool execution
  | 'post_tool_exec'   // After tool execution
  | 'on_error';        // On error

// Hook execution
async function executeHook(
  hookType: HookType,
  hookConfig: Hook,
  context: HookContext
): Promise<string | null> {
  // 1. Build command from hook definition
  const command = hookConfig.command;

  // 2. Inject context via stdin (JSON)
  const stdin = JSON.stringify({
    run_id: context.runId,
    iteration: context.iteration,
    payload: context.payload  // Hook-specific data
  });

  // 3. Execute hook command
  const result = await execCommand(command, { stdin });

  // 4. Hook output can modify engine behavior
  return result.stdout;
}
```

**Example Use Case**: `examples/3-advanced/code-reviewer/config.yaml`
```yaml
hooks:
  pre_llm_req:
    command: ["python3", "hooks/inject_context.py"]
    timeout_ms: 5000

  post_tool_exec:
    command: ["bash", "hooks/audit_trail.sh"]
    timeout_ms: 3000
```

**Result**: Advanced behaviors (context engineering, audit logging) are external compositions, not built-in features.

---

## How Principles Reinforce Each Other

### Feedback Loop

```
"Everything is a Command"
         ↓
  Provides atomic composable units (tools, hooks, agents)
         ↓
"Environment as Interface"
         ↓
  Provides communication bus (CWD, file system)
         ↓
"Composition Defines Intelligence"
         ↓
  Orchestrates units via environment
         ↓
  Complex intelligence emerges without core changes
```

### Concrete Example: Multi-Agent Research Pipeline

**Without Delta Engine** (traditional framework):
```python
# Tightly coupled, in-memory objects
orchestrator = Orchestrator()
searcher = SearchAgent(api_keys=...)
analyzer = AnalyzerAgent(model=...)
writer = WriterAgent(style=...)

results = orchestrator.run([searcher, analyzer, writer])
```

**With Delta Engine** (composition):
```bash
# 1. Create workspace structure
mkdir research_project
cd research_project

# 2. Run search agent
delta run --agent ~/agents/web-searcher \
  --task "Find AI papers" \
  --work-dir ./search_results

# 3. Run analyzer on search results
delta run --agent ~/agents/paper-analyzer \
  --task "Analyze papers in ./search_results" \
  --work-dir .

# 4. Run writer on analysis
delta run --agent ~/agents/report-writer \
  --task "Write summary from ./analysis.json" \
  --work-dir .
```

**Key Differences**:
- No shared runtime or memory
- Agents are independent processes
- Communication through file system
- Each step is independently resumable
- Agents can be in different languages

---

## Testing the Principles

### Unit Tests

**Test**: "Everything is a Command" parameter injection
- File: `tests/unit/executor.test.ts`
- Validates: `argument`, `stdin`, `option` injection modes

**Test**: "Environment as Interface" workspace isolation
- File: `tests/integration/workspace-isolation.test.ts`
- Validates: W001/W002 workspaces don't interfere

**Test**: "Composition" stateless resumability
- File: `tests/unit/engine.test.ts`
- Validates: State rebuilds correctly from journal

### Integration Tests

**Test**: Sub-agent orchestration
- File: `tests/integration/sub-agent-orchestration.test.ts`
- Validates: Parent agent calls delta run, gets results

### Example Agents

**Basic**: `examples/1-basics/hello-world/`
- Demonstrates: All three principles in simplest form

**Advanced**: `examples/3-advanced/delta-agent-generator/`
- Demonstrates: Composition at its peak (agent creates agents)

---

## Violation Patterns (What NOT to Do)

### ❌ Anti-Pattern 1: Built-in Capabilities
```typescript
// WRONG: Adding built-in file operations
class Engine {
  async readFile(path: string) { ... }
  async writeFile(path: string, content: string) { ... }
}
```

**Why Wrong**: Violates "Everything is a Command"

**Correct Approach**: Define file operations as tools in `config.yaml`

### ❌ Anti-Pattern 2: In-Memory State Passing
```typescript
// WRONG: Sharing state in memory
class Engine {
  private sharedState: Record<string, any> = {};

  async invokeTool(name: string) {
    this.sharedState[name] = result;  // ❌
  }
}
```

**Why Wrong**: Violates "Environment as Interface" + stateless core

**Correct Approach**: Tools write results to files in CWD

### ❌ Anti-Pattern 3: Framework-Style Abstractions
```typescript
// WRONG: Creating agent base classes
abstract class BaseAgent {
  abstract async plan(): Promise<Plan>;
  abstract async execute(plan: Plan): Promise<Result>;
}
```

**Why Wrong**: Violates "Composition Defines Intelligence"

**Correct Approach**: Agents are processes invoked via `delta run`, not classes

---

## Evolution Guardrails

When adding new features, validate against principles:

### Checklist
1. ✅ **Can this be a command?** (Pillar 1)
   - If yes: Implement as tool or hook
   - If no: Justify why it must be built-in

2. ✅ **Does this require new API surface?** (Pillar 2)
   - If yes: Can it be expressed through files in CWD?
   - If no: Reconsider design

3. ✅ **Does this add engine complexity?** (Pillar 3)
   - If yes: Can it be achieved through composition instead?
   - If no: Proceed with core change (rare)

### Recent Examples

**v1.6 Context Composition**:
- ❓ Could it be external? → Partially (generators are external)
- ✅ Uses file-based sources → Aligns with Pillar 2
- ✅ Adds composability → Aligns with Pillar 3
- **Verdict**: Core integration justified (enables new composition patterns)

**v1.5 Simplified Sessions**:
- ❓ Could it be external? → Yes! (separate `delta-sessions` CLI)
- ✅ Stateless file-based storage → Aligns with Pillar 2
- ✅ Session as composable primitive → Aligns with Pillar 3
- **Verdict**: Extracted from core, perfectly aligned

---

## Further Reading

- [Complete Philosophy Whitepaper](./philosophy-02-whitepaper.md) - Deep dive into "why"
- [v1.1 Design Specification](./v1.1-design.md) - Stateless core architecture
- [v1.6 Context Composition](./v1.6-context-composition.md) - Latest feature design
- [Agent Development Guide](../guides/agent-development.md) - Build your first agent

---

**Last Updated**: 2025-10-10
**Version**: v1.6
