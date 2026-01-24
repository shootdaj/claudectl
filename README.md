# claudectl

Global session manager for [Claude Code](https://claude.ai/code). Browse, search, and resume sessions across all your projects from one place.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)

```
┌─ claudectl v1.0.37 │ sessions [SKIP PERMS] [AGENT EXPERT]     42 sessions ─┐
│ TITLE                              PROJECT          TIME    MSGS   TOK MOD │
│ Fix authentication bug             myapp            2h ago    12   45K son │
│ Refactor database layer            backend          1d ago    28  120K opus│
│ Add dark mode toggle               frontend         3d ago     8   22K son │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fix authentication bug  abc123ef                                            │
│ path ~/Code/myapp  branch main                                              │
│ created 1/5/2025, 10:30:00 AM  model claude-sonnet-4-20250514               │
├─────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ Nav  ↵ Launch  n New  r Rename  / Search  m MCP  u Update  q Quit       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

### Windows (PowerShell)

> **Note:** Windows support is experimental. Please [report issues](https://github.com/shootdaj/claudectl/issues) if you encounter problems.

```powershell
irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
```

<details>
<summary>Other install options</summary>

**macOS/Linux - specific version:**
```bash
VERSION=v2.0.0 curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

**macOS/Linux - main branch (development):**
```bash
VERSION=main curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

**Windows - specific version:**
```powershell
$env:VERSION="v2.0.0"; irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
```

**Windows - main branch (development):**
```powershell
$env:VERSION="main"; irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
```

</details>

This will install [Bun](https://bun.sh) if needed, then set up claudectl.

## Usage

```bash
claudectl          # Open interactive session picker
ccl                # Short alias

# Quick aliases
ccln               # Create new project
ccls               # Start scratch session (quick question)
cclc               # Clone from GitHub
cclr               # Resume most recent session
ccll               # List sessions (text output)
cclw               # Start web server

# Commands
ccl sessions list              # List all sessions
ccl sessions launch <id>       # Launch specific session
ccl sessions launch --continue # Resume most recent session
ccl sessions search <query>    # Full-text search across sessions
ccl sessions stats             # Usage statistics
ccl new --mode scratch         # Start scratch session
ccl new --mode create          # Create new project
ccl new --mode clone           # Clone from GitHub
ccl serve                      # Start web server for remote access
ccl mcp list                   # List MCP servers
ccl update                     # Update to latest version
ccl backup                     # Backup all sessions
ccl config                     # Show config paths
```

## Keybindings

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate sessions |
| `Enter` | Launch session (returns to picker when Claude exits) |
| `n` | Start: Quick question or Clone repo |
| `n` | Promote to project (when on scratch session) |
| `r` | Rename session |
| `R` | Restore deleted session |
| `p` | Preview session details |
| `/` | Search sessions (full-text) |
| `m` | Open MCP manager |
| `u` | Update claudectl |
| `d` | Toggle dangerous mode (skip permissions) |
| `a` | Toggle Agent Expert auto-install |
| `q` | Quit |

## Features

- **Global View**: See all Claude Code sessions across every project
- **Quick Questions**: Start scratch sessions without a project (Shift+P → New)
- **Promote to Project**: Turn a scratch session into a real project with git + GitHub
- **Clone from GitHub**: Quick access to your repos (Shift+P → Existing)
- **Session Loop**: Returns to picker after Claude exits (Ctrl+C, /exit, etc.)
- **Rich TUI**: Beautiful terminal interface with Dark Midnight theme
- **Full-Text Search**: SQLite FTS5 index for instant search across all session content
- **Rename**: Give sessions memorable names (preserved across updates)
- **Soft Delete & Restore**: Deleted sessions can be restored from backup
- **Stats**: Track token usage and session activity
- **MCP Manager**: View and manage MCP server configurations
- **Auto-Update**: Check for updates on startup, update with `u` key
- **Auto-Backup**: Automatic hourly backup of all sessions
- **Skip Permissions**: Launch sessions with `--dangerously-skip-permissions`
- **Agent Expert**: Auto-install agent-expert in new sessions
- **Data Preserved**: Settings, renames, backups, and search index persist across updates
- **Cross-Platform**: macOS, Linux, and Windows (experimental)
- **Fast**: Built with Bun for speed

## Agent Expert

claudectl integrates with [Agent Expert](https://github.com/shootdaj/agent-expert), a self-improving agent framework that makes Claude Code learn and get better over time.

**What it does:**
- Creates `experts/` files that document patterns, file locations, and project-specific knowledge
- Claude reads expertise before starting work, applies learned knowledge
- Automatically updates expertise after code changes
- Knowledge persists across sessions, building a growing knowledge base

**How to use:**
1. Press `a` in claudectl to enable "Agent Expert auto-install"
2. Start a new session - agent-expert is automatically installed
3. Claude now reads and updates expertise files as you work

Or install manually in any project:
```bash
curl -sL https://raw.githubusercontent.com/shootdaj/agent-expert/main/install.sh | bash
```

Learn more: [github.com/shootdaj/agent-expert](https://github.com/shootdaj/agent-expert)

## Requirements

- [Claude Code](https://claude.ai/code) installed
- macOS, Linux, or Windows 10/11

## How It Works

claudectl reads session data from Claude Code's projects directory:
- **macOS/Linux:** `~/.claude/projects/`
- **Windows:** `%USERPROFILE%\.claude\projects\`

It parses the JSONL files to extract metadata and provides a unified interface to browse and launch sessions. When you launch a session, claudectl changes to that project's directory before starting Claude.

## Configuration

Settings are stored in:
- **macOS/Linux:** `~/.claudectl/settings.json`
- **Windows:** `%USERPROFILE%\.claudectl\settings.json`

```json
{
  "skipPermissions": false,
  "autoAddAgentExpert": false
}
```

Session backups are stored in the `backup/` subdirectory.

## License

MIT
