# UI Expert

> Mental model for TUI (Terminal User Interface) operations in this codebase.
> **Last Updated**: 2026-01-07
> **Expertise Level**: intermediate

## Quick Reference

### Key Files
| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/ui/session-picker.ts` | Main session picker with search | Adding keybindings, changing layout |
| `src/ui/new-project.ts` | New project wizard (create/clone) | Adding project creation options |
| `src/ui/details-panel.ts` | Session details popup | Modifying session preview |
| `src/ui/menu.ts` | Main menu | Adding top-level menu items |
| `src/ui/list.ts` | Reusable list component | List behavior changes |

### Common Operations
| Operation | How To |
|-----------|--------|
| Add keybinding | Use `widget.key(['key'], handler)` in session-picker.ts |
| Show popup | Create blessed.box with `parent: screen` and high z-index |
| Add wizard step | Increment step counter, hide/show appropriate widgets |

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

## New Project Wizard

### Features
1. **Mode Selection** (Step 0)
   - Create new project
   - Clone from GitHub

2. **Parent Folder Selection** (Step 1)
   - Common folders auto-detected: ~/Code, ~/Projects, ~/Developer, etc.
   - Custom path option

3. **Project Name / Repo Selection** (Step 2)
   - **New mode**: Enter project name (sanitized to kebab-case)
   - **Clone mode**: Select from user's GitHub repos or enter URL manually

4. **GitHub Options** (Step 3, new mode only)
   - Create private repo
   - Create public repo
   - Local git only (no GitHub)

### Keybinding
- `Shift+P` from session picker opens the wizard

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

---

## Open Questions

- [ ] Should we add a "recent folders" feature to new project wizard?
- [ ] Consider adding org selection for GitHub repo creation
