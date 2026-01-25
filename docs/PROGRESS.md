# Progress

## 2026-01-25 (Session 3)

### Completed
- **Footer Settings Indicators**: Added `d:skip` and `x:expert` to footer with state-based coloring
- **Centralized Keybindings**: Created `src/ui/keybindings.ts` as single source of truth
  - All keybindings defined in one place
  - `buildSessionFooter()` generates footer based on context (scratch, archive view, settings)
  - Help popup content generated from same source
- **Added Missing Keybindings**: Added `mcp`, `update` to footer
- **Added `cclu` Alias**: Quick update command in `install.sh`
- **Comprehensive README Update**: Documented all features including hidden ones
  - All CLI aliases and keybindings
  - Backup & recovery commands
  - Search index commands
  - Deleted session recovery
  - Settings toggles documentation
  - File locations table

### PRs Merged
- #12: Branch protection test
- #13: Footer settings indicators
- #14: Footer spacing and keybindings centralization
- #15: Missing keybindings, cclu alias, unified footer builder
- #16: Comprehensive README update
- #17: Remove incomplete server feature from README, add In Progress section
- #18: Fix README accuracy (settings.json → SQLite, backup command)

### Current State
- All tests passing
- Main branch protected (requires "Test" status check)
- README fully accurate and comprehensive
- v2.2.13 released

---

## 2026-01-25 (Session 2)

### Completed
- **Archive/Settings Persistence Bug Fix**: Data was lost across updates
  - `sync()` now preserves `is_archived` when re-indexing changed files
  - `rebuild()` saves and restores archive status
  - Schema v4: Added `settings` table to SQLite
  - Migrated claudectl settings from JSON to SQLite
- **Feature Branch Prereleases**: Auto-deploy feature branches as prereleases
  - `.github/workflows/release.yml` triggers on `feature/*`, `fix/*`, `feat/*`
  - Creates versions like `v2.2.2-branch-name` marked as prerelease
  - Won't be installed by default (skipped by `/releases/latest`)
- **Branch Update Command**: Install prereleases easily
  - `ccl update <branch>` finds and installs matching prerelease
  - `ccl update --list` shows available prereleases
  - `ccl update v2.2.0-archive-fix` for explicit version

### PRs Merged
- #8: fix: Preserve archive status and consolidate settings in SQLite
- #9: feat: Add prerelease workflow for feature branches
- #10: feat: Add branch argument to update command

### Current State
- All tests passing (206 tests)
- Latest stable: v2.2.2
- Prereleases available: v2.2.0-archive-fix, v2.2.1-prerelease-workflow, v2.2.2-update-branch-arg

---

## 2026-01-25

### Completed
- **Archive Sessions Feature**: Hide sessions without deleting them
  - `a` key to archive/restore selected session
  - `A` (Shift+A) to toggle archive view
  - SQLite schema v3 with `is_archived` and `archived_at` columns
  - Archive status persists across restarts
  - Visual indicators: `[ARCHIVE]` badge in title, footer shows "Restore" in archive view
- **Form Tab Navigation Fix**: Fixed Tab key inserting tab character instead of navigating
  - Root cause: textbox with `inputOnFocus: true` captures all keystrokes in edit mode
  - Solution: Use `blessed.form` with `keys: true` as parent container
  - All form elements need `name` attribute and `parent: form`
- **Create Project Wizard**: Added template selection (Empty, TypeScript, React, Node API)
  - Tab/Shift+Tab navigation between form fields
  - Create button at end of form
  - Visibility toggle (private/public)

### Current State
- All tests passing (184 tests)
- TypeScript compiles clean
- On branch `feature/create-project-wizard`
- Ready to merge to main

---

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

## Bugs - TODO

### Session Renames Not Persisting
- **Priority:** High
- **Description:** Session renames revert to original auto-generated titles
- **Root cause:** Likely related to sync() or rebuild() not preserving session_titles properly
- **Notes:**
  - session_titles is a separate table from files
  - The LEFT JOIN in queries should work, but renames still getting lost
  - Need to investigate when exactly the rename disappears (after update? sync? rebuild?)

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
