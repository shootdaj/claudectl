# Requirements: claudectl Docker Sandbox

**Defined:** 2026-02-04
**Core Value:** Isolated testing environment that doesn't risk real Claude Code data

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Dockerfile builds successfully with Bun + all dependencies
- [ ] **INFRA-02**: Container has isolated `/sandbox/.claude/` and `/sandbox/.claudectl/`
- [ ] **INFRA-03**: Environment variables redirect paths to sandbox

### Services

- [ ] **SVC-01**: `sandbox` service runs with pre-populated sample data
- [ ] **SVC-02**: `sandbox-clean` service runs with empty tmpfs (first-run testing)
- [ ] **SVC-03**: `sandbox-shell` service provides bash access for debugging
- [ ] **SVC-04**: `test` service runs integration/E2E tests in isolation

### Fixtures

- [ ] **FIX-01**: Sample session files with realistic JSONL data
- [ ] **FIX-02**: Mock `.claude.json` config file
- [ ] **FIX-03**: At least 2 sample projects with different session types

### Developer Experience

- [ ] **DX-01**: `bun run sandbox` starts sandbox with sample data
- [ ] **DX-02**: `bun run sandbox:clean` starts clean sandbox
- [ ] **DX-03**: `bun run sandbox:shell` opens bash in container
- [ ] **DX-04**: Index auto-syncs on first run (entrypoint script)

### Testing

- [ ] **TEST-01**: E2E tests run in Docker via `docker compose up test`
- [ ] **TEST-02**: Unit tests remain local (`bun test` unchanged)
- [ ] **TEST-03**: CI uses Docker for test consistency

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
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| FIX-01 | Phase 2 | Pending |
| FIX-02 | Phase 2 | Pending |
| FIX-03 | Phase 2 | Pending |
| SVC-01 | Phase 3 | Pending |
| SVC-02 | Phase 3 | Pending |
| SVC-03 | Phase 3 | Pending |
| DX-04 | Phase 3 | Pending |
| SVC-04 | Phase 4 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 5 | Pending |
| DX-01 | Phase 5 | Pending |
| DX-02 | Phase 5 | Pending |
| DX-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after roadmap creation*
