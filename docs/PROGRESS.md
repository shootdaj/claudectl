# Progress

## 2026-01-12

### Completed
- **Unified `n` key workflow**: Consolidated separate keybindings (n/N/Shift+P) into single `n` key entry point
  - Quick question: Starts in `~/.claudectl/scratch/` with no git
  - Clone repo: Clone from GitHub
  - Promote to project: When on scratch session, promotes to full project with git + private GitHub repo
- **Footer cleanup**: Removed "P Project" from footer, now just shows "n New"
- **`/wrapup` command**: Created new Claude Code skill for session wrap-up (document, self-improve, commit, push)
- **Remote Web Server (`claudectl serve`)**: Full web interface for Claude Code access from any device
  - Password authentication with JWT tokens
  - WebSocket-based terminal I/O with xterm.js
  - Tokyo Night Storm themed UI
  - PWA support with push notifications
  - Multi-client support (multiple browsers same session)
  - Cloudflare Tunnel integration for remote access
  - Service worker for offline shell + push handling

### Current State
- All tests passing (162 tests)
- TypeScript compiles clean
- Remote server tested and working
- Changes committed and pushed

### Usage
```bash
# Set password first
claudectl serve auth set

# Start server
claudectl serve

# Start with Cloudflare Tunnel for remote access
claudectl serve --tunnel
```

### Pending
- Add proper PNG icons for full PWA compliance (currently using SVG)
- Test on actual mobile devices
