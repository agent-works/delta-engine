# ADR-001: Stateless Core Architecture

**Date**: 2025 Q3 (v1.0 → v1.1 Refactor)
**Status**: Active
**Related**: ADR-002 (Journal Format)

## Context

The v1.0 MVP used traditional OOP design with in-memory state:

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
1. **Non-recoverable**: Process crash → all state lost
2. **Non-pausable**: No way to interrupt and continue
3. **Non-debuggable**: Can't replay execution history
4. **Non-auditable**: Can't analyze what happened after errors

## Decision

**All state must be immediately persisted to disk. The engine process itself maintains no in-memory state.**

### Implementation Principles

1. **Journal is Single Source of Truth (SSOT)**
   - `journal.jsonl` is the only state source
   - Every event written immediately when it occurs
   - Rebuild state = replay journal events

2. **Stateless Engine Process**
   ```typescript
   // ✅ v1.1+ approach
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

### Core Implementation

See:
- `src/engine.ts:rebuildConversationFromJournal()` - State reconstruction logic
- `src/context/builder.ts:buildContext()` - v1.6+ context composition (replaces rebuild)
- `src/journal.ts` - Journal persistence layer

## Consequences

### Benefits ✅

1. **Perfect Recoverability**
   - `Ctrl+C` interrupt → `delta run` automatically resumes
   - Process crash → resume from last persisted event
   - Supports `WAITING_FOR_INPUT` state (v1.2+)
   - Enables interactive human-in-the-loop workflows

2. **Complete Audit Trail**
   - Every decision recorded in journal
   - Can replay entire execution for debugging
   - Easy post-mortem analysis
   - Foundation for memory folding (v1.6+)

3. **Enables Advanced Features**
   - v1.2: Human interaction with pause/resume
   - v1.6: Context composition with memory folding
   - Future: Time-travel debugging, state branching

### Tradeoffs ❌

1. **Performance Overhead**
   - O(n) rebuild each iteration where n = number of conversation turns
   - **Mitigation**: n typically small (<30), LLM calls dominate (~1-3s vs ~50ms rebuild)
   - **Measured**: Negligible in practice

2. **Increased Complexity**
   - Must carefully design journal event schemas
   - Rebuild logic needs comprehensive test coverage
   - **Mitigation**: Strong TypeScript typing + integration tests

3. **Journal Format Stability**
   - Hard to change format after release
   - Must maintain backward compatibility
   - **Mitigation**: Runtime validation (see `.story/incidents/2025-10-09-journal-corruption.md`)

## Lessons Learned

1. **Journal Format is Critical** - Must be stable, validated, and documented (see ADR-002)
2. **Immediate Persistence is Correct** - Simplicity > premature optimization
3. **Rebuild Logic is Bug-Prone** - High test coverage essential (see `tests/integration/stateless-core.test.ts`)
4. **Performance Fears Were Unfounded** - 50ms overhead vs seconds for LLM calls = negligible

## Related

- **ADR-002**: Journal Format (JSONL choice)
- **Incident Report**: `.story/incidents/2025-10-09-journal-corruption.md` - Format validation
- **Architecture Doc**: `docs/architecture/v1.1-design.md` - Full v1.1 specification
- **Tests**: `tests/integration/stateless-core.test.ts`
