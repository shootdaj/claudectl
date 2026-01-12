# Learnings

## 2026-01-12

### Session Renames Persistence
- **Issue**: Renames weren't persisting across updates
- **Cause**: Dual storage (JSON file + SQLite) with `renameSession()` only writing to JSON, but `discoverSessions()` reading from SQLite
- **Fix**: Consolidated to SQLite-only storage in `session_titles` table

### Claude Code Skills
- Skills are defined in `~/.claude/commands/*.md`
- Format: YAML frontmatter (`description`, `argument-hint`) + markdown body
- `$ARGUMENTS` placeholder for user arguments
- Skills appear in Skill tool and can be invoked with `/skillname`

### Blessed Keybinding Gotcha
- `table.key(['n'], handler)` captures lowercase only
- `table.key(['S-n'], handler)` for Shift+N
- Footer hints should match actual keybindings exactly

### Bun Native Server + WebSocket
- Bun has built-in HTTP server with WebSocket support
- `Bun.serve()` handles both HTTP and WebSocket in single server
- WebSocket upgrade: `server.upgrade(req, { data: {...} })`
- Password hashing: Use `Bun.password.hash()` instead of bcrypt

### PTY with node-pty
- `node-pty` works with Bun (uses native bindings)
- Set `TERM=xterm-256color` for color support
- Use `pty.onData()` for output, `pty.write()` for input
- `pty.resize(cols, rows)` for terminal resize

### xterm.js Integration
- Load via CDN: xterm.js, xterm-addon-fit, xterm-addon-webgl
- Theme: Pass color object to `new Terminal({ theme: {...} })`
- Fit addon: Call `fitAddon.fit()` on window resize
- WebGL addon: Optional but improves rendering performance

### PWA Icons
- Modern browsers support SVG in manifest.json
- Set `"sizes": "any"` for vector icons
- Some older mobile browsers may need PNG fallback
