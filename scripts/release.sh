#!/usr/bin/env bash
#
# Interactive Release Script for Delta Engine
#
# This script automates the release process:
# 1. Validates current state
# 2. Updates package.json
# 3. Prompts for CHANGELOG entry
# 4. Creates git commit
# 5. Creates git tag
# 6. Pushes to remote
# 7. Runs validation checks
#
# Usage:
#   ./scripts/release.sh [--version X.Y.Z] [--type major|minor|patch]
#

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
NEW_VERSION=""
VERSION_TYPE=""
AUTO_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      NEW_VERSION="$2"
      shift 2
      ;;
    --type)
      VERSION_TYPE="$2"
      shift 2
      ;;
    --auto)
      AUTO_MODE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--version X.Y.Z] [--type major|minor|patch] [--auto]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🚀 Delta Engine Release Script${NC}"
echo ""

# Step 1: Validate current state
echo -e "${BLUE}Step 1: Validating current state...${NC}"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo -e "${YELLOW}⚠  You have uncommitted changes:${NC}"
  git status --short
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo -e "${YELLOW}⚠  You are not on main branch (current: $CURRENT_BRANCH)${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Get current version
CURRENT_VERSION=$(jq -r '.version' package.json)
echo -e "${GREEN}✓${NC} Current version: ${BLUE}$CURRENT_VERSION${NC}"

# Step 2: Determine new version
echo ""
echo -e "${BLUE}Step 2: Determining new version...${NC}"

if [[ -z "$NEW_VERSION" ]]; then
  if [[ -n "$VERSION_TYPE" ]]; then
    # Calculate new version based on type
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

    case $VERSION_TYPE in
      major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
      minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
      patch)
        PATCH=$((PATCH + 1))
        ;;
      *)
        echo -e "${RED}✗ Invalid version type: $VERSION_TYPE${NC}"
        echo "  Must be: major, minor, or patch"
        exit 1
        ;;
    esac

    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
  else
    # Interactive input
    echo "Current version: $CURRENT_VERSION"
    echo ""
    echo "Version type:"
    echo "  1) major - Breaking changes (X.0.0)"
    echo "  2) minor - New features (0.X.0)"
    echo "  3) patch - Bug fixes (0.0.X)"
    echo "  4) custom - Enter manually"
    echo ""
    read -p "Select version type [1-4]: " -n 1 VERSION_CHOICE
    echo ""

    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

    case $VERSION_CHOICE in
      1)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        NEW_VERSION="$MAJOR.$MINOR.$PATCH"
        ;;
      2)
        MINOR=$((MINOR + 1))
        PATCH=0
        NEW_VERSION="$MAJOR.$MINOR.$PATCH"
        ;;
      3)
        PATCH=$((PATCH + 1))
        NEW_VERSION="$MAJOR.$MINOR.$PATCH"
        ;;
      4)
        read -p "Enter new version: " NEW_VERSION
        ;;
      *)
        echo "Invalid choice."
        exit 1
        ;;
    esac
  fi
fi

echo -e "${GREEN}✓${NC} New version will be: ${BLUE}$NEW_VERSION${NC}"

if [[ "$AUTO_MODE" == "false" ]]; then
  read -p "Proceed with version $NEW_VERSION? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Step 3: Update package.json
echo ""
echo -e "${BLUE}Step 3: Updating package.json...${NC}"

jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp
mv package.json.tmp package.json

echo -e "${GREEN}✓${NC} Updated package.json to version $NEW_VERSION"

# Step 4: Update CHANGELOG.md
echo ""
echo -e "${BLUE}Step 4: Updating CHANGELOG.md...${NC}"

RELEASE_DATE=$(date +%Y-%m-%d)
CHANGELOG_TEMPLATE="## [$NEW_VERSION] - $RELEASE_DATE

### Changed

- Release v$NEW_VERSION
- [Add your changes here]

---

"

# Insert new version after "## [Unreleased]" line
if grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  # Create temporary file with new entry
  awk -v template="$CHANGELOG_TEMPLATE" '
    /^## \[Unreleased\]/ {
      print $0
      print ""
      print template
      next
    }
    {print}
  ' CHANGELOG.md > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md

  echo -e "${GREEN}✓${NC} Added template entry to CHANGELOG.md"
  echo ""
  echo -e "${YELLOW}⚠  Please edit CHANGELOG.md to add release notes${NC}"

  if [[ "$AUTO_MODE" == "false" ]]; then
    read -p "Open CHANGELOG.md in editor now? (Y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ || -z $REPLY ]]; then
      ${EDITOR:-vim} CHANGELOG.md
    fi
  fi
else
  echo -e "${YELLOW}⚠  Could not find [Unreleased] section in CHANGELOG.md${NC}"
  echo "  Please manually add the version entry."
fi

# Step 5: Review changes
echo ""
echo -e "${BLUE}Step 5: Reviewing changes...${NC}"
git diff package.json CHANGELOG.md

if [[ "$AUTO_MODE" == "false" ]]; then
  echo ""
  read -p "Commit these changes? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Changes not committed."
    echo "To revert: git checkout package.json CHANGELOG.md"
    exit 1
  fi
fi

# Step 6: Create commit
echo ""
echo -e "${BLUE}Step 6: Creating git commit...${NC}"

git add package.json CHANGELOG.md
git commit -m "chore(release): prepare v$NEW_VERSION release"

echo -e "${GREEN}✓${NC} Created commit for v$NEW_VERSION"

# Step 7: Create git tag
echo ""
echo -e "${BLUE}Step 7: Creating git tag...${NC}"

if [[ "$AUTO_MODE" == "false" ]]; then
  read -p "Enter tag message (or press Enter for default): " TAG_MESSAGE
  if [[ -z "$TAG_MESSAGE" ]]; then
    TAG_MESSAGE="Release v$NEW_VERSION"
  fi
else
  TAG_MESSAGE="Release v$NEW_VERSION"
fi

git tag -a "v$NEW_VERSION" -m "$TAG_MESSAGE"

echo -e "${GREEN}✓${NC} Created tag v$NEW_VERSION"

# Step 8: Push to remote
echo ""
echo -e "${BLUE}Step 8: Pushing to remote...${NC}"

if [[ "$AUTO_MODE" == "false" ]]; then
  read -p "Push commit and tag to remote? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipped pushing to remote."
    echo "To push later:"
    echo "  git push origin main"
    echo "  git push origin v$NEW_VERSION"
    exit 0
  fi
fi

git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

echo -e "${GREEN}✓${NC} Pushed to remote"

# Step 9: Validation
echo ""
echo -e "${BLUE}Step 9: Running validation checks...${NC}"

if [[ -f "./scripts/check-version-consistency.sh" ]]; then
  ./scripts/check-version-consistency.sh
else
  echo -e "${YELLOW}⚠  Validation script not found, skipping${NC}"
fi

# Summary
echo ""
echo "─────────────────────────────────────"
echo -e "${GREEN}✓ Release v$NEW_VERSION completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify the release on GitHub: https://github.com/agent-works/delta-engine/releases"
echo "  2. Publish to npm: npm publish"
echo "  3. Announce the release"
echo ""
