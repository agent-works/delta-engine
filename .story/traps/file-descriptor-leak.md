# Trap: File Descriptor Leak

**Discovered**: v1.1 Early Development (2025 Q3)
**Severity**: 🔴 High (causes process crash)
**Status**: ✅ Fixed in v1.1
**Affects**: `journal.ts`, `ask-human.ts`, any frequent file operations

---

## The Trap

### Wrong Code Pattern

```typescript
// ❌ Wrong: FileHandle not closed
async function readJournal() {
  const handle = await fs.open(journalPath, 'r');
  const content = await handle.readFile('utf-8');
  return content;  // ← Forgot to close handle!
}
```

**Result**: Each call leaks one file descriptor.

### Symptom

**Short runs (minutes)**: Works fine
**Long runs (hours/days)**:
```
Error: EMFILE: too many open files
  at Object.openSync (node:fs:599:3)
```

**System exhaustion**:
```bash
$ lsof -p <pid> | wc -l
1024  # ← Hit system limit (typically 256-1024)
```

---

## Why Easy to Forget

1. **JS GC doesn't manage file descriptors** - Only manages memory, not OS resources
2. **Async exception handling** - If exception thrown between `open()` and `close()`, close never executes
3. **Short-term tests don't expose** - Unit tests: dozens of calls (won't hit limit)

---

## Correct Patterns

### Pattern 1: try-finally (Recommended)

```typescript
// ✅ Correct: Always close in finally
async function readJournal() {
  const handle = await fs.open(journalPath, 'r');
  try {
    const content = await handle.readFile('utf-8');
    return content;
  } finally {
    await handle.close();  // ← Always executes
  }
}
```

### Pattern 2: Avoid fs.open (Simplest)

```typescript
// ✅ Best: Use higher-level API
async function readJournal() {
  return await fs.readFile(journalPath, 'utf-8');
  // ← Internally manages file descriptor
}
```

**Principle**: Use `readFile`/`writeFile`/`appendFile` unless you need streaming or precise control.

---

## Detection

**Runtime**: `lsof -p <pid> | wc -l` continuously growing

**Normal**: 10-30 file descriptors for Delta Engine
**Leak**: +1/+2 per iteration

---

## Fixed Locations

### journal.ts
```typescript
// ✅ Fixed: Use fs.appendFile
await fs.appendFile(journalPath, JSON.stringify(event) + '\n', 'utf-8');
```

### ask-human.ts
```typescript
// ✅ Fixed: Use fs.readFile
const content = await fs.readFile(responsePath, 'utf-8');
```

---

## Lesson

**Core lesson**: OS resources need explicit management, JS GC doesn't help.

**Best practices**:
1. Prefer high-level APIs (`readFile`/`writeFile`)
2. Must use `open`? Always `try-finally`
3. Integration tests for resource leaks
4. Long-running tests (hours) expose leaks

---

## Related

- `src/journal.ts` - Fixed (uses `appendFile`)
- `src/ask-human.ts` - Fixed (uses `readFile`)
- @decisions/001-stateless-core.md - Context for frequent file operations
