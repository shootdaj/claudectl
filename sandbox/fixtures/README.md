# Test Fixtures for Docker Sandbox

This directory contains mock Claude Code data for testing `claudectl` in isolated Docker containers.

## Purpose

Provides reproducible sample data for Phase 3 (Docker Sandbox Testing) without risking real Claude Code configurations or sessions. These fixtures can be copied into Docker containers to simulate various session types and edge cases.

## Structure

```
sandbox/fixtures/
├── .claude/
│   ├── .claude.json          # Mock MCP server configurations
│   └── projects/             # Sample session directories
│       ├── -sandbox-scratch-session1/
│       │   └── scratch-session.jsonl
│       ├── -Users-dev-webapp/
│       │   ├── project-session.jsonl
│       │   └── empty-session.jsonl
│       └── -Users-dev-api/
│           ├── multiday-session.jsonl
│           └── expensive-session.jsonl
└── README.md                 # This file
```

## Usage with Docker

To test `claudectl` with these fixtures:

```bash
# Copy fixtures into Docker container at /sandbox/.claude/
docker run -v $(pwd)/sandbox/fixtures/.claude:/sandbox/.claude \
  -e CLAUDE_CONFIG_DIR=/sandbox/.claude \
  -e CLAUDECTL_HOME=/sandbox/.claudectl \
  your-image:tag claudectl sessions list
```

Or in Docker Compose:

```yaml
services:
  test:
    image: your-image:tag
    volumes:
      - ./sandbox/fixtures/.claude:/sandbox/.claude:ro
    environment:
      CLAUDE_CONFIG_DIR: /sandbox/.claude
      CLAUDECTL_HOME: /sandbox/.claudectl
```

## Sample Sessions

### 1. Scratch Session (`-sandbox-scratch-session1/scratch-session.jsonl`)
- **Type:** Scratch/quick question session
- **Messages:** 3-4 quick exchanges
- **Features:** No git branch (scratch sessions are temporary)
- **Use case:** Test scratch session detection and display

### 2. Project Session with Tool Use (`-Users-dev-webapp/project-session.jsonl`)
- **Type:** Regular project session
- **Messages:** 8-10 messages including file operations
- **Features:** Git branch, tool_use arrays (Read, Write), file-history-snapshot
- **Use case:** Test normal project workflow, tool use parsing, git integration

### 3. Empty Session (`-Users-dev-webapp/empty-session.jsonl`)
- **Type:** Edge case
- **Messages:** 1 (only file-history-snapshot)
- **Features:** No user/assistant messages
- **Use case:** Test handling of sessions with no conversation

### 4. Multi-day Conversation (`-Users-dev-api/multiday-session.jsonl`)
- **Type:** Long-running session
- **Messages:** 8+ messages spanning 3 days
- **Features:** Summary message (conversation compression), date range
- **Use case:** Test date range display, summary handling

### 5. High-cost Session (`-Users-dev-api/expensive-session.jsonl`)
- **Type:** Resource-intensive session
- **Messages:** 4-6 messages with large token counts
- **Features:** Total cost > $1.00, high input/output tokens, cache usage
- **Use case:** Test cost display formatting, token usage stats

## MCP Configuration (`.claude.json`)

The mock MCP configuration includes:

- **User-scope servers** (`mcpServers`):
  - `filesystem`: stdio server using npx
  - `demo-api`: HTTP server with URL endpoint

- **Project-scope servers** (`projects[path].mcpServers`):
  - `local-db`: Project-specific sqlite server for `/sandbox/myproject`

This structure matches the real Claude Code MCP configuration format and tests all three server types (stdio with command/args, HTTP with URL, project-scoped).

## Maintenance

When updating fixtures:
1. Ensure all `.jsonl` files follow Claude Code's message schema
2. Keep session IDs matching their filename (without .jsonl extension)
3. Maintain realistic token counts and costs
4. Test parsing with `bun -e` scripts before committing
