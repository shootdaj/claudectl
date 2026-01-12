# Remote Server Expertise

## Overview
The `claudectl serve` command provides remote web access to Claude Code sessions via WebSocket.

## Key Files

### Server Core
- `src/server/index.ts` - HTTP server, WebSocket handling, API routes
- `src/server/session-manager.ts` - PTY session management, client broadcasting
- `src/server/auth.ts` - bcrypt password hashing, JWT token generation/verification
- `src/server/push.ts` - Web push notifications (VAPID keys)

### Entry Points
- `src/server-main.ts` - Dedicated Node.js entry point for the server
- `src/cli.ts` - CLI integration (spawns Node.js for serve command)

### Web Interface
- `src/web/` - Static files (PWA, xterm.js terminal)

## Critical: Node.js Requirement

**The server MUST run under Node.js, not Bun.**

### Why?
Bun's Terminal API has a bug (GitHub issue #25779) where `terminal.write()` bypasses PTY line discipline. This means input written to the PTY never reaches the underlying process (Claude).

### Implementation
The CLI spawns a Node.js process via `npx tsx`:

```typescript
// In src/cli.ts serve command
const proc = spawn("npx", ["tsx", serverEntryPoint, ...args], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
```

## Dependencies

### Node.js Compatibility
Changed from Bun-specific to Node.js-compatible:
- `bun:sqlite` → `better-sqlite3`
- `Bun.file()` → `fs.readFile()`
- `Bun.password.hash/verify` → `bcrypt`
- `Bun.serve()` → Node.js `http` + `ws` package

### Key Packages
- `node-pty` - Terminal emulation (PTY management)
- `better-sqlite3` - SQLite for search index
- `bcrypt` - Password hashing
- `ws` - WebSocket server
- `web-push` - Push notifications

## PTY Spawning

```typescript
// In session-manager.ts
managed.pty = pty.spawn("claude", ["--resume", managed.id], {
  name: "xterm-256color",
  cols, rows,
  cwd: managed.session.workingDirectory,
  env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
});
```

### spawn-helper Permissions
The `node-pty` package includes a `spawn-helper` binary that needs execute permissions:
```bash
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with password, returns JWT
- `GET /api/auth/status` - Check if password is set

### Sessions
- `GET /api/sessions` - List all sessions (requires auth)

### Push Notifications
- `GET /api/push/vapid-key` - Get VAPID public key
- `POST /api/push/subscribe` - Save push subscription

## WebSocket Protocol

### Connection
```
ws://localhost:3847/ws/session/:sessionId?token=<jwt>
```

### Messages

Client → Server:
```json
{ "type": "input", "data": "hello\n" }
{ "type": "resize", "cols": 120, "rows": 30 }
{ "type": "spawn", "cols": 120, "rows": 30 }
```

Server → Client:
```json
{ "type": "status", "isActive": true, "sessionTitle": "...", "workingDirectory": "..." }
{ "type": "scrollback", "data": "..." }
{ "type": "output", "data": "..." }
{ "type": "exit", "code": 0 }
```

## ES Module Compatibility

### __dirname in ESM
```typescript
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### No CommonJS require()
Static imports only - no `require()` in ESM mode.

## Gotchas

1. **Bun Terminal API Bug** - Input doesn't reach PTY. Must use Node.js + node-pty.

2. **spawn-helper Permissions** - node-pty's spawn-helper needs `chmod +x`.

3. **better-sqlite3 API** - Uses `db.prepare(sql).run()` not `db.run(sql, params)`.

4. **ESM __dirname** - Use `import.meta.url` with `fileURLToPath`.

5. **url.parse Deprecation** - Node.js warns about `url.parse()`. Use WHATWG URL API.

## Testing

### Manual Test
```bash
# Start server
npx tsx src/server-main.ts

# Test API
curl http://localhost:3847/api/auth/status

# Test WebSocket
node -e "const ws = new (require('ws'))('ws://localhost:3847/ws/session/ID?token=TOKEN'); ws.on('open', () => console.log('Connected'));"
```

## Change Log

- 2026-01-13: Fixed dates, verified full terminal I/O working
- 2026-01-13: Initial creation
- 2026-01-13: Migrated from Bun to Node.js due to Terminal API bug
- 2026-01-13: Added better-sqlite3, bcrypt, ws packages for Node.js compatibility
