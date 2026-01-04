#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
#
# Options:
#   VERSION=v1.0.0 curl ... | bash   # Install specific version
#   VERSION=latest curl ... | bash   # Install latest release (default)
#   VERSION=main curl ... | bash     # Install from main branch (development)

REPO="shootdaj/claudectl"
INSTALL_DIR="$HOME/.claudectl"
BUN_BIN="$HOME/.bun/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "┌─────────────────────────────────────────┐"
echo "│     claudectl installer                 │"
echo "│     Global Claude Code Manager          │"
echo "└─────────────────────────────────────────┘"
echo -e "${NC}"

# Determine version to install
if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  echo -e "${CYAN}Fetching latest release...${NC}"

  # Fetch release info
  RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || echo "")

  # Try jq first if available, otherwise use grep/sed
  if command -v jq &> /dev/null && [ -n "$RELEASE_JSON" ]; then
    VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty')
  elif [ -n "$RELEASE_JSON" ]; then
    VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[^"]*"([^"]+)".*/\1/')
  fi

  # Validate version looks like a tag (starts with v, single line, no spaces)
  if [ -z "$VERSION" ] || [[ ! "$VERSION" =~ ^v[0-9] ]] || [[ "$VERSION" == *$'\n'* ]]; then
    echo -e "${YELLOW}No valid release found, installing from main branch...${NC}"
    VERSION="main"
  fi
fi

if [ "$VERSION" = "main" ]; then
  DOWNLOAD_URL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
  echo -e "${YELLOW}Installing from main branch (development)${NC}"
else
  DOWNLOAD_URL="https://github.com/$REPO/archive/refs/tags/$VERSION.tar.gz"
  echo -e "${GREEN}Installing version: $VERSION${NC}"
fi

# Check if Bun is installed
if [ ! -f "$HOME/.bun/bin/bun" ] && ! command -v bun &> /dev/null; then
  echo -e "${YELLOW}Installing Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_BIN:$PATH"
fi

BUN="$HOME/.bun/bin/bun"
[ ! -f "$BUN" ] && BUN=$(command -v bun)

echo -e "${CYAN}Downloading claudectl...${NC}"

# Preserve user data before wiping
SETTINGS_FILE="$INSTALL_DIR/settings.json"
BACKUP_DIR="$INSTALL_DIR/backup"
TMP_SETTINGS=""
TMP_BACKUP=""

if [ -f "$SETTINGS_FILE" ]; then
  TMP_SETTINGS=$(mktemp)
  cp "$SETTINGS_FILE" "$TMP_SETTINGS"
fi

if [ -d "$BACKUP_DIR" ]; then
  TMP_BACKUP=$(mktemp -d)
  cp -r "$BACKUP_DIR" "$TMP_BACKUP/"
fi

# Download and extract tarball
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$DOWNLOAD_URL" | tar -xz -C "$INSTALL_DIR" --strip-components=1

# Restore user data
if [ -n "$TMP_SETTINGS" ] && [ -f "$TMP_SETTINGS" ]; then
  cp "$TMP_SETTINGS" "$SETTINGS_FILE"
  rm "$TMP_SETTINGS"
fi

if [ -n "$TMP_BACKUP" ] && [ -d "$TMP_BACKUP/backup" ]; then
  cp -r "$TMP_BACKUP/backup" "$INSTALL_DIR/"
  rm -rf "$TMP_BACKUP"
fi

# Save installed version
echo "$VERSION" > "$INSTALL_DIR/.version"

echo -e "${CYAN}Installing dependencies...${NC}"
cd "$INSTALL_DIR"
"$BUN" install --silent

# Create wrapper script
mkdir -p "$BUN_BIN"
cat > "$BUN_BIN/claudectl" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" "\$@"
EOF
chmod +x "$BUN_BIN/claudectl"
ln -sf "$BUN_BIN/claudectl" "$BUN_BIN/ccl"

# Add to PATH in shell profiles
for profile in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile"; do
  [ -f "$profile" ] && ! grep -q 'BUN_INSTALL' "$profile" 2>/dev/null && {
    echo -e '\n# bun\nexport BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"' >> "$profile"
  }
done

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo -e "Installed version: ${CYAN}$VERSION${NC}"
echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}ccl${NC} to get started."
echo ""

# Verify
export PATH="$BUN_BIN:$PATH"
"$BUN_BIN/claudectl" --version
