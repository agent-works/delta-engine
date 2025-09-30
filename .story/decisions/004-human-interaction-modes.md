# Decision: Human Interaction - Two Modes Design

**Date**: v1.2 Design & Implementation (2025 Q3)
**Status**: ✅ Active
**Related**: @decisions/001-stateless-core.md

---

## Context

### Requirements

Agent often needs human input during execution:
- API keys or sensitive information
- Confirmation for dangerous operations
- Choosing between options
- Providing missing information

### Scenario Classification

**Scenario A: Local Dev/Debug**
- Developer running Agent in terminal
- Needs immediate interaction (Q&A style)
- Expects synchronous blocking experience (like `read` command)

**Scenario B: Automation/Production**
- Agent runs in background or server
- No TTY (can't use stdin/stdout)
- May provide input via Web UI or API
- Needs asynchronous interaction (pause-input-resume)

---

## Options Considered

### Option A: Only Sync CLI Input ❌
**Pros**: Simple, good dev experience
**Cons**: Can't run in background, no Web UI integration

### Option B: Only Async File Communication ❌  
**Pros**: Works anywhere (background, Web, API)
**Cons**: Poor local dev experience (must manually edit files)

### Option C: Both Modes Coexist ✅ CHOSEN
**Pros**: Covers both scenarios, shared `ask_human` tool
**Cons**: Adds some implementation complexity

---

## Decision

**Chosen: Option C - Two modes toggled via `-i` flag**

```bash
# Interactive mode (sync)
delta run -i --agent my-agent --task "Deploy to prod"

# Async mode (default)
delta run --agent my-agent --task "Deploy to prod"
```

---

## Implementation

### Built-in Tool: `ask_human`

No need to define in `config.yaml`, Engine provides automatically.

**Tool Parameters**:
```typescript
interface AskHumanParams {
  prompt: string;         // Required: question text
  input_type?: string;    // Optional: 'text' | 'password' | 'confirmation'
  sensitive?: boolean;    // Optional: is sensitive info
}
```

### Interactive Mode (`-i`)

```typescript
// Direct stdin read
const answer = await readline.question(`\n🤔 ${params.prompt}\n> `);
// Immediately write to journal (ACTION_RESULT)
// Continue T-A-O loop
```

### Async Mode (default)

**Pause phase**:
1. Create `.delta/interaction/request.json`
2. Update `metadata.json` status = `'WAITING_FOR_INPUT'`
3. Print instructions for user
4. Exit process with code 101

**Resume phase**:
1. User creates `.delta/interaction/response.txt`
2. User runs `delta run` again
3. Engine detects `WAITING_FOR_INPUT` status
4. Reads `response.txt`, writes to journal
5. Cleans up interaction files
6. Continues T-A-O loop

---

## Consequences

### Benefits ✅

1. **Good dev experience** - `-i` for instant interaction
2. **Production ready** - Default mode works with Web UI/API
3. **Aligns with Stateless Core** - Both modes persist to journal immediately
4. **Unified interface** - Agent code doesn't care about mode

### Tradeoffs ❌

1. **Implementation complexity** - Maintain two logic paths
2. **Documentation burden** - Must explain both modes
3. **Non-standard Exit Code** - 101 means "needs input" (custom semantics)

---

## Lessons Learned

1. **Don't assume runtime environment** - Users want Docker, Web UI, CI/CD
2. **`-i` flag choice** - Short (common operation), intuitive (interactive), Unix convention (`docker run -i`)
3. **Exit Code 101 rationale** - Standard codes (0/1/130) don't fit; 101 is non-standard range, avoids conflicts

---

## Related

- `docs/architecture/v1.2-human-interaction.md` - Full specification
- `src/ask-human.ts` - Implementation
- `src/cli.ts` - `-i` flag handling
