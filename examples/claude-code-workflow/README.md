# Claude Code Workflow Orchestrator

**AI Orchestrating AI** - An intelligent agent that controls Claude Code through direct CLI invocation.

## What is This?

This example demonstrates **meta-level automation** where one AI (Delta Engine agent) orchestrates another AI (Claude Code) through its headless CLI mode. This agent:

- **Executes** tasks via `claude -p` with structured JSON output
- **Resumes** conversations to refine results
- **Plans** execution preview with `--permission-mode plan`
- **Records** experience for cost tracking and pattern learning

This showcases reliable AI-to-AI orchestration without the complexity of terminal interaction.

## The AI <-> AI Value Proposition

### Why is AI-orchestrating-AI different from Human-orchestrating-AI?

| Capability | Human <-> AI | AI <-> AI |
|------------|-------------|-----------|
| **Workflow Consistency** | Manual, error-prone | 100% consistent execution |
| **Experience Accumulation** | Tribal knowledge, hard to scale | Systematically recorded in `.claude-code-lab/sessions.jsonl` |
| **Pattern Recognition** | Intuitive, hard to quantify | Data-driven, measurable |
| **Scale** | 1 session at a time | N parallel sessions (future) |
| **Error Recovery** | Emotionally draining | Tireless, methodical retries |
| **Knowledge Transfer** | Documentation lags behind | Real-time experience capture |

### Concrete Value Examples

#### 1. Structured Execution
**Human approach**: "Let me open Claude Code and type in my request..."
**AI approach**:
- Direct CLI invocation: `claude -p "task" --output-format json`
- Parses structured response automatically
- No manual copy-paste or interface navigation
- Programmatic error handling

#### 2. Experience Systematization
**Human approach**: "Claude Code seems to struggle with refactoring tasks..."
**AI approach**:
- Logs every interaction to `.claude-code-lab/sessions.jsonl`
- Can analyze: "In 15 refactoring tasks, 12 succeeded when we provided file context upfront vs. 3/8 without context"
- Automatically applies this learning to future tasks

#### 3. Intelligent Error Recovery
**Human approach**: See error → think → retry → get frustrated → take a break
**AI approach**:
```
Attempt 1: Failed (missing context)
→ Analyze error pattern
→ Attempt 2: Add file reading step
→ Success
→ Record: "Add context reading for similar tasks"
```

#### 4. Meta-Cognition
**Human**: "I feel like Claude Code needs more specific instructions"
**AI**: Quantifies patterns:
- "Tasks with <10 word descriptions have 45% success rate"
- "Tasks with specific file references have 87% success rate"
- Generates rule: "Always include file references"

## How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│     Delta Engine (Orchestrator AI)      │
│  - Composes claude commands             │
│  - Parses JSON responses                │
│  - Manages session IDs                  │
│  - Records experience                   │
└────────────┬────────────────────────────┘
             │ claude CLI
             │ (headless mode)
             ▼
┌─────────────────────────────────────────┐
│         Claude Code (Worker AI)         │
│  - Receives task via -p flag            │
│  - Returns structured JSON              │
│  - Preserves context via session_id     │
│  - Supports plan/execute modes          │
└─────────────────────────────────────────┘
```

### Workflow: Direct Execution

**Phase 1: Check Experience (Optional)**
1. Read `.claude-code-lab/sessions.jsonl` for historical patterns
2. Analyze what worked/failed before
3. Apply learnings to current approach

**Phase 2: Execute Task**
1. Compose command: `claude -p "task" --output-format json`
2. Parse JSON response (session_id, result, num_turns, cost)
3. Record execution metadata
4. If unsatisfactory → Phase 2b (Resume)
5. If satisfactory → Phase 3 (Verify)

**Phase 2b: Iterative Refinement (Optional)**
1. Resume with: `claude --resume "session-id" -p "refinement" --output-format json`
2. Parse updated response
3. Record resume action
4. Repeat if needed

**Phase 3: Verify Results**
1. Check created files exist
2. Run tests if applicable
3. Validate implementation
4. Record completion

### Experience Data Structure

All interactions are logged to `.claude-code-lab/sessions.jsonl`:

```jsonl
{"timestamp":"2025-10-02T10:00:00Z","action":"execute","session_id":"abc-123","task":"Create HTTP server","num_turns":4,"cost_usd":0.024,"result":"success"}
{"timestamp":"2025-10-02T10:05:00Z","action":"resume","session_id":"abc-123","prompt":"add error handling","result":"success"}
{"timestamp":"2025-10-02T10:10:00Z","action":"verify","details":"Files: server.ts (50 lines), server.test.ts (30 lines)"}
{"timestamp":"2025-10-02T10:10:15Z","action":"verify","details":"Tests: 5 passed"}
{"timestamp":"2025-10-02T10:10:30Z","action":"complete","details":"HTTP server with error handling and tests"}
```

This data enables:
- **Cost tracking**: Monitor total_cost_usd per task type
- **Success metrics**: Completion rates by category
- **Pattern recognition**: Which task descriptions work best
- **Resume analytics**: How many iterations typically needed

## Usage

### Prerequisites

```bash
# Build Delta Engine
npm run build

# Ensure Claude Code CLI is available
claude --version
```

### Run the Orchestrator

```bash
# From the delta-engine root
delta run --agent examples/claude-code-workflow --task "Create a simple HTTP server in Node.js"
```

### What Happens

1. Orchestrator initializes `.claude-code-lab/`
2. Checks historical experience (if exists)
3. Composes: `claude -p "Create a simple HTTP server in Node.js" --output-format json`
4. Parses JSON response (session_id, result, cost)
5. Records execution metadata
6. Verifies files were created
7. Optionally resumes for refinement
8. Records completion

### Expected Output

```
Initializing lab...
Checking experience history...
Executing task via Claude Code...
Session ID: abc-123
Result: [Claude Code's response]
Turns: 4, Cost: $0.024

Verifying results...
✓ server.js created (35 lines)
✓ Implementation looks correct

Task completed successfully!
Experience logged to: .claude-code-lab/sessions.jsonl
```

### Inspect Experience Log

```bash
# View all recorded interactions
cat .claude-code-lab/sessions.jsonl | jq .

# Count successful executions
grep '"result":"success"' .claude-code-lab/sessions.jsonl | wc -l

# Calculate total cost
cat .claude-code-lab/sessions.jsonl | jq -s 'map(.cost_usd // 0) | add'

# Find session IDs of successful tasks
cat .claude-code-lab/sessions.jsonl | jq -r 'select(.result=="success") | .session_id' | sort -u
```

## Example Tasks

### Simple Task
```bash
delta run --agent examples/claude-code-workflow --task "Create a function that validates email addresses"
```

### Complex Task with Refinement
```bash
# Initial execution
delta run --agent examples/claude-code-workflow --task "Create a REST API endpoint for user registration"

# Agent internally uses resume if needed:
# claude --resume "session-id" -p "add input validation" --output-format json
# claude --resume "session-id" -p "add unit tests" --output-format json
```

### Plan Mode Preview
The agent can optionally use plan mode first:
```bash
# Agent uses: claude -p "refactor auth module" --permission-mode plan --output-format json
# Reviews plan, then executes if satisfactory
```

## Future Enhancements (Phase 2 & 3)

### Phase 2: Experience Analysis
- Automatic pattern extraction from `sessions.jsonl`
- Generate `BEST_PRACTICES.md` from successful patterns
- Detect `LIMITATIONS.md` from failures
- Success rate dashboards

### Phase 3: Self-Improvement
- Apply historical patterns to new tasks
- Intelligent retry strategies based on error patterns
- Multi-session orchestration (parallel tasks)
- Conflict detection and resolution

## Learning Opportunities

This example teaches:
1. **CLI Orchestration**: Composing bash commands via tool parameters
2. **JSON Parsing**: Extracting structured data from command output
3. **Session Continuity**: Managing conversation state across invocations
4. **Cost Tracking**: Monitoring API usage patterns
5. **Experience Recording**: Building data for pattern analysis

## Value Demonstration

After running multiple tasks, you'll see:
- Reliable execution via structured CLI interface
- Cost tracking per task type
- Complete audit trail in `.claude-code-lab/sessions.jsonl`
- Session ID tracking for reproducibility

## Contributing

Ideas for improvements:
- Automatic plan mode for high-risk tasks
- Cost optimization strategies
- Parallel task execution
- Advanced JSON parsing and validation

## Related Examples

- `examples/hello-world/` - Basic tool execution
- `examples/file-organizer/` - File operation patterns
- See `docs/guides/agent-development.md` for agent fundamentals

## Philosophy

This example embodies Delta Engine's philosophy:
- **Everything is a Command**: Claude Code CLI is just another bash tool
- **Stateless Core**: No session state tracking, direct invocation each time
- **Composition**: Complex workflows from simple tool calls
- **Learning**: Experience data for cost and success analysis

---

**Key Insight**: Direct CLI invocation is simpler and more reliable than terminal interaction. Use structured interfaces (JSON) whenever possible for AI-to-AI communication.
