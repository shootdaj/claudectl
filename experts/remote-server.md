# Remote Server Expertise

## Overview
The `claudectl serve` command provides remote web access to Claude Code sessions.

**Current Architecture (v1.5)**: Terminal-only web interface using xterm.js with tmux-based PTY synchronization. Works on both desktop and mobile with mobile-friendly input bar.

## Key Files

### Server Core
- `src/server/index.ts` - HTTP server, WebSocket handling, API routes
- `src/server/auth.ts` - bcrypt password hashing, JWT token generation/verification
- `src/server/push.ts` - Web push notifications (VAPID keys)
- `src/server/session-manager.ts` - tmux-based session management (polling, input forwarding)

### Entry Points
- `src/server-main.ts` - Dedicated Node.js entry point for the server
- `src/cli.ts` - CLI integration (spawns Node.js for serve command)

### Web Interface
- `src/web/index.html` - Terminal UI with mobile input bar
- `src/web/app.js` - Client-side JS (WebSocket, xterm.js, mobile input)
- `src/web/styles.css` - Responsive styles with mobile-first design

## Architecture

```
Mac (tmux):  Claude runs in tmux session "claudectl-{8-char-id}"
Web UI:      xterm.js terminal + WebSocket for real-time sync
Mobile:      Same terminal UI + bottom input bar for keyboard input
```

### tmux Integration (Key Innovation)
**node-pty doesn't work with Bun** - callbacks don't fire. We use tmux instead:

1. Claude runs in a detached tmux session
2. Server polls `tmux capture-pane` every 100ms for output
3. Input sent via `tmux send-keys -l` for literal characters

```typescript
// Session naming
function getTmuxSessionName(sessionId: string): string {
  return `claudectl-${sessionId.slice(0, 8)}`;
}

// Start session
tmux new-session -d -s "claudectl-0e2a91cd" -c "/path/to/project" -x 120 -y 30 "claude --resume '0e2a91cd-...'"

// Capture output (polls every 100ms)
tmux capture-pane -t "claudectl-0e2a91cd" -p -S -500

// Send input
tmux send-keys -t "claudectl-0e2a91cd" -l 'user message'
```

### Polling-Based Output Sync
- Server stores `lastCapturedContent` to detect changes
- On change, sends ANSI clear + full new content to client
- Broadcasts to all connected WebSocket clients
- Polling stops when no clients connected, restarts on reconnect

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

```
ws://localhost:3847/ws/session/:sessionId?token=<jwt>
```

### Client → Server
```json
{ "type": "spawn" }           // Start/attach tmux session
{ "type": "input", "data": "text" }  // Send user input
{ "type": "resize", "cols": 120, "rows": 30 }  // Resize terminal
```

### Server → Client
```json
{ "type": "output", "data": "terminal output" }
{ "type": "scrollback", "data": "previous output" }
{ "type": "status", "isActive": true, "sessionTitle": "...", "workingDirectory": "..." }
{ "type": "exit", "code": 0 }
{ "type": "error", "message": "..." }
```

## Mobile UX

### Input Bar
- Bottom-fixed input bar with text field + send button
- Uses `autocorrect="on"` and `autocapitalize="sentences"` for phone keyboard
- Visible on screens <= 768px via CSS media query

### Sidebar Toggle
- Hamburger menu button (mobile-only) shows session sidebar
- Sidebar slides in from left with `transform: translateX()`

### URL-Based Session Selection
Added in app.js to support direct linking:
```javascript
const pathMatch = window.location.pathname.match(/\/session\/([a-f0-9-]+)/);
if (pathMatch) {
  setTimeout(() => selectSession(pathMatch[1]), 500);
}
```

## Session Manager Details

### ManagedSession Structure
```typescript
interface ManagedSession {
  id: string;
  session: Session;           // From core/sessions
  clients: Set<WebSocket>;    // Connected clients
  scrollback: string;         // Output buffer (max 50KB)
  isActive: boolean;          // tmux session running
  pollInterval: ReturnType<typeof setInterval> | null;
  lastCapturedContent: string;  // For diff detection
}
```

### Key Functions
- `getOrCreateManagedSession(sessionId)` - Find or create session
- `spawnPty(managed, cols, rows)` - Start tmux session
- `startPolling(managed)` - Begin capture-pane polling
- `sendInput(sessionId, data)` - Send via tmux send-keys
- `resizePty(sessionId, cols, rows)` - Resize tmux window
- `addClient(sessionId, ws)` - Add WebSocket client + restart polling
- `removeClient(sessionId, ws)` - Remove client + stop polling if empty

## Gotchas

1. **node-pty + Bun**: Doesn't work - use tmux instead. Callbacks never fire.

2. **Polling restart**: When clients reconnect to an active session, need to restart polling (fixed in `addClient()`).

3. **Browser caching**: HTML/JS/CSS must use `no-cache, no-store` headers. Static assets (images) can use longer cache.

4. **Keyboard scrambling**: Playwright's `page.keyboard.type()` can scramble characters when typing to xterm.js. Real user typing works fine.

5. **Input button ID**: It's `#send-input`, not `#send-btn`.

6. **Sidebar on mobile**: Hidden by default, toggle via `#toggle-sidebar` button. Uses `.open` class.

7. **tmux capture-pane**: Use `-S -500` to get last 500 lines. Output is full pane content, not incremental.

## Testing

```bash
# Start server
npx tsx src/server-main.ts

# Test auth
curl http://localhost:3847/api/auth/status

# Login
TOKEN=$(curl -s http://localhost:3847/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"test123"}' | jq -r '.token')

# Check sessions
curl "http://localhost:3847/api/sessions" \
  -H "Authorization: Bearer $TOKEN"
```

### Manual Testing Checklist
1. Desktop: Login → Select session → Terminal renders → Type → Claude responds
2. Mobile: Login → Toggle sidebar → Select session → Terminal renders → Mobile input → Send → Claude responds
3. Reconnect: Disconnect client → Reconnect → Terminal shows scrollback + continues updating

## Change Log

- 2026-01-13: Fixed URL-based session selection for direct mobile linking
- 2026-01-13: Fixed mobile input button ID (#send-input not #send-btn)
- 2026-01-13: Verified bidirectional sync working (browser → tmux, tmux → browser)
- 2026-01-13: Fixed polling restart on client reconnect
- 2026-01-13: Fixed browser cache policy for HTML/JS/CSS
- 2026-01-13: Switched from node-pty to tmux-based session management
- 2026-01-13: Simplified to terminal-only UI (removed chat view)
- 2026-01-13: Initial creation with chat UI concept
