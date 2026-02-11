# Requirements: claudectl Docker Sandbox

**Defined:** 2026-02-04
**Core Value:** Isolated testing environment that doesn't risk real Claude Code data

## v1 Requirements

### Infrastructure

- [x] **INFRA-01**: Dockerfile builds successfully with Bun + all dependencies
- [x] **INFRA-02**: Container has isolated `/sandbox/.claude/` and `/sandbox/.claudectl/`
- [x] **INFRA-03**: Environment variables redirect paths to sandbox

### Services

- [x] **SVC-01**: `sandbox` service runs with pre-populated sample data
- [x] **SVC-02**: `sandbox-clean` service runs with empty tmpfs (first-run testing)
- [x] **SVC-03**: `sandbox-shell` service provides bash access for debugging
- [x] **SVC-04**: `test` service runs integration/E2E tests in isolation

### Fixtures

- [x] **FIX-01**: Sample session files with realistic JSONL data
- [x] **FIX-02**: Mock `.claude.json` config file
- [x] **FIX-03**: At least 2 sample projects with different session types

### Developer Experience

- [x] **DX-01**: `bun run sandbox` starts sandbox with sample data
- [x] **DX-02**: `bun run sandbox:clean` starts clean sandbox
- [x] **DX-03**: `bun run sandbox:shell` opens bash in container
- [x] **DX-04**: Index auto-syncs on first run (entrypoint script)

### Testing

- [x] **TEST-01**: E2E tests run in Docker via `docker compose up test`
- [x] **TEST-02**: Unit tests remain local (`bun test` unchanged)
- [x] **TEST-03**: CI uses Docker for test consistency

## v2 Requirements

(None — focused milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full VM testing | Overkill — Docker provides sufficient isolation |
| Cloud sandbox (Vercel) | Not needed for local dev/CI |
| memfs/mock-fs | Doesn't catch real filesystem edge cases |
| Windows container support | macOS/Linux priority, Windows can use WSL |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| FIX-01 | Phase 2 | Complete |
| FIX-02 | Phase 2 | Complete |
| FIX-03 | Phase 2 | Complete |
| SVC-01 | Phase 3 | Complete |
| SVC-02 | Phase 3 | Complete |
| SVC-03 | Phase 3 | Complete |
| DX-04 | Phase 3 | Complete |
| SVC-04 | Phase 4 | Complete |
| TEST-01 | Phase 4 | Complete |
| TEST-02 | Phase 4 | Complete |
| TEST-03 | Phase 5 | Complete |
| DX-01 | Phase 5 | Complete |
| DX-02 | Phase 5 | Complete |
| DX-03 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-11 after Phase 5 completion*
