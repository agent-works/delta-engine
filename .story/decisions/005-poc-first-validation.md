# Decision: POC-First Architecture Validation

**Date**: 2025-10-01 (v1.4.2 session management)
**Status**: ✅ Active Methodology
**Context**: Choosing between multiple architecture approaches
**Related**: v1.4.0 failed (GNU Screen), v1.4.2 succeeded (Unix Socket)

---

## The Problem

**Question**: How to avoid wasting days/weeks implementing the wrong architecture?

**Real Case Study**: v1.4.2 Session Management

We needed to add session management to Delta Engine. Two main architectural approaches:
1. **GNU Screen-based** (wrap existing tool)
2. **Unix Socket + Custom Holder** (build from scratch)

Both seemed viable on paper. Which to choose?

---

## The Trap: Implement-First Approach

### What Happened with v1.4.0

**Timeline**:
- **Morning**: Decided on GNU Screen approach (seemed simpler)
- **Day 1**: Implemented Screen wrapper, session manager, CLI commands
- **Day 1 evening**: Discovered `screen -X hardcopy` produces empty files when session is detached
- **Day 1 night**: Tried workarounds (attach/detach, alternative commands)
- **Result**: **Entire day wasted**, architecture fundamentally broken

**Root Cause**: Assumption violation discovered too late
- **Assumed**: Screen's `hardcopy` works with detached sessions
- **Reality**: Only works with attached sessions (by design)
- **Impact**: Core requirement (cross-process read) impossible

---

## The Solution: POC-First Validation

### Methodology

**Principle**: **Validate critical assumptions BEFORE implementation**

**Process**:
1. **Identify Core Assumptions** (2-5 per architecture)
2. **Write Minimal POC Scripts** (5-15 min each)
3. **Each POC Tests ONE Assumption**
4. **All POCs Pass** → Start implementation
5. **Any POC Fails** → Reconsider architecture

---

### v1.4.2 POC Example (Unix Socket Approach)

**9 POC Scripts Created** (investigation/ directory, ~2 hours total):

#### Phase 1: Basic Concepts
1. **test-1-detached-stdio.cjs**
   - **Assumption**: Node.js can spawn detached processes that survive parent exit
   - **Test**: Spawn detached holder, parent exits, verify holder alive
   - **Result**: ✅ Pass

2. **test-2-cross-cli-rw.cjs**
   - **Assumption**: Multiple CLI processes can communicate with single holder
   - **Test**: CLI 1 writes to file, CLI 2 reads from file
   - **Result**: ✅ Pass (proof of concept for cross-process)

#### Phase 2: Socket Implementation
3. **test-3-unix-socket.cjs**
   - **Assumption**: Unix sockets work for simple IPC
   - **Test**: Server accepts connections, echo protocol
   - **Result**: ✅ Pass

4. **test-4-full-cli.cjs** ⭐ **Key POC**
   - **Assumption**: Complete architecture (detached holder + socket + CLI) is viable
   - **Test**: Full lifecycle: start → write → read → end
   - **Result**: ✅ Pass (became implementation template)

#### Phase 3: Edge Cases & Reliability
5. **test-5-holder-crash.cjs**
   - **Assumption**: CLI can detect if holder crashes
   - **Test**: Kill holder, verify CLI detects dead socket
   - **Result**: ✅ Pass

6. **test-6-stale-socket.cjs**
   - **Assumption**: Stale sockets (from crashed holders) can be cleaned up
   - **Test**: Create orphaned socket, verify cleanup logic
   - **Result**: ✅ Pass

7. **test-7-concurrent.cjs**
   - **Assumption**: Socket handles concurrent read/write safely
   - **Test**: 30 simultaneous writers, verify no corruption
   - **Result**: ✅ Pass

8. **test-8-zombie.cjs**
   - **Assumption**: Holder doesn't create zombie processes
   - **Test**: Kill holder abruptly, check for zombies
   - **Result**: ✅ Pass

9. **test-9-large-data.cjs**
   - **Assumption**: Socket handles large data (>1MB) without truncation
   - **Test**: Transfer 1MB+ strings through socket
   - **Result**: ✅ Pass

**Outcome**: All 9 POCs passed → Proceeded with implementation → v1.4.2 succeeded

---

## Cost-Benefit Analysis

### POC Investment
- **Time**: ~2 hours (9 scripts × 10-15 min each)
- **Code**: ~300 lines of throwaway scripts
- **Risk**: Minimal (validates assumptions, doesn't commit to design)

### Avoided Cost (from v1.4.0 Failure)
- **Implementation Time**: 1 full day wasted
- **Debugging Time**: 4 hours trying workarounds
- **Context Switching**: Mental cost of abandoning approach
- **Emotional Cost**: Frustration from "dead end"
- **Estimated Total**: **1.5-2 days saved**

### ROI
```
Investment:    2 hours
Saved:        16-20 hours (2 days)
ROI:          8-10x return
```

---

## When to Use POC-First

### High-Value Scenarios ✅

1. **Multiple Viable Architectures**
   - 2+ approaches seem reasonable
   - Trade-offs not obvious

2. **Critical Assumptions**
   - Relying on library/tool behavior not well-documented
   - Platform-specific features (e.g., Unix sockets, file locking)
   - Performance requirements (latency, throughput)

3. **Unfamiliar Territory**
   - First time using technology (e.g., PTY, IPC, sockets)
   - Uncertain about API capabilities

4. **High Implementation Cost**
   - Feature would take 1+ days to implement
   - Refactoring/migration would be expensive

### Low-Value Scenarios ❌

1. **Well-Understood Patterns**
   - Standard CRUD operations
   - Common file I/O patterns
   - Established best practices

2. **Low Implementation Cost**
   - Can implement in <2 hours
   - Easy to refactor later

3. **Only One Viable Approach**
   - No architectural alternatives
   - Clear technical consensus

---

## Best Practices

### 1. Keep POCs Minimal
```javascript
// ✅ Good: Single-file, <100 lines
// test-socket.cjs
const net = require('net');
const server = net.createServer(...);
// Test one thing

// ❌ Bad: Multi-file, full framework
// src/poc/server.ts
// src/poc/client.ts
// src/poc/types.ts
// Too much infrastructure
```

### 2. Test Assumptions, Not Features
```javascript
// ✅ Good: Tests core assumption
// "Can socket handle concurrent writes?"
for (let i = 0; i < 30; i++) {
  sendConcurrentWrite();
}

// ❌ Bad: Tests product feature
// "Can user create and list sessions?"
// (This is integration test, not POC)
```

### 3. Use Throwaway Code
- Don't worry about code quality
- Copy-paste is fine
- No TypeScript, no types, no tests
- Goal: **Quick validation**, not production code

### 4. Document Learnings
```markdown
# POC Results

Test 1: ✅ Detached process works
Test 2: ❌ Screen hardcopy fails
Test 3: ✅ Socket IPC works

Decision: Proceed with Socket approach
Reason: Test 2 failure blocks Screen approach
```

---

## Failure Mode: When POC Shows Problem

**Example**: v1.4.0 Screen approach

If we had done POC first:

```bash
# test-screen-hardcopy.cjs
screen -dmS test_session bash
screen -S test_session -X hardcopy /tmp/output.txt
cat /tmp/output.txt  # ← Empty!

# POC reveals problem in 10 minutes
# Saved entire day of implementation
```

**Action**: Don't stubbornly continue
- If core assumption fails → Reconsider architecture
- Don't try to "make it work" if POC shows fundamental limitation
- Better to discover in 10 minutes than after 1 day

---

## Related Decisions

- `001-stateless-core.md` - Another example of architectural validation
- `002-journal-jsonl-format.md` - Format choice validated through testing

---

## Lessons Learned

### What Worked
1. **Independent Scripts**: Each POC focused, not interdependent
2. **Comprehensive Coverage**: 9 POCs covered concept → implementation → edge cases
3. **Template Value**: test-4 became implementation template (saved time)

### What Could Improve
1. **Earlier Start**: Should have done POC for v1.4.0 Screen approach
2. **Document First**: Write POC plan before coding (avoid missing critical tests)

### Core Insight

> **"The cost of wrong architecture grows exponentially with time. The cost of POC validation is linear and small."**

**Corollary**: When in doubt, POC it out.

---

**Status**: ✅ Recommended practice for all major architectural decisions
