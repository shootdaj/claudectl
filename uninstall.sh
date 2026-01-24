#!/bin/bash
set -e

# claudectl uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.sh | bash

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
echo "│     claudectl uninstaller               │"
echo "└─────────────────────────────────────────┘"
echo -e "${NC}"

# Remove wrapper scripts and aliases
SCRIPTS=("claudectl" "ccl" "ccln" "ccls" "cclc" "cclr" "ccll" "cclw" "cclh")

echo -e "${CYAN}Removing command aliases...${NC}"
for script in "${SCRIPTS[@]}"; do
  if [ -f "$BUN_BIN/$script" ]; then
    rm "$BUN_BIN/$script"
    echo -e "  Removed ${YELLOW}$script${NC}"
  fi
done

# Ask about user data
if [ -d "$INSTALL_DIR" ]; then
  echo ""
  echo -e "${YELLOW}Found claudectl data at $INSTALL_DIR${NC}"
  echo ""
  read -p "Remove all data including settings and index? (y/N) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Removed all claudectl data${NC}"
  else
    # Remove source but keep user data
    echo -e "${CYAN}Keeping user data, removing source files...${NC}"
    rm -rf "$INSTALL_DIR/src" 2>/dev/null || true
    rm -rf "$INSTALL_DIR/node_modules" 2>/dev/null || true
    rm -f "$INSTALL_DIR/package.json" 2>/dev/null || true
    rm -f "$INSTALL_DIR/tsconfig.json" 2>/dev/null || true
    rm -f "$INSTALL_DIR/bun.lockb" 2>/dev/null || true
    rm -f "$INSTALL_DIR/.version" 2>/dev/null || true
    echo -e "${GREEN}✓ Removed source files${NC}"
    echo -e "${YELLOW}  User data preserved at $INSTALL_DIR${NC}"
  fi
fi

echo ""
echo -e "${GREEN}Uninstall complete!${NC}"
echo ""
