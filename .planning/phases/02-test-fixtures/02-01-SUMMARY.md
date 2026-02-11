---
phase: 02-test-fixtures
plan: 01
subsystem: testing
tags: [jsonl, fixtures, docker, mcp, test-data]

# Dependency graph
requires:
  - phase: 01-docker-foundation
    provides: Docker container setup with sandbox environment
provides:
  - Mock Claude Code data structure in sandbox/fixtures/
  - 5 sample session fixtures covering all scenarios
  - Mock MCP configuration with user/project scopes
affects: [03-docker-sandbox-e2e, testing, integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [jsonl-fixtures, mock-mcp-config, path-encoding-samples]

key-files:
  created:
    - sandbox/fixtures/.claude/.claude.json
    - sandbox/fixtures/.claude/projects/-sandbox-scratch-session1/scratch-session.jsonl
    - sandbox/fixtures/.claude/projects/-Users-dev-webapp/project-session.jsonl
    - sandbox/fixtures/.claude/projects/-Users-dev-webapp/empty-session.jsonl
    - sandbox/fixtures/.claude/projects/-Users-dev-api/multiday-session.jsonl
    - sandbox/fixtures/.claude/projects/-Users-dev-api/expensive-session.jsonl
    - sandbox/fixtures/README.md
  modified: []

key-decisions:
  - "Used realistic token counts and costs matching Claude Opus/Sonnet pricing"
  - "Created separate project directories to test path encoding (-Users-dev-webapp vs -sandbox-scratch-session1)"
  - "Included tool_use examples (Read/Write) in project session for comprehensive testing"

patterns-established:
  - "Session fixtures follow exact JSONL schema from Claude Code internals"
  - "MCP config matches three-tier architecture (user/local/project scopes)"
  - "Edge cases represented: empty sessions, multi-day gaps, high costs"

# Metrics
duration: 3min
completed: 2026-02-03
---

# Phase 2 Plan 1: Test Fixtures Summary

**Mock Claude Code data structure with 5 realistic session fixtures and MCP configuration for isolated Docker testing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T22:44:53Z
- **Completed:** 2026-02-03T22:47:47Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created complete `.claude/` directory structure with projects and MCP config
- Generated 5 sample sessions: scratch, project with tools, empty, multi-day, expensive
- All fixtures parse as valid JSONL with correct message schema
- README documents usage with Docker volume mounting

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fixture directory structure and mock .claude.json** - `e953177` (chore)
2. **Task 2: Create sample session fixtures covering all scenarios** - `b499837` (chore)

## Files Created/Modified

**Mock Configuration:**
- `sandbox/fixtures/.claude/.claude.json` - Mock MCP servers (stdio + HTTP + project-scoped)
- `sandbox/fixtures/README.md` - Fixture documentation and usage guide

**Session Fixtures:**
- `sandbox/fixtures/.claude/projects/-sandbox-scratch-session1/scratch-session.jsonl` - Quick question scratch session (5 messages, no git)
- `sandbox/fixtures/.claude/projects/-Users-dev-webapp/project-session.jsonl` - Project session with Read/Write tool use (11 messages)
- `sandbox/fixtures/.claude/projects/-Users-dev-webapp/empty-session.jsonl` - Edge case with only file-history-snapshot (1 message)
- `sandbox/fixtures/.claude/projects/-Users-dev-api/multiday-session.jsonl` - Multi-day conversation with summary type (10 messages)
- `sandbox/fixtures/.claude/projects/-Users-dev-api/expensive-session.jsonl` - High-cost session with large token counts (7 messages, >$1 total)

## Decisions Made

**Realistic token counts:** Used actual Claude Opus 4.5 and Sonnet 4 pricing (input/output tokens, cache creation/read) to generate realistic costs:
- Scratch session: ~$0.002 (low usage)
- Project session: ~$0.05 (medium usage with caching)
- Expensive session: >$1.00 (large-scale code analysis)

**Path encoding diversity:** Created sessions in different encoded paths to test decoding logic:
- `-sandbox-scratch-session1` → `/sandbox/scratch-session1`
- `-Users-dev-webapp` → `/Users/dev/webapp`
- `-Users-dev-api` → `/Users/dev/api`

**Tool use representation:** Project session includes actual tool_use arrays with Read/Write operations and tool_result messages to test tool parsing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all JSONL fixtures generated correctly on first attempt and parsed without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 3 (Docker Sandbox E2E):**
- Fixtures can be volume-mounted into Docker containers at `/sandbox/.claude/`
- All 5 scenarios covered: normal, scratch, empty, multi-day, expensive
- MCP config tests all three scopes (user, local, project)
- README provides exact Docker commands for testing

**No blockers or concerns.**

---

## Fixture Details

### Coverage Matrix

| Scenario | Session File | Messages | Features Tested |
|----------|--------------|----------|----------------|
| Scratch | scratch-session.jsonl | 5 | No git branch, quick Q&A |
| Project | project-session.jsonl | 11 | Git branch, tool_use, file-history-snapshot |
| Empty | empty-session.jsonl | 1 | Only snapshot, no conversation |
| Multi-day | multiday-session.jsonl | 10 | Date spans 3 days, summary type |
| Expensive | expensive-session.jsonl | 7 | High tokens (>$1), cache usage |

### Verification Results

```
✓ All 5 sessions parse as valid JSONL
✓ Scratch session has no gitBranch (correct)
✓ Multi-day session has summary type message
✓ MCP config has 2 user servers + 1 project-scoped server
✓ Total message count: 34 across all sessions
```

---
*Phase: 02-test-fixtures*
*Completed: 2026-02-03*
