# Roadmap: Docker Test Sandbox

## Overview

Transform claudectl testing from filesystem-dependent to fully isolated Docker-based testing. Build from foundation (Dockerfile with Bun + isolated paths) through test fixtures (realistic sample data) to complete sandbox modes (clean, pre-populated, shell access) and finally integrate with CI for consistent testing across environments.

## Phases

- [x] **Phase 1: Docker Foundation** - Container builds with Bun and isolated sandbox paths
- [ ] **Phase 2: Test Fixtures** - Realistic sample session data and config files
- [ ] **Phase 3: Docker Services** - Multiple sandbox modes with auto-sync
- [ ] **Phase 4: Test Integration** - E2E tests running in Docker isolation
- [ ] **Phase 5: CI Integration** - CI uses Docker for test consistency with local scripts

## Phase Details

### Phase 1: Docker Foundation
**Goal**: Container builds successfully with Bun runtime and isolated Claude Code directories
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Dockerfile builds without errors using oven/bun base image
  2. Container has isolated /sandbox/.claude/ directory (not touching ~/.claude/)
  3. Container has isolated /sandbox/.claudectl/ directory
  4. Environment variables (CLAUDE_CONFIG_DIR, CLAUDECTL_HOME) redirect to sandbox paths
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md - Create Dockerfile with Bun runtime and sandbox isolation

### Phase 2: Test Fixtures
**Goal**: Repository contains realistic sample data for testing various scenarios
**Depends on**: Nothing (independent of Phase 1)
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. Sample session files exist with realistic JSONL format (user/assistant/summary messages)
  2. Mock .claude.json exists with sample MCP server configurations
  3. At least 2 sample projects with different session characteristics (scratch session, project session)
  4. Fixtures cover edge cases (empty sessions, multi-day conversations, high cost sessions)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Docker Services
**Goal**: Multiple sandbox modes work via docker compose (pre-populated, clean slate, shell access)
**Depends on**: Phase 1 (needs container), Phase 2 (needs fixtures)
**Requirements**: SVC-01, SVC-02, SVC-03, DX-04
**Success Criteria** (what must be TRUE):
  1. Developer can run sandbox service with pre-populated sample data
  2. Developer can run sandbox-clean service with empty tmpfs (first-run testing)
  3. Developer can run sandbox-shell service and get bash prompt in container
  4. Index auto-syncs on first run when starting from empty or fixture data
  5. Docker Compose services defined for all three modes
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Test Integration
**Goal**: E2E tests run in isolated Docker environment via test service
**Depends on**: Phase 3 (needs working sandbox services)
**Requirements**: SVC-04, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. E2E tests can be executed via docker compose up test
  2. Tests run against isolated sandbox (not real ~/.claude/)
  3. Unit tests still run locally with bun test (unchanged workflow)
  4. Test service exits with proper exit codes (0 for pass, non-zero for fail)
  5. Test output is visible in container logs
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: CI Integration
**Goal**: CI and local development use identical Docker test environment
**Depends on**: Phase 4 (needs working test service)
**Requirements**: TEST-03, DX-01, DX-02, DX-03
**Success Criteria** (what must be TRUE):
  1. GitHub Actions workflow runs tests via Docker
  2. bun run sandbox starts sandbox with sample data (npm script)
  3. bun run sandbox:clean starts clean sandbox (npm script)
  4. bun run sandbox:shell opens bash in container (npm script)
  5. CI and local developer experience are identical (same Docker setup)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Docker Foundation | 1/1 | Complete ✓ | 2026-02-04 |
| 2. Test Fixtures | 0/1 | Not started | - |
| 3. Docker Services | 0/1 | Not started | - |
| 4. Test Integration | 0/1 | Not started | - |
| 5. CI Integration | 0/1 | Not started | - |
