#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

REPO="shootdaj/claudectl"

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
if ! command -v bun &> /dev/null; then
  echo -e "${YELLOW}Bun not found. Installing Bun first...${NC}"
  curl -fsSL https://bun.sh/install | bash

  # Source the new path
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun &> /dev/null; then
    echo -e "${RED}Failed to install Bun. Please install manually: https://bun.sh${NC}"
    exit 1
  fi
  echo -e "${GREEN}Bun installed successfully!${NC}"
  echo ""
fi

echo -e "${CYAN}Installing claudectl...${NC}"

# Install claudectl globally from GitHub
bun install -g "github:${REPO}"

# Create cctl alias
BUN_BIN="$HOME/.bun/bin"
if [ -f "$BUN_BIN/claudectl" ] && [ ! -f "$BUN_BIN/cctl" ]; then
  ln -sf "$BUN_BIN/claudectl" "$BUN_BIN/cctl"
fi

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│  Installation complete!                 │${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""
echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}cctl${NC} to get started."
echo ""
echo -e "${YELLOW}Note:${NC} You may need to restart your terminal or run:"
echo -e "  ${CYAN}source ~/.bashrc${NC}  (or ~/.zshrc)"
echo ""
