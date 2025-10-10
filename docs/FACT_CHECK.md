# Documentation Fact-Check Checklist

> **Purpose**: Ensure all documentation reflects actual implementation, not assumptions or hallucinations.
> **Last Updated**: 2025-10-10

---

## 🚨 Critical Facts That MUST Be Verified

### 1. Package Names & Installation Commands

**Source of Truth**: `package.json`

**Checklist**:
- [ ] Package name: Read `package.json` "name" field
- [ ] npm install commands: Use exact package name from package.json
- [ ] CLI command names: Verify from `package.json` "bin" section

**Common Errors**:
- ❌ `@delta-engine/core` (fictional scoped package)
- ❌ `delta` vs `delta-engine` (check bin names)
- ✅ `npm install -g delta-engine` (correct)

**Verification Command**:
```bash
# Extract correct install command
PACKAGE_NAME=$(node -p "require('./package.json').name")
echo "npm install -g $PACKAGE_NAME"
```

---

### 2. Directory & File Paths

**Source of Truth**: File system (`ls`, `find`, `tree`)

**Checklist**:
- [ ] Example paths: Verify with `ls examples/`
- [ ] Config file names: Check actual files (config.yaml, system_prompt.md)
- [ ] .delta/ structure: Verify control plane directories
- [ ] tools/ directories: Confirm in example agents

**Common Errors**:
- ❌ `examples/hello-world/` (missing directory level)
- ✅ `examples/1-basics/hello-world/` (correct)

**Verification Commands**:
```bash
# List all examples
find examples/ -name config.yaml -exec dirname {} \;

# Verify .delta/ structure
ls -la .delta/*/
```

---

### 3. Code References (Functions, Files, Constants)

**Source of Truth**: Source code (`grep`, file reads)

**Checklist**:
- [ ] Function names: `grep "function buildContext" src/`
- [ ] File locations: Verify path like `src/engine.ts:145`
- [ ] Constant values: Check `MAX_ITERATIONS` in source
- [ ] Type definitions: Verify types.ts exports

**Common Errors**:
- ❌ `rebuildConversation()` (fictional function name)
- ✅ `buildContext()` (actual function, verified with grep)
- ❌ `executor.ts:42-108` (made-up line numbers)
- ✅ `executor.ts:executeToolCommand()` (function exists, avoid exact lines)

**Verification Commands**:
```bash
# Find function definitions
grep -rn "function buildContext" src/

# Find constant values
grep "MAX_ITERATIONS" src/**/*.ts
```

---

### 4. CLI Commands & Flags

**Source of Truth**: `src/index.ts`, `--help` output

**Checklist**:
- [ ] Command syntax: Run `delta --help` to verify
- [ ] Flag names: Check `-i`, `-y`, `--resume` exist
- [ ] Subcommands: Verify `delta run`, `delta init`
- [ ] Environment variables: Check source code for usage

**Verification Commands**:
```bash
# Build and check help
npm run build
node dist/index.js --help
node dist/index.js run --help
```

---

### 5. External Links & URLs

**Source of Truth**: User confirmation, existing docs

**Checklist**:
- [ ] GitHub repository URL: Ask user or grep existing docs
- [ ] npm package URL: Check npmjs.com after publish
- [ ] Documentation URLs: Verify internal links exist

**Common Errors**:
- ❌ `https://github.com/delta-engine/delta-engine` (made-up org)
- ⚠️ Assume nothing - always verify with user

**Verification Commands**:
```bash
# Find existing GitHub URLs in docs
grep -r "github.com" docs/ README.md

# Check internal doc links
find docs/ -name "*.md" -exec grep -H "\[.*\](.*/.*\.md)" {} \;
```

---

### 6. Version Numbers & Dates

**Source of Truth**: `package.json`, `git log`

**Checklist**:
- [ ] Current version: Read package.json "version"
- [ ] Last updated dates: Use `git log` for file history
- [ ] Deprecation dates: Check architecture docs

**Verification Commands**:
```bash
# Get current version
node -p "require('./package.json').version"

# Get last commit date for file
git log -1 --format="%ai" -- docs/architecture/v1.6-context-composition.md
```

---

### 7. Configuration Schemas

**Source of Truth**: `src/types.ts` (Zod schemas)

**Checklist**:
- [ ] config.yaml fields: Verify ToolSchema, AgentConfigSchema
- [ ] context.yaml fields: Check ContextManifestSchema
- [ ] Parameter types: Validate inject_as options
- [ ] Hook types: Check LifecycleHooksSchema

**Verification Commands**:
```bash
# Find schema definitions
grep "export const.*Schema" src/types.ts

# Find inject_as enum values
grep "inject_as" src/types.ts
```

---

## 🛠️ Verification Workflow

### Before Writing New Documentation

1. **Identify Factual Claims**
   - List all concrete statements (package names, paths, commands)
   - Mark each as "verified" or "needs verification"

2. **Run Verification Commands**
   - Execute commands from checklist above
   - Paste actual output into notes

3. **Cross-Reference Existing Docs**
   - Search existing docs for same facts
   - If conflict found → verify which is correct

4. **Mark Unverified Facts**
   ```markdown
   **[TODO: Verify]** This package can be installed via...
   ```

### After Writing Documentation

1. **Self-Review Checklist**
   - [ ] All npm commands verified against package.json
   - [ ] All file paths tested with ls/find
   - [ ] All code references checked with grep
   - [ ] All CLI commands run to verify output
   - [ ] All version numbers match package.json

2. **Peer Review (Optional)**
   - Have another person spot-check 3 random facts
   - Focus on "surprising" or "unusual" claims

---

## 🤖 AI-Specific Guidance

> **For AI agents (like Claude) writing documentation:**

### Mandatory Pre-Flight Checks

Before generating ANY documentation containing:

**Package/Install Commands** → MUST read `package.json`
```
□ Read /path/to/package.json
□ Extract "name" field
□ Use exact name in all npm install commands
```

**File/Directory Paths** → MUST verify with ls/find
```
□ Run: ls -la /path/to/directory
□ Confirm directory exists
□ Use exact path in documentation
```

**Code References** → MUST grep source code
```
□ Run: grep -rn "functionName" src/
□ Confirm function exists
□ Avoid hard-coding line numbers
```

**CLI Commands** → MUST check help output
```
□ Run: node dist/index.js --help
□ Verify flag names
□ Copy exact syntax
```

**External URLs** → MUST ask user or grep existing docs
```
□ Search: grep "github.com" docs/
□ If not found → ask user explicitly
□ Never invent GitHub org/repo names
```

### If Verification Fails

**DO**:
- Mark fact as `[TODO: Verify]`
- Explain what you couldn't verify
- Suggest how user can verify

**DON'T**:
- Make up plausible-sounding values
- Assume based on common patterns
- Skip verification "to save time"

### Example: Good vs Bad

**❌ Bad (Hallucination)**:
```markdown
Install the package:
\`\`\`bash
npm install -g @delta-engine/core
\`\`\`
```
*Error: Never verified package name*

**✅ Good (Verified)**:
```markdown
[Reads package.json first]
[Confirms name: "delta-engine"]

Install the package:
\`\`\`bash
npm install -g delta-engine
\`\`\`
```
*Correct: Verified before writing*

**✅ Also Good (Honest)**:
```markdown
Install the package:
\`\`\`bash
npm install -g [TODO: Verify package name from package.json]
\`\`\`
```
*Acceptable: Explicit about uncertainty*

---

## 📊 Tracking Verification Status

### Documentation Audit Log

| Document | Last Verified | Verified By | Issues Found |
|----------|---------------|-------------|--------------|
| QUICKSTART.md | 2025-10-10 | Claude | 2 (package name) |
| README.md | 2025-10-10 | Claude | 0 |
| ... | | | |

### Known Issues

| Issue | Location | Status | Fix |
|-------|----------|--------|-----|
| Wrong package name `@delta-engine/core` | QUICKSTART.md:13,236 | ✅ Fixed | Changed to `delta-engine` |
| ... | | | |

---

## 🔄 Continuous Verification

### When to Re-Verify

- [ ] After package.json changes (package name, version)
- [ ] After directory restructuring
- [ ] After CLI command changes
- [ ] Before major releases
- [ ] When users report doc errors

### Verification Strategy

1. **On Every Edit**: Use verification commands from this checklist
2. **Before Committing**: Spot-check 3-5 random facts
3. **Monthly Review**: Scan for outdated version references
4. **When Users Report Issues**: Update this checklist with new patterns

---

## 📖 Related Documents

- [CLAUDE.md](../CLAUDE.md) - AI agent guidance (includes doc verification protocol)
- [README.md](./README.md) - Documentation index

---

**Last Updated**: 2025-10-10
**Maintained By**: Delta Engine Documentation Team
