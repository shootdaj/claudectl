#!/bin/bash
set -e

# claudectl installer
# Usage: curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

REPO_URL="https://github.com/shootdaj/claudectl.git"
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

# Function to get bun path
get_bun() {
  if [ -f "$HOME/.bun/bin/bun" ]; then
    echo "$HOME/.bun/bin/bun"
  elif command -v bun &> /dev/null; then
    command -v bun
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
  BUN="$HOME/.bun/bin/bun"

  if [ ! -f "$BUN" ]; then
    echo -e "${RED}Failed to install Bun. Please install manually: https://bun.sh${NC}"
    exit 1
  fi
  echo ""
  echo -e "${GREEN}Bun installed!${NC}"
  echo ""

  # Add to current shell PATH
  export PATH="$BUN_BIN:$PATH"
fi

echo -e "${CYAN}Installing claudectl...${NC}"

# Clone or update the repo
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet origin main
else
  echo "Cloning repository..."
  git clone --quiet --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
"$BUN" install --silent

# Create wrapper scripts in ~/.bun/bin
mkdir -p "$BUN_BIN"

# Create claudectl wrapper
cat > "$BUN_BIN/claudectl" << EOF
#!/bin/bash
exec "$BUN" run "$INSTALL_DIR/src/index.ts" "\$@"
EOF
chmod +x "$BUN_BIN/claudectl"

# Create cctl alias
ln -sf "$BUN_BIN/claudectl" "$BUN_BIN/cctl"

# Ensure ~/.bun/bin is in shell profile for future sessions
add_to_path() {
  local profile="$1"
  if [ -f "$profile" ]; then
    if ! grep -q 'BUN_INSTALL' "$profile" 2>/dev/null; then
      echo '' >> "$profile"
      echo '# bun' >> "$profile"
      echo 'export BUN_INSTALL="$HOME/.bun"' >> "$profile"
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$profile"
    fi
  fi
}

# Add to common shell profiles if not already there
add_to_path "$HOME/.bashrc"
add_to_path "$HOME/.zshrc"
add_to_path "$HOME/.bash_profile"

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│  Installation complete!                 │${NC}"
echo -e "${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""
echo -e "Run ${CYAN}claudectl${NC} or ${CYAN}cctl${NC} to get started."
echo ""

# Add to current session PATH if needed
if [[ ":$PATH:" != *":$BUN_BIN:"* ]]; then
  export PATH="$BUN_BIN:$PATH"
fi

# Run it to verify installation works
echo -e "${CYAN}Verifying installation...${NC}"
"$BUN_BIN/claudectl" --version
