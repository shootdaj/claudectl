# Progress

## 2026-01-13

### Completed
- **Fixed Remote Server Terminal I/O**: Debugged blank terminal issue in web interface
  - Root cause: Bun's Terminal API bug (GitHub #25779) - `terminal.write()` bypasses PTY line discipline
  - Solution: Migrated server to Node.js compatibility, spawned via `npx tsx`
- **Node.js Compatibility for Server**:
  - `bun:sqlite` → `better-sqlite3`
  - `Bun.file()` → Node.js `fs` module
  - `Bun.password.hash/verify` → `bcrypt`
  - Fixed ES module `__dirname` issue with `import.meta.url`
- **CLI Integration**: Updated `claudectl serve` to spawn Node.js process for server
- **Created `experts/remote-server.md`**: Documented server architecture and gotchas

### Current State
- Remote server fully functional with working terminal I/O
- Input reaches Claude through PTY correctly
- All API endpoints and WebSocket protocol working

### Usage
```bash
claudectl serve              # Start on port 3847
claudectl serve --tunnel     # With Cloudflare tunnel
```

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
