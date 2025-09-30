# Trap: ESM Import Must Include .js Extension

**Discovered**: v1.0+ (Ongoing Issue)
**Severity**: 🔴 High (runtime error, compiles fine)
**Status**: ✅ Documented in CLAUDE.md
**Affects**: All TypeScript files in this project

---

## The Trap

### Wrong (compiles, fails at runtime)

```typescript
// ❌ Wrong: Missing .js extension
import { Engine } from './engine';
import { EngineContext } from './types';
```

**Compile**: ✅ TypeScript compiles successfully  
**Runtime**: ❌ Node.js errors

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/Users/.../dist/engine' imported from /Users/.../dist/cli.js
Did you mean to import ./engine.js?
```

### Correct

```typescript
// ✅ Correct: Explicit .js extension
import { Engine } from './engine.js';
import { EngineContext } from './types.js';
```

---

## Why This Trap Exists

**TypeScript's historical baggage**: In CommonJS era, could omit extensions. TypeScript allowed this for CJS compatibility.

**ESM's strict requirement**: ES Modules spec requires explicit extensions (browser-compatible URL semantics).

**TypeScript doesn't check**: Compiler validates types but **doesn't verify runtime path existence**.

```typescript
// TypeScript compiler behavior
import { Engine } from './engine';  // ← Only checks types
                     // ↓ Compiled as-is
import { Engine } from './engine';  // ← Node.js ESM can't resolve
```

---

## How to Detect

**Symptom**: Runtime error
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/path/to/engine'
Did you mean to import ./engine.js?
                       ^^^^^^^^^^^
```

**Quick check**:
```bash
# Check src/ for wrong imports
grep -r "from '\\./" src/ | grep -v "\\.js'" | grep -v "\\.json'"
```

---

## Prevention

### Always Use `.js` Extension

```typescript
// ✅ Correct pattern
import { Engine } from './engine.js';
import { foo } from '../utils/helpers.js';
import type { Config } from './types.js';
```

### Why .js and not .ts?

Because runtime executes compiled `.js` files:
```
src/cli.ts  →  [tsc]  →  dist/cli.js      (this runs)
src/engine.ts → [tsc] → dist/engine.js    (needs .js to find this)
```

TypeScript compiler knows `.js` corresponds to `.ts` during type checking.

---

## Related

- CLAUDE.md "Code Patterns to Avoid"
- .story/INDEX.md "Known Traps"
- `tsconfig.json` - ESM configuration
