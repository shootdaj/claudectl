#!/bin/bash
set -e

# Release script for claudectl
# Creates a version tag and pushes it - GitHub Actions handles the rest
#
# Usage: ./scripts/release.sh [patch|minor|major|vX.Y.Z]
#
# Examples:
#   ./scripts/release.sh patch    # 1.0.0 -> 1.0.1
#   ./scripts/release.sh minor    # 1.0.0 -> 1.1.0
#   ./scripts/release.sh major    # 1.0.0 -> 2.0.0
#   ./scripts/release.sh v1.2.3   # Set explicit version

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}Error: Must be on main branch to release (currently on $CURRENT_BRANCH)${NC}"
  exit 1
fi

# Ensure working directory is clean
if ! git diff --quiet || ! git diff --staged --quiet; then
  echo -e "${RED}Error: Working directory not clean. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi

# Pull latest
echo -e "${CYAN}Pulling latest changes...${NC}"
git pull origin main

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' package.json | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
echo -e "${CYAN}Current version: v$CURRENT_VERSION${NC}"

# Determine new version
if [ -z "$1" ]; then
  echo -e "${RED}Usage: $0 [patch|minor|major|vX.Y.Z]${NC}"
  echo ""
  echo "  patch  - Bug fixes (1.0.0 -> 1.0.1)"
  echo "  minor  - New features (1.0.0 -> 1.1.0)"
  echo "  major  - Breaking changes (1.0.0 -> 2.0.0)"
  echo "  vX.Y.Z - Explicit version"
  exit 1
fi

case "$1" in
  patch)
    IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
    NEW_VERSION="$major.$minor.$((patch + 1))"
    ;;
  minor)
    IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
    NEW_VERSION="$major.$((minor + 1)).0"
    ;;
  major)
    IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
    NEW_VERSION="$((major + 1)).0.0"
    ;;
  v*)
    NEW_VERSION="${1#v}"
    ;;
  *)
    NEW_VERSION="$1"
    ;;
esac

echo -e "${GREEN}New version: v$NEW_VERSION${NC}"

# Check if tag already exists
if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo -e "${RED}Error: Tag v$NEW_VERSION already exists${NC}"
  exit 1
fi

# Confirm
echo ""
read -p "Create release v$NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Update version in package.json
echo -e "${CYAN}Updating package.json...${NC}"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# Commit version bump
git add package.json
git commit -m "chore: bump version to v$NEW_VERSION"

# Create annotated tag
echo -e "${CYAN}Creating tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push commit and tag
echo -e "${CYAN}Pushing to origin...${NC}"
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo -e "${GREEN}✓ Tag v$NEW_VERSION pushed!${NC}"
echo -e "${CYAN}GitHub Actions will now create the release.${NC}"
echo -e "Watch progress: https://github.com/shootdaj/claudectl/actions"
