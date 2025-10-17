#!/usr/bin/env bash
#
# Version Consistency Checker
#
# Validates that package.json, CHANGELOG.md, and git tags are consistent.
# Returns exit code 0 if all checks pass, 1 if any check fails.
#
# Usage:
#   ./scripts/check-version-consistency.sh
#

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status tracking
ERRORS=0

echo -e "${BLUE}🔍 Delta Engine Version Consistency Check${NC}"
echo ""

# 1. Check package.json version
echo -e "${BLUE}📦 Checking package.json...${NC}"
if [[ ! -f "package.json" ]]; then
  echo -e "${RED}✗ package.json not found${NC}"
  exit 1
fi

PKG_VERSION=$(jq -r '.version' package.json)
if [[ -z "$PKG_VERSION" || "$PKG_VERSION" == "null" ]]; then
  echo -e "${RED}✗ Cannot read version from package.json${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} package.json version: ${BLUE}$PKG_VERSION${NC}"

# 2. Check CHANGELOG.md latest version
echo -e "${BLUE}📝 Checking CHANGELOG.md...${NC}"
if [[ ! -f "CHANGELOG.md" ]]; then
  echo -e "${RED}✗ CHANGELOG.md not found${NC}"
  exit 1
fi

# Extract latest version from CHANGELOG (format: ## [X.Y.Z] - YYYY-MM-DD)
# Skip [Unreleased] section
CHANGELOG_ENTRY=$(grep '^## \[' CHANGELOG.md | grep -v '\[Unreleased\]' | head -1 || echo "")
if [[ -z "$CHANGELOG_ENTRY" ]]; then
  echo -e "${RED}✗ No version entries found in CHANGELOG.md${NC}"
  exit 1
fi

CHANGELOG_VERSION=$(echo "$CHANGELOG_ENTRY" | sed -n 's/^## \[\([0-9.]*\)\].*/\1/p')
CHANGELOG_DATE=$(echo "$CHANGELOG_ENTRY" | sed -n 's/^## \[.*\] - \(.*\)/\1/p')

if [[ -z "$CHANGELOG_VERSION" ]]; then
  echo -e "${RED}✗ Cannot parse version from CHANGELOG.md${NC}"
  echo "  Entry: $CHANGELOG_ENTRY"
  exit 1
fi

echo -e "${GREEN}✓${NC} CHANGELOG.md latest: ${BLUE}$CHANGELOG_VERSION${NC} ($CHANGELOG_DATE)"

# 3. Check git tag
echo -e "${BLUE}🏷️  Checking git tags...${NC}"

# Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -z "$LATEST_TAG" ]]; then
  echo -e "${YELLOW}⚠${NC}  No git tags found"
  TAG_VERSION=""
else
  # Remove 'v' prefix if present
  TAG_VERSION=$(echo "$LATEST_TAG" | sed 's/^v//')
  echo -e "${GREEN}✓${NC} Git latest tag: ${BLUE}$LATEST_TAG${NC} (version: $TAG_VERSION)"
fi

# 4. Cross-check consistency
echo ""
echo -e "${BLUE}🔄 Checking consistency...${NC}"

# Check package.json vs CHANGELOG
if [[ "$PKG_VERSION" != "$CHANGELOG_VERSION" ]]; then
  echo -e "${RED}✗ Version mismatch:${NC}"
  echo "  package.json:  $PKG_VERSION"
  echo "  CHANGELOG.md:  $CHANGELOG_VERSION"
  ((ERRORS++))
else
  echo -e "${GREEN}✓${NC} package.json and CHANGELOG.md match"
fi

# Check package.json vs git tag (if tag exists)
if [[ -n "$TAG_VERSION" ]]; then
  if [[ "$PKG_VERSION" != "$TAG_VERSION" ]]; then
    echo -e "${YELLOW}⚠${NC}  Version difference detected:"
    echo "  package.json:  $PKG_VERSION"
    echo "  Latest tag:    $TAG_VERSION"
    echo ""
    echo "  ${YELLOW}Note:${NC} This may be normal if you're preparing a new release."
    echo "  The git tag should be created after package.json is updated."
  else
    echo -e "${GREEN}✓${NC} package.json and git tag match"
  fi
fi

# 5. Check if CHANGELOG has entry for current package.json version
echo ""
echo -e "${BLUE}📋 Checking CHANGELOG completeness...${NC}"

if grep -q "^## \[$PKG_VERSION\]" CHANGELOG.md; then
  echo -e "${GREEN}✓${NC} CHANGELOG.md has entry for version $PKG_VERSION"
else
  echo -e "${RED}✗ CHANGELOG.md missing entry for version $PKG_VERSION${NC}"
  ((ERRORS++))
fi

# 6. Check if git tag exists for current package.json version
if git rev-parse "v$PKG_VERSION" >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Git tag v$PKG_VERSION exists"
else
  echo -e "${YELLOW}⚠${NC}  Git tag v$PKG_VERSION does not exist yet"
  echo "  Run: git tag -a v$PKG_VERSION -m \"Release v$PKG_VERSION\""
fi

# 7. List all version tags
echo ""
echo -e "${BLUE}📊 All version tags:${NC}"
git tag -l 'v*' --sort=-version:refname | head -10

# Final summary
echo ""
echo "─────────────────────────────────────"
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}✓ All version consistency checks passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Found $ERRORS consistency error(s)${NC}"
  echo ""
  echo "Please fix the errors above before releasing."
  exit 1
fi
