# claudectl

## What This Is

A global session manager for Claude Code that provides a unified TUI and CLI for discovering, launching, and managing Claude Code sessions across all projects from one place. Solves the problem of sessions being siloed by directory - `claude --resume` only shows sessions from the current folder.

## Core Value

Users can find and resume any Claude Code session from anywhere, without losing track of their work across projects.

## Requirements

### Validated

- ✓ Session discovery across all projects — existing
- ✓ Interactive TUI session picker with keyboard navigation — existing
- ✓ Session search (full-text search across conversations) — existing
- ✓ Session launch in correct working directory — existing
- ✓ Session renaming without entering Claude — existing
- ✓ Usage statistics (tokens, costs, activity) — existing
- ✓ SQLite-based session indexing for fast search — existing
- ✓ Session backup and restore — existing
- ✓ Web server with remote session access — existing
- ✓ MCP configuration management — existing
- ✓ Scratch sessions (quick questions without a project) — existing
- ✓ Session archiving — existing
- ✓ Configurable scratch folder location — existing

### Active

- [ ] Docker test sandbox for isolated testing
- [ ] Sample session fixtures for testing
- [ ] Multiple sandbox modes (clean slate, sample data)
- [ ] Auto-sync index on first sandbox run

### Out of Scope

- Full VM-based testing — overkill, Docker provides sufficient isolation
- Vercel Sandbox integration — cloud-hosted, not needed for local dev/CI
- memfs/mock-fs approach — doesn't catch real filesystem edge cases

## Context

**Existing codebase:** ~9,570 lines of TypeScript across 19 main files. Well-structured with clear separation between CLI, core logic, UI, and server layers.

**Testing gap:** Currently no isolated environment for testing. Tests run against real filesystem, which risks touching actual Claude Code data.

**CI consideration:** Docker sandbox should work identically in local dev and GitHub Actions.

## Constraints

- **Runtime:** Bun (Claude Code is Bun-based)
- **TUI Library:** blessed (cannot be compiled to binary due to dynamic requires)
- **Distribution:** Source via install script (not compiled binary)
- **Docker base:** oven/bun image for consistency

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Docker over VM | Lightweight, fast startup, CI-compatible | — Pending |
| Fixture-based sample data | Reproducible test scenarios | — Pending |
| Entrypoint auto-sync | First-run experience handles empty index | — Pending |

---
*Last updated: 2026-02-04 after initialization*
