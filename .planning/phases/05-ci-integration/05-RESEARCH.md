# Phase 5: CI Integration - Research

**Researched:** 2026-02-11
**Domain:** GitHub Actions + Docker Compose CI/CD
**Confidence:** HIGH

## Summary

CI integration for Docker-based testing requires the official `docker/setup-compose-action` to ensure Docker Compose is available in GitHub Actions runners. The standard approach is to use `docker compose` (subcommand, not hyphenated) with explicit service names from docker-compose.yml.

For developer experience, npm scripts should provide semantic aliases that hide Docker complexity. The pattern is `sandbox` for interactive development, `sandbox:clean` for isolated testing, and `sandbox:shell` for debugging. These scripts map directly to docker-compose services, ensuring CI and local development use identical environments.

The critical insight is that CI and local development must use the same Docker setup to guarantee "it works on my machine" never becomes an issue. This means CI should run `docker compose run --rm test` exactly as developers do locally, rather than installing Bun/Node directly on the runner.

**Primary recommendation:** Use docker/setup-compose-action@v1 in GitHub Actions, replace `bun test` with `docker compose run --rm test`, and add npm scripts for sandbox modes to improve developer experience.

## Standard Stack

The established tools for Docker-based CI in GitHub Actions:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| docker/setup-compose-action | v1 | Install Docker Compose in CI | Official Docker action, handles version detection |
| docker/setup-buildx-action | v3 | Set up Docker BuildKit | Faster builds with improved caching |
| docker compose (subcommand) | v2.x | Orchestrate multi-container apps | Built into Docker, replaces docker-compose CLI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| actions/checkout | v4 | Clone repository in CI | Always needed before docker commands |
| GitHub Secrets | N/A | Store sensitive credentials | When pushing images or accessing private registries |
| docker/metadata-action | v5 | Generate image tags/labels | When building and pushing container images |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| docker/setup-compose-action | Manual download/install | Action handles version detection and caching automatically |
| docker compose | ickshonpe/docker-compose-action | Third-party action adds complexity, official action is simpler |
| docker compose run | docker-compose up + docker-compose down | run --rm auto-cleans containers, simpler for one-off tasks |

**Installation:**
```yaml
# In .github/workflows/ci.yml
- name: Set up Docker Compose
  uses: docker/setup-compose-action@v1
```

## Architecture Patterns

### Recommended CI Workflow Structure
```yaml
.github/
└── workflows/
    ├── ci.yml           # Tests, linting, type checking
    └── release.yml      # Building, tagging, deployment (if needed)
```

### Pattern 1: Docker Compose for Test Parity
**What:** Run tests via `docker compose run --rm test` in CI, exactly matching local development
**When to use:** Always, when testing environment setup is complex (dependencies, fixtures, isolation)
**Example:**
```yaml
# Source: https://docs.docker.com/build/ci/github-actions/
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Compose
        uses: docker/setup-compose-action@v1

      - name: Run tests in Docker
        run: docker compose run --rm test
```

### Pattern 2: npm Script Aliases for Developer Experience
**What:** Provide semantic npm scripts that wrap docker-compose commands
**When to use:** When developers need simple commands without remembering docker-compose service names
**Example:**
```json
// Source: https://oneuptime.com/blog/post/2026-01-22-nodejs-npm-scripts/view
{
  "scripts": {
    "sandbox": "docker compose run --rm sandbox",
    "sandbox:clean": "docker compose run --rm sandbox-clean",
    "sandbox:shell": "docker compose run --rm sandbox-shell"
  }
}
```

### Pattern 3: Pre/Post Hooks for Setup/Cleanup
**What:** Use npm pre/post hooks to automate setup before and cleanup after script execution
**When to use:** When scripts need preparation steps (building images) or cleanup (removing volumes)
**Example:**
```json
{
  "scripts": {
    "presandbox": "docker compose build sandbox",
    "sandbox": "docker compose run --rm sandbox",
    "postsandbox": "echo 'Sandbox session ended. Run sandbox:clean for fresh state.'"
  }
}
```

### Anti-Patterns to Avoid
- **Using `latest` tag for Docker images:** Leads to unpredictable builds across time. Pin versions like `oven/bun:1.0.0`.
- **Running `bun test` directly in CI:** Breaks parity with local Docker environment. Use `docker compose run --rm test` instead.
- **Using `docker-compose` (hyphenated):** Deprecated in favor of `docker compose` subcommand (available in Docker v2+).
- **Anonymous volumes:** Create data dangling between runs. Use named volumes or tmpfs for ephemeral data.
- **Skipping `--rm` flag:** Leaves stopped containers littering the system. Always use `docker compose run --rm`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Installing Docker Compose in CI | Curl + chmod script | docker/setup-compose-action | Handles version detection, caching, and error cases automatically |
| Running one-off test commands | docker-compose up + exec + down | docker compose run --rm | Auto-creates and removes container, simpler workflow |
| Generating image tags from git | Parse git output manually | docker/metadata-action | Handles edge cases (tags, PRs, branches) and follows conventions |
| Cross-platform npm scripts | OS detection in scripts | npm-run-all, cross-env packages | Platform-agnostic parallel/sequential execution |
| Container environment validation | Custom healthcheck scripts | Docker HEALTHCHECK directive | Built-in, monitored by Docker daemon |

**Key insight:** Docker and GitHub Actions ecosystems have mature, official solutions for common CI/CD patterns. Custom scripts add maintenance burden and miss edge cases that official actions handle.

## Common Pitfalls

### Pitfall 1: Using `docker-compose` (hyphenated) instead of `docker compose`
**What goes wrong:** CI fails with "docker-compose: command not found" on modern GitHub runners
**Why it happens:** The standalone `docker-compose` binary is deprecated. Docker v2+ uses `docker compose` subcommand.
**How to avoid:** Always use `docker compose` (space, not hyphen) in scripts and CI workflows
**Warning signs:** Error messages mentioning docker-compose not found, or documentation from pre-2022

### Pitfall 2: CI tests pass but local tests fail (environment drift)
**What goes wrong:** CI installs dependencies directly on runner, but local development uses Docker. Tests pass in CI but fail locally due to version mismatches.
**Why it happens:** CI and local environments diverge when CI bypasses Docker for speed
**How to avoid:** Run the same docker-compose command in CI and locally: `docker compose run --rm test`
**Warning signs:** "Works in CI but not on my machine" complaints, version conflicts in error messages

### Pitfall 3: Forgetting `--rm` flag leaves container debris
**What goes wrong:** Every test run creates a stopped container, eventually filling disk or hitting container limits
**Why it happens:** docker compose run creates containers but doesn't auto-remove them without --rm
**How to avoid:** Always use `docker compose run --rm <service>` for one-off commands
**Warning signs:** `docker ps -a` shows dozens of stopped containers with names like `claudectl-test-run-123`

### Pitfall 4: Docker Compose not available in GitHub Actions
**What goes wrong:** Workflow fails immediately with "docker compose: command not found"
**Why it happens:** GitHub Actions runners don't have Docker Compose installed by default (as of 2026)
**How to avoid:** Add `docker/setup-compose-action@v1` step before any docker compose commands
**Warning signs:** Workflow succeeds locally but fails in CI at first docker compose command

### Pitfall 5: Anonymous volumes persist data across test runs
**What goes wrong:** Tests fail intermittently because old data from previous runs affects current tests
**Why it happens:** Docker volumes persist by default unless explicitly configured as tmpfs or named with --rm
**How to avoid:** Use tmpfs for ephemeral test data (already in docker-compose.yml for test service)
**Warning signs:** "Test passes when container is rebuilt but fails on subsequent runs"

### Pitfall 6: npm scripts hide errors with silent failures
**What goes wrong:** Script fails but exits with 0, making CI think tests passed
**Why it happens:** Commands with `|| true` or improper error handling swallow exit codes
**How to avoid:** Let errors propagate naturally, avoid `|| true` unless truly optional
**Warning signs:** CI shows green checkmark but functionality is broken

## Code Examples

Verified patterns from official sources:

### Complete CI Workflow with Docker Compose
```yaml
# Source: https://docs.docker.com/build/ci/github-actions/
name: CI

on:
  push:
    branches: [develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Compose
        uses: docker/setup-compose-action@v1

      - name: Run tests
        run: docker compose run --rm test

      - name: Cleanup
        if: always()
        run: docker compose down -v
```

### npm Scripts for Developer Experience
```json
// Source: https://oneuptime.com/blog/post/2026-01-22-nodejs-npm-scripts/view
{
  "scripts": {
    "sandbox": "docker compose run --rm sandbox",
    "sandbox:clean": "docker compose run --rm sandbox-clean",
    "sandbox:shell": "docker compose run --rm sandbox-shell",
    "test:docker": "docker compose run --rm test"
  }
}
```

### Docker Compose Service with Test Mode
```yaml
# Source: Project's existing docker-compose.yml (Phase 4)
services:
  test:
    build: .
    entrypoint: /app/sandbox/entrypoint.sh
    command: ["bun", "test"]
    environment:
      - SANDBOX_MODE=test
    volumes:
      - ./sandbox/fixtures/.claude:/sandbox/.claude:ro
    tmpfs:
      - /sandbox/.claudectl
    stdin_open: true
    tty: true
```

### Installing Specific Docker Compose Version
```yaml
# Source: https://github.com/docker/setup-compose-action
- name: Set up Docker Compose
  uses: docker/setup-compose-action@v1
  with:
    version: v2.32.4  # Pin specific version for reproducibility
    cache-binary: true  # Cache for faster subsequent runs
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| docker-compose (standalone binary) | docker compose (Docker subcommand) | Docker v2.0 (2021) | Must use space, not hyphen |
| docker-compose up + exec + down | docker compose run --rm | Docker Compose v1.28+ | Simpler one-off commands, auto-cleanup |
| Manual Docker Compose install in CI | docker/setup-compose-action | 2023 | Official action handles edge cases |
| CI runs `bun test` directly | CI runs `docker compose run --rm test` | 2024+ (parity trend) | Eliminates environment drift |
| npm scripts as shortcuts | npm scripts with pre/post hooks | 2025+ | Better automation, clearer intent |

**Deprecated/outdated:**
- `docker-compose` (hyphenated): Replaced by `docker compose` subcommand in Docker v2+
- `version: "3.8"` in docker-compose.yml: No longer needed in Compose v2, format is implicit
- Manual `curl` + `chmod` for Compose install: docker/setup-compose-action is now standard

## Open Questions

Things that couldn't be fully resolved:

1. **Should CI run type checking in Docker or directly on runner?**
   - What we know: Tests must run in Docker for parity, but type checking is deterministic
   - What's unclear: Whether installing TypeScript twice (host + Docker) is worth avoiding
   - Recommendation: Run typecheck directly on runner for speed (use oven-sh/setup-bun), tests in Docker for parity

2. **Should npm scripts rebuild Docker images automatically?**
   - What we know: `presandbox` hook could run `docker compose build`, but slows down every invocation
   - What's unclear: Whether developers expect automatic rebuilds or prefer explicit control
   - Recommendation: Don't auto-rebuild. Document "run `docker compose build` after code changes" in README

3. **Should sandbox:clean remove volumes or just use tmpfs?**
   - What we know: Current setup uses tmpfs for ephemeral state, no volumes to clean
   - What's unclear: If future requirements need persistent volumes, how to handle cleanup
   - Recommendation: Keep tmpfs approach (already implemented), add `sandbox:cleanup` script if volumes are added later

## Sources

### Primary (HIGH confidence)
- [Docker GitHub Actions Official Docs](https://docs.docker.com/build/ci/github-actions/) - Docker Compose in CI patterns
- [docker/setup-compose-action GitHub](https://github.com/docker/setup-compose-action) - Official action usage
- [GitHub Actions Node.js Testing Docs](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs) - CI testing patterns

### Secondary (MEDIUM confidence)
- [Docker Compose Common Pitfalls](https://moldstud.com/articles/p-avoid-these-common-docker-compose-pitfalls-tips-and-best-practices) - Verified with official docs
- [npm Scripts Effective Usage](https://oneuptime.com/blog/post/2026-01-22-nodejs-npm-scripts/view) - 2026 best practices
- [How to use docker-compose with GitHub Actions](https://github.com/orgs/community/discussions/27185) - Community patterns verified against official docs

### Tertiary (LOW confidence)
- WebSearch results for "CI local development parity Docker 2026" - Community consensus, not officially documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Docker and GitHub Actions documentation
- Architecture: HIGH - Patterns verified in official docs and existing Phase 4 implementation
- Pitfalls: HIGH - Documented in official docs and community discussions with verification

**Research date:** 2026-02-11
**Valid until:** 2026-03-15 (30 days - stable domain, minimal churn expected)
