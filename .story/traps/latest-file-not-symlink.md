# Trap: LATEST File Not a Symlink

**Discovered**: 2025-09-30
**Reporter**: @fugen
**Severity**: ⚠️ Medium (causes debug command failures)
**Status**: ✅ Documented

---

## The Trap

### Wrong Assumption

When writing CLAUDE.md debug commands, assumed `.delta/runs/LATEST` was a symbolic link:

```bash
# ❌ Wrong command (based on wrong assumption)
cat .delta/runs/$(readlink .delta/runs/LATEST)/execution/journal.jsonl
                  ^^^^^^^^ assumes LATEST is symlink
```

**Result**: Command fails, `readlink` returns error.

### Actual Implementation

`.delta/runs/LATEST` is a **plain text file** containing latest run ID string:

```typescript
// src/context.ts:183
await fs.writeFile(latestFile, runId, 'utf-8');
//                              ^^^^^ writes run ID string directly
```

**File content**:
```bash
$ cat .delta/runs/LATEST
20250930_112833_ddbdb0
```

---

## Why This Assumption Was Reasonable

Symlinks are common Unix pattern for tracking "latest":
```bash
logs/latest -> logs/2025-09-30.log
config/active -> config/production.yaml
```

So assuming `LATEST` is symlink **looks reasonable**.

### But Why Not Symlink?

**Reasons** (see INDEX.md "Core Decisions #4"):
1. **Cross-platform** - Windows symlink needs admin privileges
2. **Simplicity** - Text file simpler, `cat` to read
3. **Atomicity** - `fs.writeFile()` is atomic

---

## Correct Usage

```bash
# Method 1: Using variable (recommended, readable)
RUN_ID=$(cat .delta/runs/LATEST)
tail -20 .delta/runs/$RUN_ID/execution/journal.jsonl

# Method 2: One-liner (bash/zsh)
tail -20 .delta/runs/$(cat .delta/runs/LATEST)/execution/journal.jsonl
                      ^^^ Note: cat, not readlink
```

---

## Detection

**Symptom**: Error message
```
readlink: LATEST: Invalid argument
# or
not a symbolic link
```

**Verify**:
```bash
file .delta/runs/LATEST
# Output: ASCII text, with no line terminators
```

---

## Prevention

### In Documentation

```markdown
# ✅ Good: Explicit about file type
LATEST is a text file containing run ID (see context.ts:183)

# ❌ Bad: Ambiguous
LATEST points to the latest run
```

### Always Reference Source Code

Don't guess implementation details - always check source code and provide reference.

---

## Lesson

**Core lesson**: Don't assume implementation details, always check source code.

Even "obvious" designs (LATEST should be symlink) may differ due to:
- Platform compatibility
- Simplicity priorities
- Historical reasons

---

## Related

- `src/context.ts:183` - Creates LATEST file
- `src/context.ts:221-231` - Reads LATEST file
- CLAUDE.md - Debug commands corrected
