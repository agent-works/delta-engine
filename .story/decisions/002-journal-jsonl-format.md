# Decision: Journal Format - JSONL vs JSON Array

**Date**: v1.1 Architecture Design (2025 Q3)
**Status**: ✅ Active
**Related**: @decisions/001-stateless-core.md

---

## Context

When designing Stateless Core, needed to choose journal file format. Core requirements:
1. Support append-only writes (each event persisted independently)
2. Human-readable for debugging (`cat`/`tail` friendly)
3. Support partial reads (don't need to load entire file)
4. Fault-tolerant (file corruption doesn't affect existing events)

---

## Options Considered

### Option A: Single JSON Array ❌
```json
[
  {"seq": 1, "type": "ENGINE_START", ...},
  {"seq": 2, "type": "THOUGHT", ...}
]
```

**Pros**: Standard JSON, direct `JSON.parse()`
**Cons**: Hard to append (must read entire file, modify array, rewrite)

### Option B: JSONL (JSON Lines) ✅ CHOSEN
```jsonl
{"seq":1,"type":"ENGINE_START",...}
{"seq":2,"type":"THOUGHT",...}
```

**Pros**: Atomic appends (`fs.appendFile`), can `tail -f`, partial reads, damage localization
**Cons**: Need line-by-line parsing

### Option C: SQLite Database ❌
**Pros**: Strong types, indexes, transactions
**Cons**: Adds dependency, violates "Everything is a File" philosophy, not human-readable

---

## Decision

**Chosen: Option B (JSONL)**

**Key Reasons**:
1. Append-friendly (aligns with Stateless Core's "immediate persistence")
2. Unix philosophy (plain text, rich toolchain)
3. Debug-friendly (`tail -f` real-time viewing, `grep` search)
4. Simplicity (no extra dependencies)

---

## Implementation

```typescript
// Writing
await fs.appendFile(journalPath, JSON.stringify(event) + '\n', 'utf-8');

// Reading
const lines = content.trim().split('\n');
const events = lines.map(line => JSON.parse(line)).sort((a, b) => a.seq - b.seq);
```

---

## Consequences

### Benefits ✅
- Excellent debug experience (`tail`, `grep`, `jq`)
- Fault-tolerant (bad line doesn't corrupt others)
- Good performance (append O(1), 180 lines < 5ms)
- Rich toolchain (`jq`, `awk`, etc.)

### Tradeoffs ❌
- Slightly more complex parsing (but < 20 lines of code)
- ~5-10% larger file size (vs JSON Array)

---

## Lessons Learned

1. **Simplicity over optimization** - Worried about "line-by-line parsing" but it's negligible (~10ms for 1000 lines vs 1000-3000ms for LLM calls)
2. **Human readability matters** - Countless times used `tail -20 journal.jsonl` for quick debug
3. **Unix toolchain value** - Using `grep`/`awk`/`jq` combos avoided writing analysis code

---

## Related

- @decisions/001-stateless-core.md - Why we need journal
- `src/journal.ts` - Implementation
- `src/journal-types.ts` - Event type definitions
