# ADR-002: Journal Format - JSONL vs JSON Array

**Date**: 2025 Q3 (v1.1 Architecture Design)
**Status**: Active
**Related**: ADR-001 (Stateless Core)

## Context

When designing Stateless Core (ADR-001), we needed to choose a journal file format.

**Core Requirements**:
1. Support append-only writes (each event persisted independently)
2. Human-readable for debugging (`cat`/`tail` friendly)
3. Support partial reads (don't need to load entire file)
4. Fault-tolerant (corruption doesn't affect existing events)
5. Unix philosophy alignment (plain text, rich toolchain)

## Decision

**Chosen: JSONL (JSON Lines) format**

One JSON object per line, no array wrapper:

```jsonl
{"seq":1,"type":"ENGINE_START","timestamp":"2025-10-01T10:00:00.000Z",...}
{"seq":2,"type":"THOUGHT","timestamp":"2025-10-01T10:00:05.123Z",...}
{"seq":3,"type":"ACTION_RESULT","timestamp":"2025-10-01T10:00:10.456Z",...}
```

### Options Considered

#### Option A: Single JSON Array ❌
```json
[
  {"seq": 1, "type": "ENGINE_START", ...},
  {"seq": 2, "type": "THOUGHT", ...}
]
```

**Pros**: Standard JSON, direct `JSON.parse()`
**Cons**:
- Hard to append (must read entire file, modify array, rewrite)
- Can't use `tail -f` for real-time viewing
- File corruption affects entire array

#### Option B: JSONL (JSON Lines) ✅ **CHOSEN**
```jsonl
{"seq":1,"type":"ENGINE_START",...}
{"seq":2,"type":"THOUGHT",...}
```

**Pros**:
- Atomic appends (`fs.appendFile`)
- Can `tail -f` for real-time viewing
- Partial reads efficient
- Damage localized to single line
- Rich Unix toolchain (`grep`, `awk`, `jq`)

**Cons**:
- Need line-by-line parsing (~20 lines of code)
- Slightly larger file size (~5-10%)

#### Option C: SQLite Database ❌

**Pros**: Strong types, indexes, transactions, query flexibility
**Cons**:
- Adds dependency (violates minimalism)
- Not human-readable (can't `cat` or `grep`)
- Violates "Everything is a File" philosophy
- Overkill for append-only sequential access

### Implementation

```typescript
// Writing (src/journal.ts)
await fs.appendFile(journalPath, JSON.stringify(event) + '\n', 'utf-8');

// Reading (src/journal.ts)
const content = await fs.readFile(journalPath, 'utf-8');
const lines = content.trim().split('\n').filter(line => line.length > 0);
const events = lines.map(line => JSON.parse(line)).sort((a, b) => a.seq - b.seq);
```

## Consequences

### Benefits ✅

1. **Excellent Debug Experience**
   - `tail -20 .delta/$(cat .delta/LATEST)/journal.jsonl` - Quick inspection
   - `tail -f journal.jsonl` - Real-time monitoring
   - `grep "ERROR" journal.jsonl | jq .` - Powerful filtering
   - Used countless times during development

2. **Fault Tolerance**
   - Bad line doesn't corrupt rest of file
   - Can manually fix corrupted line with text editor
   - Easy to concatenate/split journals

3. **Performance**
   - Append is O(1) and atomic
   - Read 180 lines < 5ms (measured)
   - Negligible vs LLM call latency (1-3 seconds)

4. **Rich Toolchain**
   - `jq` for JSON processing
   - `awk`/`sed` for text manipulation
   - Standard Unix tools "just work"

### Tradeoffs ❌

1. **Parsing Complexity**
   - Need to split by newline + parse each line
   - ~20 lines of code vs `JSON.parse()` for array
   - **Mitigation**: Abstracted in `journal.ts`, single responsibility

2. **File Size**
   - ~5-10% larger than JSON array (no compression)
   - **Mitigation**: Size negligible for typical runs (<1MB for 1000 events)

3. **External Tool Corruption Risk**
   - VSCode JSONL plugins can auto-convert format (incident: 2025-10-09)
   - **Mitigation**: Runtime validation added (see incident report)

## Lessons Learned

1. **Simplicity Over Premature Optimization**
   - Worried about "line-by-line parsing" being slow
   - Reality: 10ms for 1000 lines vs 1000-3000ms for LLM calls
   - Developer experience > micro-optimization

2. **Human Readability Has Compounding Value**
   - Used `tail`/`grep`/`jq` hundreds of times during development
   - Avoided writing custom analysis tools
   - Enabled quick debugging in production

3. **Unix Philosophy Alignment Pays Off**
   - Plain text + line-based format = universal tooling
   - Composition of simple tools > monolithic solution

4. **Format Stability is Critical**
   - Once chosen, hard to change (backward compatibility)
   - Runtime validation essential (see incident: 2025-10-09)

## Related

- **ADR-001**: Stateless Core (why we need journal)
- **Incident Report**: `.story/incidents/2025-10-09-journal-corruption.md` - VSCode plugin corruption
- **Implementation**: `src/journal.ts` - Read/write logic
- **Schema**: `src/journal-types.ts` - Event type definitions
- **Tests**: `tests/unit/journal-format-validation.test.ts` - Format validation tests
