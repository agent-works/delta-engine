# Trap: Unix Socket Path Length Limit (104 bytes)

**Discovered**: v1.4.2 session management (2025-10-01)
**Severity**: 🔴 High (complete feature failure)
**Platform**: macOS, Linux, most Unix systems
**Status**: ✅ Fixed (sockets in /tmp/)

---

## The Trap

### Symptom

Socket file is created but connection fails with timeout or "connection refused":

```bash
$ ls -la .sessions/sess_abc123/
total 8
-rw-r--r--  1 user  staff  1 Oct  1 23:43 session.sock  # ← Only 1 byte!

$ delta-sessions read sess_abc123
Error: Timeout waiting for session to start
```

**Actual file content**: Single character `'s'` instead of valid socket

### Root Cause

**POSIX Specification**: `struct sockaddr_un` in `<sys/un.h>` defines:

```c
struct sockaddr_un {
    sa_family_t sun_family;   // AF_UNIX
    char sun_path[104];       // ← Path length limit
};
```

**macOS/BSD**: 104 bytes (including null terminator = 103 usable)
**Linux**: 108 bytes

**When path exceeds limit**: System **truncates silently** instead of error

---

## Example Failure

### v1.4.2 Initial Implementation

```typescript
// ❌ Wrong: Path too long
const sessionDir = '/Users/fugen/codes/delta-engine/examples/interactive-shell/workspaces/W006/.sessions/sess_abc123de4567';
const socketPath = path.join(sessionDir, 'session.sock');

// socketPath length: 116 bytes
// /Users/fugen/codes/delta-engine/examples/interactive-shell/workspaces/W006/.sessions/sess_abc123de4567/session.sock
//                                                                                                         ^
//                                                                                                    104 bytes → TRUNCATED!
```

**Result**:
```bash
$ stat session.sock
  File: session.sock
  Size: 1         # ← Truncated to 's'
```

---

## Detection

### 1. Check File Size
```bash
stat <socket-path> | grep Size
# Normal socket: 0 bytes (special file)
# Truncated: 1-10 bytes (partial path)
```

### 2. Try to Connect
```bash
nc -U /path/to/socket.sock
# Truncated: Connection refused
# Valid: Connection accepted or timeout
```

### 3. Check Path Length
```bash
echo -n "/path/to/socket.sock" | wc -c
# If > 104 on macOS → Will fail
```

---

## The Fix

### Solution 1: Use /tmp/ for Sockets ✅ (Recommended)

```typescript
// ✅ Correct: Short path in /tmp/
const socketPath = `/tmp/delta-sock-${sessionId}.sock`;
// Length: 42 bytes (well under limit)

// Metadata still in project directory
const metadataPath = path.join(sessionDir, 'metadata.json');
```

**Benefits**:
- ✅ Short path guaranteed (42 bytes)
- ✅ OS handles cleanup on reboot
- ✅ Standard practice (Redis, PostgreSQL use /tmp/ for sockets)

**Trade-offs**:
- ⚠️ Must clean up manually (OS only cleans on reboot)
- ⚠️ Multiple projects could conflict (use unique prefix)

### Solution 2: Use Short Session IDs (Partial)

```typescript
// ⚠️ Partial solution: Shorter IDs
const sessionId = `sess_${uuidv4().slice(0, 8)}`;  // sess_abc12345
// Saves ~20 bytes, but still risk exceeding limit
```

**Problem**: Project path may already be >80 bytes

### Solution 3: Abstract Socket (Linux Only)

```typescript
// Linux only: Abstract namespace (prepend \0)
const socketPath = `\0delta-${sessionId}`;
// No filesystem path, no limit
```

**Problem**: Not portable (macOS doesn't support)

---

## Design Impact

### Separation of Concerns

**Key Insight**: Socket is **IPC channel**, not persistent state

```
┌─────────────────────────────────────────┐
│  Socket (IPC Channel)                   │
│  - Location: /tmp/delta-sock-XXX.sock   │
│  - Purpose: Communication                │
│  - Lifetime: Process lifetime            │
│  - Visibility: Hidden from user          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Metadata (Persistent State)            │
│  - Location: $CWD/.sessions/sess_XXX/   │
│  - Purpose: Session info, status         │
│  - Lifetime: Until explicit cleanup      │
│  - Visibility: User can inspect          │
└─────────────────────────────────────────┘
```

**Result**: Better architecture
- Socket = ephemeral, OS-managed (/tmp/)
- Metadata = persistent, user-visible (.sessions/)

---

## Related Traps in Other Projects

### Redis

```bash
# Redis uses short paths
/tmp/redis.sock         # ✅ 15 bytes
/var/run/redis.sock     # ✅ 19 bytes
```

### PostgreSQL

```bash
# PostgreSQL uses /tmp by default
/tmp/.s.PGSQL.5432      # ✅ 18 bytes
```

### Docker

```bash
# Docker daemon socket
/var/run/docker.sock    # ✅ 20 bytes
```

**Pattern**: Industry standard = use /tmp/ or /var/run/ for sockets

---

## Prevention Checklist

When implementing Unix sockets:

### 1. Path Length Check
```typescript
function validateSocketPath(path: string): void {
  const MAX_LEN = 104;  // macOS limit
  if (path.length > MAX_LEN) {
    throw new Error(`Socket path too long: ${path.length} > ${MAX_LEN}`);
  }
}
```

### 2. Prefer /tmp/
```typescript
// ✅ Default to /tmp/
const socketPath = `/tmp/${APP_NAME}-${uniqueId}.sock`;
```

### 3. Test with Deep Paths
```typescript
// Integration test
it('should work with deep project paths', () => {
  const deepPath = '/very/long/path/'.repeat(10);
  const session = createSession(deepPath);
  expect(session.connect()).resolves.toBeTruthy();
});
```

---

## Platform Differences

| Platform | Limit | Notes |
|----------|-------|-------|
| macOS | 104 bytes | Includes null terminator |
| Linux | 108 bytes | Slightly more permissive |
| BSD | 104 bytes | Same as macOS |
| Windows | N/A | Named pipes instead of Unix sockets |

**Recommendation**: Design for 104 bytes (most restrictive)

---

## Debugging

### 1. Verify Socket Creation
```bash
# Check if socket was created
file /tmp/delta-sock-sess_abc.sock
# Expected: socket
# If regular file → Truncation occurred
```

### 2. Check Listener
```bash
# List all Unix sockets
lsof -U | grep delta
# Should show holder process listening
```

### 3. Manual Connection Test
```bash
# Try to connect
echo '{"type":"ping"}' | nc -U /tmp/delta-sock-sess_abc.sock
# Should get response if holder alive
```

---

## Lessons Learned

### Core Lesson
**Unix socket paths are NOT regular file paths**
- Regular files: Path length ~4096 bytes
- Unix sockets: Path length 104 bytes (macOS)
- **25x shorter limit!**

### Why It's Easy to Miss
1. **Works in short paths**: Development often in short paths like `/home/user/project`
2. **Silent truncation**: No error, just fails mysteriously
3. **Rare documentation**: Not mentioned in most Node.js socket tutorials

### Prevention Strategy
- **Always use /tmp/ for sockets** (unless absolute reason not to)
- **Add path length validation** in development
- **Test with deep paths** in CI/CD

---

## Related

- `@decisions/005-poc-first-validation.md` - POC test-6 validated socket cleanup
- v1.4.2 session management implementation
- POSIX `sys/un.h` specification

---

**Fixed In**: v1.4.2 (socket paths moved to /tmp/)
**Detection Time**: ~2 hours (discovered during testing)
**Fix Time**: 30 minutes (3 file changes)
