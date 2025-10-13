# Release Checklist

**⚠️ CRITICAL**: This checklist MUST be completed in full before ANY release.

**Purpose**: Ensure systematic validation of all changes before tagging and publishing a new version. This checklist serves as the **primary defense** against shipping broken or incomplete releases.

**Usage**: Copy this checklist into your release preparation notes and check off each item as you complete it.

---

## ⚠️ MANDATORY PRE-RELEASE CHECKS

**🔴 If ANY checkbox is unchecked, release is PROHIBITED.**

### 1. Testing Verification (MUST ALL PASS)

- [ ] **Unit Tests**: `npm run test:unit` - All tests passing
  ```bash
  npm run test:unit
  # Verify: Test Suites: X passed, X total (no failures)
  ```

- [ ] **Integration Tests**: `npm run test:integration` - All tests passing
  ```bash
  npm run test:integration
  # Verify: 📊 Test Summary shows ✅ Passed: N, ❌ Failed: 0
  ```

- [ ] **E2E Tests**: `npm run test:e2e` - All core journeys passing
  ```bash
  npm run test:e2e
  # Verify: At minimum, 6/6 core E2E tests passing
  ```

- [ ] **All Tests Combined**: `npm run test:all` - Complete test suite passing
  ```bash
  npm run test:all
  # This is the DEFINITIVE test command - must pass completely
  ```

- [ ] **Manual Smoke Test**: Run at least 2 examples from `examples/` directory
  ```bash
  # Example verification:
  cd examples/1-basics/hello-world
  delta run -m "Test message"
  # Verify: No crashes, reasonable output
  ```

### 2. Build & Code Quality

- [ ] **TypeScript Compilation**: `npm run build` - No compilation errors
  ```bash
  npm run build
  # Verify: No "error TS" messages, dist/ directory created
  ```

- [ ] **No Debug Code**: No `console.log` / `debugger` / `TODO` in production code
  ```bash
  grep -r "console.log" src/ | grep -v "// " | grep -v "//"
  # Should return minimal results (documented logging only)
  ```

- [ ] **No Commented Code**: No large blocks of commented-out code
  ```bash
  # Manual review of recent changes
  git diff main --stat
  ```

### 3. Documentation Synchronization

- [ ] **CHANGELOG.md**: Updated with version number and complete change summary
  - [ ] Version number matches `package.json`
  - [ ] All significant changes documented
  - [ ] Breaking changes clearly marked with "BREAKING CHANGE:"
  - [ ] Migration guidance provided for breaking changes

- [ ] **README.md**: Version references updated (if applicable)
  - [ ] Installation instructions accurate
  - [ ] Quick start examples still valid
  - [ ] Links to documentation working

- [ ] **CLAUDE.md**: Version history updated
  - [ ] New version added to "Current Version" section
  - [ ] Feature list reflects new capabilities
  - [ ] Breaking changes documented

- [ ] **Architecture Docs**: Updated for architectural changes
  - [ ] New `docs/architecture/vX.Y-*.md` created (if significant changes)
  - [ ] Existing architecture docs updated (if behavior changed)

- [ ] **API Documentation**: Updated for API changes
  - [ ] `docs/api/*.md` reflects new signatures/options
  - [ ] Example code in docs still works

### 4. Version Management

- [ ] **package.json**: Version number incremented correctly
  - [ ] Major version (X.0.0) for breaking changes
  - [ ] Minor version (0.X.0) for new features
  - [ ] Patch version (0.0.X) for bug fixes

- [ ] **Git Tag**: Not yet created (will be created after this checklist)
  ```bash
  git tag -l | grep "v$(node -p 'require("./package.json").version')"
  # Should return empty (tag doesn't exist yet)
  ```

- [ ] **Commit Message**: Follows conventional commits format
  ```
  feat: description               (for features)
  fix: description                (for bug fixes)
  BREAKING CHANGE: description    (for breaking changes)
  ```

### 5. Breaking Changes (If Applicable)

**If this release includes breaking changes, ALL of the following MUST be checked:**

- [ ] **Breaking Change Documented**: Explicit "BREAKING CHANGE:" in commit message
- [ ] **Architecture Spec Created**: `docs/architecture/vX.Y-*.md` explains rationale
- [ ] **Migration Guide Provided**: Step-by-step migration instructions exist
- [ ] **Error Messages Updated**: Failing code shows clear error with fix instructions
- [ ] **Examples Updated**: All `examples/` work with new breaking change
- [ ] **Tests Updated**: All tests pass with breaking changes applied

**If NO breaking changes:**
- [ ] Confirmed: No changes that break backward compatibility

### 6. Release Artifact Verification

- [ ] **dist/ Directory**: Generated and contains all expected files
  ```bash
  ls -la dist/
  # Verify: index.js, sessions-cli.js, and all compiled TypeScript modules exist
  ```

- [ ] **package.json bin**: All CLI entry points exist
  ```bash
  node dist/index.js --help
  node dist/sessions-cli.js --help
  # Both should show help text without errors
  ```

### 7. Final Pre-Release Validation

- [ ] **All Tests Pass**: `npm run test:pre-release` - Build + All Tests
  ```bash
  npm run test:pre-release
  # This is the FINAL validation before release
  ```

- [ ] **Git Status Clean**: No uncommitted changes
  ```bash
  git status
  # Should show: "nothing to commit, working tree clean"
  ```

- [ ] **On Correct Branch**: On `main` branch (or release branch)
  ```bash
  git branch --show-current
  # Should show: main
  ```

---

## 🚀 Release Execution (After Checklist Complete)

**Only proceed if ALL checkboxes above are checked ✅**

### Step 1: Create Git Tag
```bash
VERSION=$(node -p "require('./package.json').version")
git tag -a "v${VERSION}" -m "Release v${VERSION}

$(cat CHANGELOG.md | sed -n '/^## \['${VERSION}'\]/,/^## \[/p' | head -n -1)
"
```

### Step 2: Push to Remote
```bash
git push origin main
git push origin "v${VERSION}"
```

### Step 3: Verify GitHub Release
- Visit: `https://github.com/agent-works/delta-engine/releases`
- Confirm tag appears
- (Optional) Create GitHub Release from tag with CHANGELOG excerpt

### Step 4: Post-Release Validation
```bash
# Pull fresh clone and test
cd /tmp
git clone https://github.com/agent-works/delta-engine.git test-release
cd test-release
git checkout "v${VERSION}"
npm install
npm run build
npm test
```

---

## 🚫 RELEASE BLOCKED - What to Do

If you cannot check ALL boxes:

1. **DO NOT RELEASE** - No exceptions
2. **Fix the failing item** - Address test failures, update docs, etc.
3. **Re-run this checklist** - Start from the top
4. **Document the issue** - If this revealed a process gap, update this checklist

---

## 📚 Related Documentation

- **Testing Strategy**: `tests/TESTING_STRATEGY.md` - Complete testing approach
- **Testing Guide**: `docs/testing/README.md` - How to run and write tests
- **Quality Standards**: `docs/testing/TEST_QUALITY_STANDARDS.md` - Test quality requirements
- **Release Process**: `docs/testing/RELEASE_PROCESS.md` - Detailed release procedure
- **Development Guide**: `CLAUDE.md` - Development workflow and conventions

---

## 📝 Checklist History

**Last Used**: _[Date]_ - v_[Version]_
**Result**: _[Success/Blocked]_
**Notes**: _[Any issues encountered]_

---

**Remember**: This checklist exists because of real incidents where incomplete testing led to broken releases. Every checkbox matters. No shortcuts.

**Incident Reference**: See `.story/incidents/2025-10-13-v1.8-data-loss.md` for a cautionary tale of what happens when process is bypassed.
