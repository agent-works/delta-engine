# Decision: Stateless Core Architecture

**Date**: v1.0 → v1.1 Refactor (2025 Q3)
**Status**: ✅ Active
**Participants**: @fugen, Delta Engine team

---

## Context

### v1.0 MVP Problem

MVP used traditional OOP design with in-memory state:

```typescript
// ❌ v1.0 approach
class Engine {
  private conversationHistory: Message[] = [];  // in-memory state
  private currentIteration: number = 0;

  async run() {
    while (!done) {
      const response = await this.llm.chat(this.conversationHistory);
      this.conversationHistory.push(response);  // accumulates in memory
    }
  }
}
```

**Core Problems**:
1. **Non-recoverable** - Process crash → all state lost
2. **Non-pausable** - No way to interrupt and continue
3. **Non-debuggable** - Can't replay execution history
4. **Non-auditable** - Can't analyze what happened after errors

---

## Decision

**All state must be immediately persisted to disk. Engine process itself maintains no state.**

### Core Principles

1. **Journal is SSOT** (Single Source of Truth)
   - `journal.jsonl` is the only state source
   - Every event written immediately when it occurs
   - Rebuild state = replay journal events

2. **Stateless Engine Process**
   ```typescript
   // ✅ v1.1 approach
   class Engine {
     // No in-memory state!

     async run() {
       while (!done) {
         // Rebuild from journal every iteration
         const messages = await this.rebuildConversationFromJournal();
         const response = await this.llm.chat(messages);

         // Immediately write to journal
         await this.journal.logThought(response);
       }
     }
   }
   ```

3. **Immediate Persistence**
   - No batch writes
   - No memory caching
   - Each event persisted independently

---

## Implementation

See `src/engine.ts:rebuildConversationFromJournal()` and `src/journal.ts`

---

## Consequences

### Benefits ✅

1. **Perfect Recoverability**
   - `Ctrl+C` interrupt → `delta run` continues
   - Process crash → resume from last event
   - Supports `WAITING_FOR_INPUT` state (v1.2)

2. **Complete Audit Trail**
   - Every decision recorded
   - Can replay entire execution
   - Easy debugging and analysis

### Tradeoffs ❌

1. **Performance overhead** - O(n) rebuild each iteration
   - **Mitigated**: n typically small (<30), I/O is async

2. **Increased complexity** - Must carefully design journal format
   - **Mitigated**: Strong typing + integration tests

---

## Lessons Learned

1. **Journal format must be stable** - Hard to change after release
2. **Immediate persistence is correct** - Simplicity > performance
3. **Rebuild logic needs test coverage** - Most bug-prone area
4. **Performance isn't actually a problem** - ~50ms overhead vs seconds for LLM calls

---

## Related

- @decisions/002-journal-jsonl-format.md - Why JSONL format
- `src/engine.ts:rebuildConversationFromJournal()` - Core implementation
- `tests/integration/stateless-core.test.ts` - Integration tests
