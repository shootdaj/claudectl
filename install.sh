#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

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

# Check if Bun is installed
if [ ! -f "$HOME/.bun/bin/bun" ] && ! command -v bun &> /dev/null; then
  echo -e "${YELLOW}Installing Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_BIN:$PATH"
fi

BUN="$HOME/.bun/bin/bun"
[ ! -f "$BUN" ] && BUN=$(command -v bun)

echo -e "${CYAN}Downloading claudectl...${NC}"

# Download and extract tarball (no .git, smaller)
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$INSTALL_DIR" --strip-components=1

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
echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}ccl${NC} to get started."
echo ""

# Verify
export PATH="$BUN_BIN:$PATH"
"$BUN_BIN/claudectl" --version
