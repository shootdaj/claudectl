#!/bin/bash
# Record a demo gif of claudectl using vhs
# Run this script in an interactive terminal

set -e

cd "$(dirname "$0")/.."
mkdir -p assets

echo "Recording demo.gif..."
echo "This will open ccl, navigate, search, and show help."
echo ""

# Create the tape file
cat > /tmp/claudectl-demo.tape << 'EOF'
Output assets/demo.gif

Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Dracula"
Set Padding 20

# Show the command we're running
Type "ccl"
Sleep 500ms
Enter
Sleep 2s

# Navigate down
Down
Sleep 400ms
Down
Sleep 400ms
Down
Sleep 400ms

# Navigate up
Up
Sleep 400ms
Up
Sleep 400ms

# Open search
Type "/"
Sleep 400ms
Type "auth"
Sleep 1s

# Clear search
Escape
Sleep 500ms

# Show help
Type "?"
Sleep 2s

# Close help and quit
Escape
Sleep 300ms
Type "q"
Sleep 500ms
EOF

vhs /tmp/claudectl-demo.tape

echo ""
echo "✓ Saved to assets/demo.gif"
echo ""
echo "To regenerate screenshots:"
echo "  ccl help | freeze -o assets/help.png --language bash --theme dracula"
echo "  ccl sessions list | head -15 | freeze -o assets/sessions-list.png --language bash --theme dracula"
