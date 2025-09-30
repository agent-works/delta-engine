# Delta Engine MVP Technical Specification Document (TSD v1.0)

## 1. Project Overview and Philosophy

**Goal:** Implement Delta Engine MVP, a minimalist platform for accelerating AI Agent prototype iteration.

**Core Philosophy (must be strictly followed):**

1. **Everything is a Command:** All capabilities are implemented through executing external command-line programs.
2. **The Environment is the Interface:** Agent interaction with the environment occurs only through the current working directory (CWD).
3. **Composition Defines Intelligence:** Complexity emerges through composing simple Agents (processes).

## 2. Technology Stack and Requirements

- **Runtime:** Node.js (v20+)
- **Language:** TypeScript (must enable `strict: true`)
- **Project Type:** ESM (ECMAScript Modules)
- **Core Dependencies:**
    - `commander`: CLI development
    - `yaml`: Parse `config.yaml`
    - `zod`: Configuration and data structure validation (critical)
    - `execa`: Execute external commands
    - `openai`: LLM interaction (v4+ SDK)
    - `uuid`: Generate Run ID
- **Testing:** Jest

## 3. Core Data Structure Definitions

All implementations must follow these data structures (to be implemented as TypeScript Interfaces and Zod Schemas).

```typescript
// Configuration file structure (config.yaml)
export interface AgentConfig { /* ... */ }
export interface LLMConfig { /* ... */ }

// Tool definition (core)
export enum InjectionType {
    Argument = 'argument', // As command-line argument at the end
    Stdin = 'stdin',       // Pass through standard input
    Option = 'option',     // As command-line option (e.g., --key value)
}

export interface ToolParameter {
    name: string;
    type: 'string'; // MVP only supports string
    inject_as: InjectionType;
    option_name?: string; // Only required when inject_as is 'option'
}

export interface ToolDefinition {
    name: string;
    command: string[]; // e.g., ["ls", "-F"]
    parameters: ToolParameter[];
}

// Runtime context
export interface EngineContext {
    runId: string;
    agentPath: string;      // Absolute path to Agent project
    workDir: string;        // Run working directory (CWD) (Absolute)
    config: AgentConfig;
    systemPrompt: string;
    initialTask: string;
}

// Tool execution result
export interface ToolExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean; // exitCode === 0
}
```

## 4. Detailed Specifications

### 4.1 CLI Specification

```bash
delta-engine run --agent <agent_path> --task "<task_description>" [--work-dir <path_to_work_dir>]
```

- **Default `--work-dir`:** If not provided, create a new directory in `<agent_path>/workspaces/` with format `<YYYYMMDD_HHmmss>_<uuid_short>`.

### 4.2 Tool Execution Specification (Critical)

1. **CWD Isolation:** When executing any command, **must** set subprocess CWD to `EngineContext.workDir`.
2. **Variable Substitution:** Before execution, must replace `${AGENT_HOME}` in the `command` array with `EngineContext.agentPath`.
3. **Parameter Injection:** Strictly follow `InjectionType` implementation. `Stdin` must be passed through standard input stream, not concatenated to command line. A tool can have at most one parameter injected via Stdin.
4. **Error Handling:** If command fails (non-zero exit code), must capture output and return `ToolExecutionResult`, engine must not crash.

### 4.3 LLM Interaction Specification

1. **Protocol:** Use OpenAI Tool Calling API.
2. **Authentication:** Get API key through environment variable `OPENAI_API_KEY`.

### 4.4 Logging Specification (trace.jsonl)

All events must be written to `work-dir/trace.jsonl` in JSON Lines format.

## 5. Implementation Phases

### Phase 1: Project Initialization and Core Type Definitions
- Set up TypeScript project with ESM
- Define all interfaces and Zod schemas
- Configure Jest for testing

### Phase 2: Configuration Loading and Environment Initialization
- Implement config.yaml loader with Zod validation
- Create context initializer
- Set up working directory management

### Phase 3: CLI Implementation
- Create CLI using Commander
- Implement run command
- Handle parameter parsing

### Phase 4: Tool Executor
- Implement tool execution logic
- Handle different injection types
- Implement ${AGENT_HOME} substitution

### Phase 5: LLM Integration
- Implement OpenAI client wrapper
- Convert tools to OpenAI function schema
- Handle tool calling responses

### Phase 6: Trace Logger
- Implement trace.jsonl writer
- Create structured event logging
- Ensure atomic writes

### Phase 7: Core Engine Loop
- Implement Think-Act-Observe cycle
- Handle iteration limits
- Integrate all components

## 6. Testing Requirements

- Unit tests for all core modules
- Integration tests for engine loop
- Test coverage > 80%
- Mock external dependencies (OpenAI API, file system)

## 7. Security Considerations

⚠️ **Important:** Executing LLM-generated commands poses security risks.

- Implement command whitelist mechanism
- Develop sandbox execution environment (high priority)
- Avoid command injection vulnerabilities
- Limit file system access scope

## 8. Performance Requirements

- Startup time < 500ms
- Command execution overhead < 50ms
- Support concurrent tool execution
- Efficient trace logging (async, non-blocking)

## 9. Error Handling

- All errors must be caught and logged
- Graceful degradation when tools fail
- Clear error messages for users
- Preserve partial results in trace

## 10. Documentation Requirements

- Inline code documentation with JSDoc
- README with quickstart guide
- API reference documentation
- Example Agent implementations