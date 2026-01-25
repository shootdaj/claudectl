# Learnings

## 2026-01-25 (Session 4)

### TUI Testing with PassThrough Streams (RECOMMENDED APPROACH)
- **Problem**: Testing blessed TUI apps is hard - PTY timing flaky, CI has no TTY
- **Solution**: Inject PassThrough streams into blessed's screen constructor

```typescript
import { PassThrough } from "stream";
import blessed from "blessed";

const input = new PassThrough();
const output = new PassThrough();

const screen = blessed.screen({
  input,   // Receives keystrokes
  output,  // Captures rendered output
  terminal: "xterm-256color",
});

// Send keystrokes
input.write("j");           // Move down
input.write("\x1b[A");      // Arrow up (escape sequence)

// Capture output
let buffer = "";
output.on("data", (chunk) => {
  buffer += chunk.toString();
});
```

**Why this works:**
1. Tests blessed directly - no PTY abstraction layer
2. Deterministic - no timing issues from process spawning
3. Fast - no subprocess overhead
4. CI-friendly - no TTY requirements

### @types/blessed Bug: Swapped Input/Output Types
- **Issue**: TypeScript types have input/output swapped (bug in @types/blessed)
- **Workaround**: Cast the options object: `{...options} as blessed.Widgets.IScreenOptions`
- Lines 994 and 1000 in node_modules/@types/blessed/index.d.ts have the bug

### Key Escape Sequences for Testing
```typescript
export const Keys = {
  UP: "\x1b[A",      // Arrow up
  DOWN: "\x1b[B",    // Arrow down
  ENTER: "\r",       // Enter/Return
  ESCAPE: "\x1b",    // Escape
  CTRL_C: "\x03",    // Ctrl+C
  j: "j", k: "k",    // vim navigation
  SHIFT_A: "A",      // Shift+A sends uppercase
};
```

### Blessed Output Contains Escape Codes
- Output buffer contains raw ANSI escape sequences, not plain text
- Box content isn't directly in output - blessed uses cursor positioning
- For content verification, use `box.getContent()` instead of checking output buffer
- For output verification, check output length > 0 or look for escape sequences

### Bun Test --ignore Flag Quirks
- `bun test --ignore '**/*.tui.test.ts'` doesn't work as expected
- The glob pattern isn't matched by bun's test runner
- Simpler to just run all tests together: `bun test`

---

## 2026-01-25 (Session 3)

### Centralized Keybindings Pattern
- **Problem**: Keybindings defined in multiple places (footer, help popup, CLI help) leading to inconsistencies
- **Solution**: Created `src/ui/keybindings.ts` as single source of truth

```typescript
// Define all keybindings once
export const keybindings: Record<string, Keybinding> = {
  launch: { key: "↵", label: "Launch", description: "Launch selected session", color: keyColors.action },
  // ...
};

// Context-aware footer generation
export function buildSessionFooter(context: FooterContext): string {
  const keys: string[] = ["launch"];
  if (context.isArchiveView) keys.push("restore");
  else {
    if (context.isScratch) keys.push("promote");
    keys.push("new", "archive");
  }
  keys.push("rename", "search", "mcp", "update", "help", "skipPerms", "agentExpert", "quit");
  return buildFooter(keys, context.settings);
}
```

### Settings Migration: JSON → SQLite
- claudectl settings moved from `~/.claudectl/settings.json` to `index.db` (settings table)
- Schema v4 added `settings` table with key-value structure
- `getClaudectlSettingsPath()` is deprecated
- Always use `loadClaudectlSettings()` which reads from SQLite

### README Accuracy Checklist
When updating README, verify:
1. CLI commands match actual implementation (`ccl backup now` not `ccl backup`)
2. File paths are current (settings.json removed, now in SQLite)
3. Features marked "In Progress" are actually incomplete
4. Aliases listed match what installer creates

---

## 2026-01-25 (Session 2)

### SQLite Data Preservation During Sync/Rebuild (CRITICAL)
- **Problem**: Archive status lost when files change on disk or index rebuilds
- **Root Cause**: `sync()` deletes and recreates rows when mtime/size changes, losing metadata
- **Solution**: Save and restore user metadata (`is_archived`, `archived_at`) during re-indexing

```typescript
// In sync(): preserve state before delete
const preservedState = {
  isArchived: indexed.is_archived === 1,
  archivedAt: indexed.archived_at,
};
this.db.prepare("DELETE FROM files WHERE id = ?").run(indexed.id);
await this.indexFile(diskFile, preservedState);  // Pass to indexFile

// In indexFile(): accept and use preserved state
private async indexFile(fileInfo: FileInfo, preserveState?: {...}) {
  // INSERT includes: is_archived = preserveState?.isArchived ? 1 : 0
}
```

For `rebuild()`: save all archived sessions before wipe, restore after sync.

### GitHub Actions Prerelease Workflow
- Use `prerelease: true` in `softprops/action-gh-release` for feature branches
- Check for tag existence before creating to avoid duplicates
- Sanitize branch names for version suffix: `feature/foo-bar` → `foo-bar`
- Pre-releases skipped by `/releases/latest` API endpoint

### GitHub Branch Protection
- Status check names are **case-sensitive**: "Test" ≠ "test"
- Use `gh api repos/{owner}/{repo}/commits/{sha}/check-runs --jq '.check_runs[].name'` to get exact names
- `strict: false` allows merging without rebasing to latest main first

---

## 2026-01-25

### Blessed Form Tab Navigation (CRITICAL)
- **Problem**: Tab key inserts tab character in textbox instead of navigating to next field
- **Root Cause**: `inputOnFocus: true` makes textbox enter "editing mode" where all keystrokes are captured by internal `_listener`
- **Failed Attempts**:
  - `screen.key(["tab"])` - never fires when textbox has focus
  - `textbox.key(["tab"])` - doesn't work in edit mode
  - Patching `_listener` prototype - too fragile
  - Using `keypress` event - event fires but textbox still processes tab

**Solution**: Use `blessed.form` with `keys: true` as parent:
```typescript
const form = blessed.form({
  parent: mainBox,
  keys: true,  // Enables Tab/Shift+Tab navigation
}) as blessed.Widgets.FormElement<any>;

const nameInput = blessed.textbox({
  parent: form,  // MUST be parent of form, not mainBox
  name: "name",  // REQUIRED for form to track
  inputOnFocus: true,
  // ...
});
```

**Key requirements**:
- All form elements MUST have `name` attribute
- All form elements MUST have `parent: form` (not outer container)
- `keys: true` on form enables Tab/Shift+Tab
- Form emits "submit" event on Enter

### SQLite Schema Migrations
- Use version number in schema (e.g., `PRAGMA user_version = 3`)
- Check version on startup and run migrations sequentially
- Add columns with `ALTER TABLE ... ADD COLUMN ... DEFAULT`
- Always provide defaults for new columns to handle existing rows

---

## 2026-01-13

### Bun Terminal API Bug (Critical)
- **Issue**: Bun's Terminal API has a bug where `terminal.write()` bypasses PTY line discipline
- **Symptom**: Input written to PTY never reaches the underlying process (Claude)
- **GitHub Issue**: https://github.com/oven-sh/bun/issues/25779
- **Workaround**: Use Node.js with `node-pty` instead of Bun's native terminal

### Node.js ESM Compatibility
- **`__dirname` not available**: Use `fileURLToPath(import.meta.url)` + `dirname()`
  ```typescript
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  ```
- **No `require()`**: Must use static imports only, no dynamic `require()` calls
- **better-sqlite3 API differs from bun:sqlite**:
  - `db.query(sql).get()` → `db.prepare(sql).get()`
  - `db.run(sql, [params])` → `db.prepare(sql).run(...params)`

### node-pty spawn-helper
- The `spawn-helper` binary needs execute permissions
- Fix: `chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`
- Also check Bun cache: `~/.bun/install/cache/node-pty@*/prebuilds/*/spawn-helper`

### Hybrid Bun/Node.js Architecture
- Some components work better with Bun (TUI, blessed), others need Node.js (PTY)
- Solution: Main CLI runs on Bun, spawns Node.js subprocess for server
- Use `npx tsx` to run TypeScript with Node.js

---

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
