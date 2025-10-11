# ADR-004: POC-First Architecture Validation Methodology

**Date**: 2025-10-01 (v1.4.2 session management)
**Status**: Active Methodology
**Context**: Choosing between multiple architectural approaches

## Context

### The Problem

**Question**: How do we avoid wasting days or weeks implementing the wrong architecture?

**Real Case Study**: v1.4 Session Management

We needed to add persistent session management to Delta Engine. Two main approaches seemed viable:
1. **GNU Screen-based**: Wrap existing tool (seemed simpler)
2. **Unix Socket + Custom Holder**: Build from scratch (more control)

Both looked reasonable on paper. Which to choose?

### The Trap: Implement-First Approach

**What happened with v1.4.0 (Screen approach)**:

**Timeline**:
- **9:00 AM**: Decided on GNU Screen (seemed simpler, mature tool)
- **9:30 AM - 5:00 PM**: Implemented Screen wrapper, session manager, CLI commands
- **5:30 PM**: Integration testing - discovered `screen -X hardcopy` produces empty files when session detached
- **5:30 PM - 9:00 PM**: Tried workarounds (attach/detach tricks, alternative commands)
- **9:00 PM**: Gave up - fundamental limitation, cannot be worked around

**Result**: **Entire day wasted** on fundamentally broken architecture

**Root Cause**: Critical assumption violation discovered too late
- **Assumed**: Screen's `hardcopy` works with detached sessions
- **Reality**: Only works with attached sessions (by design, not a bug)
- **Impact**: Core requirement (cross-process read without attaching) impossible

## Decision

**Validate critical assumptions with minimal POC scripts BEFORE full implementation**

### Methodology: POC-First Validation

**Process**:
1. **Identify Core Assumptions** (2-5 per architecture option)
2. **Write Minimal POC Scripts** (5-15 min each, throwaway code)
3. **Each POC Tests ONE Assumption** (focused, not comprehensive)
4. **All POCs Pass** → Start implementation
5. **Any POC Fails** → Reconsider architecture immediately

**Key Principle**:
> "The cost of wrong architecture grows exponentially with time. The cost of POC validation is linear and small."

### v1.4.2 POC Example (Unix Socket Approach)

**9 POC Scripts Created** (`investigation/` directory, ~2 hours total):

#### Phase 1: Basic Concepts (15 min)
1. **test-1-detached-stdio.cjs**
   - Assumption: Node.js can spawn detached processes that survive parent exit
   - Test: Spawn detached holder, kill parent, verify holder alive
   - Result: ✅ Pass

2. **test-2-cross-cli-rw.cjs**
   - Assumption: Multiple CLI processes can share state via files
   - Test: CLI 1 writes, CLI 2 reads
   - Result: ✅ Pass (validates concept)

#### Phase 2: Socket Implementation (30 min)
3. **test-3-unix-socket.cjs**
   - Assumption: Unix sockets work for IPC
   - Test: Simple echo server/client
   - Result: ✅ Pass

4. **test-4-full-cli.cjs** ⭐ **Key POC**
   - Assumption: Complete architecture viable (holder + socket + CLI)
   - Test: Full lifecycle: start → write → read → end
   - Result: ✅ Pass
   - **Bonus**: Became implementation template (saved time)

#### Phase 3: Edge Cases & Reliability (1 hour)
5. **test-5-holder-crash.cjs**
   - Assumption: CLI can detect dead holder
   - Result: ✅ Pass

6. **test-6-stale-socket.cjs**
   - Assumption: Can clean up orphaned sockets
   - Result: ✅ Pass

7. **test-7-concurrent.cjs**
   - Assumption: Socket handles 30 concurrent writers safely
   - Result: ✅ Pass (no data corruption)

8. **test-8-zombie.cjs**
   - Assumption: No zombie processes after abrupt kill
   - Result: ✅ Pass

9. **test-9-large-data.cjs**
   - Assumption: Socket handles >1MB data without truncation
   - Result: ✅ Pass

**Outcome**: All 9 POCs passed → Implemented with confidence → v1.4.2 shipped successfully

## Consequences

### Cost-Benefit Analysis

**POC Investment**:
- Time: ~2 hours (9 scripts × 10-15 min each)
- Code: ~300 lines of throwaway scripts
- Risk: Minimal (no commitment to design yet)

**Cost Avoided** (from v1.4.0 failure):
- Implementation time: 1 full day wasted
- Debugging time: 4 hours on workarounds
- Context switching: Mental cost of dead end
- Emotional cost: Frustration
- **Total saved**: 1.5-2 days (16-20 hours)

**ROI**: 8-10x return on time invested

### Benefits ✅

1. **Fail Fast, Fail Cheap**
   - Discover deal-breakers in minutes, not days
   - Throwaway code = no sunk cost

2. **Confidence in Implementation**
   - All core assumptions validated
   - Less anxiety during development
   - Know it will work before investing heavily

3. **Documentation Value**
   - POC scripts serve as runnable examples
   - Team can reproduce assumptions
   - Reference during implementation

4. **Template Value**
   - test-4-full-cli.cjs became implementation blueprint
   - Saved ~4 hours of "how to structure this"

### Tradeoffs ❌

1. **Upfront Time**
   - 2 hours before coding "real" feature
   - Can feel like delay
   - **Mitigation**: Compare to 16+ hours if wrong

2. **Temptation to Skip**
   - "This is obviously going to work"
   - "I'll just try it and see"
   - **Counter**: v1.4.0 felt obvious too

3. **Throwaway Code**
   - ~300 lines never make it to production
   - Feels wasteful
   - **Reality**: Validation value >> code reuse

## When to Use POC-First

### High-Value Scenarios ✅

1. **Multiple Viable Architectures**
   - 2+ approaches seem reasonable
   - Trade-offs not obvious from paper design

2. **Critical Assumptions**
   - Relying on poorly-documented library behavior
   - Platform-specific features (sockets, PTY, file locking)
   - Performance requirements (latency, throughput)

3. **Unfamiliar Territory**
   - First time using technology (IPC, sessions, etc.)
   - Uncertain about API capabilities

4. **High Implementation Cost**
   - Feature would take 1+ days to implement
   - Refactoring would be expensive

### Low-Value Scenarios ❌

1. **Well-Understood Patterns**
   - Standard CRUD, file I/O, HTTP APIs
   - Established best practices

2. **Low Implementation Cost**
   - Can implement in <2 hours
   - Easy to refactor later

3. **Only One Viable Approach**
   - No alternatives
   - Clear technical consensus

## Best Practices

### 1. Keep POCs Minimal
```javascript
// ✅ Good: Single-file, <100 lines, no dependencies
// test-socket.cjs
const net = require('net');
const server = net.createServer(socket => {
  socket.on('data', data => socket.write(data)); // Echo
});
server.listen('/tmp/test.sock');

// ❌ Bad: Multi-file, TypeScript, full framework
// src/poc/server.ts
// src/poc/client.ts
// src/poc/types.ts
// tsconfig.poc.json
```

### 2. Test Assumptions, Not Features
```javascript
// ✅ Good: Tests core assumption
// "Can socket handle 30 concurrent writes safely?"
for (let i = 0; i < 30; i++) {
  forkClient().write(`msg-${i}`);
}
verifyNoCorruption();

// ❌ Bad: Tests product feature
// "Can user create/list/delete sessions?"
// (This is integration test, not POC)
```

### 3. Use Throwaway Code Quality
- No TypeScript (unless needed for typing complex library)
- No tests (POC itself is the test)
- Copy-paste is fine
- Inline everything
- **Goal**: Quick validation, not production code

### 4. Document Learnings
```markdown
# POC Results (2025-10-01)

✅ test-1: Detached processes work
❌ test-2: Screen hardcopy fails with detached sessions
✅ test-3: Unix socket IPC works
✅ test-4: Full architecture validated

Decision: Proceed with Unix Socket approach
Reason: Screen approach blocked by test-2 failure
Time saved: ~16 hours (avoided full implementation)
```

## Failure Mode: When POC Reveals Problem

**Example**: v1.4.0 Screen approach (if we had POC'd it)

```bash
#!/usr/bin/env node
# test-screen-hardcopy.cjs

const { execSync } = require('child_process');

// Detach screen session
execSync('screen -dmS test_session bash');

// Try to read output
execSync('screen -S test_session -X hardcopy /tmp/output.txt');
const output = require('fs').readFileSync('/tmp/output.txt', 'utf-8');

console.log('Output length:', output.length);
// → Output length: 0  ❌ FAIL

// POC reveals problem in 10 minutes
// Saved entire day of implementation!
```

**Action When POC Fails**:
- ❌ Don't try to "make it work" if fundamental
- ❌ Don't invest more time in workarounds
- ✅ Pivot to alternative approach immediately
- ✅ Document why this approach won't work

Better to discover in 10 minutes than after 1 day.

## Lessons Learned

### What Worked
1. **Independent Scripts**: Each POC standalone, easy to run
2. **Comprehensive Coverage**: Concept → implementation → edge cases
3. **Template Value**: test-4 became blueprint (unexpected bonus)
4. **Team Buy-In**: Saved time makes case for methodology

### What Could Improve
1. **Earlier Start**: Should have POC'd Screen approach before coding
2. **Write POC Plan First**: List assumptions before writing scripts
3. **Share Results**: Team didn't see POC value until after v1.4.0 failure

### Core Insight

> **"Architecture mistakes are far more expensive than POC time. When in doubt, POC it out."**

## Related

- **Success Story**: v1.4.2 sessions shipped successfully using this methodology
- **Failure Story**: v1.4.0 wasted day due to skipping POC
- **POC Scripts**: See `investigation/` directory for examples
- **Related**: ADR-001, ADR-002 also benefited from validation testing

---

**Status**: ✅ Recommended for all major architectural decisions

**Adoption**: Required for any feature with >1 day implementation cost and unclear assumptions
