# UI Expert

> Mental model for TUI (Terminal User Interface) operations in this codebase.
> **Last Updated**: 2026-01-25
> **Expertise Level**: intermediate

## Quick Reference

### Key Files
| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/ui/keybindings.ts` | Single source of truth for all keybindings | Adding/modifying keybindings |
| `src/ui/session-picker.ts` | Main session picker with search | Layout changes, new features |
| `src/ui/create-screen.ts` | Screen factory with DI support | Adding screen options |
| `src/ui/new-project.ts` | New project wizard (create/clone) | Adding project creation options |
| `src/ui/details-panel.ts` | Session details popup | Modifying session preview |
| `src/ui/menu.ts` | Main menu | Adding top-level menu items |
| `src/ui/list.ts` | Reusable list component | List behavior changes |
| `src/test-utils/` | TUI testing infrastructure | Adding test utilities |

### Common Operations
| Operation | How To |
|-----------|--------|
| Add keybinding | Define in `keybindings.ts`, use `widget.key(['key'], handler)` in session-picker.ts |
| Show popup | Create blessed.box with `parent: screen` and high z-index |
| Add wizard step | Increment step counter, hide/show appropriate widgets |
| Modify footer | Update `keybindings.ts` - `keybindings` object and `buildSessionFooter()` |

---

## Architecture Overview

The UI uses the `blessed` library for terminal rendering. All screens are created as blessed screen instances with widgets as children.

### Component Map
```
screen (blessed.screen)
├── mainBox (container with border)
│   ├── header (title, search box)
│   ├── table (session list - blessed-contrib)
│   ├── footer (keybinding hints)
│   └── popups (details panel, help, etc.)
└── overlays (loading spinners, etc.)
```

### Data Flow
1. User input → blessed key handler
2. Handler updates state and/or calls core functions
3. UI re-renders based on new state
4. Screen.render() pushed to terminal

---

## Patterns & Conventions

### Pattern: Neon Theme
**Purpose**: Consistent cyberpunk aesthetic across all UI components
**When to Use**: All UI elements

```typescript
const theme = {
  pink: "#ff00ff",      // Borders, primary accent
  blue: "#00ffff",      // Links, secondary accent
  green: "#00ff00",     // Success, selected items
  yellow: "#ffff00",    // Warnings, highlights
  orange: "#ff8800",    // Secondary highlights
  purple: "#aa88ff",    // Tertiary accent
  muted: "#888888",     // Disabled, less important
  fg: "#ffffff",        // Main text
  selectedBg: "#333333", // Selected row background
  selectedFg: "#00ff00", // Selected row text
};
```

### Pattern: Multi-Step Wizard
**Purpose**: Guide user through complex operations with back/forward navigation
**When to Use**: Operations requiring multiple inputs (new project, MCP setup)

```typescript
let step = 0;

function updateStep() {
  hideAll();
  if (step === 0) {
    stepIndicator.setContent("Step 1: Choose option");
    list1.show();
    list1.focus();
  } else if (step === 1) {
    stepIndicator.setContent("Step 2: Enter details");
    input1.show();
    input1.focus();
  }
  screen.render();
}

// Navigation
list.key(["escape"], () => { step--; updateStep(); });
list.on("select", () => { step++; updateStep(); });
```

### Pattern: Keybinding Footer
**Purpose**: Show available actions at bottom of screen
**When to Use**: Any interactive screen

```typescript
const footer = blessed.box({
  parent: mainBox,
  bottom: 0,
  height: 1,
  content: " {#ff00ff-fg}↑↓{/} Navigate  {#00ff00-fg}↵{/} Select  {#aa88ff-fg}Esc{/} Back",
  tags: true,
});
```

### Pattern: Session Loop (Return to Picker)
**Purpose**: Return to session picker after Claude exits
**When to Use**: Any action that launches Claude

```typescript
// In session-picker.ts - after launching Claude
await launchSession(session, { skipPermissions: settings.skipPermissions, quiet: true });
// Return to session picker after Claude exits
await showSessionPicker(options);
```

**Key implementation details:**
- `launchSession()` returns instead of calling `process.exit()`
- SIGINT is ignored while Claude runs (so Ctrl+C only affects Claude)
- After Claude exits (any method: Ctrl+C, /exit, normal exit), picker reappears

### Pattern: Centralized Session Launch
**Purpose**: ALL session launches go through a single pipeline for consistent flag handling
**When to Use**: Any code that starts Claude

```typescript
// src/core/sessions.ts - launchClaude() is the central function
import { launchClaude } from "../core/sessions";

// For new sessions (no resume)
await launchClaude({
  cwd: projectPath,
  skipPermissions: settings.skipPermissions,
});

// For resuming sessions
await launchClaude({
  cwd: session.workingDirectory,
  resumeSessionId: session.id,
  skipPermissions: settings.skipPermissions,
  prompt: additionalPrompt,  // optional
  quiet: true,               // suppress startup logs (for TUI)
});

// Helper for resuming sessions
await launchSession(session, { skipPermissions, quiet: true });
```

**Key options:**
- `cwd` (required): Working directory to run in
- `resumeSessionId`: Session ID to resume (omit for new sessions)
- `skipPermissions`: Passes `--dangerously-skip-permissions`
- `prompt`: Additional prompt to send after resuming
- `dryRun`: Just return what would happen
- `quiet`: Suppress startup logs (use when caller already logs)

---

## File Locations

### UI Components
- `src/ui/` - All TUI components
  - `session-picker.ts` - Main session picker (296 lines)
  - `new-project.ts` - Project creation wizard (542 lines)
  - `details-panel.ts` - Session preview popup
  - `menu.ts` - Main menu
  - `list.ts` - Reusable list widget

### Tests
- `src/ui/*.test.ts` - Unit tests for UI logic (not rendering)
  - `new-project.test.ts` - Tests folder detection, name sanitization, URL parsing

---

## New Project Wizard (Unified `n` Key)

### Entry Point
- Press `n` in session picker to open unified start menu
- If current session is scratch, shows "Promote to Project" instead

### Options
1. **Quick question** - Start in `~/.claudectl/scratch/` with no git
2. **Clone repo** - Clone from GitHub

### Promote Flow (Scratch Sessions Only)
When on a scratch session, `n` shows promote wizard:
1. Enter project name
2. Creates `~/Code/<name>/`
3. Runs `git init` + `gh repo create --private`
4. Moves session JSONL to new location
5. Updates SQLite index
6. Relaunches Claude in new directory

### GitHub Integration
- Uses `gh repo list` to fetch user's repositories
- Uses `gh repo clone` with git fallback for cloning
- Uses `gh repo create` for new repo creation

### Code Flow
```typescript
// Entry point
showNewProjectWizard({ onComplete, onCancel })

// Mode: new
createProject(parentFolder, projectName, createGitHub, isPrivate, options)
  → mkdir projectPath
  → git init
  → gh repo create (if createGitHub)
  → Bun.spawn(["claude"], { cwd: projectPath })

// Mode: clone
cloneRepo(parentFolder, repoUrl, projectName, options)
  → gh repo clone (with git fallback)
  → Bun.spawn(["claude"], { cwd: projectPath })
```

---

## Gotchas & Edge Cases

### Cross-Platform Considerations
**Windows Support**: Experimental but supported
- Use `homedir()` from `os` module, not `process.env.HOME`
- Use `basename()` from `src/utils/paths.ts` for path splitting (handles both `/` and `\`)
- Use `isWindowsPlatform()` for platform-specific commands
- For shell commands: `cmd /c type` on Windows, `cat` on Unix

### Blessed Cannot Be Compiled
**Symptom**: `bun build --compile` produces broken binary
**Cause**: blessed uses dynamic require() and runtime terminal detection
**Solution**: Distribute as source, run with `bun run`

### Screen Destruction Order
**Symptom**: "Cannot read property of destroyed" errors
**Cause**: Async operations completing after screen.destroy()
**Solution**: Stop all async operations before destroying screen

```typescript
table.key(["S-p"], async () => {
  stopAnimations(); // Stop any intervals
  screen.destroy(); // Then destroy
  await showNewProjectWizard(...);
});
```

### Focus Management
**Symptom**: Key events not firing
**Cause**: Wrong widget has focus
**Solution**: Call `widget.focus()` after showing/hiding

### Form Tab Navigation
**Symptom**: Tab key inserts tab character instead of navigating between fields
**Cause**: textbox with `inputOnFocus: true` captures all keystrokes in edit mode
**Solution**: Use `blessed.form` with `keys: true` as the parent container

```typescript
// CORRECT - Tab navigation works
const form = blessed.form({
  parent: mainBox,
  keys: true,  // Enables Tab/Shift+Tab navigation
}) as blessed.Widgets.FormElement<any>;

const nameInput = blessed.textbox({
  parent: form,  // Parent is the form, not mainBox
  name: "name",  // Required for form to track it
  inputOnFocus: true,
  // ...
});

const descInput = blessed.textbox({
  parent: form,
  name: "desc",
  inputOnFocus: true,
  // ...
});

// Form handles Tab navigation automatically
```

**Key points:**
- All form elements must have `name` attribute
- All form elements must have `parent: form` (not the outer container)
- `keys: true` on the form enables Tab/Shift+Tab navigation
- Form emits "submit" event when Enter is pressed on last field

### SIGINT Handling for Child Processes
**Symptom**: Ctrl+C kills both Claude and claudectl
**Cause**: SIGINT goes to entire process group
**Solution**: Ignore SIGINT while child process runs

```typescript
// In src/core/sessions.ts - launchSession()
const originalSigint = process.listeners("SIGINT");
process.removeAllListeners("SIGINT");
process.on("SIGINT", () => { /* ignore */ });

const proc = Bun.spawn(["claude", ...args], { ... });
await proc.exited;

// Restore handlers
process.removeAllListeners("SIGINT");
for (const listener of originalSigint) {
  process.on("SIGINT", listener as () => void);
}
```

---

## Dependencies

### External
- `blessed`: Terminal UI framework (boxes, lists, inputs)
- `blessed-contrib`: Extended widgets (tables with column formatting)

### Internal
- `src/core/sessions.ts`: Session data for picker
- `src/core/search-index.ts`: FTS5 search for session search

---

## Testing

### How to Test
UI components are split into:
1. **Logic tests** (automated): Pure functions like path sanitization, URL parsing
2. **Visual tests** (manual): Run `bun run src/index.ts` and interact

### Test File
`src/ui/new-project.test.ts` covers:
- Common folder detection
- Project name sanitization (kebab-case conversion)
- Repo URL parsing (HTTPS, SSH, short format)
- GitHub repo list JSON parsing
- Project path construction
- Wizard mode validation
- GitHub creation flag logic

### Manual Testing Checklist
- [ ] Shift+P opens wizard from session picker
- [ ] "Create new project" flow works end-to-end
- [ ] "Clone from GitHub" shows user's repos
- [ ] Manual URL entry works
- [ ] Escape navigates back through steps
- [ ] New Claude session opens in created/cloned folder

---

## Change Log

| Date | Change | Source |
|------|--------|--------|
| 2026-01-07 | Created ui.md expert file | Documentation task |
| 2026-01-07 | Added new-project wizard with clone support | v2.0.10 release |
| 2026-01-07 | Added comprehensive tests for new-project | Testing task |
| 2026-01-09 | Added Windows cross-platform support | Windows compatibility |
| 2026-01-09 | Added session loop (return to picker after Claude exits) | UX improvement |
| 2026-01-09 | Added SIGINT handling for Ctrl+C in child processes | Bug fix |
| 2026-01-12 | Fixed renames not persisting (sync to SQLite index) | Bug fix |
| 2026-01-12 | Added selection state restore after returning from Claude | UX improvement |
| 2026-01-12 | Unified `n` key: Quick question, Clone repo, Promote to project | Feature |
| 2026-01-12 | Removed separate n/N/Shift+P keybindings, consolidated to single `n` | Simplification |
| 2026-01-12 | Added remote web server (`claudectl serve`) with Tokyo Night Storm theme | Feature |
| 2026-01-12 | Added PWA support with push notifications | Feature |
| 2026-01-12 | Added WebSocket-based terminal I/O with xterm.js | Feature |
| 2026-01-15 | Fixed Ctrl+Up/Down scrolling (disable built-in keys, manual handling) | Bug fix |
| 2026-01-15 | Added "OPEN" badge for sessions with running PTY | Feature |
| 2026-01-15 | Fixed WebSocket session spawning (getOrCreateManagedSession before addClient) | Bug fix |
| 2026-01-25 | Added archive sessions feature (`a` to archive, `A` to toggle archive view) | Feature |
| 2026-01-25 | Fixed form Tab navigation using blessed.form with keys: true | Bug fix |
| 2026-01-25 | Added Create Project wizard with template selection | Feature |
| 2026-01-25 | Added CLI aliases (ccln, ccls, cclc, cclr, ccll, cclw) | Feature |
| 2026-01-25 | Added `new` command with `--mode` option for direct mode access | Feature |
| 2026-01-25 | Added `--continue` flag to `sessions launch` for resuming last session | Feature |
| 2026-01-25 | Exported startQuickQuestion, showCreateFlow, showCloneFlow from new-project.ts | Refactor |
| 2026-01-25 | Added uninstall scripts (uninstall.sh, uninstall.ps1) | Feature |
| 2026-01-25 | Created src/ui/keybindings.ts as single source of truth for all keybindings | Refactor |
| 2026-01-25 | Added cclu alias for quick updates | Feature |
| 2026-01-25 | Footer now uses buildSessionFooter() with FooterContext for context-aware generation | Refactor |
| 2026-01-27 | Added centralized `launchClaude()` function for all session launches | Refactor |
| 2026-01-27 | CLI aliases now respect saved skipPermissions setting from SQLite | Bug fix |
| 2026-01-27 | All launch paths (ccls, ccln, cclc, cclr, TUI) use same pipeline | Refactor |

---

## Archive Sessions

### Overview
Sessions can be archived to hide them from the main list without deleting them. This is useful for keeping your session list clean while preserving sessions for future reference.

### Keybindings
- `a` - Archive selected session (in main view) / Restore session (in archive view)
- `A` (Shift+A) - Toggle between main view and archive view

### Implementation
- Archive status stored in SQLite `files` table (`is_archived`, `archived_at` columns)
- Schema version 3 added the archive columns
- `getSessions()` supports `includeArchived` and `archivedOnly` options
- Archive/unarchive via `archiveSession(sessionId)` and `unarchiveSession(sessionId)`

### Visual Indicators
- Title bar shows `[ARCHIVE]` badge when in archive view
- Session count label changes to "archived" in archive view
- Footer shows "Restore" instead of "Archive" in archive view

---

## Remote Web Server

### Overview
The `claudectl serve` command starts a web server that exposes Claude Code sessions via WebSocket, accessible from any device as a PWA.

### Architecture
```
src/server/
├── index.ts              # Bun HTTP + WebSocket server
├── auth.ts               # Password verification, JWT tokens
├── session-manager.ts    # PTY lifecycle, multi-client broadcast
└── push.ts               # Web push notifications

src/web/
├── index.html            # Single page app
├── app.js                # Main app logic with xterm.js
├── styles.css            # Tokyo Night Storm theme
├── service-worker.js     # PWA + push handler
├── manifest.json         # PWA manifest
└── icon.svg              # App icon
```

### Key Components
- **Bun native server**: HTTP + WebSocket in single server
- **node-pty**: Spawns Claude with full TTY support
- **xterm.js**: Terminal emulator in browser
- **JWT auth**: Password-based authentication with 7-day tokens
- **Multi-client**: Multiple browsers can connect to same session
- **Push notifications**: Alerts when Claude needs input

### CLI Commands
```bash
claudectl serve              # Start server on port 3847
claudectl serve --port 4000  # Custom port
claudectl serve --tunnel     # With Cloudflare Tunnel
claudectl serve auth set     # Set password
claudectl serve auth reset   # Reset password
```

---

---

## CLI Aliases

### Overview
Short command aliases for common workflows, installed as wrapper scripts in `~/.bun/bin/`.

**All aliases respect saved settings** (skip-permissions, auto-agent-expert) from SQLite database. The setting toggled with `d` in the TUI applies to all launch methods.

### Available Aliases
| Alias | Command | Action |
|-------|---------|--------|
| `claudectl` / `ccl` | `claudectl` | Open TUI session picker |
| `ccln` | `claudectl new --mode create` | Create new project wizard |
| `ccls` | `claudectl new --mode scratch` | Start scratch session immediately |
| `cclc` | `claudectl new --mode clone` | Clone from GitHub |
| `cclr` | `claudectl sessions launch --continue` | Resume most recent session |
| `ccll` | `claudectl sessions list` | List sessions (text, not TUI) |
| `cclw` | `claudectl serve` | Start web server |

### CLI Override
Use `-s` flag to override skip-permissions for a single command:
```bash
ccls -s          # Scratch with skip-perms (even if setting is off)
ccln -s          # Create with skip-perms
cclr -s          # Resume with skip-perms
```

### Implementation
Aliases are created as wrapper scripts by the installer:
- **Unix**: Bash scripts in `~/.bun/bin/`
- **Windows**: `.cmd` files in `%USERPROFILE%\.bun\bin\`

### Code Changes
- `src/cli.ts`: Added `new` command with `--mode` option, added `--continue` to `sessions launch`
- `src/ui/new-project.ts`: Exported `startQuickQuestion`, `showCreateFlow`, `showCloneFlow`
- `install.sh` / `install.ps1`: Create wrapper scripts for aliases
- `uninstall.sh` / `uninstall.ps1`: Remove wrapper scripts on uninstall

### Uninstall
```bash
# Unix
curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.sh | bash

# Windows
irm https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.ps1 | iex
```

---

## Open Questions

- [ ] Should we add a "recent folders" feature to new project wizard?
- [ ] Consider adding org selection for GitHub repo creation
