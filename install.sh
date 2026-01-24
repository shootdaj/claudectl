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

  # Fetch release info and extract tag_name directly
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | \
    grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4)

  # Validate version looks like a tag
  if [ -z "$VERSION" ] || [[ ! "$VERSION" =~ ^v[0-9] ]]; then
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
RENAMES_FILE="$INSTALL_DIR/renamed-sessions.json"
BACKUP_DIR="$INSTALL_DIR/backup"
INDEX_DB="$INSTALL_DIR/index.db"
TMP_SETTINGS=""
TMP_RENAMES=""
TMP_BACKUP=""
TMP_INDEX=""

if [ -f "$SETTINGS_FILE" ]; then
  TMP_SETTINGS=$(mktemp)
  cp "$SETTINGS_FILE" "$TMP_SETTINGS"
fi

if [ -f "$RENAMES_FILE" ]; then
  TMP_RENAMES=$(mktemp)
  cp "$RENAMES_FILE" "$TMP_RENAMES"
fi

if [ -d "$BACKUP_DIR" ]; then
  TMP_BACKUP=$(mktemp -d)
  cp -r "$BACKUP_DIR" "$TMP_BACKUP/"
fi

if [ -f "$INDEX_DB" ]; then
  TMP_INDEX=$(mktemp)
  cp "$INDEX_DB" "$TMP_INDEX"
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

if [ -n "$TMP_RENAMES" ] && [ -f "$TMP_RENAMES" ]; then
  cp "$TMP_RENAMES" "$RENAMES_FILE"
  rm "$TMP_RENAMES"
fi

if [ -n "$TMP_BACKUP" ] && [ -d "$TMP_BACKUP/backup" ]; then
  cp -r "$TMP_BACKUP/backup" "$INSTALL_DIR/"
  rm -rf "$TMP_BACKUP"
fi

if [ -n "$TMP_INDEX" ] && [ -f "$TMP_INDEX" ]; then
  cp "$TMP_INDEX" "$INDEX_DB"
  rm "$TMP_INDEX"
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

# Create alias wrappers
# ccln - New project (create wizard)
cat > "$BUN_BIN/ccln" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" new --mode create "\$@"
EOF
chmod +x "$BUN_BIN/ccln"

# ccls - Scratch session (quick question)
cat > "$BUN_BIN/ccls" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" new --mode scratch "\$@"
EOF
chmod +x "$BUN_BIN/ccls"

# cclc - Clone repo
cat > "$BUN_BIN/cclc" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" new --mode clone "\$@"
EOF
chmod +x "$BUN_BIN/cclc"

# cclr - Resume most recent session
cat > "$BUN_BIN/cclr" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" sessions launch --continue "\$@"
EOF
chmod +x "$BUN_BIN/cclr"

# ccll - List sessions (text, not TUI)
cat > "$BUN_BIN/ccll" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" sessions list "\$@"
EOF
chmod +x "$BUN_BIN/ccll"

# cclw - Web server
cat > "$BUN_BIN/cclw" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" serve "\$@"
EOF
chmod +x "$BUN_BIN/cclw"

# cclh - Help
cat > "$BUN_BIN/cclh" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" help "\$@"
EOF
chmod +x "$BUN_BIN/cclh"

# Add to PATH in shell profiles
for profile in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile"; do
  [ -f "$profile" ] && ! grep -q 'BUN_INSTALL' "$profile" 2>/dev/null && {
    echo -e '\n# bun\nexport BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"' >> "$profile"
  }
done

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo -e "Installed version: ${CYAN}$VERSION${NC}"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  ${GREEN}claudectl${NC} / ${GREEN}ccl${NC}   Open session picker"
echo -e "  ${GREEN}ccln${NC}              Create new project"
echo -e "  ${GREEN}ccls${NC}              Start scratch session"
echo -e "  ${GREEN}cclc${NC}              Clone from GitHub"
echo -e "  ${GREEN}cclr${NC}              Resume last session"
echo -e "  ${GREEN}ccll${NC}              List sessions"
echo -e "  ${GREEN}cclw${NC}              Start web server"
echo -e "  ${GREEN}cclh${NC}              Show help"
echo ""
echo -e "${YELLOW}Uninstall:${NC} curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.sh | bash"
echo ""

# Verify
export PATH="$BUN_BIN:$PATH"
"$BUN_BIN/claudectl" --version
