# Progress

## 2026-01-15

### Completed
- **Fixed Ctrl+Up/Down scrolling**: Search preview now scrolls without moving table selection
  - Disabled built-in `keys: true` and `vi: true` on table
  - Implemented manual navigation via `table.on("keypress")`
  - Ctrl+Up/Down scrolls preview, plain Up/Down/j/k navigates table
- **Fixed WebSocket session spawning**: Sessions now properly spawn PTY when clicked
  - Bug: `addClient()` returned null for new sessions (no managed session existed)
  - Fix: Call `getOrCreateManagedSession()` before `addClient()` in WebSocket open handler
- **Added "OPEN" badge for running sessions**: Web UI shows which sessions have active PTY
  - Added `isActive` flag to sessions API response
  - Green dot + "OPEN" badge in session list
  - Refreshes on WebSocket connect/disconnect
- **Fixed GitHub repo creation in promote flow**: `--push` fails on empty repos
  - Removed `--push` flag, manually add remote after repo creation
- **Added auth logging**: Server logs login attempts for debugging

### Current State
- All tests passing (172 tests)
- TypeScript compiles clean
- Web server functional (login, session list, terminal)
- Ready to merge to main

---

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

---

## Server Session Management - TODO

**Goal:** See which sessions are "open" (Claude running) vs "closed" (not running)

**North star:** Continue on the web after leaving machine, then continue when coming back

**Current state:**
- `isSessionActive()` only checks if CCL server spawned a PTY
- Doesn't detect Claude running locally in terminal

**Simplest model:**
- OPEN = CCL server has PTY running for this session
- CLOSED = no PTY, just the session file
- Click closed → spawn PTY
- Click open → reconnect to existing PTY
- PTY persists even when browser closes

**Open questions to resolve:**
- Should we detect locally-running Claude processes (ps aux)?
- Should we prevent multiple instances of same session?
- What happens if user starts via web, then wants to continue in local terminal?

**Resume this discussion after merging current branch.**
