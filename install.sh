#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

REPO="shootdaj/claudectl"
INSTALL_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "┌─────────────────────────────────────────┐"
echo "│     claudectl installer                 │"
echo "│     Global Claude Code Manager          │"
echo "└─────────────────────────────────────────┘"
echo -e "${NC}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin)
    case "$ARCH" in
      arm64)
        BINARY="claudectl-darwin-arm64"
        ;;
      x86_64)
        BINARY="claudectl-darwin-x64"
        ;;
      *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
    esac
    ;;
  linux)
    case "$ARCH" in
      x86_64)
        BINARY="claudectl-linux-x64"
        ;;
      *)
        echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
    esac
    ;;
  *)
    echo -e "${RED}Error: Unsupported operating system: $OS${NC}"
    exit 1
    ;;
esac

echo -e "${YELLOW}Detected:${NC} $OS ($ARCH)"
echo -e "${YELLOW}Binary:${NC} $BINARY"
echo ""

# Get latest release
echo -e "${CYAN}Fetching latest release...${NC}"
LATEST_RELEASE=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_RELEASE" ]; then
  echo -e "${RED}Error: Could not fetch latest release${NC}"
  exit 1
fi

echo -e "${GREEN}Latest version:${NC} $LATEST_RELEASE"
echo ""

# Download binary
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST_RELEASE/$BINARY"
TMP_FILE=$(mktemp)

echo -e "${CYAN}Downloading $BINARY...${NC}"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"; then
  echo -e "${RED}Error: Failed to download binary${NC}"
  rm -f "$TMP_FILE"
  exit 1
fi

# Make executable
chmod +x "$TMP_FILE"

# Install
echo -e "${CYAN}Installing to $INSTALL_DIR...${NC}"
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_FILE" "$INSTALL_DIR/claudectl"
  ln -sf "$INSTALL_DIR/claudectl" "$INSTALL_DIR/cctl"
else
  echo -e "${YELLOW}Requesting sudo access to install to $INSTALL_DIR${NC}"
  sudo mv "$TMP_FILE" "$INSTALL_DIR/claudectl"
  sudo ln -sf "$INSTALL_DIR/claudectl" "$INSTALL_DIR/cctl"
fi

# Verify installation
if command -v claudectl &> /dev/null; then
  echo ""
  echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}│  Installation complete!                 │${NC}"
  echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}cctl${NC} to get started."
  echo ""
else
  echo -e "${RED}Error: Installation failed${NC}"
  exit 1
fi
