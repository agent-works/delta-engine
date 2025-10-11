# ADR-003: Two-Mode Human Interaction Design

**Date**: 2025 Q3 (v1.2 Design & Implementation)
**Status**: Active
**Related**: ADR-001 (Stateless Core enables pause/resume)

## Context

Agents often need human input during execution:
- API keys or sensitive information
- Confirmation for dangerous operations (e.g., "Deploy to production?")
- Choosing between options
- Providing missing information

### User Scenarios

**Scenario A: Local Development/Debugging**
- Developer running agent in terminal
- Needs immediate interaction (Q&A style)
- Expects synchronous blocking experience (like shell `read` command)
- Example: "Which database to migrate?" → answer immediately

**Scenario B: Automation/Production**
- Agent runs in background, server, or CI/CD
- No TTY available (can't use stdin/stdout directly)
- May provide input via Web UI, API, or file
- Needs asynchronous interaction (pause → get input → resume)
- Example: Slack bot asks user, waits for reply, then continues

### Design Constraints

1. Must work with Stateless Core (ADR-001) - all state in journal
2. Must not require code changes in agent definition
3. Must provide good UX for both scenarios
4. Agent code should be unaware of interaction mode

## Decision

**Two modes coexisting, toggled via `-i` CLI flag**

```bash
# Interactive mode (sync)
delta run -i --agent my-agent --task "Deploy to prod"

# Async mode (default)
delta run --agent my-agent --task "Deploy to prod"
```

### Built-in Tool: `ask_human`

Engine provides `ask_human` tool automatically (no need to define in `config.yaml`).

**Parameters**:
```typescript
interface AskHumanParams {
  prompt: string;         // Required: question text
  input_type?: string;    // Optional: 'text' | 'password' | 'confirmation'
  sensitive?: boolean;    // Optional: is sensitive info (don't log plaintext)
}
```

### Interactive Mode (`-i` flag)

**Flow**:
1. Agent calls `ask_human` tool
2. Engine uses `readline` to read from stdin synchronously
3. User types answer in terminal
4. Engine writes to journal as `ACTION_RESULT`
5. T-A-O loop continues immediately

**Implementation** (`src/ask-human.ts`):
```typescript
const answer = await readline.question(`\n🤔 ${params.prompt}\n> `);
await journal.logActionResult({
  tool: 'ask_human',
  result: answer,
  sensitive: params.sensitive
});
```

### Async Mode (default)

**Pause Phase**:
1. Agent calls `ask_human` tool
2. Engine creates `.delta/interaction/request.json`:
   ```json
   {
     "prompt": "Which database to migrate?",
     "input_type": "text",
     "timestamp": "2025-10-01T10:00:00.000Z"
   }
   ```
3. Updates `metadata.json`: `status = 'WAITING_FOR_INPUT'`
4. Prints instructions:
   ```
   ⏸️  Agent is waiting for input.

   Question: Which database to migrate?

   To respond:
     echo "production" > .delta/interaction/response.txt
     delta run
   ```
5. Exits with code 101 (custom "needs input" signal)

**Resume Phase**:
1. User creates `.delta/interaction/response.txt` with answer
2. User runs `delta run` (no args needed)
3. Engine detects `WAITING_FOR_INPUT` in `metadata.json`
4. Reads `response.txt`, writes to journal as `ACTION_RESULT`
5. Cleans up `request.json` and `response.txt`
6. Continues T-A-O loop from where it paused

**Implementation** (`src/ask-human.ts` + `src/cli.ts`):
- Async write: Creates interaction files + exits
- Resume detection: Checks metadata status on startup

## Consequences

### Benefits ✅

1. **Good Developer Experience**
   - `-i` flag for instant Q&A during development
   - Natural terminal interaction (like shell scripts)
   - No file management needed

2. **Production Ready**
   - Default async mode works with background processes
   - Web UI can watch `request.json` and write `response.txt`
   - Supports Docker, CI/CD, serverless environments

3. **Aligns with Stateless Core**
   - Both modes persist to journal immediately
   - Can resume from either mode
   - State reconstruction handles both paths identically

4. **Agent Simplicity**
   - Agent code identical for both modes
   - Just calls `ask_human` tool
   - Mode is transparent to agent logic

5. **Safety**
   - `sensitive: true` flag prevents logging plaintext passwords
   - Async mode allows time for approval workflows
   - All interactions auditable in journal

### Tradeoffs ❌

1. **Implementation Complexity**
   - Maintain two code paths (sync readline vs async files)
   - Resume logic needs careful state management
   - ~200 lines vs ~50 for sync-only

2. **Documentation Burden**
   - Must explain both modes
   - Users may be confused which to use
   - **Mitigation**: Clear guidance in docs + error messages

3. **Non-Standard Exit Code**
   - Exit code 101 = "needs input" (custom semantics)
   - Not POSIX standard (0=success, 1=error, 130=SIGINT)
   - **Rationale**: Standard codes don't fit; 101 avoids conflicts

4. **File-Based Communication Limitations**
   - Async mode requires filesystem polling by external systems
   - No push notifications for Web UI
   - **Future**: Could add webhook support (v2.x)

## Lessons Learned

1. **Don't Assume Runtime Environment**
   - Initial design only considered local terminal
   - Users want Docker, Web UI, CI/CD, Slack bots
   - Multi-mode design future-proofs the system

2. **`-i` Flag Choice**
   - Short (common operation)
   - Intuitive (interactive)
   - Unix convention (e.g., `docker run -i`, `python -i`)

3. **Exit Code 101 Rationale**
   - Needed distinct signal from success/failure
   - 101 in non-standard range (avoids shell conflicts)
   - Allows orchestration systems to detect "needs input" state

4. **File-Based State Works Well**
   - Simple to implement and debug
   - Easy for Web UI to integrate (just watch directory)
   - No need for complex IPC

## Related

- **Architecture Doc**: `docs/architecture/v1.2-human-interaction.md` - Full specification
- **Implementation**: `src/ask-human.ts` - Both modes
- **CLI**: `src/cli.ts` - `-i` flag handling and resume detection
- **Tests**: `tests/e2e/human-in-loop.test.ts` - End-to-end validation
