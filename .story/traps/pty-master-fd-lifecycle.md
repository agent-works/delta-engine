# PTY Master FD Lifecycle Trap

**Date**: 2025-10-01
**Version**: v1.4.1 fix
**Severity**: 🔴 Critical (Complete feature failure)
**Impact**: All sessions died immediately when CLI exited

---

## Problem Summary

Session management feature (v1.4.0) was completely broken due to a fundamental misunderstanding of PTY (pseudo-terminal) lifecycle. Sessions would start successfully but die within 3-5 seconds after CLI process exited, even though they were supposed to persist independently.

---

## Root Cause Analysis

### What Happened

```
delta-sessions CLI → node-pty (PTY Master FD) → bash (Slave FD)
                     ↑
                     CLI exits → Master FD closes
                                 ↓
                     Kernel sends SIGHUP to bash
                                 ↓
                     bash terminates ❌
```

### The Core Misconception

**Wrong Assumption**: "If we start a child process and don't keep references to it, it will run independently"

**Reality**: PTY Master file descriptor is owned by the parent process. When parent exits:
1. Master FD closes automatically (part of process cleanup)
2. Kernel detects Master FD closure
3. Kernel sends SIGHUP (hangup signal) to all processes on the Slave FD
4. Default SIGHUP behavior: Process terminates

This is *by design* - it's how terminals historically worked (physical phone line disconnection → hangup signal).

### Why Regular Child Processes Work Differently

```javascript
// Regular child process (works fine)
const child = spawn('sleep', ['60'], { detached: true });
child.unref();
// Parent exits → child continues running ✅

// PTY process (doesn't work)
const pty = ptySpawn('sleep', ['60']);
// Parent exits → child receives SIGHUP → dies ❌
```

**Difference**: Regular child processes don't have PTY Master FD dependency. PTY processes are *intentionally* tied to parent terminal lifecycle.

---

## Why Tests Didn't Catch This

### 1. **Time-Based Assumption Error**

**What tests did**:
```typescript
const { session_id, pid } = await createSession('sleep', '60');
const alive = await isProcessAlive(pid);
expect(alive).toBe(true); // ✅ Passes immediately
```

**Problem**: Test checked immediately after creation, before SIGHUP propagated.

**What tests should have done**:
```typescript
const { session_id, pid } = await createSession('sleep', '60');
await sleep(10000); // Wait 10 seconds ← KEY ADDITION
const alive = await isProcessAlive(pid);
expect(alive).toBe(true); // ❌ Would fail with node-pty
```

### 2. **Missing Cross-Process Verification**

**What tests did**: All operations within same test process
```typescript
// Same process context
const manager = new SessionManager(...);
await manager.createSession(['bash']);
await manager.getSession(sessionId); // Still same process
```

**What tests should have done**: Simulate CLI exit by spawning separate processes
```typescript
// Process 1: Start session
await execa('node', ['cli.js', 'start', 'bash']);

// Process 2: Check session (different CLI invocation)
await sleep(5000);
const { stdout } = await execa('node', ['cli.js', 'status', sessionId]);
```

### 3. **Knowledge Gap at Design Time**

During Phase 0 (planning) and Phase 1 (implementation), we didn't understand:
- What PTY Master FD is
- How FD ownership works in Unix
- When SIGHUP is sent
- Why `detached: true` doesn't help with PTY

**Contributing factor**: node-pty documentation doesn't explicitly warn about this lifecycle issue.

---

## Solution: GNU screen Wrapper

### Why screen Works

```
delta-sessions CLI → screen daemon (persistent) → bash
                     ↑
                     CLI exits → screen daemon continues
                                 ↓
                     screen daemon still holds Master FD
                                 ↓
                     bash continues running ✅
```

Screen is a **session manager daemon** that:
1. Runs as separate persistent process
2. Holds PTY Master FDs
3. Provides command interface (`screen -X stuff`, `screen -X hardcopy`)
4. Survives CLI exits because it's not the CLI process

### Architecture Change

**Before (node-pty)**:
```typescript
import * as pty from 'node-pty';
const ptyProcess = pty.spawn('bash', ['-i'], {...});
ptyProcess.write('ls\n');
ptyProcess.onData((data) => console.log(data));
```

**After (screen)**:
```typescript
import { execa } from 'execa';

// Start session (detached screen daemon)
await execa('screen', ['-dmS', 'sess1', 'bash', '-i']);

// Write input
await execa('screen', ['-S', 'sess1', '-X', 'stuff', 'ls\n']);

// Read output
await execa('screen', ['-S', 'sess1', '-X', 'hardcopy', '/tmp/out.txt']);
const output = await fs.readFile('/tmp/out.txt', 'utf-8');
```

**Tradeoff**:
- ✅ Sessions persist correctly
- ✅ Mature, battle-tested solution (37 years old)
- ✅ Pre-installed on most Unix systems
- ❌ External dependency (not pure Node.js)
- ❌ Polling-based output (vs event-driven with node-pty)

---

## Testing Methodology Improvements

### New Test Pattern: "Persistence Tests"

```typescript
describe('Session Persistence (CRITICAL)', () => {
  it('session MUST survive CLI process exit', async () => {
    // 1. Start in separate CLI process
    const { stdout } = await execa('delta-sessions', ['start', 'sleep', '60']);
    const { pid } = JSON.parse(stdout);

    // 2. Wait for SIGHUP propagation
    await sleep(10000); // ← KEY: Delayed verification

    // 3. Check via another CLI process
    const alive = await isProcessAlive(pid);
    expect(alive).toBe(true);
  }, 15000); // Long timeout
});
```

**Key principles**:
1. **Delayed verification**: Wait 10+ seconds for async system events
2. **Cross-process**: Use separate CLI invocations (`execa`, not in-memory calls)
3. **Long-term stability**: Test 60+ second survival
4. **Explicit test name**: "MUST survive CLI exit" makes expectation clear

### Checklist for Async/Stateful Features

When implementing features involving:
- Process lifecycle
- File descriptors
- System signals
- Daemon interactions
- Network connections

**Must include**:
- [ ] Delayed verification tests (10+ seconds)
- [ ] Cross-process interaction tests
- [ ] Long-term stability tests (60+ seconds)
- [ ] Resource leak checks (`lsof -p <pid>`)
- [ ] Cleanup verification tests

---

## Lessons for Future Development

### 1. **Question Technology Assumptions**

Before implementing with a technology (node-pty, file descriptors, etc.):
- [ ] Read documentation thoroughly
- [ ] Search for "known issues" and "caveats"
- [ ] Build minimal POC and test edge cases
- [ ] Ask: "What happens when parent process exits?"

**In this case**: A 5-minute POC would have caught the issue:
```bash
# test-pty-survival.js
const pty = require('node-pty').spawn('sleep', ['60']);
console.log('PID:', pty.pid);
// Exit script immediately
process.exit(0);

# In another terminal after 10 seconds:
ps aux | grep <PID>  # Would show process is dead
```

### 2. **Test What You Claim**

**Claimed behavior**: "Sessions persist independently of CLI"

**What tests validated**: "Sessions can be created"

**Gap**: The core claim (persistence) was never tested!

**Fix**: Test suite name should reflect the claim:
```typescript
// ❌ Vague
describe('Session Management', () => { ... });

// ✅ Explicit
describe('Session Persistence After CLI Exit', () => { ... });
```

### 3. **Time-Based Tests for Async Systems**

For features involving:
- Process lifecycle
- Signal handling
- Daemon communication
- Resource cleanup

**Always include delays** because:
- Signal propagation isn't instant (1-5 seconds)
- System cleanup is async
- Race conditions are common

**Pattern**:
```typescript
// Immediate check (detects obvious errors)
expect(systemState()).toBe(expected1);

// Delayed check (detects lifecycle errors)
await sleep(10000);
expect(systemState()).toBe(expected2); // ← Often fails if design is wrong
```

### 4. **TDD Doesn't Guarantee Correctness**

**What happened**: We wrote tests first (Phase 0), tests passed, but feature was broken.

**Why**: Tests validated the wrong thing (creation success, not persistence).

**Lesson**: TDD ensures code matches tests, but doesn't ensure tests match requirements.

**Mitigation**:
1. Write tests based on user scenarios, not implementation
2. Have someone else review test cases
3. Test the "negative case" (what happens when assumptions break)
4. Manual E2E testing is still critical

### 5. **Cross-Process Testing is Essential**

For any feature claiming to work "across CLI invocations":

**Don't**:
```typescript
const manager = new SessionManager();
manager.createSession(...);
manager.getSession(...); // Same process, same memory
```

**Do**:
```typescript
// Process 1
await execa('cli', ['start', ...]);

// Process 2 (separate invocation)
await execa('cli', ['status', ...]);
```

This simulates real-world usage and catches state management bugs.

---

## References

- **PTY Fundamentals**: https://en.wikipedia.org/wiki/Pseudoterminal
- **SIGHUP Behavior**: `man 7 signal` (search for SIGHUP)
- **GNU screen Manual**: `man screen`
- **Issue Discovery**: Manual testing on 2025-10-01
- **Fix Implementation**: v1.4.1 (screen wrapper)

---

## Quick Reference

**Symptom**: Process dies shortly after creation, even with `detached: true`

**Check**:
```bash
# Start process via PTY
node start-pty.js  # Creates PID 12345

# In another terminal
ps -p 12345        # Immediately: alive
sleep 10
ps -p 12345        # 10 seconds later: dead ❌
```

**Solution**: Use screen, tmux, or similar session manager instead of raw PTY.

**Test Pattern**:
```typescript
it('process survives 10 seconds', async () => {
  const { pid } = await startProcess();
  await sleep(10000); // ← Essential
  expect(isAlive(pid)).toBe(true);
}, 15000);
```

---

**Status**: ✅ Fixed in v1.4.1
**Prevention**: Added to .story/traps/ and INDEX.md
