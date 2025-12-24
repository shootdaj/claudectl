# claudectl

Global session manager for [Claude Code](https://claude.ai/code). Browse, search, and resume sessions across all your projects from one place.

![Demo](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)

```
┌─ claudectl ──────────────────────────────────────────────────────────────────┐
│ TITLE                              PROJECT          TIME    MSGS   TOK  MOD │
├──────────────────────────────────────────────────────────────────────────────┤
│ Fix authentication bug             myapp            2h ago    12   45K  son │
│ Refactor database layer            backend          1d ago    28  120K opus │
│ Add dark mode toggle               frontend         3d ago     8   22K  son │
│ Update API documentation           docs             1w ago    15   38K  hai │
└──────────────────────────────────────────────────────────────────────────────┘
│ ↑↓ Navigate  Enter Launch  n New  N New@sel  r Rename  p Preview  / Search  │
```

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
```

This will install [Bun](https://bun.sh) if needed, then set up claudectl.

## Usage

```bash
claudectl          # Open interactive session picker
cctl               # Short alias

# Commands
claudectl sessions list              # List all sessions
claudectl sessions launch <id>       # Launch specific session
claudectl sessions rename <id> <name> # Rename a session
claudectl sessions stats             # Usage statistics
claudectl config                     # Show config paths
```

## Keybindings

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate sessions |
| `Enter` | Launch selected session |
| `n` | New session in current directory |
| `N` | New session in selected session's directory |
| `r` | Rename session |
| `p` | Preview session details |
| `/` | Search sessions |
| `q` | Quit |

## Features

- **Global View**: See all Claude Code sessions across every project
- **Rich TUI**: Beautiful terminal interface with keyboard navigation
- **Search**: Find sessions by title, project, or content
- **Rename**: Give sessions memorable names
- **Stats**: Track token usage and session activity
- **Fast**: Built with Bun for speed

## Requirements

- [Claude Code](https://claude.ai/code) installed
- macOS or Linux

## How It Works

claudectl reads session data from `~/.claude/projects/` where Claude Code stores conversation transcripts. It parses the JSONL files to extract metadata and provides a unified interface to browse and launch sessions.

## License

MIT
