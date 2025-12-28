# claudectl - Global Claude Code Management Tool

## Project Goal

Build a CLI tool that provides **global management** for Claude Code - managing sessions, MCPs, plugins, and settings across all projects from one place.

**Problem it solves:** Claude Code sessions are organized by folder. Running `claude --resume` only shows sessions from the current directory, making it hard to find and resume sessions from other projects.

## Tech Stack

- **Runtime:** Bun (Claude Code is Bun-based)
- **Language:** TypeScript
- **Distribution:** Source via install script (see Build Limitation below)
- **UI Library:** `blessed` (rich TUI with boxes, tables, scrolling)
- **Styling:** Custom Dark Midnight theme with Nord-inspired colors
- **CLI Parsing:** `commander`
- **Testing:** Bun's built-in test runner (`bun test`)

## Build Limitation

**IMPORTANT:** This project cannot be compiled to a single binary using `bun build --compile`.

The `blessed` library uses dynamic `require()` calls and terminal detection at runtime that fail when bundled into a compiled binary. Attempts to compile result in missing terminal capabilities and broken rendering.

**Current distribution method:** Source distribution via install script. The installer downloads source to `~/.claudectl/` and runs via `bun run`.

If we ever need a compiled binary, we'd need to:
1. Replace `blessed` with a terminal library that supports bundling
2. Or use a different bundler/compilation approach

This limitation was discovered during v1.0.0 development and is why we switched from compiled binary to source distribution.

---

## Testing Requirements

**All code must have tests.** Tests are written alongside implementation and run continuously during development.

### Testing Approach
- Use Bun's built-in test runner (`bun test`)
- Tests live in `src/**/*.test.ts` (co-located with source files)
- Test files mirror their source: `paths.ts` → `paths.test.ts`
- Run tests after implementing each module before moving on

### Test Commands
```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun test src/utils          # Run tests in specific directory
bun test --coverage         # With coverage report
```

### Unit Tests (Automated)
Run with `bun test`. Test pure functions and isolated modules:
- **Utils:** Path encoding/decoding, JSONL parsing, date formatting
- **Core:** Session discovery, config loading (use temp directories/fixtures)
- **Commands:** Output format, error handling (mock dependencies)

### Test Fixtures
Create `src/test-fixtures/` with sample data:
- Sample `.jsonl` session files
- Sample config files (`.claude.json`, `settings.json`)
- Various edge cases (empty files, malformed data)

### E2E Tests (Manual)
These tests depend on actual Claude sessions on the machine. Run manually after each feature:

| Command | What to verify |
|---------|----------------|
| `claudectl sessions list` | Shows sessions from all projects, sorted by recency |
| `claudectl sessions list --json` | Outputs valid JSON with correct structure |
| `claudectl sessions launch <id>` | Opens Claude in the correct working directory |
| `claudectl sessions launch <id> --dry-run` | Shows what would happen without launching |
| `claudectl sessions stats` | Shows accurate cost/usage totals |
| `claudectl mcp list` | Lists all configured MCP servers |
| `claudectl` (no args) | Shows interactive menu |

**Expected behaviors:**
- Commands complete without errors
- Output is properly formatted (colors, tables)
- Session launch opens Claude in correct `cwd`
- `--dry-run` shows intended action without executing
- Invalid session IDs show helpful error messages
- Empty states (no sessions) show friendly message

---

## Claude Code Internals (Research Summary)

### Session Storage

Sessions are stored in `~/.claude/projects/` (can be overridden via `CLAUDE_CONFIG_DIR`).

**Directory structure:**
```
~/.claude/
├── projects/                    # Session transcripts
│   ├── -Users-anshul-Code-myapp/   # Path-encoded directory
│   │   ├── abc123-def456.jsonl     # Session file (UUID)
│   │   └── xyz789-uvw012.jsonl
│   └── -Users-anshul-Code-backend/
│       └── session-uuid.jsonl
├── .claude.json                 # Global MCP servers, OAuth, preferences
└── settings.json                # User settings (permissions, hooks, etc.)
```

**Path encoding:** Forward slashes become hyphens
- `/Users/anshul/Code` → `-Users-anshul-Code`
- To decode: replace leading `-` with `/`, then all `-` with `/`

### Session File Format (JSONL)

Each `.jsonl` file contains one JSON object per line:

```json
{
  "uuid": "message-uuid",
  "parentUuid": "previous-message-uuid",
  "sessionId": "session-uuid",
  "timestamp": "2025-12-20T14:30:00Z",
  "type": "user|assistant|summary",
  "cwd": "/working/directory/path",
  "version": "1.0.24",
  "costUSD": 0.045,
  "message": {
    "content": "message text",
    "tool_use": [...],
    "token_usage": {...}
  }
}
```

**Message types:**
- `user` - User messages
- `assistant` - Claude responses
- `summary` - Compressed conversation summaries

### MCP Configuration

**Global MCPs:** `~/.claude.json`
```json
{
  "mcpServers": {
    "server-name": {
      "type": "http|sse|stdio",
      "url": "https://...",
      "command": "...",
      "args": [],
      "env": {}
    }
  }
}
```

**Project MCPs:** `.mcp.json` in project root (same format)

### Plugin Storage

**User plugins:** `~/.claude/settings.json`
```json
{
  "enabledPlugins": ["plugin-name"],
  "permissions": {...},
  "env": {...},
  "hooks": {...}
}
```

### Launching Sessions

Claude Code has no `--cwd` flag. To launch a session in a specific directory:
```bash
cd /path/to/project && claude --resume session-id
```

Or using Bun/Node:
```typescript
Bun.spawn(['claude', '--resume', sessionId], {
  cwd: workingDirectory,
  stdio: ['inherit', 'inherit', 'inherit'],
});
```

### Session Resume Options

```bash
claude --resume                    # Interactive picker
claude --resume session-name       # By name
claude --resume abc123-def456      # By UUID
claude --continue                  # Most recent session
claude -r "name" "new prompt"      # Resume + add prompt
```

---

## Features to Implement

### 1. Session Management (Highest Priority)
- **List all sessions globally** with metadata (name, directory, last used, cost)
- **Interactive session picker** with keyboard navigation
- **Launch session** in correct working directory
- **Rename sessions** without entering Claude
- **Export to Markdown** for sharing
- **Search across sessions** by content
- **Usage stats** (tokens, costs, activity)
- **Cleanup old sessions**

### 2. MCP Management
- List global MCPs with connection status
- Add MCP (interactive form for http/sse/stdio)
- Remove MCP
- Edit MCP configuration

### 3. Plugin Management
- List installed/enabled plugins
- Enable/disable plugins
- Show plugin details

### 4. Settings Management
- View/edit `~/.claude/settings.json`
- Manage permissions (allowed/disallowed tools)
- Configure hooks
- Set default model

### 5. CLAUDE.md Management
- View/edit global `~/.claude/CLAUDE.md`

---

## CLI Command Structure

```bash
claudectl                        # Interactive main menu
claudectl new [dir]              # Start new session

# Sessions
claudectl sessions               # Interactive session picker
claudectl sessions list          # List all sessions
claudectl sessions launch [id]   # Launch specific session
claudectl sessions rename <id>   # Rename a session
claudectl sessions export <id>   # Export to markdown
claudectl sessions search <q>    # Search sessions
claudectl sessions stats         # Usage statistics
claudectl sessions clean         # Cleanup old sessions

# MCPs
claudectl mcp                    # Interactive MCP manager
claudectl mcp list               # List all MCPs
claudectl mcp add                # Add MCP (interactive)
claudectl mcp remove <name>      # Remove MCP
claudectl mcp edit <name>        # Edit MCP

# Plugins
claudectl plugins                # Interactive plugin manager
claudectl plugins list           # List plugins
claudectl plugins enable <name>  # Enable plugin
claudectl plugins disable <name> # Disable plugin

# Config
claudectl settings               # View/edit settings
claudectl claude-md              # View/edit CLAUDE.md
claudectl config                 # Show all config paths
```

---

## Project Structure

```
claudectl/
├── src/
│   ├── index.ts                 # Entry point, main menu
│   ├── cli.ts                   # CLI argument parsing (commander)
│   ├── commands/
│   │   ├── sessions/
│   │   │   ├── list.ts
│   │   │   ├── launch.ts
│   │   │   ├── rename.ts
│   │   │   ├── export.ts
│   │   │   ├── search.ts
│   │   │   ├── stats.ts
│   │   │   └── clean.ts
│   │   ├── mcp/
│   │   │   ├── list.ts
│   │   │   ├── add.ts
│   │   │   ├── remove.ts
│   │   │   └── edit.ts
│   │   ├── plugins/
│   │   │   ├── list.ts
│   │   │   ├── enable.ts
│   │   │   └── disable.ts
│   │   ├── settings/
│   │   │   ├── view.ts
│   │   │   └── edit.ts
│   │   └── claude-md/
│   │       ├── view.ts
│   │       └── edit.ts
│   ├── core/
│   │   ├── config.ts            # Config paths, env vars
│   │   ├── config.test.ts       # Tests for config
│   │   ├── sessions.ts          # Session discovery & parsing
│   │   ├── sessions.test.ts     # Tests for sessions
│   │   ├── mcp.ts               # MCP config management
│   │   ├── plugins.ts           # Plugin management
│   │   └── settings.ts          # Settings management
│   ├── ui/
│   │   ├── menu.ts              # Main interactive menu
│   │   ├── session-picker.ts    # Session selection UI
│   │   ├── table.ts             # Table rendering
│   │   └── spinner.ts           # Loading states
│   ├── utils/
│   │   ├── paths.ts             # Path encoding/decoding
│   │   ├── paths.test.ts        # Tests for paths
│   │   ├── jsonl.ts             # JSONL parsing
│   │   ├── jsonl.test.ts        # Tests for JSONL
│   │   └── format.ts            # Date/size formatting
│   └── test-fixtures/           # Test data
│       ├── sessions/            # Sample session files
│       └── config/              # Sample config files
├── package.json
├── tsconfig.json
├── bunfig.toml
└── README.md
```

---

## Core Types

```typescript
interface Session {
  id: string;                    // UUID
  name?: string;                 // Human-readable name (if renamed)
  workingDirectory: string;      // Original cwd (decoded path)
  encodedPath: string;           // Path-encoded directory name
  filePath: string;              // Full path to .jsonl file
  createdAt: Date;
  lastAccessedAt: Date;
  messageCount: number;
  totalCostUSD: number;
  model?: string;
  gitBranch?: string;
}

interface MCPServer {
  name: string;
  type: 'http' | 'sse' | 'stdio';
  url?: string;                  // For http/sse
  command?: string;              // For stdio
  args?: string[];
  env?: Record<string, string>;
}

interface SessionMessage {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'summary';
  cwd: string;
  costUSD?: number;
  message: {
    content: string;
    tool_use?: any[];
  };
}
```

---

## Key Implementation Snippets

### Path Encoding/Decoding
```typescript
export function encodePath(p: string): string {
  return p.replace(/\//g, '-');
}

export function decodePath(encoded: string): string {
  // -Users-anshul-Code → /Users/anshul/Code
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}
```

### Session Discovery
```typescript
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export async function discoverSessions(): Promise<Session[]> {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const projectsDir = join(claudeDir, 'projects');

  const sessions: Session[] = [];
  const encodedDirs = await readdir(projectsDir);

  for (const encodedDir of encodedDirs) {
    const dirPath = join(projectsDir, encodedDir);
    const files = await readdir(dirPath);

    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        const sessionId = file.replace('.jsonl', '');
        const filePath = join(dirPath, file);
        const meta = await parseSessionMetadata(filePath);

        sessions.push({
          id: sessionId,
          workingDirectory: decodePath(encodedDir),
          encodedPath: encodedDir,
          filePath,
          ...meta,
        });
      }
    }
  }

  return sessions.sort((a, b) =>
    b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()
  );
}
```

### JSONL Parsing
```typescript
export async function parseSessionMetadata(filePath: string) {
  const file = Bun.file(filePath);
  const text = await file.text();
  const lines = text.trim().split('\n').filter(Boolean);

  if (lines.length === 0) {
    return { createdAt: new Date(), lastAccessedAt: new Date(), messageCount: 0, totalCostUSD: 0 };
  }

  const firstMsg = JSON.parse(lines[0]);
  const lastMsg = JSON.parse(lines[lines.length - 1]);

  let totalCost = 0;
  for (const line of lines) {
    const msg = JSON.parse(line);
    totalCost += msg.costUSD || 0;
  }

  return {
    createdAt: new Date(firstMsg.timestamp),
    lastAccessedAt: new Date(lastMsg.timestamp),
    messageCount: lines.length,
    totalCostUSD: totalCost,
    cwd: firstMsg.cwd,
    name: firstMsg.sessionName, // If session was renamed
  };
}
```

### Session Launch
```typescript
export async function launchSession(session: Session, newPrompt?: string) {
  const args = ['--resume', session.id];
  if (newPrompt) {
    args.push(newPrompt);
  }

  const proc = Bun.spawn(['claude', ...args], {
    cwd: session.workingDirectory,
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  await proc.exited;
}
```

---

## Interactive UI Examples

### Main Menu
```
┌  claudectl - Claude Code Manager
│
◆  What would you like to do?
│  ● Resume session
│  ○ New session
│  ○ Manage MCPs
│  ○ Manage plugins
│  ○ Settings
│  ○ CLAUDE.md
│  ○ Exit
└
```

### Session Picker
```
┌  Select a session
│
│  Search: [_______________]
│
│  ┌────────────────────────────────────────────────────┐
│  │ ● auth-refactor          ~/Code/myapp     2h ago  │
│  │   fix-typescript-errors  ~/Code/myapp     1d ago  │
│  │   api-redesign           ~/Code/backend   3d ago  │
│  │   untitled               ~/Code/scripts   1w ago  │
│  └────────────────────────────────────────────────────┘
│
│  [P]review  [R]ename  [E]xport  [D]elete  [Enter] Launch
└
```

---

## Dependencies

```json
{
  "name": "claudectl",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "claudectl": "./dist/claudectl"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --compile --outfile dist/claudectl",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:watch": "bun test --watch"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "picocolors": "^1.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

---

## Implementation Order

### Phase 1: Foundation
1. Project setup (package.json, tsconfig.json, bunfig.toml)
2. Core config module (`src/core/config.ts`)
3. Path encoding/decoding utilities (`src/utils/paths.ts`)
4. JSONL parsing utilities (`src/utils/jsonl.ts`)

### Phase 2: Session Management
5. Session discovery and indexing (`src/core/sessions.ts`)
6. Session list command (`src/commands/sessions/list.ts`)
7. Interactive session picker UI (`src/ui/session-picker.ts`)
8. Session launch (`src/commands/sessions/launch.ts`)
9. Session rename
10. Session export to markdown
11. Session search
12. Session stats
13. Session cleanup

### Phase 3: MCP Management
14. MCP config parsing (`src/core/mcp.ts`)
15. MCP list/add/remove/edit commands

### Phase 4: Plugins & Settings
16. Plugin discovery (`src/core/plugins.ts`)
17. Plugin list/enable/disable
18. Settings view/edit
19. CLAUDE.md view/edit

### Phase 5: Polish
20. Main interactive menu (`src/ui/menu.ts`)
21. CLI entry point (`src/cli.ts`, `src/index.ts`)
22. Error handling & edge cases
23. Help text and documentation
24. Binary compilation & testing

---

## Build & Distribution

```bash
# Development
bun run src/index.ts

# Type checking
bun run typecheck

# Build single binary
bun build src/index.ts --compile --outfile dist/claudectl

# Install globally
sudo cp dist/claudectl /usr/local/bin/

# Or link during development
bun link
```

---

## Notes

- The `@clack/prompts` library provides the same visual style as Claude Code's prompts
- Bun's `Bun.spawn` with `cwd` option is perfect for launching Claude in the right directory
- Consider caching session metadata to avoid re-parsing JSONL files on every run
- Session names are stored in the session file metadata, not in a separate index

---

# Agent Expert

You are an **Agent Expert** - you execute AND learn. This behavior is automatic.

## Automatic Behaviors

### Before Any Task

1. Check `experts/` for relevant expertise files
2. If one exists for this domain, read it first
3. Use that knowledge to inform your approach
4. If no expertise file exists and this is a significant domain, create one

### After Making Code Changes

Whenever you modify the codebase, **automatically update the relevant expertise file**:

1. Run `git diff` to see what changed
2. Open the relevant `experts/{domain}.md` file
3. Add any new knowledge:
   - New file locations you created or discovered
   - Patterns you used or discovered
   - Gotchas or edge cases you encountered
   - Corrections to outdated information
4. Update the Change Log section

This happens automatically - no command needed. Every code change is a learning opportunity.

## Expertise Files

Location: `experts/{domain}.md` (e.g., `experts/database.md`, `experts/api.md`)

These are your mental model. They contain:
- File locations and structure
- Patterns and conventions
- Gotchas and edge cases
- Architecture notes

**Important**: The code is the source of truth, not the expertise file. Validate against the codebase.

Template: `experts/_template.md`

## When Updating Expertise

Be concrete:
- Include actual file paths
- Include code examples from what you just built
- Document specific gotchas, not vague warnings
- Remove outdated information

## Optional Commands

These exist for explicit control but aren't required:

- `/init-expert {domain}` - Manually create a new expertise file
- `/plan {task}` - Explicitly plan before building
- `/build` - Explicitly trigger build with auto-learning

Normal conversation flow handles everything automatically.

---

# Agent Expert

You are an **Agent Expert** - you execute AND learn. This behavior is automatic.

## Automatic Behaviors

### Before Any Task

1. Check `experts/` for relevant expertise files
2. If one exists for this domain, read it first
3. Use that knowledge to inform your approach
4. If no expertise file exists and this is a significant domain, create one

### After Making Code Changes

Whenever you modify the codebase, **automatically update the relevant expertise file**:

1. Run `git diff` to see what changed
2. Open the relevant `experts/{domain}.md` file
3. Add any new knowledge:
   - New file locations you created or discovered
   - Patterns you used or discovered
   - Gotchas or edge cases you encountered
   - Corrections to outdated information
4. Update the Change Log section

This happens automatically - no command needed. Every code change is a learning opportunity.

## Expertise Files

Location: `experts/{domain}.md` (e.g., `experts/database.md`, `experts/api.md`)

These are your mental model. They contain:
- File locations and structure
- Patterns and conventions
- Gotchas and edge cases
- Architecture notes

**Important**: The code is the source of truth, not the expertise file. Validate against the codebase.

Template: `experts/_template.md`

## When Updating Expertise

Be concrete:
- Include actual file paths
- Include code examples from what you just built
- Document specific gotchas, not vague warnings
- Remove outdated information

## Optional Commands

These exist for explicit control but aren't required:

- `/init-expert {domain}` - Manually create a new expertise file
- `/plan {task}` - Explicitly plan before building
- `/build` - Explicitly trigger build with auto-learning

Normal conversation flow handles everything automatically.

---

# Agent Expert

You are an **Agent Expert** - you execute AND learn. This behavior is automatic.

## Automatic Behaviors

### Before Any Task

1. Check `experts/` for relevant expertise files
2. If one exists for this domain, read it first
3. Use that knowledge to inform your approach
4. If no expertise file exists and this is a significant domain, create one

### After Making Code Changes

Whenever you modify the codebase, **automatically update the relevant expertise file**:

1. Run `git diff` to see what changed
2. Open the relevant `experts/{domain}.md` file
3. Add any new knowledge:
   - New file locations you created or discovered
   - Patterns you used or discovered
   - Gotchas or edge cases you encountered
   - Corrections to outdated information
4. Update the Change Log section

This happens automatically - no command needed. Every code change is a learning opportunity.

## Expertise Files

Location: `experts/{domain}.md` (e.g., `experts/database.md`, `experts/api.md`)

These are your mental model. They contain:
- File locations and structure
- Patterns and conventions
- Gotchas and edge cases
- Architecture notes

**Important**: The code is the source of truth, not the expertise file. Validate against the codebase.

Template: `experts/_template.md`

## When Updating Expertise

Be concrete:
- Include actual file paths
- Include code examples from what you just built
- Document specific gotchas, not vague warnings
- Remove outdated information

## Optional Commands

These exist for explicit control but aren't required:

- `/init-expert {domain}` - Manually create a new expertise file
- `/plan {task}` - Explicitly plan before building
- `/build` - Explicitly trigger build with auto-learning

Normal conversation flow handles everything automatically.

---

# Agent Expert

You are an **Agent Expert** - you execute AND learn. This behavior is automatic.

## Automatic Behaviors

### Before Any Task

1. Check `experts/` for relevant expertise files
2. If one exists for this domain, read it first
3. Use that knowledge to inform your approach
4. If no expertise file exists and this is a significant domain, create one

### After Making Code Changes

Whenever you modify the codebase, **automatically update the relevant expertise file**:

1. Run `git diff` to see what changed
2. Open the relevant `experts/{domain}.md` file
3. Add any new knowledge:
   - New file locations you created or discovered
   - Patterns you used or discovered
   - Gotchas or edge cases you encountered
   - Corrections to outdated information
4. Update the Change Log section

This happens automatically - no command needed. Every code change is a learning opportunity.

## Expertise Files

Location: `experts/{domain}.md` (e.g., `experts/database.md`, `experts/api.md`)

These are your mental model. They contain:
- File locations and structure
- Patterns and conventions
- Gotchas and edge cases
- Architecture notes

**Important**: The code is the source of truth, not the expertise file. Validate against the codebase.

Template: `experts/_template.md`

## When Updating Expertise

Be concrete:
- Include actual file paths
- Include code examples from what you just built
- Document specific gotchas, not vague warnings
- Remove outdated information

## Optional Commands

These exist for explicit control but aren't required:

- `/init-expert {domain}` - Manually create a new expertise file
- `/plan {task}` - Explicitly plan before building
- `/build` - Explicitly trigger build with auto-learning

Normal conversation flow handles everything automatically.
