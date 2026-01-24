# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Uses [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH

---

## [Unreleased]

### Added
- **CLI aliases** for quick access to common workflows:
  - `ccln` - Create new project
  - `ccls` - Start scratch session
  - `cclc` - Clone from GitHub
  - `cclr` - Resume most recent session
  - `ccll` - List sessions (text output)
  - `cclw` - Start web server
  - `cclh` - Show help (keybindings & aliases)
- **`help` command** (`ccl help` or `cclh`) showing all keybindings and aliases
- **Help popup** (`?` key) in session picker
- **`new` command** with `--mode` option (scratch, create, clone)
- **`--continue` flag** on `sessions launch` to resume most recent session
- **Uninstall scripts** (`uninstall.sh` and `uninstall.ps1`)

---

## [2.1.0] - 2026-01-15 - Remote Web Server

Access Claude Code from any device via web browser.

### Added
- **Web server** (`claudectl serve`) - Full terminal access from browser
- **WebSocket terminal** with xterm.js - Real-time PTY I/O
- **Password authentication** with JWT tokens
- **PWA support** - Install as app on mobile/desktop
- **Push notifications** - Get notified when Claude needs input
- **Cloudflare Tunnel** (`--tunnel`) - Secure remote access
- **Multi-client support** - Multiple browsers, same session
- **OPEN badge** - See which sessions have active PTY
- **Ctrl+Up/Down** - Scroll search preview without moving selection

### Fixed
- Session spawning on WebSocket connect
- GitHub repo creation in promote flow
- Hidden directory path encoding (`.claudectl/scratch`)

---

## [2.0.0] - 2026-01-07 - SQLite Search Index

Fast full-text search across all sessions.

### Added
- **SQLite FTS5 search index** - Sub-second search across thousands of sessions
- **Incremental sync** - Only re-index changed files
- **Soft-delete** - Deleted sessions stay in DB for recovery
- **Session renames** - Persist in SQLite (no more JSON files)
- **Quick question workflow** - `n` key for scratch sessions in `~/.claudectl/scratch/`
- **Promote to project** - `p` key to convert scratch to full project with GitHub repo
- **Clone from GitHub** - `n` → Clone repo option
- **Windows support** - Cross-platform path handling

### Fixed
- Empty session filtering (require user messages)
- Session cleanup disabled by default (max retention)
- Index auto-sync on startup

---

## [1.0.0] - 2024-12-28 - Initial Release

Global session management for Claude Code.

### Added
- **TUI session picker** - Browse all sessions across projects
- **Keyboard navigation** - vim-style j/k, search with /
- **Session details** - Preview messages, see stats
- **Launch sessions** - Open in correct working directory
- **MCP management** - View/edit MCP server configs (`m` key)
- **Auto-updates** - `claudectl update` command
- **Dark midnight theme** - Nord-inspired colors
- **Skip permissions mode** - `d` key toggle
- **Auto-backup** - Hourly backup to `~/.claudectl/backup/`

### Technical
- Source distribution via Bun (blessed incompatible with compiled binaries)
- GitHub Actions CI/CD pipeline
- Semantic versioning with release automation
