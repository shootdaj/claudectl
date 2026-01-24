# claudectl - System Architecture

## Overview

**claudectl** is a global session manager for Claude Code. It provides a unified TUI and REST API for discovering, launching, and managing Claude Code sessions across all projects from a single place.

**Core Technology Stack:**
- **Runtime:** Bun (JavaScript/TypeScript)
- **CLI Framework:** Commander.js
- **TUI:** Blessed (cross-platform terminal UI)
- **Database:** SQLite (via `bun:sqlite`) for session indexing and search
- **Web Server:** Bun.serve() with WebSocket support
- **Terminal Emulation:** node-pty for remote session access

**Codebase Size:** ~9,570 lines of TypeScript across 19 main files (excluding tests)

---

## Architectural Layers

The system is organized into four distinct layers that communicate through well-defined interfaces:

### Layer 1: Entry Points & CLI

**Files:**
- `src/index.ts` - Executable entry point (calls CLI)
- `src/cli.ts` - Command-line interface routing (566 lines)
- `src/server-main.ts` - Server entry point

**Responsibility:**
- Parse command-line arguments using Commander.js
- Route to appropriate command handlers
- Handle version management and updates
- Provide help text and option validation

**Key Commands:**
- Interactive TUI: `claudectl` (default action)
- Session management: `sessions list|launch|rename|stats|search`
- Search index: `index stats|sync|rebuild`
- Backup: `backup now|status|deleted|restore`
- Web server: `serve start|auth`
- Configuration: `config`, `update`

---

### Layer 2: Core Business Logic

**Core Modules:**
- `src/core/config.ts` - Configuration paths and settings
- `src/core/sessions.ts` - Session discovery, launching, metadata (733 lines)
- `src/core/search-index.ts` - SQLite-based session indexing and full-text search
- `src/core/title-generator.ts` - Session custom title management
- `src/core/backup.ts` - Session backup/restore functionality
- `src/core/mcp.ts` - MCP server configuration management

**Key Abstractions:**

#### Session Interface
```typescript
interface Session {
  id: string;                      // UUID (filename without .jsonl)
  title: string;                   // Display title for UI
  slug?: string;                   // Auto-generated name
  workingDirectory: string;        // Decoded path
  shortPath: string;               // Shortened with ~
  encodedPath: string;             // Path-encoded folder name
  filePath: string;                // Full path to .jsonl
  createdAt: Date;                 // Session creation time
  lastAccessedAt: Date;            // Last accessed time
  messageCount: number;            // Total messages
  userMessageCount: number;        // User message count
  assistantMessageCount: number;   // Assistant message count
  gitBranch?: string;              // Git branch at start
  model?: string;                  // Model used
  totalInputTokens: number;        // Input token usage
  totalOutputTokens: number;       // Output token usage
  isDeleted?: boolean;             // Deleted but in index
  isArchived?: boolean;            // Archived (hidden)
  machine: "local";                // For future multi-machine support
}
```

#### Data Flow in Core Layer:

```
Filesystem (~/.claude/projects/)
         ↓
   File Discovery
    (readdir + stat)
         ↓
  JSONL Parsing
 (parseJsonl)
         ↓
  SQLite Index
   (search-index)
         ↓
   Session Objects
    (Cache + Memory)
         ↓
   CLI/UI/Server
```

**Session Discovery Process:**
1. Scans `~/.claude/projects/` for encoded directory names
2. Parses `.jsonl` session files within each directory
3. Extracts metadata (created at, last accessed, message counts)
4. Uses SQLite index for fast lookups (or falls back to file-based)
5. Optionally filters by archived status, minimum message count, etc.

**Search Index (SQLite):**
- FTS5 full-text search for session content
- Session metadata table (id, path, title, timestamps, token counts)
- Session titles table (custom renamed titles)
- Message index for content search
- Incremental sync capability (tracks file timestamps)

**Title Management:**
- User can rename sessions with custom titles
- Titles stored in SQLite `session_titles` table
- Displayed in UI/CLI instead of auto-generated first-message truncation
- Migrates from legacy JSON file on startup

**Backup System:**
- Single snapshot backup of all sessions to `~/.claudectl/backup/sessions/`
- Tracks backup timestamp
- Can restore individual deleted sessions or all at once
- Uses `fs/promises` for async copy operations

---

### Layer 3: User Interface

**TUI Components:**
- `src/ui/session-picker.ts` - Interactive session list with keyboard navigation (1,283 lines)
- `src/ui/new-project.ts` - New session wizard (GitHub clone flow)
- `src/ui/mcp-manager.ts` - MCP server management UI

**TUI Library:** Blessed (cross-platform terminal widget library)

**Session Picker Features:**
- Full-text search filtering
- Keyboard navigation (j/k for up/down, enter to launch)
- Session previews with metadata
- Support for archiving/unarchiving sessions
- Visual indicators for git branches, models, token counts
- Scrolling for large lists
- Custom "neon" color theme

**New Project Wizard:**
- Quick question (scratch) vs. existing project flow
- GitHub repo cloning with `gh cli`
- Interactive folder selection
- Handles both new and existing projects

**Data Flow in UI:**
```
Session Picker
      ↓
(User input: j/k, /, enter, etc.)
      ↓
Event Handlers
      ↓
Core Layer (discoverSessions, launchSession, etc.)
      ↓
Render Updates
      ↓
Terminal Output
```

---

### Layer 4: Server & Remote Access

**Server Components:**
- `src/server/index.ts` - Bun HTTP server with WebSocket support (465 lines)
- `src/server/session-manager.ts` - PTY and WebSocket client management
- `src/server/auth.ts` - Password authentication and JWT tokens
- `src/server/push.ts` - Web Push notification support

**Server Architecture:**

```
HTTP Server (Bun.serve)
    ├── /api/* endpoints
    │   ├── GET /api/sessions - List sessions (JSON)
    │   ├── POST /api/auth - Authenticate
    │   ├── GET /api/health - Health check
    │   └── ...
    │
    ├── /ws/* WebSocket
    │   └── /ws/session/:id - PTY I/O tunnel
    │
    └── Static Files
        └── /index.html, /app.js, etc.
```

**PTY Management:**
- Uses `node-pty` to spawn Claude processes
- One PTY per managed session
- Maintains scrollback buffer (50KB)
- Routes input from WebSocket clients to PTY stdin
- Routes PTY output to all connected clients
- Handles resize events from clients

**Authentication:**
- bcrypt password hashing for server password
- Simple JWT-like tokens for session authentication
- VAPID keys for Web Push notifications
- Config stored in `~/.claudectl/server-config.json`

**WebSocket Protocol:**
```typescript
// Client → Server
{ type: "input", data: "command text" }
{ type: "resize", cols: 120, rows: 30 }
{ type: "spawn", cols: 120, rows: 30 }

// Server → Client
{ type: "output", data: "terminal output" }
{ type: "status", data: "session active|inactive" }
```

---

## Utility Modules

**Path Encoding/Decoding (`src/utils/paths.ts`):**
- Claude Code encodes paths as directory names (slashes → hyphens)
- Example: `/Users/anshul/Code` → `-Users-anshul-Code`
- Supports hidden directories: `/.claudectl` → `--claudectl`
- Windows drives: `C:\Users\...` → `C--Users-...`
- Includes path validation against filesystem to handle ambiguous cases

**JSONL Parsing (`src/utils/jsonl.ts`):**
- Claude stores session transcripts as JSONL (one JSON object per line)
- Extracts metadata: timestamps, message types, token counts, model info
- Handles malformed lines gracefully
- Distinguishes message types: user, assistant, summary, internal

**Formatting (`src/utils/format.ts`):**
- Token count formatting (K/M suffix)
- Model name abbreviation (opus/sonnet/haiku)
- Terminal width-aware text truncation
- Marquee scrolling for long titles
- Byte size formatting (B/KB/MB/GB)

---

## Data Storage & Persistence

### File Structure

```
~/.claude/                          # Claude Code directory
├── projects/                       # All sessions
│   ├── -Users-anshul-Code-myapp/   # Encoded project path
│   │   ├── abc123-def456.jsonl     # Session file (UUID)
│   │   └── xyz789-uvw012.jsonl
│   └── -Users-anshul-Code-backend/
│       └── session-uuid.jsonl
├── .claude.json                    # Global config (MCPs, OAuth)
└── settings.json                   # User settings

~/.claudectl/                       # claudectl-specific
├── .version                        # Current version
├── server-config.json              # Server password, JWT secret, VAPID
├── claudectl-settings.json         # App settings (skip-permissions, etc.)
├── sessions.db                     # SQLite index
├── backup/
│   └── sessions/                   # Backup snapshot
└── scratch/                        # Quick question sessions (no git)
```

### Session File Format (JSONL)

```json
{
  "uuid": "message-uuid",
  "sessionId": "session-uuid",
  "type": "user|assistant|summary",
  "timestamp": "2025-01-25T14:30:00Z",
  "cwd": "/working/directory",
  "version": "1.0.24",
  "gitBranch": "main",
  "slug": "optimized-plotting-pancake",
  "message": {
    "content": "message text",
    "model": "claude-3-5-sonnet-20241022",
    "usage": {
      "input_tokens": 1500,
      "output_tokens": 2000
    }
  }
}
```

### SQLite Database Schema

**sessions table:**
- id (TEXT PRIMARY KEY)
- filePath (TEXT)
- workingDirectory (TEXT)
- shortPath (TEXT)
- encodedPath (TEXT)
- slug (TEXT)
- customTitle (TEXT) - User-renamed title
- firstUserMessage (TEXT)
- gitBranch (TEXT)
- model (TEXT)
- createdAt (DATETIME)
- lastAccessedAt (DATETIME)
- messageCount (INTEGER)
- userMessageCount (INTEGER)
- assistantMessageCount (INTEGER)
- totalInputTokens (INTEGER)
- totalOutputTokens (INTEGER)
- isDeleted (BOOLEAN)
- isArchived (BOOLEAN)
- mtimeMs (REAL) - For sync tracking

**messages table (FTS5):**
- rowid (ROWID)
- sessionId (TEXT)
- type (TEXT) - user|assistant
- lineNumber (INTEGER)
- content (TEXT) - Full-text indexed

**session_titles table:**
- sessionId (TEXT PRIMARY KEY)
- title (TEXT)

---

## Key Design Patterns

### 1. Index-Based Discovery with File Fallback
- Primary: Fast SQLite-based discovery for large session histories
- Fallback: Direct file parsing if index is unavailable
- Maintains compatibility while improving performance

### 2. JSONL as Source of Truth
- SQLite is a cache/index layer, not source of truth
- Session files are immutable after creation
- Allows rebuilding index from scratch if needed
- File timestamps used for incremental syncing

### 3. Lazy Loading
- Session discovery doesn't parse full JSONL content
- Only extracts metadata needed for listing
- Full content search uses index, not disk I/O

### 4. Session Abstraction
- Encodes Claude Code internals (path encoding, JSONL format)
- Presents clean Session interface to UI/CLI
- Handles cross-platform path differences

### 5. Pluggable UI Layer
- Same Core layer serves both TUI and Web Server
- CLI can launch sessions the same way TUI does
- REST API can query sessions identically

---

## Information Flow: Session Launch

```
User selects session in TUI
        ↓
showSessionPicker() (ui/session-picker.ts)
        ↓
launchSession(session) (core/sessions.ts)
        ↓
Bun.spawn(['claude', '--resume', sessionId])
        ↓
  With cwd: session.workingDirectory
        ↓
Claude Code starts in correct project
        ↓
  (stdin/stdout attached to terminal)
```

**Dry Run Mode:**
- Shows what command would run without executing
- Useful for debugging without modifying system

---

## Error Handling Strategy

1. **File I/O:** Uses try-catch, returns empty/fallback values
2. **JSON Parsing:** Skips malformed JSONL lines gracefully
3. **Session Discovery:** Continues if individual files fail
4. **Search Index:** Falls back to file-based search if SQLite unavailable
5. **Server:** Returns HTTP errors with descriptive messages
6. **Terminal UI:** Catches exceptions, displays error dialogs

---

## Performance Considerations

1. **Index Caching:** SQLite index reduces repeated JSONL parsing
2. **Lazy Metadata:** Doesn't load full session content for listing
3. **Incremental Sync:** Only updates changed sessions (file mtime check)
4. **Scrollback Limiting:** PTY keeps only 50KB of output history
5. **FTS5 Optimization:** Uses Porter stemming for better search relevance

**Typical Performance:**
- Session discovery: <100ms (SQLite) vs ~5s (file-based) for 1000+ sessions
- Full-text search: <1s for 1000+ sessions
- Session launch: <50ms (Bun.spawn overhead)
- Server start: <500ms

---

## Extension Points

1. **Commands:** Add new subcommands to `cli.ts`
2. **UI:** Add new blessed screens to `ui/`
3. **Core Logic:** Implement new features in `core/`
4. **Storage:** Custom backend by replacing SQLite with alternative
5. **Server Routes:** Add REST endpoints in `server/index.ts`

---

## Testing Architecture

- Unit tests co-located with source: `*.test.ts`
- Test fixtures in `src/test-fixtures/`
- Bun test runner with native support
- E2E tests use `node-pty` for TUI testing
- Integration tests test full CLI commands

