# ADR-005: Tool Configuration Syntax Simplification

**Date**: 2025-10-11
**Status**: ✅ **Active** (Implemented in v1.7)
**Related**: [ADR-001](./001-stateless-core.md) (Stateless Core Architecture)

---

## Context

Delta Engine v1.0-v1.6 required verbose tool configurations with explicit `command:` arrays and detailed parameter definitions. This created friction for rapid prototyping:

**Problem:**
```yaml
# v1.0-v1.6: 9 lines for a simple pipe operation
- name: count_lines
  command: [sh, -c, "cat \"$1\" | wc -l", --]
  parameters:
    - name: file
      type: string
      inject_as: argument
      position: 0
```

**Impact:**
- 60% of tool definitions were boilerplate
- Cognitive load for simple tools
- Barrier to rapid iteration
- Obscured the actual tool behavior

**Design Constraint:** Must maintain 100% backward compatibility and "secure by default" philosophy.

---

## Decision

Introduce **v1.7 simplified syntax** with two modes:

### 1. `exec:` Mode - Direct Execution (No Shell)

```yaml
tools:
  - name: list_files
    exec: "ls -F ${directory}"
```

**Properties:**
- Uses `execvp()` directly (no shell involvement)
- Rejects all shell metacharacters (`|`, `>`, `<`, `&`, `;`, etc.)
- Safest option - zero shell injection risk
- Automatic parameter inference from `${param}` placeholders

### 2. `shell:` Mode - Shell with Safe Parameterization

```yaml
tools:
  - name: count_lines
    shell: "cat ${file} | wc -l"
```

**Properties:**
- Uses `sh -c "script" -- arg1 arg2` pattern
- Parameters passed via POSIX argv (NOT string interpolation)
- Automatic quoting: `${param}` → `"$1"` prevents injection
- Supports `:raw` modifier for expert use: `${flags:raw}` → `$1` (unquoted)

### Security Guarantee

Both modes use **argv-based parameterization**, NOT string interpolation:

```typescript
// SAFE: exec: mode (no shell)
exec('ls', ['-F', userInput]);

// SAFE: shell: mode (argv-based)
exec('sh', ['-c', 'cat "$1" | wc -l', '--', userInput]);

// UNSAFE (what we DON'T do):
exec('sh', ['-c', `cat ${userInput} | wc -l`]); // ❌ String interpolation
```

See [v1.7 Design Spec Section 4.2.1](../architecture/v1.7-tool-simplification.md#4.2.1) for formal security proof.

---

## Consequences

### ✅ Benefits

1. **60% Reduction in Config Verbosity**
   - 9 lines → 2 lines for common tools
   - Faster prototyping and iteration

2. **Security by Default**
   - `exec:` mode prevents ALL shell involvement
   - `shell:` mode uses argv-based parameterization
   - Explicit `:raw` marker for dangerous operations

3. **100% Backward Compatible**
   - Legacy `command:` syntax fully supported
   - No migration required
   - Both syntaxes work side-by-side

4. **Transparency**
   - `delta tool:expand` shows internal representation
   - `__meta` field preserves original syntax
   - Clear error messages with hints

### ⚠️ Costs

1. **Additional Parser Complexity**
   - New `ToolExpander` module (~470 lines)
   - Tokenization, validation, parameter merging
   - Mitigated by comprehensive tests (19 security tests)

2. **Two Formats to Maintain**
   - Simplified syntax + internal format
   - Mitigated by `delta tool:expand` transparency tool

3. **Learning Curve**
   - Users must understand exec vs shell modes
   - Mitigated by clear error messages and examples

### 🛡️ Risks and Mitigation

**Risk 1: Incorrect sh -c Implementation**
- **Mitigation**: Test Suite 2 (4 injection prevention tests)
- **Mitigation**: Code review focused on POSIX argv semantics
- **Contingency**: Feature flag `DELTA_ENABLE_V17_SYNTAX=false`

**Risk 2: :raw Modifier Misuse**
- **Mitigation**: Only allowed in `shell:` mode
- **Mitigation**: Documentation warnings
- **Future**: Runtime warnings in development mode

---

## Implementation

**Status**: ✅ Complete (October 11, 2025)

**Key Files:**
- `src/types.ts` - Type system extension (schemas)
- `src/tool-expander.ts` - Core expansion logic (~470 lines)
- `src/config.ts` - Integration into config loading
- `src/commands/tool-expand.ts` - CLI transparency tool
- `tests/unit/tool-expander.test.ts` - Security tests

**Timeline:** 2 weeks (actual: 1 day with AI assistance)

---

## References

**Design Documents:**
- [v1.7 Design Specification](../architecture/v1.7-tool-simplification.md) - Complete design rationale
- [v1.7 Implementation Plan](../architecture/v1.7-implementation-plan.md) - Development roadmap

**External Standards:**
- [POSIX Shell Specification](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html) - Shell parameter expansion semantics
- [shell-quote (Node.js)](https://github.com/substack/node-shell-quote) - Tokenization library

**Related ADRs:**
- [ADR-001: Stateless Core Architecture](./001-stateless-core.md)
- [ADR-002: Journal Format - JSONL](./002-journal-format.md)

---

## Examples

### Before (v1.0-v1.6)

```yaml
tools:
  - name: search
    command: [grep, -r]
    parameters:
      - name: pattern
        type: string
        inject_as: argument
      - name: directory
        type: string
        inject_as: argument
```

### After (v1.7)

```yaml
tools:
  - name: search
    exec: "grep -r ${pattern} ${directory}"
```

**Lines of code:** 9 → 2 (77% reduction)

---

## Approval

**Proposed by:** Design Team A
**Reviewed by:** Security Team, Engineering Team
**Approved by:** Project Maintainers
**Date:** October 11, 2025

**Verification:** 19/19 security tests passing, backward compatibility validated.

---

**Status**: ✅ **Active and Production-Ready**
