#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

REPO_URL="https://github.com/shootdaj/claudectl.git"
INSTALL_DIR="$HOME/.claudectl"

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

# Function to get bun path
get_bun() {
  if command -v bun &> /dev/null; then
    echo "bun"
  elif [ -f "$HOME/.bun/bin/bun" ]; then
    echo "$HOME/.bun/bin/bun"
  else
    echo ""
  fi
}

# Check if Bun is installed
BUN=$(get_bun)
if [ -z "$BUN" ]; then
  echo -e "${YELLOW}Bun not found. Installing Bun first...${NC}"
  echo ""
  curl -fsSL https://bun.sh/install | bash

  # Set path for this script
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  BUN="$HOME/.bun/bin/bun"

  if [ ! -f "$BUN" ]; then
    echo -e "${RED}Failed to install Bun. Please install manually: https://bun.sh${NC}"
    exit 1
  fi
  echo ""
  echo -e "${GREEN}Bun installed!${NC}"
  echo ""
fi

echo -e "${CYAN}Installing claudectl...${NC}"

# Clone or update the repo
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet
else
  echo "Cloning repository..."
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
"$BUN" install --silent

# Create wrapper scripts in ~/.bun/bin
BUN_BIN="$HOME/.bun/bin"
mkdir -p "$BUN_BIN"

# Create claudectl wrapper
cat > "$BUN_BIN/claudectl" << 'WRAPPER'
#!/bin/bash
exec "$HOME/.bun/bin/bun" run "$HOME/.claudectl/src/index.ts" "$@"
WRAPPER
chmod +x "$BUN_BIN/claudectl"

# Create cctl alias
ln -sf "$BUN_BIN/claudectl" "$BUN_BIN/cctl"

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│  Installation complete!                 │${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""

# Check if ~/.bun/bin is in PATH
if [[ ":$PATH:" != *":$BUN_BIN:"* ]]; then
  echo -e "${YELLOW}Add this to your shell profile (.bashrc, .zshrc, etc.):${NC}"
  echo ""
  echo -e "  ${CYAN}export PATH=\"\$HOME/.bun/bin:\$PATH\"${NC}"
  echo ""
  echo -e "Then restart your terminal or run: ${CYAN}source ~/.bashrc${NC}"
  echo ""
else
  echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}cctl${NC} to get started."
  echo ""
fi
