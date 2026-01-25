# claudectl

**Your command center for Claude Code.** Browse, search, and launch sessions across all your projects—from one place.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)

## Demo

**Session Picker & Search**

https://github.com/user-attachments/assets/5d76d8cb-d759-4961-af7e-017d3f96e813

https://github.com/user-attachments/assets/b88d84a8-eabb-469e-afe0-e98b0d2ded65

**New Project Wizard**

https://github.com/user-attachments/assets/4af9cacc-e8e0-473a-9dd0-8238fcaddc18

## Quick Start

```bash
# Install (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash

# Open session picker
ccl

# Or use quick aliases
ccls    # Start a scratch session right now
cclr    # Resume your last session
cclh    # See all commands
```

## Why claudectl?

Claude Code sessions are organized by folder. If you're in `~/myapp`, you only see sessions from that project. **claudectl gives you a global view** - see and launch sessions from any project, all in one place.

**Quality of life features:**
- **Quick aliases** - `ccls` starts a scratch session instantly, `cclr` resumes your last session
- **Session loop** - After Claude exits, you're back in the picker (no re-typing `ccl`)
- **Scratch sessions** - Quick questions without creating a project
- **Promote to project** - Turn that scratch session into a real repo when it grows
- **Full-text search** - Find that session where you fixed the auth bug
- **Deleted session recovery** - Accidentally delete a session? Restore it from backup

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
```

> Windows support is experimental. [Report issues](https://github.com/shootdaj/claudectl/issues) if you encounter problems.

<details>
<summary>More install options</summary>

**Specific version:**
```bash
VERSION=v2.1.0 curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

**Development (main branch):**
```bash
VERSION=main curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

**Feature branch (prerelease):**
```bash
ccl update feature/my-branch
# or
ccl update --list  # see available prereleases
```

**Uninstall:**
```bash
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.sh | bash
```

</details>

## Quick Aliases

Memorize these and you'll fly:

| Alias | What it does |
|-------|--------------|
| `ccl` | Open session picker |
| `ccls` | **S**cratch session - start chatting immediately |
| `cclr` | **R**esume last session |
| `ccln` | **N**ew project (create wizard) |
| `cclc` | **C**lone from GitHub |
| `ccll` | **L**ist sessions (text output) |
| `cclu` | **U**pdate claudectl |
| `cclh` | **H**elp - show all commands |

## Keybindings

| Key | Action |
|-----|--------|
| `↑↓` or `jk` | Navigate sessions |
| `Enter` | Launch session |
| `n` | New session menu |
| `p` | Promote scratch to project (or preview for non-scratch) |
| `r` | Rename session |
| `/` | Search sessions (full-text) |
| `a` | Archive session (or restore in archive view) |
| `A` | Toggle archive view |
| `R` | Restore deleted session from backup |
| `c` | Copy session ID |
| `m` | MCP server manager |
| `d` | Toggle skip-permissions mode |
| `x` | Toggle agent-expert auto-install |
| `u` | Check for updates |
| `?` | Show help popup |
| `q` | Quit |

**In search mode:**
| Key | Action |
|-----|--------|
| `↑↓` | Navigate results while typing |
| `Ctrl+↑↓` | Scroll match preview |
| `Enter` | Exit search, keep results |
| `Escape` | Clear search |

## Commands

### Session Management

```bash
# List all sessions
ccl sessions list              # Table format
ccl sessions list -j           # JSON format

# Launch sessions
ccl sessions launch <id>       # By ID or name
ccl sessions launch -c         # Resume most recent (same as cclr)
ccl sessions launch -d         # Dry run - show what would happen
ccl sessions launch -p "prompt" # Resume with additional prompt

# Search
ccl sessions search <query>    # Full-text search across all messages
ccl sessions search -c <query> # Case-sensitive
ccl sessions search -j <query> # JSON output
ccl sessions search -m 5 <query> # Max 5 matches per session

# Rename
ccl sessions rename <id> <title>

# Statistics
ccl sessions stats             # Token usage, costs, model breakdown
```

### New Sessions

```bash
ccl new                        # Interactive menu
ccl new --mode scratch         # Quick question (scratch session)
ccl new --mode create          # Create new GitHub repo + project
ccl new --mode clone           # Clone existing repo
ccl new --skip-permissions     # Start with skip-permissions enabled
```

### Backup & Recovery

Sessions are automatically backed up every hour. Deleted sessions can be recovered.

```bash
ccl backup                     # Create backup now
ccl backup status              # Show backup info
ccl backup deleted             # List deleted sessions available for restore
ccl backup restore <id>        # Restore specific session
ccl backup restore --all       # Restore all deleted sessions
```

### Search Index

claudectl maintains a SQLite index for fast search. Usually automatic, but can be managed manually.

```bash
ccl index stats                # Show index statistics
ccl index sync                 # Incremental sync with filesystem
ccl index rebuild              # Full rebuild (use if index corrupted)
```

### Updates

```bash
ccl update                     # Update to latest stable
ccl update v2.1.0              # Install specific version
ccl update feature/branch      # Install prerelease from branch
ccl update --check             # Check without installing
ccl update --list              # List available prereleases
ccl update --force             # Force reinstall
```

### MCP Server Management

```bash
ccl mcp list                   # List all MCP servers
# Or press 'm' in the session picker for interactive management
```

### Other

```bash
ccl config                     # Show all config paths
ccl help                       # Show keybindings & aliases
```

## Features

### Session Management
- **Global view** - See all sessions from every project in one place
- **Full-text search** - Search across all conversation messages with SQLite FTS5
- **Rename sessions** - Give sessions memorable names instead of auto-generated titles
- **Archive sessions** - Hide old sessions without deleting (press `a`)
- **Soft delete** - Deleted sessions are preserved in backup for recovery
- **Auto-backup** - Sessions backed up automatically every hour

### Deleted Session Recovery

When a session is deleted (either by you or Claude Code), claudectl keeps a backup:

1. Deleted sessions appear dimmed with `[DEL]` prefix in the list
2. Press `R` (Shift+R) to restore from backup
3. Or use CLI: `ccl backup deleted` to see what can be restored

### Scratch Sessions

Quick questions without creating a project:
- `ccls` or press `n` then select "Quick question"
- Sessions stored in `~/.claudectl/scratch/`
- Press `p` on a scratch session to promote it to a real project

### Search Features

Press `/` to search:
- Searches session titles, paths, and **full message content**
- Real-time results as you type (150ms debounce)
- Shows match context with highlighted terms
- Navigate results with arrow keys while typing
- `Ctrl+↑↓` scrolls the match preview panel

### Session Details

Each session in the list shows:
- **Title** - Auto-generated or custom name
- **Project** - Working directory (shortened)
- **Time** - Relative time since last access
- **Messages** - Total message count
- **Tokens** - Input+output tokens (K/M format)
- **Model** - opus/son/hai

The details panel shows:
- Full path and git branch
- Creation and last access timestamps
- Message breakdown (user/assistant)
- Full model name

### Settings Toggles

**Skip Permissions** (`d` key):
- When ON, launches use `--dangerously-skip-permissions`
- Shown as orange `[SKIP PERMS]` badge in title bar
- Footer shows `d skip` in orange when enabled

**Agent Expert** (`x` key):
- When ON, auto-installs [agent-expert](https://github.com/shootdaj/agent-expert) on new projects
- Shown as green `[AGENT EXPERT]` badge in title bar
- Footer shows `x expert` in green when enabled

### MCP Server Management

Press `m` to manage MCP servers:
- View global servers (`~/.claude.json`)
- View project servers (`.mcp.json`)
- Add/edit/remove servers interactively

## How It Works

claudectl reads from Claude Code's session directory (`~/.claude/projects/`), parses the JSONL transcript files, and maintains a SQLite index for fast search. When you launch a session, it `cd`s to the project directory before starting Claude.

### File Locations

| Path | Purpose |
|------|---------|
| `~/.claudectl/index.db` | SQLite search index |
| `~/.claudectl/settings.json` | User settings |
| `~/.claudectl/backup/` | Session backups |
| `~/.claudectl/.version` | Installed version |
| `~/.claude/projects/` | Claude Code sessions |
| `~/.claude.json` | Global MCP servers |

### Settings

```json
{
  "skipPermissions": false,
  "autoAddAgentExpert": false
}
```

## Agent Expert Integration

claudectl integrates with [Agent Expert](https://github.com/shootdaj/agent-expert) - a framework that helps Claude learn and improve over time.

Press `x` to enable auto-install. When enabled, new projects get Agent Expert automatically. Claude will:
- Read expertise files before starting work
- Update expertise after making changes
- Build project-specific knowledge over time

Learn more: [github.com/shootdaj/agent-expert](https://github.com/shootdaj/agent-expert)

## In Progress

Features being actively developed:

- **Web Server (Remote Access)** - Access sessions from any device via browser
- **Session Renames Persistence** - Bug fix for renames reverting to auto-generated titles

## Requirements

- [Claude Code](https://claude.ai/code)
- macOS, Linux, or Windows 10/11

## License

MIT
