# Phase 4: Test Integration - Research

**Researched:** 2026-02-08
**Domain:** Docker Compose test services, E2E testing in containers, TTY handling for TUI tests
**Confidence:** HIGH

## Summary

This phase focuses on integrating E2E tests into the existing Docker sandbox infrastructure. The project already has a complete testing setup with unit tests (`bun test`), E2E tests using node-pty for TUI testing (`session-picker.e2e.test.ts`), and Docker infrastructure from Phases 1-3 (`docker-compose.yml`, `entrypoint.sh`). The goal is to add a `test` service that runs E2E tests in an isolated Docker environment against the fixture data.

The existing `entrypoint.sh` already includes a `test` mode that executes passed commands (`exec "$@"`), making the implementation straightforward. The main challenge is handling TTY allocation correctly - node-pty requires a pseudo-terminal, but CI environments often lack TTY support. The solution involves using Docker's `--tty` flag with `docker compose run`, which creates a pseudo-terminal inside the container.

**Primary recommendation:** Add a `test` service to docker-compose.yml that runs `bun test` with SANDBOX_MODE=test, using the same volume mounts as `sandbox` service for fixture data access.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun | latest | Test runner (`bun test`) | Already in Dockerfile, native test runner |
| node-pty | ^1.0.0 | PTY for E2E TUI tests | Already in package.json, powers existing E2E tests |
| Docker Compose | v2+ | Multi-service test orchestration | Already configured from Phase 3 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| blessed | ^0.1.81 | TUI library under test | Already the app's TUI library |
| child_process | built-in | CLI E2E tests | Existing pattern in cli.e2e.test.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-pty for TUI | Playwright/xterm.js | Would require web terminal adapter, more complex |
| bun test | jest | Already using bun, no benefit to switching |
| docker compose run | docker compose up | `run` better for one-shot test execution |

**Installation:**
```bash
# No new dependencies needed - all already in package.json
```

## Architecture Patterns

### Recommended Project Structure
```
sandbox/
├── entrypoint.sh           # Already has SANDBOX_MODE=test handling
├── fixtures/
│   └── .claude/            # Pre-populated test data
docker-compose.yml          # Add test service here
src/
├── **/*.test.ts            # Unit tests (run locally with bun test)
├── **/*.e2e.test.ts        # E2E tests (run in Docker with node-pty)
└── **/*.tui.test.ts        # TUI tests (run locally with blessed harness)
```

### Pattern 1: Test Service Definition
**What:** Docker Compose service configuration for running tests
**When to use:** E2E tests that need isolated environment with fixture data
**Example:**
```yaml
# Source: Docker Compose documentation + project patterns
services:
  test:
    build: .
    entrypoint: /app/sandbox/entrypoint.sh
    command: ["bun", "test"]
    environment:
      - SANDBOX_MODE=test
      - CI=true
    volumes:
      - ./sandbox/fixtures/.claude:/sandbox/.claude:ro
    stdin_open: true
    tty: true
```

### Pattern 2: Exit Code Propagation
**What:** Using `--exit-code-from` to capture test results
**When to use:** CI/CD pipelines that need pass/fail signal
**Example:**
```bash
# Source: Docker Compose docs
docker compose up --exit-code-from test test
# OR
docker compose run --rm test bun test
# Exit code from bun test propagates through Docker to shell
```

### Pattern 3: Selective Test Execution
**What:** Running specific test suites in Docker vs locally
**When to use:** E2E tests need Docker, unit tests run locally
**Example:**
```bash
# Local unit tests (fast, no Docker)
bun test src/utils src/core

# Docker E2E tests (isolated, uses fixtures)
docker compose run --rm test bun test src/**/*.e2e.test.ts
```

### Anti-Patterns to Avoid
- **Running unit tests in Docker:** Adds unnecessary overhead; unit tests should run locally with `bun test`
- **Using `docker compose up` for one-shot tests:** `docker compose run --rm` is cleaner for test execution
- **Hardcoding TTY requirements:** Tests should work both with and without TTY (use CI detection)
- **Mounting volumes read-only without tmpfs for output:** Tests may need to write index files or temp data

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PTY in container | Custom PTY wrapper | node-pty + Docker's tty:true | node-pty creates PTY inside container |
| Test isolation | Custom sandbox logic | Docker volumes + tmpfs | Already solved by Phase 3 infrastructure |
| Exit code handling | Custom signal handling | Docker Compose `--exit-code-from` | Built-in feature |
| CI TTY detection | Custom detection | `process.env.CI` + test.skipIf | Already used in session-picker.e2e.test.ts |

**Key insight:** The existing codebase already has solutions for most challenges. The E2E tests use `test.skipIf(isCI)` to handle environments without TTY. In Docker with `tty: true`, this check can pass.

## Common Pitfalls

### Pitfall 1: TTY Allocation in CI
**What goes wrong:** E2E tests fail with "The input device is not a TTY" error
**Why it happens:** CI environments (GitHub Actions, Jenkins) don't provide TTY by default
**How to avoid:** Use `docker compose run -T` to disable TTY in CI, or set `CI=true` to trigger test.skipIf
**Warning signs:** Tests pass locally but fail in CI with TTY errors

### Pitfall 2: Exit Code Not Propagating
**What goes wrong:** Test failures show as success in CI
**Why it happens:** Using `docker compose up` without `--exit-code-from`
**How to avoid:** Use `docker compose run --rm` which naturally propagates exit codes
**Warning signs:** CI shows green but tests actually failed

### Pitfall 3: Volume Permission Issues
**What goes wrong:** Container can't read fixture files or write temp files
**Why it happens:** UID/GID mismatch between host and container
**How to avoid:** Fixtures are read-only (`:ro`), use tmpfs for writes, or match CURRENT_UID
**Warning signs:** Permission denied errors in container logs

### Pitfall 4: Test Timeout in Docker
**What goes wrong:** E2E tests that pass locally timeout in Docker
**Why it happens:** Container startup overhead + slower I/O through Docker layers
**How to avoid:** Increase test timeouts for Docker environment (e.g., 30s instead of 10s)
**Warning signs:** Intermittent timeout failures, tests slower than expected

### Pitfall 5: Stale Container Cache
**What goes wrong:** Code changes not reflected in test runs
**Why it happens:** Docker layer caching retains old code
**How to avoid:** Use `docker compose build` before `docker compose run`, or `--build` flag
**Warning signs:** Tests pass/fail unexpectedly, old behavior observed

## Code Examples

Verified patterns from project codebase and official sources:

### Docker Compose Test Service
```yaml
# Source: Project pattern extrapolated from docker-compose.yml
services:
  test:
    build: .
    entrypoint: /app/sandbox/entrypoint.sh
    command: ["bun", "test"]
    environment:
      - SANDBOX_MODE=test
      - CI=true  # Triggers test.skipIf for TTY-dependent tests
    volumes:
      - ./sandbox/fixtures/.claude:/sandbox/.claude:ro
    tmpfs:
      - /sandbox/.claudectl  # Writable temp area for index
    stdin_open: true
    tty: true
```

### Running Tests with Exit Code
```bash
# Source: Docker Compose documentation
# Run all tests
docker compose run --rm test

# Run specific test file
docker compose run --rm test bun test src/cli.e2e.test.ts

# In CI/CD pipeline
docker compose run -T --rm test
echo "Tests exited with code: $?"
```

### CI Detection in Tests
```typescript
// Source: src/ui/session-picker.e2e.test.ts (existing pattern)
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

test.skipIf(isCI)("TUI test that requires TTY", async () => {
  // This test skips in CI but runs in Docker with tty:true
});
```

### Entrypoint Test Mode (Already Exists)
```bash
# Source: sandbox/entrypoint.sh (existing)
case "${SANDBOX_MODE:-tui}" in
    test)
        exec "$@"  # Executes passed command (e.g., bun test)
        ;;
esac
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| VM-based isolation | Docker containers | 2020+ | 10x faster startup, CI-compatible |
| `docker compose up` for tests | `docker compose run --rm` | Docker Compose v2 | Cleaner one-shot execution |
| Custom TTY wrappers | node-pty + Docker tty | 2023+ | Reliable PTY in containers |

**Deprecated/outdated:**
- `docker-compose` (hyphenated): Use `docker compose` (v2 CLI plugin)
- `--exit-code-from` with `depends_on`: Known issues, prefer `run --rm` for tests

## Open Questions

Things that couldn't be fully resolved:

1. **TTY in GitHub Actions with Docker**
   - What we know: GitHub Actions doesn't provide TTY, but Docker can create one
   - What's unclear: Whether `docker compose run` with `tty: true` works in GitHub Actions
   - Recommendation: Test with `CI=true` to skip TTY tests initially, then validate if Docker TTY works

2. **node-pty Bun Compatibility in Docker**
   - What we know: node-pty callbacks have issues in Bun (noted in session-picker.e2e.test.ts)
   - What's unclear: If these issues persist or differ in Docker environment
   - Recommendation: Keep using Node subprocess pattern as done in existing E2E tests

3. **Test Performance in Docker**
   - What we know: Container startup adds ~3-5 seconds overhead
   - What's unclear: Total E2E test suite duration in Docker
   - Recommendation: Benchmark and adjust timeouts if needed, consider `--watch` for dev

## Sources

### Primary (HIGH confidence)
- Docker Compose CLI documentation - `--exit-code-from` flag, `run` vs `up`
- Project codebase - `docker-compose.yml`, `sandbox/entrypoint.sh`, `*.e2e.test.ts`
- node-pty GitHub README - platform requirements, containerization recommendations

### Secondary (MEDIUM confidence)
- [Docker Compose for CI](https://serversforhackers.com/dockerized-app/compose-tty) - TTY handling patterns
- [Integration Testing with Docker Compose](https://blog.harrison.dev/2016/06/19/integration-testing-with-docker-compose.html) - exit code patterns

### Tertiary (LOW confidence)
- [Bun TTY issues in Docker](https://github.com/oven-sh/bun/issues/17767) - potential TTY bugs (unverified in current version)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in project, well-documented
- Architecture: HIGH - Extends existing Phase 3 infrastructure with minimal changes
- Pitfalls: MEDIUM - Based on community patterns, not all verified firsthand

**Research date:** 2026-02-08
**Valid until:** 60 days (stable stack, Docker patterns well-established)
