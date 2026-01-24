# Technology Stack

## Overview
claudectl is a global Claude Code session manager built with Bun, TypeScript, and a rich terminal UI. It provides a unified interface to manage Claude Code sessions, MCPs, plugins, and settings across all projects.

## Language & Runtime

- **Language:** TypeScript 5.7.2
  - Strict mode enabled for type safety
  - ESNext module output with bundler resolution
  - JSX/TSX support via TypeScript compiler
  - Absolute path aliases configured: `@/*` → `src/*`

- **Runtime:** Bun (latest)
  - Used for CLI execution, testing, and server operations
  - Provides built-in SQLite support via `bun:sqlite`
  - Process spawning via `Bun.spawn()` and `Bun.spawnSync()`
  - File API for reading/writing config files
  - HTTP server via `Bun.serve()`

## Core Dependencies

### CLI & Command Parsing
- **commander** (^13.0.0)
  - Command-line interface framework
  - Subcommand support for sessions, MCP, plugins, settings
  - Option and argument parsing

- **@clack/prompts** (^0.9.1)
  - Beautiful interactive prompts matching Claude Code UI style
  - Used for password setup and interactive configuration

- **picocolors** (^1.1.1)
  - Terminal color formatting for colored output
  - Used throughout CLI for visual hierarchy

### Terminal UI

- **blessed** (^0.1.81)
  - Rich Terminal User Interface library
  - Box drawing, tables, scrolling, keyboard navigation
  - Session picker TUI implementation
  - MCP manager interactive UI
  - **CRITICAL LIMITATION:** Cannot be bundled into a compiled binary due to dynamic require() calls and runtime terminal capability detection

- **node-pty** (^1.0.0)
  - Pseudo-terminal support for spawning interactive shells
  - Used in web server for terminal emulation
  - Enables remote Claude Code session access
  - Cross-platform PTY support (macOS, Linux, Windows)

### Authentication & Security

- **bcrypt** (^6.0.0) + **@types/bcrypt** (^6.0.0)
  - Password hashing for web server authentication
  - Salt rounds configured for bcrypt operations
  - Used to securely store server password hashes

- **crypto** (Node.js built-in)
  - HMAC for JWT-like token signing
  - RandomBytes for token generation
  - Encryption utilities for authentication

- **ws** (^8.19.0) + **@types/ws** (^8.18.1)
  - WebSocket server implementation
  - Real-time client communication in web server
  - Session streaming and terminal I/O

### Push Notifications

- **web-push** (^3.6.7) + **@types/web-push** (^3.6.4)
  - Web Push API support for push notifications
  - VAPID key management
  - Push subscription handling
  - Used in remote web server for client notifications

## Build Configuration

### TypeScript Configuration (tsconfig.json)
- **Compiler Options:**
  - Target: ESNext
  - Module: ESNext
  - Module Resolution: bundler (Bun-optimized)
  - Strict mode enabled
  - JSON module resolution for config files
  - Isolated modules for better bundling
  - Absolute path aliases for imports

- **Source:** `src/**/*`
- **Exclusions:** `node_modules`, `dist`

### Bun Configuration (bunfig.toml)
- **Test Settings:**
  - Coverage disabled
  - Coverage directory: `coverage/`
  - Fast test execution

- **Install:**
  - Auto fallback for missing packages

### Package Configuration (package.json)
- **Version:** 1.0.1
- **Type:** Module (ES modules)
- **Bin Entries:**
  - `claudectl` → `./dist/claudectl`
  - `ccl` → `./dist/claudectl` (alias)

- **Scripts:**
  - `dev` - Run CLI from source: `bun run src/index.ts`
  - `build` - Compile to binary: `bun build src/index.ts --compile`
  - `typecheck` - Type validation: `tsc --noEmit`
  - `test` - Run all tests: `bun test`
  - `test:watch` - Watch mode testing: `bun test --watch`

## Project Structure

```
src/
├── index.ts                 # Entry point (shebang: #!/usr/bin/env bun)
├── cli.ts                   # Commander program setup and all CLI commands
├── core/                    # Core business logic modules
│   ├── config.ts           # Claude Config paths, env var handling
│   ├── config.test.ts      # Config unit tests
│   ├── sessions.ts         # Session discovery, parsing, launching
│   ├── sessions.test.ts    # Session tests
│   ├── search-index.ts     # SQLite FTS5 index for fast search
│   ├── search-index.test.ts
│   ├── mcp.ts              # MCP configuration management
│   ├── mcp.test.ts
│   ├── backup.ts           # Session backup/restore functionality
│   ├── backup.test.ts
│   ├── title-generator.ts  # Session renaming
│   └── title-generator.test.ts
├── server/                  # Web server for remote access
│   ├── index.ts            # Bun.serve() HTTP + WebSocket server
│   ├── auth.ts             # Password hashing, JWT, VAPID keys
│   ├── push.ts             # Web Push notification system
│   ├── session-manager.ts  # PTY management and terminal I/O
│   └── web/                # Static web client (HTML, CSS, JS)
├── ui/                      # Terminal UI components (blessed)
│   ├── session-picker.ts   # Interactive session selection
│   ├── new-project.ts      # New project wizard
│   ├── new-project.test.ts
│   └── mcp-manager.ts      # MCP interactive manager
├── utils/                   # Utility modules
│   ├── paths.ts            # Path encoding/decoding (cross-platform)
│   ├── paths.test.ts
│   ├── jsonl.ts            # JSONL parsing and metadata extraction
│   ├── jsonl.test.ts
│   └── format.ts           # Date/time/size formatting
│   └── format.test.ts
├── test-fixtures/          # Test data
│   ├── sessions/           # Sample JSONL session files
│   └── config/             # Sample config files
└── integration.test.ts     # End-to-end integration tests
```

## Database

### SQLite (via bun:sqlite)
- **Location:** `~/.claudectl/search-index.db`
- **Purpose:** Fast session indexing and full-text search cache
- **Tables:**
  - `sessions` - Indexed session metadata
  - `messages` - FTS5 full-text search index
  - `metadata` - Search index metadata (sync state, timestamps)
- **Features:**
  - FTS5 (Full-Text Search 5) with Porter stemming
  - Incremental sync support for performance
  - Fallback to JSONL parsing if index unavailable
  - Used by `search-index.ts` module

### JSONL Source Files
- **Location:** `~/.claude/projects/{encoded-path}/{session-uuid}.jsonl`
- **Format:** One JSON object per line (JSONL)
- **Purpose:** Official source of truth for session data
- **Content:** Session messages with metadata (timestamps, tokens, costs, git branch, model)
- **Parsed by:** `src/utils/jsonl.ts`

### Configuration Files
- **`~/.claude/.claude.json`** - Global MCP servers, OAuth tokens
- **`~/.claude/settings.json`** - Plugins, permissions, hooks
- **`~/.claude/CLAUDE.md`** - Global Claude instructions
- **`~/.claudectl/server-config.json`** - Server password hash, JWT secret, VAPID keys
- **`~/.claudectl/.version`** - Installed version (set by installer)

## Key Patterns & Conventions

### Import System
- Absolute paths with `@/` prefix for imports
- Tree-shaking compatible ES module exports
- No default exports to force named imports

### Configuration Paths
- `getClaudeDir()` - `~/.claude` (can override with `CLAUDE_CONFIG_DIR`)
- `getClaudectlDir()` - `~/.claudectl` (installation directory)
- `getProjectsDir()` - `~/.claude/projects` (session storage)

### Session Discovery
- Default uses SQLite index for speed (10-100x faster)
- Falls back to JSONL parsing if index unavailable
- Session list filtered by message count and agent status by default

### Cross-Platform Support
- Path encoding handles Windows (`C:\Users\...` → `C--Users-...`)
- Line ending normalization in JSONL parsing
- Platform-specific shell detection for update commands (bash vs PowerShell)

## Testing Framework

- **Runner:** Bun's built-in test runner (`bun test`)
- **Test Files:** Co-located with source (`*.test.ts`)
- **Test Types:**
  - Unit tests for utilities (paths, JSONL, format)
  - Integration tests for core modules (sessions, config, search)
  - E2E tests for CLI commands and TUI
- **Configuration:** `bunfig.toml` with coverage settings

## Distribution

### Current Method: Source Distribution
- **Install Script:** `install.sh` (Unix/macOS) and `install.ps1` (Windows)
- **Distribution:** Downloaded to `~/.claudectl/`, runs via `bun run`
- **Versioning:** Version stored in `~/.claudectl/.version`
- **Updates:** `claudectl update` fetches latest from GitHub via API

### Binary Compilation (NOT USED)
- Cannot use `bun build --compile` due to `blessed` library limitations
- Dynamic require() calls in blessed fail when bundled
- Runtime terminal capability detection incompatible with compiled binaries
- Would need to replace blessed with a bundle-compatible UI library

## Development Workflow

1. **Type Checking:** `bun run typecheck`
2. **Development:** `bun run dev` (runs `src/index.ts`)
3. **Testing:** `bun test` or `bun test --watch`
4. **Building:** `bun build src/index.ts --compile --outfile dist/claudectl` (experimental)

## Performance Considerations

- SQLite index vastly faster than JSONL parsing for session discovery
- Lazy initialization of search index (created on first use)
- Incremental sync for index maintenance
- Caching of renamed titles in separate database table
- Session filtering (minimum message count) reduces memory usage
