# Version Management Policy

This document defines the version management policy for Delta Engine, ensuring consistency between package.json, CHANGELOG.md, and git tags.

## Semantic Versioning

Delta Engine follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** version (X.0.0): Incompatible API changes or breaking changes
- **MINOR** version (0.X.0): New functionality in a backward-compatible manner
- **PATCH** version (0.0.X): Backward-compatible bug fixes and improvements

### Version Format

- **Format**: `MAJOR.MINOR.PATCH` (e.g., `1.10.1`)
- **Git tags**: Prefixed with `v` (e.g., `v1.10.1`)
- **package.json**: No prefix (e.g., `"version": "1.10.1"`)

## Three-Way Consistency Rule

Every version MUST maintain consistency across three sources:

1. **package.json** - `version` field
2. **CHANGELOG.md** - Version section with date
3. **Git tag** - Annotated tag pointing to the release commit

### Validation Checklist

Before any release:

- [ ] package.json version matches the release version
- [ ] CHANGELOG.md has a section for this version with proper date
- [ ] Git tag exists for this version (format: `vX.Y.Z`)
- [ ] Git tag points to the correct commit
- [ ] All three sources show the same version number

## CHANGELOG Format

Follow [Keep a Changelog](https://keepachangelog.com/) format:

### Structure

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Category - Brief Description

**Detailed summary of changes:**

- Change 1
- Change 2

### Breaking Changes (if applicable)

- Breaking change 1
- Migration guide
```

### Categories

Use these standard categories:

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

### Version Sections

Each version MUST have:

1. **Version header**: `## [X.Y.Z] - YYYY-MM-DD`
2. **Category headers**: At least one category (Added/Changed/Fixed/etc.)
3. **Change descriptions**: Clear, user-facing descriptions
4. **Breaking changes**: Explicitly marked when present

## Git Tag Requirements

### Tag Format

```bash
# Annotated tag (REQUIRED)
git tag -a vX.Y.Z -m "feat(vX.Y): Brief description of main feature"

# Examples:
git tag -a v1.10.1 -m "test: v1.10.1 comprehensive test coverage and bug fixes"
git tag -a v1.10.0 -m "feat(v1.10): Frontierless Workspace Architecture"
```

### Tag Message Convention

Follow conventional commit format:

- `feat(vX.Y): Description` - For new features
- `fix(vX.Y): Description` - For bug fixes
- `docs(vX.Y): Description` - For documentation updates
- `test(vX.Y): Description` - For test improvements

### Tag Date

Tags should preserve the commit date using:

```bash
GIT_COMMITTER_DATE="$(git show -s --format=%ci COMMIT_SHA)" \
  git tag -a vX.Y.Z COMMIT_SHA -m "Message"
```

## Version Increment Guidelines

### When to increment MAJOR (X.0.0)

- Breaking API changes
- Removal of deprecated features
- Major architectural changes requiring migration
- Changes that break backward compatibility

**Examples:**
- v1.10.0: Removed `.delta/LATEST` file (breaking workspace structure)
- v1.9.1: Made `context.yaml` mandatory (breaking requirement)

### When to increment MINOR (0.X.0)

- New features added in backward-compatible manner
- New CLI commands or parameters
- New configuration options
- Significant improvements or enhancements

**Examples:**
- v1.9.0: Added imports mechanism and hooks.yaml
- v1.7.0: Tool configuration simplification (77% reduction)
- v1.6.0: Context composition layer

### When to increment PATCH (0.0.X)

- Bug fixes
- Performance improvements
- Documentation updates
- Test improvements
- Minor UX enhancements

**Examples:**
- v1.10.1: Test coverage improvements and bug fixes
- v1.8.1: Made `--agent` parameter optional (usability improvement)
- v1.4.3: Enhanced CLI output visibility

## Release Process

### Step-by-Step Release

1. **Determine version number** based on changes (MAJOR/MINOR/PATCH)

2. **Update package.json**:
   ```bash
   # Edit package.json
   vim package.json  # Change version to X.Y.Z
   ```

3. **Update CHANGELOG.md**:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### Category - Description

   - Changes...
   ```

4. **Commit changes**:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore(release): prepare vX.Y.Z release"
   ```

5. **Create git tag**:
   ```bash
   git tag -a vX.Y.Z -m "feat(vX.Y): Brief description"
   ```

6. **Push to remote**:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

7. **Verify consistency**:
   ```bash
   # Run validation script
   ./scripts/check-version-consistency.sh
   ```

### Automated Release (Future)

Use the release script for automated workflow:

```bash
./scripts/release.sh --version X.Y.Z --type [major|minor|patch]
```

This script will:
- Validate current state
- Update package.json
- Update CHANGELOG.md (with template)
- Create git commit
- Create git tag
- Push to remote
- Run validation checks

## Version History Maintenance

### Retrospective Tagging

If a version was released without a git tag:

1. Find the commit that corresponds to the version
2. Create the tag with the correct date:
   ```bash
   COMMIT_SHA=$(git log --grep="vX.Y.Z" --format="%H" -1)
   GIT_COMMITTER_DATE="$(git show -s --format=%ci $COMMIT_SHA)" \
     git tag -a vX.Y.Z $COMMIT_SHA -m "feat(vX.Y): Description"
   ```
3. Push the tag: `git push origin vX.Y.Z`

### CHANGELOG Retroactive Updates

If a version is missing from CHANGELOG:

1. Review git history for the version
2. Add the version section in chronological order
3. Document all significant changes
4. Mark as retroactive: `## [X.Y.Z] - YYYY-MM-DD (retroactively documented)`

## Common Mistakes to Avoid

### ❌ Don't

- Create lightweight tags (use annotated tags with `-a`)
- Skip CHANGELOG updates
- Use inconsistent version numbers across sources
- Forget to push tags after creating them
- Modify git history after tags are pushed
- Create tags without corresponding CHANGELOG entries

### ✅ Do

- Always use annotated tags with meaningful messages
- Update all three sources (package.json, CHANGELOG.md, git tag)
- Verify consistency before releasing
- Follow semantic versioning strictly
- Document breaking changes explicitly
- Use automation scripts for validation

## Validation Tools

### Manual Validation

```bash
# Check package.json version
jq -r '.version' package.json

# Check latest CHANGELOG version
grep -m 1 '^## \[' CHANGELOG.md

# Check latest git tag
git describe --tags --abbrev=0

# List all tags
git tag -l 'v*' --sort=-version:refname
```

### Automated Validation

```bash
# Run consistency check script
./scripts/check-version-consistency.sh

# Expected output:
# ✓ package.json version: 1.10.1
# ✓ CHANGELOG.md latest: 1.10.1 (2025-10-17)
# ✓ Git latest tag: v1.10.1
# ✓ All versions consistent!
```

## Version Lifecycle

```
Development
    ↓
Update package.json
    ↓
Update CHANGELOG.md
    ↓
Commit changes
    ↓
Create git tag
    ↓
Push to remote
    ↓
Validation
    ↓
Released
```

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Tagging Best Practices](https://git-scm.com/book/en/v2/Git-Basics-Tagging)

---

**Last Updated**: 2025-10-17
**Document Version**: 1.0
**Applies to**: Delta Engine v1.10.1 and later
