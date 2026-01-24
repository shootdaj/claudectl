# claudectl - Directory & File Structure

## Repository Layout

```
claudectl/
├── .planning/
│   └── codebase/                   # This documentation
│       ├── ARCHITECTURE.md         # System design and layers
│       └── STRUCTURE.md            # (this file)
│
├── .claude/                        # Claude Code internals
│   ├── commands/                   # Custom CLAUDE.md commands
│   └── CLAUDE.md                   # Global project instructions
│
├── .github/
│   └── workflows/                  # CI/CD automation
│       ├── release.yml             # Auto-release on main push
│       └── test.yml                # Run tests on PR
│
├── docs/                           # User documentation
│   ├── README.md                   # Getting started guide
│   ├── FEATURES.md                 # Feature overview
│   └── CHANGELOG.md                # Release notes
│
├── experts/                        # Agent expertise files
│   ├── sessions.md                 # Session management knowledge
│   └── server.md                   # Server/web architecture
│
├── scripts/                        # Utility scripts
│   ├── install.sh                  # macOS/Linux installer
│   └── install.ps1                 # Windows installer
│
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── cli.ts                      # Command routing (566 lines)
│   ├── server-main.ts              # Server entry point
│   │
│   ├── core/                       # Business logic layer
│   │   ├── config.ts               # Configuration paths (Claude + claudectl)
│   │   ├── config.test.ts          # Config tests
│   │   │
│   │   ├── sessions.ts             # Session discovery & launching (733 lines)
│   │   ├── sessions.test.ts        # Session tests
│   │   │
│   │   ├── search-index.ts         # SQLite indexing & search
│   │   ├── search-index.test.ts    # Search tests
│   │   │
│   │   ├── title-generator.ts      # Session custom titles
│   │   ├── title-generator.test.ts # Title tests
│   │   │
│   │   ├── backup.ts               # Backup/restore functionality
│   │   ├── backup.test.ts          # Backup tests
│   │   │
│   │   ├── mcp.ts                  # MCP server configuration
│   │   └── mcp.test.ts             # MCP tests
│   │
│   ├── ui/                         # Terminal UI layer
│   │   ├── session-picker.ts       # Interactive session list (1,283 lines)
│   │   ├── session-picker.test.ts  # Picker tests
│   │   │
│   │   ├── new-project.ts          # New session wizard
│   │   ├── new-project.test.ts     # Wizard tests
│   │   │
│   │   └── mcp-manager.ts          # MCP configuration UI
│   │
│   ├── server/                     # Remote access layer
│   │   ├── index.ts                # HTTP server & WebSocket (465 lines)
│   │   ├── session-manager.ts      # PTY management
│   │   ├── auth.ts                 # Password & JWT authentication
│   │   └── push.ts                 # Web Push notifications
│   │
│   ├── utils/                      # Shared utilities
│   │   ├── paths.ts                # Path encoding/decoding
│   │   ├── paths.test.ts           # Path tests
│   │   │
│   │   ├── jsonl.ts                # JSONL session parsing
│   │   ├── jsonl.test.ts           # JSONL tests
│   │   │
│   │   ├── format.ts               # Display formatting
│   │   └── format.test.ts          # Format tests
│   │
│   ├── test-fixtures/              # Test data
│   │   ├── sessions/               # Sample .jsonl files
│   │   └── config/                 # Sample config files
│   │
│   ├── web/                        # Web client assets
│   │   ├── manifest.json           # PWA manifest
│   │   ├── index.html              # Web UI entry point
│   │   ├── app.js                  # Web app logic
│   │   └── style.css               # Web styling
│   │
│   └── integration.test.ts         # End-to-end tests
│
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
├── bunfig.toml                     # Bun runtime configuration
└── README.md                       # Project overview
```

---

## Core Module Details

### Entry Points

#### `src/index.ts` (5 lines)
- Shebang: `#!/usr/bin/env bun`
- Imports CLI program and calls `program.parse()`
- Executable via `bun run src/index.ts`

#### `src/cli.ts` (566 lines)
- Commander.js application setup
- Defines all CLI commands and options
- Routes to core/ui/server functions
- Groups commands by category: sessions, index, backup, serve, config, update

**Command Structure:**
```
claudectl                          # Default: show TUI
├── sessions
│   ├── list [options]
│   ├── launch [id] [options]
│   ├── rename <id> <title>
│   ├── stats
│   └── search <query> [options]
├── index
│   ├── stats
│   ├── sync
│   └── rebuild
├── backup
│   ├── now
│   ├── status
│   ├── deleted
│   └── restore [id] [options]
├── serve
│   ├── start [options]
│   └── auth [action]
├── config
└── update [options]
```

#### `src/server-main.ts`
- Alternative entry point for running as server
- Used by deployment/systemd configurations

---

## Core Layer (`src/core/`)

### `config.ts` - Configuration Paths

**Exported Functions:**
- `getClaudeDir()` - `~/.claude` (can be overridden via `CLAUDE_CONFIG_DIR`)
- `getProjectsDir()` - `~/.claude/projects` (where sessions are stored)
- `getGlobalConfigPath()` - `~/.claude.json`
- `getSettingsPath()` - `~/.claude/settings.json`
- `getGlobalClaudeMdPath()` - `~/.claude/CLAUDE.md`
- `getClaudectlDir()` - `~/.claudectl` (claudectl-specific config)
- `getScratchDir()` - `~/.claudectl/scratch` (quick question sessions)
- `loadClaudectlSettings()` - Read app settings
- `saveClaudectlSettings()` - Persist app settings
- `ensureMaxSessionRetention(maxDays)` - Cleanup old sessions
- `isScratchPath(path)` - Check if path is scratch directory

**Interfaces:**
```typescript
interface ClaudectlSettings {
  skipPermissions: boolean;        // Use --dangerously-skip-permissions
  autoAddAgentExpert: boolean;     // Auto-add CLAUDE.md expert
}
```

---

### `sessions.ts` - Session Management (733 lines)

**Core Types:**
- `Session` - Main session interface with metadata
- `DiscoverOptions` - Discovery configuration
- `ContentSearchResult` - Full-text search results

**Session Discovery:**
- `discoverSessions(options?)` - Main entry point
  - Uses SQLite index by default
  - Falls back to file-based if index unavailable
  - Returns sessions sorted by last access time descending

- `discoverSessionsFromIndex(options)` - Fast path (SQLite)
- `discoverSessionsFromFiles(options)` - Slow path (JSONL parsing)

**Session Finding & Launching:**
- `findSession(idOrName)` - Find session by UUID or custom name
- `launchSession(session, options)` - Execute `claude --resume` in correct cwd
  - Options: `{ dryRun?, prompt? }`
  - Returns launch info for verification

**Session Operations:**
- `searchSessions(query, options)` - Full-text search
  - Returns matches across all session content
  - Supports case-sensitive and max results limiting

- `syncIndex()` - Incremental SQLite index update
  - Checks file modification times
  - Only re-parses changed files

- `rebuildIndex()` - Full index reconstruction
  - Deletes and recreates SQLite database
  - Slow but ensures consistency

- `renameSession(id, title)` - User-assigned title
- `archiveSession(id)` / `unarchiveSession(id)` - Hide/show from list
- `moveSession(session, newPath)` - Move to different project
- `deleteSession(id)` - Delete session files

**Metadata Extraction:**
- `formatRelativeTime(date)` - Human-readable time (e.g., "2h ago")

**Performance Notes:**
- `discoverSessions()` with index: <100ms for 1000+ sessions
- File-based discovery: ~5 seconds for same dataset
- Search: <1s for 1000+ sessions with FTS5

---

### `search-index.ts` - SQLite Indexing

**Key Functions:**
- `getSearchIndex()` - Get/create singleton SQLite connection
- `closeSearchIndex()` - Close database
- `syncIndex()` - Incremental update
- `rebuildIndex()` - Full rebuild
- `getIndexStats()` - Get cache stats
- `searchSessionContent(query, options)` - Full-text search

**Database Initialization:**
- Creates `~/.claudectl/sessions.db` if missing
- Three tables: sessions, messages (FTS5), session_titles
- Auto-creates schema on first run

**Index Lifecycle:**
1. Discover session files on disk
2. Check SQLite for matching sessionId
3. Compare file mtime against index
4. Parse JSONL if newer than index entry
5. Insert/update SQLite rows
6. Update FTS5 index for search

**Search Capabilities:**
- Porter stemming (e.g., "running" matches "run")
- Field-aware search (can restrict to user vs assistant messages)
- Ranked results by relevance
- Pagination support

---

### `title-generator.ts` - Custom Titles

**Purpose:**
- Allows users to rename sessions with custom titles
- Persists in SQLite, displayed in UI/CLI

**Functions:**
- `renameSession(id, title)` - Set custom title
- `getRenamedTitle(id)` - Retrieve custom title
- `migrateRenamesToIndex()` - Import from legacy JSON file
- `clearRenameCache()` - No-op (kept for backwards compat)

**Legacy Support:**
- Old renames stored in `~/.claudectl/renamed-sessions.json`
- Auto-migrated to SQLite on first run
- Legacy file can be deleted after migration

---

### `backup.ts` - Backup & Restore

**Backup Mechanism:**
- Single snapshot of `~/.claude/projects/` to `~/.claudectl/backup/sessions/`
- Tracks backup timestamp in `.last-backup` file
- Replaces previous backup entirely

**Functions:**
- `backupSessions()` - Create/update backup
- `getBackupInfo()` - Get last backup timestamp and path
- `getBackupDir()` - Get backup directory path
- `findDeletedSessions()` - List sessions in backup but not on disk
- `restoreSession(id)` - Restore individual session
- `restoreAllSessions()` - Restore all deleted sessions
- `autoBackup(maxAgeHours)` - Periodic backup with age check

**Restore Flow:**
1. User runs `claudectl backup deleted` to see deletable sessions
2. Copies file from `~/.claudectl/backup/sessions/` to `~/.claude/projects/`
3. Updates SQLite index
4. Session reappears in list

---

### `mcp.ts` - MCP Server Management

**Types:**
- `MCPServerStdio` - Command-based MCP (stdio protocol)
- `MCPServerHTTP` - HTTP/SSE-based MCP
- `MCPScope` - "user" (global) | "local" (project) | "project"

**Functions:**
- `loadGlobalConfig()` - Read `~/.claude.json`
- `loadProjectConfig(projectDir)` - Read `.mcp.json` from project
- `loadAllMcps()` - Merge global + local MCPs
- `getMcpsByScope(scope)` - Filter by scope
- `updateMcpConfig(name, server)` - Add/edit MCP
- `removeMcp(name, scope)` - Delete MCP
- `validateMcp(server)` - Type checking

---

## UI Layer (`src/ui/`)

### `session-picker.ts` - Interactive Session List (1,283 lines)

**Primary TUI Component**

**Blessed Widgets Used:**
- `screen` - Main terminal canvas
- `box` - Container for UI sections
- `list` - Selectable session list
- `textbox` - Search input
- `button` - Action buttons
- `log` - Status messages

**Key Functions:**
- `showSessionPicker(options)` - Main entry point
  - Loads sessions from `discoverSessions()`
  - Displays filtered list
  - Handles keyboard input (j/k, /, Enter, etc.)

**Keyboard Commands:**
- `j` / `k` - Navigate up/down
- `/` - Search/filter
- `Enter` - Launch selected session
- `n` - New session (wizard)
- `a` - Archive/unarchive session
- `r` - Rename session
- `p` - Promote (scratch → project)
- `?` - Show help
- `q` - Quit

**Visual Features:**
- Neon color theme (magenta, cyan, green)
- Session metadata columns: title, path, time, message count, tokens, model
- Search highlight
- Git branch indicator
- Token count formatting (K/M suffix)
- Model abbreviation (opus/sonnet/haiku)

**State Management:**
- Selected session index
- Search query state
- Archived/normal view toggle
- Auto-selection on return from Claude

**Event Handling:**
```typescript
screen.key(['j', 'down'], () => moveSelection(+1))
screen.key(['k', 'up'], () => moveSelection(-1))
screen.key(['/', 'c-f'], () => focusSearch())
screen.key(['enter'], () => launchSession())
screen.key(['q', 'escape'], () => screen.destroy())
```

---

### `new-project.ts` - New Session Wizard

**Purpose:**
- Guide user through creating new session
- Two flows: scratch (quick question) or clone existing project

**Key Functions:**
- `showNewProjectWizard(options)` - Main entry point
- `showNewSessionMenu(options)` - Simple two-option menu
- `showPromoteFlow(session, options)` - Promote scratch → project
- `fetchGitHubRepos()` - List user's GitHub repos via `gh cli`

**Flows:**
1. **Scratch Session:**
   - Quick question in isolated directory
   - No git repository
   - Sessions stored in `~/.claudectl/scratch/`

2. **Existing Project:**
   - Clone GitHub repo
   - Initialize git
   - Sessions stored in cloned project

3. **Promote Scratch:**
   - Move scratch session to real project
   - Clone repo to chosen location
   - Move session files

---

### `mcp-manager.ts` - MCP Configuration UI

**Features:**
- List global MCPs with connection status
- Add new MCP (interactive form)
- Remove MCP
- Test MCP connection

---

## Server Layer (`src/server/`)

### `index.ts` - HTTP Server (465 lines)

**Bun HTTP Server:**
- Port: 3847 (default, configurable)
- Routes:
  - `/api/*` - REST endpoints
  - `/ws/*` - WebSocket connections
  - Static files - Web UI assets

**REST API Endpoints:**
```
GET  /api/sessions           # List sessions
POST /api/auth              # Authenticate (returns token)
GET  /api/health            # Health check
POST /api/push/subscribe    # Register for push notifications
DELETE /api/push/:id        # Unsubscribe from push
```

**WebSocket Routes:**
```
WS /ws/session/:sessionId
```

**Authentication:**
- Password check on server start
- Token-based session access
- Encrypted cookies for browser

**WebSocket Protocol:**
Messages are JSON objects:
```typescript
// Client to Server
{ type: "input", data: "command text" }
{ type: "resize", cols: 120, rows: 30 }
{ type: "spawn", cols: 120, rows: 30 }

// Server to Client
{ type: "output", data: "terminal output" }
{ type: "status", data: "active|inactive" }
```

---

### `session-manager.ts` - PTY Management

**Purpose:**
- Manage PTY processes for remote sessions
- Route I/O between WebSocket clients and PTY

**Key Functions:**
- `getOrCreateManagedSession(sessionId)` - Get or create session object
- `spawnPty(managed, cols, rows)` - Launch Claude process
- `sendInput(sessionId, data)` - Send stdin to PTY
- `resizePty(sessionId, cols, rows)` - Handle terminal resize
- `addClient(sessionId, ws)` - Add WebSocket client
- `removeClient(sessionId, ws)` - Remove WebSocket client
- `cleanup()` - Kill all PTYs on shutdown

**Managed Session:**
```typescript
interface ManagedSession {
  id: string;
  session: Session;
  pty: IPty | null;              // node-pty instance
  clients: Set<WebSocket>;       // Connected clients
  scrollback: string;            // 50KB output buffer
  isActive: boolean;             // PTY running
}
```

**PTY Spawning:**
```bash
# In working directory
claude --resume sessionId
```

---

### `auth.ts` - Authentication

**Password Management:**
- Bcrypt hashing (10 rounds)
- Stored in `~/.claudectl/server-config.json`
- Interactive setup via `claudectl serve auth set`

**JWT Tokens:**
- Simple HMAC-based tokens
- Secret stored in server config
- Tokens passed in Authorization header

**VAPID Keys (Web Push):**
- Generate on first server start
- Used for push notifications
- Allows web client to subscribe

**Functions:**
- `setPassword(password)` - Hash and store password
- `isPasswordSet()` - Check if server configured
- `authenticate(password)` - Verify login
- `verifyToken(token)` - Check JWT validity
- `savePushSubscription(subscription)` - Store push endpoint
- `getVapidKeys()` - Get push keys
- `interactivePasswordSetup()` - CLI setup flow

---

### `push.ts` - Web Push Notifications

**Purpose:**
- Send push notifications to web client when session output arrives
- Uses Web Push standard with VAPID

**Functions:**
- `initWebPush()` - Initialize web-push library
- `sendPushNotification(payload)` - Send notification
- `getPublicVapidKey()` - Get key for client
- `updatePushSubscription(subscription)` - Store client subscription

**Use Cases:**
- Session becomes active/inactive
- New output arrives (if idle)
- Session error occurs

---

## Utility Layer (`src/utils/`)

### `paths.ts` - Path Encoding/Decoding

**Critical for Claude Code Integration**

Claude Code encodes filesystem paths as directory names:
- `/` becomes `-`
- `.` in folder names becomes `-`
- Windows drives preserved: `C:` → `C-`

**Functions:**
- `encodePath(path)` - Filesystem path → encoded directory name
- `decodePath(encoded)` - Encoded directory → filesystem path
- `shortenPath(path)` - `/Users/...` → `~/...`
- `basename(path)` - Extract last component
- `expandHomePath(path)` - Replace `~` with home directory

**Edge Cases Handled:**
- Hyphenated folder names (ambiguous decoding)
- Hidden directories (`/.claudectl` → `--claudectl`)
- Windows vs Unix path separators
- UNC paths (`\\server\share`)

**Example:**
```typescript
encodePath("/Users/anshul/Code/myapp")
  // → "-Users-anshul-Code-myapp"

decodePath("-Users-anshul-Code-myapp")
  // → "/Users/anshul/Code/myapp"
```

---

### `jsonl.ts` - JSONL Session Parsing

**Session File Format:**
- One JSON object per line (JSONL)
- Each line is a message in conversation
- Types: user, assistant, summary, internal

**Functions:**
- `parseJsonl(filePath)` - Read and parse file
- `parseJsonlText(text)` - Parse string (for testing)
- `parseSessionMetadata(filePath)` - Extract metadata only
- `extractMetadata(messages)` - Compute metadata from messages
- `getMessageContent(message)` - Extract text content
- `getMessageModel(message)` - Extract model name
- `countTokens(messages)` - Sum token usage

**Metadata Extracted:**
- Created timestamp (first message)
- Last accessed timestamp (last message)
- Message type counts (user, assistant)
- Token usage (input + output)
- Model name
- Git branch (if present)
- Session slug (auto-generated name)

**Message Types:**
- `user` - User messages
- `assistant` - Claude responses
- `summary` - Claude's conversation summary
- Internal types ignored for counts

---

### `format.ts` - Display Formatting

**Functions:**
- `formatTokens(n)` - Number → "1K", "5M", etc.
- `formatModelName(model)` - "claude-3-5-sonnet-..." → "son"
- `getTitleWidth(terminalWidth)` - Calculate title column width
- `getMarqueeText(text, width, offset)` - Scrolling text
- `truncateWithEllipsis(text, maxLen)` - Add "…" if too long
- `formatCost(usd)` - Number → "$1.23"
- `formatBytes(bytes)` - Bytes → "2.5 MB"

**Used By:**
- CLI: `sessions list` command
- TUI: Session picker display
- Server: REST API responses

---

## Test Fixtures (`src/test-fixtures/`)

**Purpose:**
- Sample session files for testing without real Claude Code
- Test various edge cases

**Fixtures:**
- Empty sessions (0 messages)
- Sessions with various message counts
- Malformed JSONL (for error handling)
- Different project paths (cross-platform)

---

## Web Client (`src/web/`)

**Files:**
- `index.html` - HTML UI
- `app.js` - JavaScript client logic
- `style.css` - Styling
- `manifest.json` - PWA manifest

**Features:**
- Responsive web UI for desktop/mobile
- WebSocket terminal emulation (xterm.js)
- Push notifications
- Offline support (service worker)

---

## Configuration Files

### `package.json`

**Scripts:**
```json
{
  "dev": "bun run src/index.ts",
  "build": "bun build src/index.ts --compile --outfile dist/claudectl",
  "typecheck": "tsc --noEmit",
  "test": "bun test",
  "test:watch": "bun test --watch"
}
```

**Dependencies:**
- `commander` - CLI parsing
- `blessed` - Terminal UI
- `node-pty` - PTY management
- `bcrypt` - Password hashing
- `web-push` - Push notifications
- `ws` - WebSocket (type defs)
- `picocolors` - Terminal colors

### `tsconfig.json`

- Target: ES2020
- Module: ESNext
- Strict mode enabled
- No implicit any

### `bunfig.toml`

- Runtime settings
- Test configuration
- Module resolution

---

## Naming Conventions

### Files
- Entry points: `index.ts`, `cli.ts`, `server-main.ts`
- Tests: `*.test.ts` (co-located with source)
- Utilities: `src/utils/`
- UI components: `src/ui/`
- Business logic: `src/core/`

### Functions
- Async functions: `async function name()`
- Event handlers: `handle...()`, `on...()`
- Getters: `get...()` or `load...()`
- Setters: `set...()` or `save...()`
- Formatters: `format...()`
- Utilities: `calculate...()`, `parse...()`, etc.

### Variables
- Constants: `UPPER_SNAKE_CASE`
- Module-level: `lowercase`
- Types: `PascalCase` (interfaces, types)
- Private: prefixed with `_` if needed

### Configuration
- Environment variables: `UPPER_SNAKE_CASE`
  - `CLAUDE_CONFIG_DIR` - Override Claude directory
- Config files: lowercase with `.json` extension
  - `.claude.json` - Claude global config
  - `claudectl-settings.json` - claudectl app config
  - `server-config.json` - Server credentials

---

## Finding Specific Functionality

### Session Discovery & Listing
- **File:** `src/core/sessions.ts`
- **Functions:** `discoverSessions()`, `discoverSessionsFromIndex()`, `discoverSessionsFromFiles()`

### Session Launching
- **File:** `src/core/sessions.ts`
- **Function:** `launchSession(session, options)`

### Full-Text Search
- **File:** `src/core/search-index.ts`
- **Function:** `searchSessionContent(query, options)`

### TUI Display
- **File:** `src/ui/session-picker.ts`
- **Function:** `showSessionPicker(options)`

### Web Server
- **File:** `src/server/index.ts`
- **Function:** `startServer(options)`

### Path Encoding/Decoding
- **File:** `src/utils/paths.ts`
- **Functions:** `encodePath()`, `decodePath()`, `shortenPath()`

### JSONL Parsing
- **File:** `src/utils/jsonl.ts`
- **Function:** `parseJsonl()`, `parseSessionMetadata()`

### Session Custom Titles
- **File:** `src/core/title-generator.ts`
- **Function:** `renameSession(id, title)`

### Backup & Restore
- **File:** `src/core/backup.ts`
- **Functions:** `backupSessions()`, `restoreSession()`, `findDeletedSessions()`

### MCP Management
- **File:** `src/core/mcp.ts`
- **Functions:** `loadGlobalConfig()`, `updateMcpConfig()`, `removeMcp()`

### CLI Commands
- **File:** `src/cli.ts`
- **Pattern:** Each command is a `.command()` chain

---

## Database Schema Quick Reference

### SQLite Tables (sessions.db)

**sessions table:**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  filePath TEXT,
  workingDirectory TEXT,
  shortPath TEXT,
  encodedPath TEXT,
  customTitle TEXT,
  firstUserMessage TEXT,
  gitBranch TEXT,
  model TEXT,
  createdAt DATETIME,
  lastAccessedAt DATETIME,
  messageCount INTEGER,
  userMessageCount INTEGER,
  assistantMessageCount INTEGER,
  totalInputTokens INTEGER,
  totalOutputTokens INTEGER,
  isDeleted BOOLEAN,
  isArchived BOOLEAN,
  mtimeMs REAL
)
```

**messages table (FTS5):**
```sql
CREATE VIRTUAL TABLE messages USING fts5(
  sessionId,
  type,
  lineNumber,
  content,
  content=sessions,
  content_rowid=rowid
)
```

**session_titles table:**
```sql
CREATE TABLE session_titles (
  sessionId TEXT PRIMARY KEY,
  title TEXT
)
```

