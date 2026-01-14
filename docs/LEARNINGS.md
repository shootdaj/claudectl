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

## 2026-01-14

### E2E Testing Rules (CRITICAL)
- **E2E tests must run as a real user would** - launch the actual app, send real keyboard commands
- **DO NOT** just call internal functions or CLI commands as a substitute for real testing
- **DO NOT** write tests that pass without the actual functionality working
- Use `node-pty` to spawn the TUI and send keystrokes:
  ```typescript
  const term = pty.spawn("bun", ["run", "src/index.ts"], {...});
  term.write("j");  // Real keystroke
  term.write("p");  // Real keystroke
  ```
- Use Playwright for web UI testing - actually navigate, click, verify
- After making changes, **actually run the app** and verify behavior matches expectations

### UI/UX Design Principles
- **Show available actions in the footer** - users shouldn't have to guess what keys work
- **Different actions need different keys** - don't conflate unrelated flows:
  - `n` = New session (create something new)
  - `p` = Promote (act on current selection)
  - These are DIFFERENT operations, not variations of the same thing
- **Never remove existing functionality** when adding new features
  - Adding `p Promote` should NOT remove `n New`
- **Context-sensitive UI** - footer should change based on selection:
  - Non-scratch session: show default options
  - Scratch session: show `p Promote` in addition to other options

### Path Encoding for Hidden Directories
- Hidden directories (starting with `.`) use double hyphen: `/.` → `--`
- Example: `~/.claudectl/scratch` → `-Users-anshul--claudectl-scratch`
- The `isScratchPath()` function checks if a path is in the scratch directory
- Session launch must re-decode from `encodedPath` to handle legacy sessions

### bun:sqlite API (NOT better-sqlite3)
- Use `.prepare().run()` not `.run("sql", [params])`
- Use `.prepare().all()` not `.query()`
- Use `.exec()` for raw SQL without parameters
- File size: use `statSync(path).size` not `Bun.file(path).size`

### Key Bindings in Blessed
- `p` key was previously used for "preview" - repurposed for "promote" on scratch sessions
- For non-scratch sessions, `p` still shows preview (backward compatible)
- Footer updates dynamically based on selected session type

### Blessed Ctrl+Arrow Key Handling (CRITICAL)
- **Problem**: `keys: true` and `vi: true` on lists/tables binds up/down keys internally
- Blessed's built-in handlers run regardless of Ctrl modifier
- `return false` does NOT prevent built-in handlers from running
- `screen.on("keypress")` fires but doesn't block element handlers

**Solution**: Disable built-in key handling and implement manually:
```typescript
const table = blessed.list({
  keys: false,  // Disable built-in
  vi: false,    // Disable vi mode
  ...
});

table.on("keypress", (ch, key) => {
  if (key.ctrl && key.name === "up") {
    // Handle Ctrl+Up (e.g., scroll preview)
    return;
  }
  if (key.name === "up" || key.name === "k") {
    // Handle plain Up (navigate table)
    table.select(Math.max(0, table.selected - 1));
  }
});
```

This gives full control over modifier key combinations.
