# Tradeoff: Type System MVP Limitation - String-Only Parameters

**Date**: v1.0 - present (2025)
**Status**: ✅ Accepted MVP limitation
**Context**: Tool parameter type system design
**Affected**: All tool definitions in `config.yaml`

---

## The Problem

### Real-World Scenario (v1.4.2)

Session management tools need timeout parameters:

```yaml
# What we want to write:
- name: shell_read
  description: "Read shell output"
  command: [delta-sessions, read]
  parameters:
    - name: session_id
      type: string         # ✅ Works
    - name: timeout_ms
      type: number         # ❌ Fails validation!
      description: "Timeout in milliseconds"
      inject_as: option
      option_name: --timeout
```

**Error**:
```
Configuration validation failed:
- tools.0.parameters.1.type: Invalid literal value, expected "string"
```

---

## Current Implementation

### Type Definition (types.ts)

```typescript
export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.literal('string'),  // ← Only 'string' allowed!
  description: z.string().optional(),
  inject_as: z.enum(['stdin', 'argument', 'option']),
  option_name: z.string().optional(),
});
```

**Result**: All parameters MUST be `type: string`

---

## The Workaround

### MVP Solution: Pass Numbers as Strings

```yaml
# ✅ Current workaround
- name: timeout_ms
  type: string                    # Declare as string
  description: "Timeout in milliseconds (e.g., '1000', '2000')"
  inject_as: option
  option_name: --timeout
```

**Tool-side parsing**:
```typescript
// CLI tool implementation
const timeoutMs = parseInt(args.timeout || '0', 10);
if (isNaN(timeoutMs)) {
  throw new Error('Invalid timeout value');
}
```

**LLM provides**:
```json
{
  "tool_calls": [{
    "name": "shell_read",
    "arguments": {
      "session_id": "sess_abc123",
      "timeout_ms": "2000"    // ← String, not number
    }
  }]
}
```

---

## Why Not Expand Type System?

### Option 1: Add number/boolean/array Types

```yaml
# Hypothetical future design
- name: timeout_ms
  type: number

- name: force
  type: boolean

- name: files
  type: array
  items: string
```

**Problems**:

#### 1. Command Line Injection Complexity

```bash
# How to inject number to command line?
command --timeout 2000        # Option A: As-is
command --timeout "2000"      # Option B: Quote it
# Both work for numbers, but which is "correct"?

# How to inject boolean?
command --force               # Option A: Flag style
command --force true          # Option B: Explicit value
command --force=true          # Option C: Equals style

# How to inject array?
command --files file1 file2 file3     # Option A: Space-separated
command --files file1,file2,file3     # Option B: Comma-separated
command --files "file1 file2 file3"   # Option C: Quoted space-separated
command --files '["file1","file2"]'   # Option D: JSON
```

**No universal standard** → Would need tool-specific conventions

#### 2. LLM Schema Generation

Currently:
```typescript
// Simple: All parameters → string
{
  type: 'object',
  properties: {
    timeout_ms: { type: 'string' }
  }
}
```

With type system:
```typescript
// Complex: Map types, handle arrays, nested objects?
{
  type: 'object',
  properties: {
    timeout_ms: { type: 'number' },    // OK
    force: { type: 'boolean' },        // OK
    files: {                            // Complex
      type: 'array',
      items: { type: 'string' }
    },
    config: {                           // Very complex
      type: 'object',
      properties: { ... }
    }
  }
}
```

**Complexity explosion** for marginal benefit

#### 3. Validation Complexity

```typescript
// Current: Simple string validation
const value = String(input);  // Always works

// With types: Complex validation
if (type === 'number') {
  const num = Number(input);
  if (isNaN(num)) throw new Error('Invalid number');
} else if (type === 'boolean') {
  if (input !== 'true' && input !== 'false') throw new Error('Invalid boolean');
} else if (type === 'array') {
  // Parse JSON? Split by comma? Validate items?
}
```

---

## The Tradeoff

### What We Give Up ❌

1. **Type Safety at Config Level**
   - No compile-time check for "timeout should be number"
   - LLM might pass invalid string ("two thousand" instead of "2000")

2. **Schema Clarity**
   - OpenAI function calling sees `timeout_ms: string` instead of `timeout_ms: number`
   - LLM might be confused about expected format

3. **Ergonomics**
   - Config YAML looks weird: `type: string` for numeric timeout
   - Need workaround documentation

### What We Keep ✅

1. **Simplicity**
   - Single type to handle: string
   - No complex injection logic
   - Easy to understand and maintain

2. **Flexibility**
   - String can represent anything (number, JSON, CSV, etc.)
   - Tool decides parsing strategy
   - No engine assumptions about semantics

3. **Unix Philosophy**
   - Command line is text-based anyway
   - All CLI arguments are strings at OS level
   - We're just being explicit about reality

4. **MVP Focus**
   - 90% of parameters are strings (filenames, paths, URLs)
   - Premature abstraction is root of evil
   - Can add types later when patterns emerge

---

## When Will We Expand?

### Criteria for v2.0 Type System

1. **Pattern Emergence**
   - 20+ tools consistently need number/boolean types
   - Clear conventions emerge across tools

2. **Real Pain Points**
   - LLMs frequently fail due to type confusion
   - String workaround causes actual bugs

3. **Standard Emerges**
   - Industry consensus on CLI type injection (unlikely)
   - OR: Delta Engine establishes own standard

### Proposed v2.0 Design

```yaml
# Conservative expansion
- name: timeout_ms
  type: number         # Inject as-is: --timeout 2000

- name: force
  type: flag           # Inject as flag: --force (if true)

- name: files
  type: string_array   # Inject space-separated: file1 file2 file3
```

**Constraints**:
- Only add types with **unambiguous CLI mapping**
- No complex nested structures
- Tools can still accept strings for custom parsing

---

## Comparison with Other Systems

### GitHub Actions
```yaml
# GitHub Actions: everything is string
inputs:
  timeout:
    description: 'Timeout in seconds'
    required: true
    default: '30'    # String, not number
```

### Docker Compose
```yaml
# Docker: YAML types, but CLI still strings
services:
  app:
    mem_limit: 512m       # String
    cpus: 0.5             # Number in YAML, string in CLI
```

### AWS CloudFormation
```yaml
# CloudFormation: Strict types, but complex
Parameters:
  Timeout:
    Type: Number
    Default: 30
    MinValue: 1
    MaxValue: 3600
```

**Our Position**: Closer to GitHub Actions (simple, string-only) than CloudFormation (complex types)

---

## Practical Impact

### Coverage Analysis (v1.4.2)

**All tools in Delta Engine**:

| Tool Type | String % | Number % | Boolean % | Array % |
|-----------|----------|----------|-----------|---------|
| File operations | 100% | 0% | 0% | 0% |
| Git commands | 100% | 0% | 0% | 0% |
| HTTP requests | 95% | 5% | 0% | 0% |
| Session mgmt | 90% | 10% | 0% | 0% |
| **Overall** | **95%** | **5%** | **0%** | **0%** |

**Conclusion**: String-only covers 95% of actual use cases

### Workaround Cost

**Per numeric parameter**:
1. Add description hint: `"e.g., '1000', '2000'"` (+1 line)
2. Tool-side parse: `parseInt(arg)` (+1 line)
3. LLM learns pattern: ✅ Works reliably

**Total cost**: ~2 lines per numeric parameter × ~5 parameters = 10 lines of workaround code

**Benefit**: Avoid ~500 lines of type system complexity

---

## Lessons Learned

### Core Insight

> **"The best abstraction is no abstraction until you need it."**

**Applied**:
- v1.x: String-only (simple, works)
- v2.x: Add types **only if** real pain emerges
- Avoid: Over-engineer type system based on "might need"

### MVP Philosophy

**Good MVP**:
- ✅ Solve 90% cases simply
- ✅ Accept 10% workarounds
- ✅ Iterate when patterns emerge

**Bad MVP**:
- ❌ Build perfect type system upfront
- ❌ Handle every edge case
- ❌ Abstract before patterns emerge

### When to Revisit

**Triggers for reconsideration**:
1. User feedback: "String-only is confusing"
2. LLM failures: Consistently passes wrong types
3. Tool proliferation: 50+ tools, many need numbers

**Not triggers**:
- "It would be elegant to have number type"
- "Other systems have rich type systems"
- "We might need it someday"

---

## Related

- `@decisions/001-stateless-core.md` - Another example of simplicity over features
- v1.4.2 session management - First time hit string-only limitation
- `executor.ts` - Parameter injection implementation

---

**Status**: ✅ Working as intended
**Next Review**: When 20+ tools need type system expansion
