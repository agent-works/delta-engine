# Release Process

**Purpose**: Define the complete, step-by-step process for releasing a new version of delta-engine.

**Scope**: Covers all release types (patch, minor, major) and special cases (breaking changes, hotfixes).

---

## Table of Contents

1. [Pre-Release Preparation](#pre-release-preparation)
2. [Release Checklist](#release-checklist)
3. [Release Execution](#release-execution)
4. [Post-Release Validation](#post-release-validation)
5. [Special Cases](#special-cases)
6. [Rollback Procedure](#rollback-procedure)

---

## Pre-Release Preparation

### Step 1: Determine Version Number

Follow [Semantic Versioning](https://semver.org/):

- **Major** (X.0.0): Breaking changes (incompatible API changes)
- **Minor** (0.X.0): New features (backward compatible)
- **Patch** (0.0.X): Bug fixes (backward compatible)

**Examples**:
- `1.9.0` → `1.9.1`: Bug fix (patch)
- `1.9.0` → `1.10.0`: New feature (minor)
- `1.9.0` → `2.0.0`: Breaking change (major)

### Step 2: Ensure Architecture Documentation (if applicable)

**For Major/Minor Releases**:
- [ ] Architecture design doc exists: `docs/architecture/vX.Y-feature-name.md`
- [ ] Implementation plan exists: `docs/architecture/vX.Y-implementation-plan.md`
- [ ] Both documents are up-to-date

**For Patch Releases**:
- Documentation updates are optional (but recommended for significant fixes)

### Step 3: Review Changes

```bash
# Review all commits since last release
git log v1.9.0..HEAD --oneline

# Review file changes
git diff v1.9.0..HEAD --stat

# Check for uncommitted changes
git status
```

**Questions to ask**:
- Are all intended changes included?
- Are there any unwanted changes?
- Do all changes align with the version number?

---

## Release Checklist

**⚠️ MANDATORY: Complete `RELEASE_CHECKLIST.md` (in project root)**

### Quick Overview

```bash
# 1. Run complete test suite
npm run test:pre-release

# 2. Manual smoke test
cd examples/1-basics/hello-world
delta run -m "Test message"

# 3. Update version
# Edit package.json: "version": "X.Y.Z"

# 4. Update CHANGELOG.md
# Add new version section with all changes

# 5. Update documentation
# README.md, CLAUDE.md, docs/ as needed

# 6. Commit changes
git add -A
git commit -m "chore: release vX.Y.Z"

# 7. Create tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# 8. Push
git push origin main && git push origin vX.Y.Z
```

**Detailed Checklist**: See `RELEASE_CHECKLIST.md` for complete, mandatory checklist.

---

## Release Execution

### Phase 1: Testing (CRITICAL)

**Command**:
```bash
npm run test:pre-release
```

**Expected Output**:
```
> delta-engine@X.Y.Z test:pre-release
> npm run build && npm run test:all

> delta-engine@X.Y.Z build
> tsc

🧪 Running All Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1/3: Unit Tests
  ✅ Unit Tests passed (10.2s)

Phase 2/3: Integration Tests
  ✅ Integration Tests passed (21.4s)

Phase 3/3: E2E Tests
  ✅ E2E Tests passed (45.8s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Summary

  Total: 3/3 phases passed
  Duration: 77.4s

✅ All tests passed!
🚀 Ready for release
```

**If ANY test fails**:
- ❌ STOP - Do not proceed with release
- Fix the failing test
- Re-run `npm run test:pre-release`
- Only proceed when ALL tests pass

### Phase 2: Manual Smoke Test

**Run at least 2 examples**:

```bash
# Example 1: hello-world
cd examples/1-basics/hello-world
delta run -m "Test hello world"
# Verify: Runs without errors, reasonable output

# Example 2: Interactive shell (if applicable)
cd examples/2-core-features/interactive-shell
delta run -m "Run a simple bash command"
# Verify: No crashes, expected behavior
```

### Phase 3: Version Update

**Update `package.json`**:
```json
{
  "version": "X.Y.Z"
}
```

**Verify**:
```bash
node -p "require('./package.json').version"
# Should output: X.Y.Z
```

### Phase 4: Update CHANGELOG.md

**Format**:
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Enhancement description

### Fixed
- Bug fix description

### BREAKING CHANGES (if applicable)
- Breaking change description
- Migration guide: [link to docs]

### Documentation
- Updated docs/...
```

**Example**:
```markdown
## [1.9.1] - 2025-10-13

### Changed
- **BREAKING**: context.yaml is now required for all agents (v1.9.1+)
- Removed implicit DEFAULT_MANIFEST fallback
- All 4 built-in templates now include context.yaml

### Added
- Friendly error message when context.yaml is missing
- Migration template in error output

### Documentation
- Added Section 9 to v1.9 architecture doc
- Updated CLAUDE.md to reflect context.yaml requirement
- Created 7 context.yaml files for examples

### Breaking Changes
- Agents without context.yaml will now fail with clear error
- No automated migration tool (explicit configuration required)
- See `docs/architecture/v1.9-unified-agent-structure.md#9` for details
```

### Phase 5: Update Documentation

**Check all references to version numbers**:

```bash
# Search for old version references
grep -r "v1.9.0" docs/ README.md CLAUDE.md

# Update as needed
```

**Required Updates**:
- [ ] `README.md`: Version badges, installation instructions
- [ ] `CLAUDE.md`: "Current Version" section
- [ ] `docs/architecture/`: New architecture docs (if applicable)

### Phase 6: Commit Changes

```bash
# Add all changes
git add -A

# Commit with conventional format
git commit -m "chore: release vX.Y.Z

- Update version to X.Y.Z
- Update CHANGELOG.md
- Update documentation

[Brief summary of changes]
"
```

**Verify commit**:
```bash
git show --stat
```

### Phase 7: Create Git Tag

```bash
VERSION=$(node -p "require('./package.json').version")

git tag -a "v${VERSION}" -m "Release v${VERSION}

[Paste CHANGELOG section for this version here]
"
```

**Verify tag**:
```bash
git tag -l | grep "v${VERSION}"
git show "v${VERSION}"
```

### Phase 8: Push to Remote

```bash
# Push main branch
git push origin main

# Push tag
git push origin "v$(node -p "require('./package.json').version")"
```

**Verify on GitHub**:
- Visit: `https://github.com/agent-works/delta-engine/releases`
- Confirm tag appears
- Confirm commit is on main branch

---

## Post-Release Validation

### Step 1: Verify GitHub Release

1. Go to `https://github.com/agent-works/delta-engine/releases`
2. Verify new tag appears
3. (Optional) Create GitHub Release from tag:
   - Click "Draft a new release"
   - Select tag: `vX.Y.Z`
   - Title: `vX.Y.Z`
   - Description: Paste CHANGELOG section
   - Publish release

### Step 2: Clone and Test

```bash
# Fresh clone in temp directory
cd /tmp
git clone https://github.com/agent-works/delta-engine.git test-release
cd test-release

# Checkout release tag
git checkout "vX.Y.Z"

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test:pre-release

# Test CLI
node dist/index.js --help
node dist/index.js init test-agent -y
cd test-agent
node ../dist/index.js run -m "Test" -y

# Clean up
cd /tmp
rm -rf test-release
```

### Step 3: Update Internal Tracking

**Record release**:
- Update project tracking document (if any)
- Notify team (if applicable)
- Document any issues encountered

---

## Special Cases

### Case 1: Breaking Changes (Major/Minor)

**Additional Requirements**:
- [ ] Architecture doc explains rationale for breaking change
- [ ] Migration guide provided (step-by-step)
- [ ] Error messages include fix instructions
- [ ] All examples updated to work with breaking change
- [ ] CHANGELOG has dedicated "BREAKING CHANGES" section

**Commit Format**:
```
feat: description

BREAKING CHANGE: description of break
Migration: [steps to migrate]
```

**Example**:
```
feat(v1.9.1): make context.yaml required

BREAKING CHANGE: context.yaml is now mandatory for all agents

Migration:
1. Create context.yaml in your agent directory
2. Use default template from error message or docs
3. Verify with `delta run`

See docs/architecture/v1.9-unified-agent-structure.md#9
```

### Case 2: Hotfix Release

**Scenario**: Critical bug in production, need immediate patch

**Fast-Track Process**:
1. Create hotfix branch from main: `git checkout -b hotfix/vX.Y.Z main`
2. Fix bug, add test
3. Run `npm run test:pre-release` (MUST pass)
4. Update version (patch only)
5. Update CHANGELOG
6. Commit: `fix: critical bug description`
7. Merge to main
8. Tag and release immediately

**Testing Requirements**:
- MUST run `npm run test:pre-release`
- SHOULD run manual smoke test
- MAY skip extended E2E if time-critical

### Case 3: Pre-Release (Beta/Alpha)

**Version Format**: `X.Y.Z-beta.N` or `X.Y.Z-alpha.N`

**Process**:
1. Follow standard release process
2. Use pre-release version format
3. Tag with pre-release flag: `git tag -a vX.Y.Z-beta.1`
4. Mark as pre-release on GitHub

**Testing Requirements**: Same as standard release

---

## Rollback Procedure

### When to Rollback

- Critical bug discovered immediately after release
- Tests were skipped or incomplete
- Breaking change more severe than anticipated
- Security vulnerability introduced

### Rollback Steps

**Option 1: Revert and Re-Release (Preferred)**

```bash
# Revert the problematic commit
git revert <commit-hash>

# Fix the issue
# ... make corrections ...

# Increment patch version
# X.Y.Z → X.Y.(Z+1)

# Follow standard release process
npm run test:pre-release
# ... etc ...
```

**Option 2: Delete Tag (Only if not yet published)**

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag
git push --delete origin vX.Y.Z

# Fix issues
# ... make corrections ...

# Re-release with same version
```

**⚠️ NEVER delete tags that have been published/distributed**

### Communication

If rollback is necessary:
1. Document issue in GitHub issue
2. Create incident report in `.story/incidents/`
3. Communicate to users (if applicable)
4. Update CHANGELOG with rollback note

---

## Checklist Template (Copy to Release Notes)

```markdown
## Release vX.Y.Z Checklist

### Pre-Release
- [ ] Version number determined: vX.Y.Z
- [ ] Architecture docs reviewed (if applicable)
- [ ] Changes reviewed: `git log v1.9.0..HEAD`
- [ ] No uncommitted changes: `git status`

### Testing
- [ ] `npm run test:pre-release` passed ✅
- [ ] Manual smoke test: examples/hello-world ✅
- [ ] Manual smoke test: examples/[other] ✅

### Documentation
- [ ] CHANGELOG.md updated
- [ ] README.md version updated (if applicable)
- [ ] CLAUDE.md version updated
- [ ] Architecture docs updated (if applicable)

### Version Management
- [ ] package.json version updated to X.Y.Z
- [ ] Breaking changes documented (if applicable)
- [ ] Migration guide provided (if applicable)

### Commit & Tag
- [ ] Changes committed: `git commit`
- [ ] Git tag created: `git tag -a vX.Y.Z`
- [ ] Tag message includes CHANGELOG excerpt

### Push & Verify
- [ ] Pushed to main: `git push origin main`
- [ ] Pushed tag: `git push origin vX.Y.Z`
- [ ] Verified on GitHub: releases page
- [ ] Fresh clone test passed ✅

### Post-Release
- [ ] GitHub Release created (optional)
- [ ] Team notified (if applicable)
- [ ] Release notes documented
```

---

## Related Documentation

- **Release Checklist**: `RELEASE_CHECKLIST.md` (project root) - Mandatory pre-release checklist
- **Testing Guide**: [`README.md`](./README.md) - How to run tests
- **Quality Standards**: [`TEST_QUALITY_STANDARDS.md`](./TEST_QUALITY_STANDARDS.md) - Test quality requirements
- **CLAUDE.md**: Project root - Development guidelines

---

**Last Updated**: 2025-10-13
**Status**: Active Release Procedure
**Adherence**: MANDATORY for all releases
