# Delta Engine Story Index

> **Meta**: This document is automatically maintained by AI, recording key project decisions and lessons learned
> **Last Updated**: 2025-09-30 by Claude Code
> **Size Goal**: Keep between 300-500 lines
> **Current Size**: 387 lines

---

## 📖 How to Use This Document (AI Instructions)

### At Collaboration Start
1. **Must Read**: "Core Decisions" and "Known Traps" sections
2. When facing architectural issues, search relevant keywords (see "Quick Search Guide" at bottom)
3. If no answer found, it's a new problem - document it after solving

### During Collaboration
| Situation | Action |
|-----------|--------|
| Discovered new design rationale | Immediately record in "Core Decisions" |
| Hit a trap and solved it | Immediately record in "Known Traps" |
| Tried multiple approaches | Consider recording in "Tradeoffs" |

### At Collaboration End
- Run maintenance checklist (see bottom)
- If updated, notify user: "📝 Updated .story/INDEX.md with XXX"

---

## 🎯 Core Decisions (Inviolable Principles)

### 1. Stateless Core Principle
**Time**: v1.1 architecture refactor
**Problem**: MVP used in-memory state, couldn't recover from crashes
**Decision**: All state must be rebuilt from journal.jsonl
**Implementation**: `engine.ts:rebuildConversationFromJournal()`
**Validation**: "If process crashes, can this state be recovered from disk?"
**Status**: ✅ Active
**Details**: @decisions/001-stateless-core.md

### 2. Everything is a Command
**Time**: v1.0 initial design
**Problem**: How to avoid engine becoming a bloated framework
**Decision**: Engine has no built-in features, all capabilities via external commands
**Implementation**: `executor.ts` + `config.yaml tools`
**Tradeoff**: Flexibility > performance, Composability > convenience
**Philosophy**: Unix philosophy - do one thing well
**Status**: ✅ Active

### 3. Environment as Interface (CWD)
**Time**: v1.0 initial design
**Problem**: How should Agent interact with the world
**Decision**: Only through current working directory (CWD), files are universal interface
**Implementation**: `.delta/` control plane + user files
**Constraint**: Agent cannot access outside CWD (unless via tools)
**Status**: ✅ Active

### 4. LATEST File Format
**Time**: 2025-09-30
**Problem**: How to track the latest run ID
**Tried**: Symlink vs text file
**Decision**: Plain text file (stores run ID string)
**Reasons**:
  1. Cross-platform compatibility (Windows symlink requires admin)
  2. Simplicity first (`cat .delta/LATEST` to read)
  3. Atomic write (`fs.writeFile` single operation)
**Implementation**: `context.ts:183` - `await fs.writeFile(latestFile, runId, 'utf-8')`
**Status**: ✅ Active
**Details**: @traps/latest-file-not-symlink.md

---

## ⚠️ Known Traps (Must Avoid)

### ESM Import Must Include .js Extension
**Symptom**: `import { Engine } from './engine'` compiles but fails at runtime
**Root Cause**: TypeScript doesn't validate ESM paths, Node.js runtime requires extension
**Solution**: All imports must explicitly use `.js`, e.g. `'./engine.js'`
**Detection**: Runtime error "Cannot find module"
**Documented**: CLAUDE.md "Code Patterns to Avoid"
**Details**: @traps/esm-import-extension.md

### File Descriptor Leak
**Symptom**: After long runs "Too many open files" / "EMFILE"
**Root Cause**: FileHandle not properly closed
**Solution**:
```typescript
// ✅ Correct
const handle = await fs.open(path);
try {
  // ... operations
} finally {
  await handle.close();
}
```
**High-risk areas**: `journal.ts`, `ask-human.ts` (frequent file operations)
**Detection**: `lsof -p <pid> | wc -l` continuously growing
**Fix history**: v1.1 fixed multiple leaks
**Details**: @traps/file-descriptor-leak.md

### Journal Rebuild Order Sensitivity
**Symptom**: Inconsistent state when resuming run
**Root Cause**: Event order incorrect (THOUGHT before ACTION_RESULT)
**Solution**: Strictly sort by `seq` field
**Implementation**: `journal.ts:readJournal()` sorting logic
**Test**: `npm run test:stateless` covers this scenario
**Key Point**: JSONL append ensures order, but reading must validate

### Hook Execution Blocking Main Loop
**Symptom**: Hook timeout causes Agent to hang
**Root Cause**: Hooks execute synchronously without timeout protection
**Solution**: All hooks have `timeout_ms` (default 5000ms)
**Configuration**: `config.yaml hooks.*.timeout_ms`
**Implementation**: `hook-executor.ts` uses `AbortController`
**Tradeoff**: See "Hook Timeout Default" below

---

## 🔄 Tradeoffs (Why We Chose This Way)

### Journal Format: JSONL vs JSON Array
**Option A**: Single JSON array `[{...}, {...}]`
**Option B**: JSONL (one JSON per line) ✅

**Chosen**: B
**Reasons**:
  - ✅ Append operation is atomic (no need to read entire file)
  - ✅ Can `tail -f` for real-time viewing
  - ✅ Partial read is efficient (read only needed lines)
  - ✅ Damage localization (one bad line doesn't affect others)
**Cost**:
  - ❌ Need line-by-line parsing (but performance impact negligible)
**Status**: ✅ Active
**Details**: @decisions/002-journal-jsonl-format.md

### Hook Timeout Default: 5000ms
**Problem**: What timeout value is appropriate?
**Test scenarios**:
  - 100ms: ❌ Kills legitimate network requests
  - 1000ms: ❌ Some git operations timeout
  - 5000ms: ✅ Covers 95% scenarios
  - 10000ms: ⚠️ Too long, user perceives hang
  - 30000ms: ❌ Almost like infinite wait

**Chosen**: 5000ms (5 seconds)
**Reasons**:
  - Covers most legitimate operations (git, curl, file processing)
  - Fast enough to expose infinite loops/blocking
  - Can be configured per-hook via `timeout_ms`
**Status**: ✅ Active

### Parameter Injection: Three Modes Necessity
**Why need stdin/argument/option?**

**Scenario 1 (stdin)**: Pass large text
```yaml
# Avoid command line length limit (typically 128KB)
parameters:
  - name: content
    inject_as: stdin  # echo "large text" | command
```

**Scenario 2 (argument)**: Simple values
```yaml
# Unix convention
parameters:
  - name: filename
    inject_as: argument  # command filename
```

**Scenario 3 (option)**: Named parameters
```yaml
# Tool requires --flag value format
parameters:
  - name: output
    inject_as: option
    option_name: --output  # command --output value
```

**Constraint**: At most one stdin (shell limitation)
**Implementation**: `executor.ts:buildCommandArgs()`
**Validation**: Zod schema enforces this constraint
**Status**: ✅ Active

### v1.2 Human Interaction: Two Modes
**Problem**: How to let Agent request user input?
**Requirements**:
  1. Dev/debug: Synchronous interaction (immediate response)
  2. Automation/Web: Asynchronous interaction (file communication)

**Option A**: Only sync CLI input ❌
**Option B**: Only async file communication ❌
**Option C**: Both modes coexist ✅

**Chosen**: C - Toggle via `-i` flag
**Implementation**:
  - Sync mode: `readline` directly reads stdin
  - Async mode: `.delta/interaction/` file communication
  - Shared tool: `ask_human` (built-in)
**Tradeoff**: Adds some complexity but covers both scenarios
**Status**: ✅ Active
**Details**: @decisions/004-human-interaction-modes.md

---

## 📚 Deep Documentation Index

### Architecture Decisions (`decisions/`)
- `001-stateless-core.md` - Why we chose stateless architecture
- `002-journal-jsonl-format.md` - Journal format deep analysis
- `004-human-interaction-modes.md` - v1.2 human interaction design

### Trap Explanations (`traps/`)
- `esm-import-extension.md` - Complete ESM import explanation
- `file-descriptor-leak.md` - File descriptor leak case analysis
- `latest-file-not-symlink.md` - LATEST file format decision process

---

## 🔧 AI Maintenance Checklist (Run at Collaboration End)

### Did This Collaboration Involve?

**Core Decision Category** (Update INDEX.md "Core Decisions" + Create decisions/XXX.md):
- [ ] Changed core architecture principles (Stateless/Everything is Command/CWD)
- [ ] Introduced new design pattern or convention
- [ ] Made irreversible tech choice
- [ ] Determined important default values or thresholds

**Trap Category** (Update INDEX.md "Known Traps" + Create traps/XXX.md):
- [ ] Discovered and fixed non-obvious bug
- [ ] Encountered platform compatibility issue
- [ ] Hit performance/resource leak trap
- [ ] Found easily misused API

**Tradeoff Category** (Update INDEX.md "Tradeoffs"):
- [ ] Chose between multiple approaches (need explanation)
- [ ] Adjusted important default values/thresholds
- [ ] Sacrificed one goal for another

**Experiment Category** (Consider creating experiments/YYYY-MM-*.md if needed):
- [ ] Tried 3+ approaches with detailed comparison data
- [ ] Conducted significant performance/usability testing
- [ ] Explored new tech/library feasibility with multiple iterations

### Post-Update Actions

If any updates:
1. **Notify user** (in response):
   ```
   📝 Updated .story/INDEX.md with:
   - [Core Decision] LATEST file format choice
   - [Known Trap] ESM import extension issue
   ```

2. **Check document health**:
   ```bash
   # Check INDEX.md line count
   wc -l .story/INDEX.md
   ```

   - **< 450 lines**: ✅ Healthy, continue current mode
   - **450-499 lines**: ⚠️ Warning, evaluate Level 2 candidates
   - **≥ 500 lines**: 🔴 Trigger leveling refactor (see "Leveling Process" at bottom)

   If leveling needed:
   - Move details to decisions/ or traps/
   - Keep summary + keywords + `@link` in INDEX.md
   - Update "Document Health" table

3. **Update metadata**:
   - Update "Last Updated" time at document top
   - Update "INDEX.md line count" in "Document Health" table

---

## 🔍 Quick Search Guide (AI Hints)

**When facing design issues, search these keywords first**:

| Keyword | Related Content |
|---------|----------------|
| `stateless` | State management, recoverability |
| `journal` | Log format, event types |
| `hook` | Lifecycle hooks, extension points |
| `stdin/argument/option` | Parameter injection, tool invocation |
| `LATEST` | Run ID tracking |
| `FileHandle/descriptor` | Resource leaks |
| `ESM/.js` | Import issues |
| `CWD/workDir` | Working directory, environment interface |
| `ask_human` | Human interaction |
| `metadata.json` | Run state management |

**Search methods**:
```bash
# Search in INDEX.md
grep -i "keyword" .story/INDEX.md

# Search in all story documents
grep -r "keyword" .story/
```

---

## 📊 Document Health

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| INDEX.md lines | 387 | <500 (warn@450) | ✅ Healthy |
| Core decisions | 4 | 5-10 | ✅ Reasonable |
| Known traps | 4 | 5-8 | ✅ Reasonable |
| Tradeoffs | 4 | 5-10 | ✅ Reasonable |
| Last updated | 2025-09-30 | - | - |
| Deep docs | 6 (3 decisions + 3 traps) | - | - |
| Level status | Level 1 (full) | - | - |

---

## 🎯 Future Extensions (As Needed)

### When Content Grows: Leveling Strategy (>500 lines)

**Problem**: INDEX.md may exceed 500 lines as project evolves

**Solution: Three-Level System**

#### Level 1 - Global Context (Must Read, Keep in INDEX)
**Criteria**:
- ✅ Core principles affecting all code (e.g. Stateless Core)
- ✅ Constraints any developer must know (e.g. ESM .js extension)
- ✅ Decisions whose violation causes architectural errors

**Format**: Full description (as current)

**Example**:
```markdown
### 1. Stateless Core Principle [LEVEL 1]
**Time**: v1.1 architecture refactor
**Problem**: MVP used in-memory state, couldn't recover from crashes
**Decision**: All state must be rebuilt from journal.jsonl
...(full content)
```

#### Level 2 - Context-Specific (Move Details to Deep Docs)
**Criteria**:
- Subsystem-specific decisions (e.g. Hook timeout value)
- Common but not always needed traps (e.g. Journal order)
- Scenario-specific tradeoff choices

**Format**: Title + keywords + link to decisions/ or traps/

**Example**:
```markdown
### Hook Execution & Timeout
**Keywords**: `hook`, `timeout`, `5000ms`, `AbortController`
**Scenario**: Modifying hook system, debugging hook timeouts
**Details**: @decisions/003-hook-timeout-design.md
```

### Leveling Conversion Process (AI Executes)

**Trigger**: INDEX.md reaches 450 lines (warning) or 500 lines (mandatory)

**Steps**:
1. **Evaluate all content**: Assign Level 1 or Level 2 to each item
   - Level 1: Core principles (5-10 items, keep full content)
   - Level 2: Context-specific (move details to decisions/ or traps/, keep summary)

2. **Refactor INDEX.md**:
   - Keep Level 1 items with full content
   - Convert Level 2 items to summary format (title + keywords + link)
   - Move detailed content to dedicated `.md` files

3. **Validate result**:
   - INDEX.md back to 300-400 line range
   - Level 1 content complete and clear
   - Level 2 items have clear retrieval paths

---

**Current Status**: Level 1 (all content, 387 lines)
**Next Evaluation**: When INDEX.md reaches 450 lines
**Goal**: Always keep INDEX.md < 500 lines
