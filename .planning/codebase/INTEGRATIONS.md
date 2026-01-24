# External Integrations

## Overview
claudectl integrates with Claude Code, GitHub, and web standards to provide a unified session management interface. The app bridges local session storage with remote web access and push notifications.

---

## Claude Code Integration

### Session Storage & Access
**Source:** `~/.claude/projects/` (can be overridden via `CLAUDE_CONFIG_DIR`)

**Integration Points:**
- **Session Discovery** (`src/core/sessions.ts`)
  - Reads from Claude's session directory structure
  - Parses JSONL files to extract session metadata
  - No modification of Claude's files (read-only)

- **Session Launch** (`src/core/sessions.ts` - `launchSession()`)
  - Spawns `claude --resume {sessionId}` command
  - Changes working directory to session's original location
  - Passes through custom prompts with `{sessionId} "prompt text"`
  - Fully inherits terminal I/O (stdin, stdout, stderr)
  - Supports `--dangerously-skip-permissions` flag for scratch sessions

- **Global Configuration Files** (`src/core/config.ts`)
  - `~/.claude/.claude.json` - MCP servers (read-only in claudectl)
  - `~/.claude/settings.json` - Plugins & permissions (read-only in claudectl)
  - `~/.claude/CLAUDE.md` - Global instructions (displayed/editable via claudectl)

### Session File Format (JSONL)
- **Location:** `~/.claude/projects/{encoded-path}/{uuid}.jsonl`
- **Fields Parsed:**
  - `uuid` - Message identifier
  - `sessionId` - Session UUID
  - `timestamp` - ISO 8601 timestamp
  - `type` - Message type: "user" | "assistant" | "summary"
  - `cwd` - Working directory at time of message
  - `version` - Claude Code version
  - `message.content` - Message text
  - `costUSD` - Token cost (summed for total cost)
  - Token usage: `input_tokens`, `output_tokens`
  - Model identifier (e.g., "claude-3-5-sonnet")
  - Git branch (if detected by Claude)
  - Session name/slug (if renamed by Claude)

**Parsing Implementation:** `src/utils/jsonl.ts`

### Claude Code Invocation
- **Command:** `claude --resume {sessionId}`
- **Optional Args:** `--dangerously-skip-permissions` for scratch sessions
- **Process Spawning:** Via `Bun.spawn()` with full terminal inheritance
- **Directory Context:** Changes `process.cwd()` before spawning
- **Signal Handling:** Disables SIGINT forwarding so Claude handles Ctrl+C

---

## GitHub Integration

### Version Management & Updates
**API Endpoint:** `https://api.github.com/repos/shootdaj/claudectl/releases/latest`

**Integration Points:**

- **Update Check** (`src/cli.ts` - `update` command)
  - Fetches latest release tag from GitHub API
  - Compares current version in `~/.claudectl/.version` against latest
  - Returns update availability status
  - `--check` flag for checking without installing
  - `--force` flag to reinstall even if on latest

- **Auto-Update Installation**
  - Unix/macOS: Runs bash script from GitHub main branch
    ```bash
    curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash
    ```
  - Windows: Runs PowerShell script from GitHub main branch
    ```powershell
    irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
    ```
  - Automatic version file update after installation

### Release Workflow
- **No Manual Releases:** All releases are automated via GitHub Actions
- **Trigger:** Push to `main` branch
- **CI Process:**
  1. Runs test suite (`bun test`)
  2. Creates version tag
  3. Publishes GitHub Release
  4. Install scripts updated automatically
- **Warning:** Manual tags will conflict with CI automation

---

## Web Server & Remote Access

### Server Architecture
**Location:** `src/server/` (Bun HTTP server via `Bun.serve()`)

**Startup:** `claudectl serve start --port 3847 [--tunnel]`

#### HTTP Routes
```
GET  /api/auth/login         - Password-based login
POST /api/auth/token         - Get JWT token
GET  /api/sessions           - List all sessions (requires auth)
GET  /api/sessions/{id}      - Get session details
POST /api/sessions/{id}/move - Move session to new directory
WS   /ws/{sessionId}         - Terminal WebSocket stream
GET  /                       - Static web client
GET  /static/*               - Web client assets
```

#### CORS
- Enabled for all origins: `Access-Control-Allow-Origin: *`
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Content-Type, Authorization

### Authentication

**Module:** `src/server/auth.ts`

- **Password-Based:**
  - Hashed with bcrypt (configurable salt rounds)
  - Stored in `~/.claudectl/server-config.json`
  - Interactive setup: `claudectl serve auth set`
  - Reset: `claudectl serve auth reset`

- **JWT Tokens:**
  - Issued after password authentication
  - Signed with HMAC using stored JWT secret
  - Expiry: 7 days by default
  - Stored in `~/.claudectl/server-config.json` as `jwtSecret`
  - Verified on each API request via `Authorization: Bearer {token}` header

- **Server Config File:**
  ```json
  {
    "passwordHash": "bcrypt_hash",
    "jwtSecret": "hmac_secret",
    "vapidPublicKey": "...",
    "vapidPrivateKey": "...",
    "pushSubscriptions": [...]
  }
  ```

### Terminal Streaming (PTY)

**Module:** `src/server/session-manager.ts`

- **Technology:** `node-pty` for pseudo-terminal emulation
- **Protocol:** WebSocket with real-time I/O
- **Features:**
  - Spawn interactive `claude --resume` sessions remotely
  - Terminal resize support (SIGWINCH)
  - UTF-8 text streaming
  - Multiple clients per session (broadcast output)
  - Automatic cleanup on disconnect
  - Support for keyboard input passthrough

- **WebSocket Messages:**
  - Client → Server: User keyboard input (`.write()`)
  - Server → Client: Terminal output (text frames)
  - Both: Terminal resize (`cols`, `rows`)

**Implementation:**
```typescript
// Spawn managed session
const managed = getOrCreateManagedSession(sessionId);
const pty = spawnPty(sessionId, "claude", ["--resume", sessionId]);

// Handle client input
ws.send(data) -> sendInput(sessionId, data)

// Broadcast terminal output
pty.output -> ws.send(output) for all connected clients
```

---

## Push Notifications (Web Push)

**Module:** `src/server/push.ts`

### VAPID Key Management
- **Keys Stored:** `~/.claudectl/server-config.json`
- **Generation:** Automatic on first server start if missing
- **Purpose:** Cryptographic signing of push messages

### Notification API
**Endpoint:** `POST /api/notify` (internal use)

- **Payload:**
  ```typescript
  {
    title: string,
    body: string,
    tag?: string,
    data?: Record<string, unknown>,
    icon: "/icon.svg",
    badge: "/icon.svg"
  }
  ```

- **Delivery:** `web-push` library to all subscribed clients
- **Use Cases:**
  - Session updated notifications
  - Error alerts
  - Session completion notifications

### Subscription Management
- **Endpoint:** `POST /api/notifications/subscribe` (web client)
- **Subscribe:** Client registers browser notification endpoint
- **Unsubscribe:** `POST /api/notifications/unsubscribe`
- **Storage:** Array in `server-config.json` under `pushSubscriptions`
- **Signature:** Each subscription contains `endpoint`, `p256dh`, `auth` keys

---

## Database & Persistence

### SQLite Search Index
**Location:** `~/.claudectl/search-index.db`

**Module:** `src/core/search-index.ts`

**Tables:**
```sql
-- Core session metadata
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  filePath TEXT,
  workingDirectory TEXT,
  shortPath TEXT,
  encodedPath TEXT,
  slug TEXT,
  firstUserMessage TEXT,
  customTitle TEXT,
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
  deletedAt DATETIME,
  isArchived BOOLEAN,
  archivedAt DATETIME
);

-- Full-text search index (FTS5)
CREATE VIRTUAL TABLE messages USING fts5(
  sessionId UNINDEXED,
  type,
  content,
  tokenizer='porter'
);

-- Sync metadata
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Features:**
- FTS5 with Porter stemming for natural language search
- Incremental sync support (tracks file mtimes)
- Session deletion tracking (soft deletes)
- Session archival (hidden from main list)
- Fast queries for discovery and search

### JSONL Source Files
- **Authoritative Source:** All session data stored in JSONL files
- **Database Role:** Cache/index for performance
- **Fallback:** If SQLite index unavailable, falls back to JSONL parsing
- **Sync:** `claudectl index sync` or `claudectl index rebuild`

---

## File System Integration

### Path Encoding (Cross-Platform)
**Module:** `src/utils/paths.ts`

**Problem Solved:** Claude stores sessions by encoded working directory names in `~/.claude/projects/`

**Encoding Rules:**
- Unix/macOS: Slashes become hyphens
  - `/Users/anshul/Code/myapp` → `-Users-anshul-Code-myapp`
- Windows: Drive letter preserved, backslashes/forward slashes become hyphens
  - `C:\Users\anshul\Code\myapp` → `C--Users-anshul-Code-myapp`

**Decoding:** Reverses encoding, handles edge cases with filesystem checks

**Implementation:**
- `encodePath(path: string)` - Converts working directory to folder name
- `decodePath(encoded: string)` - Converts folder name back to working directory
- Regex-based with platform detection

---

## External Services & APIs

### None Currently Integrated
- No third-party cloud storage
- No external analytics (self-hosted by default)
- No paid subscription services
- Only GitHub API for version checking (optional, read-only)

---

## Local System Integration

### Process Management
**Via Bun.spawn():**
- Launch Claude sessions with terminal inheritance
- Run install/update scripts (bash/PowerShell)
- PTY spawning for remote terminal access

**Signal Handling:**
- SIGINT handling in session launcher (lets Claude handle Ctrl+C)
- SIGWINCH for terminal resizing in web server

### File System Access
**Directories:**
- `~/.claude/projects/` - Session files (read-only discovery)
- `~/.claudectl/` - Installation & config (read-write)
- Project roots - Clone or create for new projects

**Permissions:**
- User-scoped configuration (no root required)
- File ownership preservation for sessions

### Environment Variables
- `CLAUDE_CONFIG_DIR` - Override Claude config location (default: `~/.claude`)
- Standard: `HOME`, `PATH`, `TERM`

---

## Summary of Integration Points

| System | Type | Direction | Purpose |
|--------|------|-----------|---------|
| Claude Code | Direct | Read/Write | Session launching, metadata reading |
| GitHub API | HTTP | Read-Only | Version checking, auto-update |
| GitHub Repos | HTTPS | Read-Only | Install/update script fetching |
| SQLite | Local | Read-Write | Search index, metadata caching |
| JSONL Files | Local | Read-Only | Official session data source |
| Web Browsers | WebSocket | Bidirectional | Remote terminal access |
| Web Push API | HTTP | Send-Only | Push notifications to browsers |
| File System | Local | Read-Write | Config/session file I/O |
| Terminal | Local | Bidirectional | User I/O and process spawning |
