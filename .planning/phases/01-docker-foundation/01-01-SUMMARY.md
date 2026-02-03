---
phase: "01"
plan: "01"
type: summary
subsystem: docker
tags: [docker, bun, sandbox, testing-infrastructure]

dependencies:
  requires: []
  provides:
    - "Docker container with Bun runtime and isolated sandbox directories"
    - "Environment variable redirects to prevent host contamination"
    - "Build pipeline for node-pty native dependencies"
  affects:
    - "Phase 2 (Test Fixtures) - Will copy fixtures into sandbox directories"
    - "Phase 3 (Docker Services) - Will build docker-compose services on this base"
    - "Phase 4 (Test Integration) - Will run tests in this container"

tech-stack:
  added:
    - docker: "Container runtime using oven/bun:latest base image"
    - python3: "Required for node-pty native module compilation"
    - build-tools: "make, g++ for compiling C++ addons"
  patterns:
    - "Sandbox isolation via environment variable redirection"
    - "Multi-stage Docker build for layer caching efficiency"
    - "Build context optimization via .dockerignore"

key-files:
  created:
    - path: Dockerfile
      purpose: "Docker container definition with Bun runtime and sandbox paths"
      critical: true
    - path: .dockerignore
      purpose: "Build context exclusions for efficient Docker builds"
      critical: false
  modified:
    - path: bun.lock
      purpose: "Synced lockfile to match package.json dependencies"
      critical: false

decisions:
  - id: USE_OVEN_BUN_IMAGE
    what: "Use oven/bun:latest as base instead of node:latest + bun install"
    why: "Official Bun image ensures runtime consistency with Claude Code"
    alternatives: ["node:latest + curl bun install", "alpine + bun binary"]

  - id: INSTALL_BUILD_DEPS
    what: "Install Python3, make, g++ in container for node-pty compilation"
    why: "node-pty (required by blessed) has native C++ dependencies needing gyp"
    alternatives: ["Use prebuilt binaries (not available for all platforms)", "Remove blessed (would break existing TUI)"]

  - id: ENV_VAR_REDIRECT
    what: "Use CLAUDE_CONFIG_DIR and CLAUDECTL_HOME to redirect paths"
    why: "Non-invasive way to isolate data without code changes"
    alternatives: ["Mock fs module (misses real filesystem edge cases)", "Volume mounts (couples container to host structure)"]

metrics:
  duration: "3 minutes"
  completed: 2026-02-03
---

# Phase 1 Plan 1: Docker Foundation Summary

**One-liner:** Docker container with Bun runtime, Python build tools, and /sandbox/.claude + /sandbox/.claudectl isolation via environment redirects

## What Was Built

Created a production-ready Dockerfile that:
1. Uses `oven/bun:latest` official base image for runtime consistency with Claude Code
2. Installs Python3, make, g++ to support node-pty native module compilation (required by blessed TUI library)
3. Creates isolated sandbox directories at `/sandbox/.claude/projects` and `/sandbox/.claudectl`
4. Sets `CLAUDE_CONFIG_DIR=/sandbox/.claude` and `CLAUDECTL_HOME=/sandbox/.claudectl` to redirect all Claude Code data access
5. Implements efficient layer caching (package.json + bun.lock copied before source)
6. Optimizes build context via .dockerignore (reduced from 353KB to 5.16KB)

## Requirements Satisfied

- **INFRA-01**: Dockerfile builds successfully with Bun + all dependencies ✓
- **INFRA-02**: Container has isolated `/sandbox/.claude/` and `/sandbox/.claudectl/` ✓
- **INFRA-03**: Environment variables redirect paths to sandbox ✓

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Dockerfile with sandbox isolation | 05ead06 | Dockerfile, bun.lock |
| 2 | Create .dockerignore and verify sandbox paths | 81878ec | .dockerignore |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong lockfile filename in Dockerfile**
- **Found during:** Task 1 - Docker build
- **Issue:** Dockerfile referenced `bun.lockb` but actual file is `bun.lock`
- **Fix:** Changed COPY command to use correct filename
- **Files modified:** Dockerfile
- **Commit:** 05ead06 (same commit as Task 1)

**2. [Rule 3 - Blocking] Lockfile out of sync with package.json**
- **Found during:** Task 1 - Docker build failed with "lockfile had changes"
- **Issue:** bun.lock didn't match package.json dependencies
- **Fix:** Ran `bun install` locally to regenerate lockfile
- **Files modified:** bun.lock
- **Commit:** 05ead06 (same commit as Task 1)

**3. [Rule 2 - Missing Critical] Build dependencies for node-pty**
- **Found during:** Task 1 - Docker build failed during `bun install`
- **Issue:** node-pty requires Python3, make, g++ to compile native C++ modules (node-gyp)
- **Fix:** Added apt-get layer to install python3, make, g++ before bun install
- **Files modified:** Dockerfile
- **Commit:** 05ead06 (same commit as Task 1)
- **Why critical:** Without build tools, claudectl cannot install dependencies (blessed depends on node-pty)

## Verification Results

All verification checks passed:

```bash
# 1. Image built successfully
docker build -t claudectl-sandbox .
✓ Build completed without errors

# 2. Sandbox directories exist
docker run --rm claudectl-sandbox sh -c 'test -d /sandbox/.claude && test -d /sandbox/.claudectl && echo "OK"'
✓ Output: OK

# 3. Environment variables set correctly
docker run --rm claudectl-sandbox sh -c 'echo $CLAUDE_CONFIG_DIR'
✓ Output: /sandbox/.claude

docker run --rm claudectl-sandbox sh -c 'echo $CLAUDECTL_HOME'
✓ Output: /sandbox/.claudectl

# 4. App runs successfully
docker run --rm claudectl-sandbox bun run src/index.ts --help
✓ Shows claudectl help text (27 lines)

# 5. Projects directory empty (not host-mounted)
docker run --rm claudectl-sandbox sh -c 'ls -la /sandbox/.claude/projects/'
✓ Directory exists and contains no session files
```

## Key Technical Details

**Dockerfile location:** `/Users/anshul/Anshul/Code/claudectl/Dockerfile`

**Environment variable mappings:**
- `CLAUDE_CONFIG_DIR=/sandbox/.claude` (Claude Code reads this to find session storage)
- `CLAUDECTL_HOME=/sandbox/.claudectl` (claudectl reads this for index database location)

**Build performance:**
- Without .dockerignore: 353KB build context (includes node_modules, dist, .planning)
- With .dockerignore: 5.16KB build context (only source files + package.json)
- Layer caching: Package install layer cached unless package.json or bun.lock changes

**Image size:** 1.24GB (includes Debian base + Bun + Python + build tools + node_modules)

## Next Phase Readiness

**Phase 2 (Test Fixtures) can proceed immediately:**
- Container provides isolated filesystem for fixtures
- Sample session files can be copied into `/sandbox/.claude/projects/`
- Mock .claude.json can be placed in `/sandbox/.claude/`

**Blockers:** None

**Concerns:** None

## Gotchas Discovered

1. **Lockfile naming inconsistency**: Bun CLI creates `bun.lock` (no 'b'), but documentation sometimes references `bun.lockb` (binary format). Always use `bun.lock` for source-based projects.

2. **node-pty build requirements**: The blessed library (used for TUI) depends on node-pty which has native C++ code. Docker containers need Python3 + make + g++ installed before `bun install`. This adds ~300MB to image size but is unavoidable.

3. **Build context bloat**: Without .dockerignore, Docker copies node_modules, dist, .planning into build context even though they're not used. This slows builds and increases memory usage. Always exclude these.

4. **Sandbox isolation verification**: Important to verify `/sandbox/.claude/projects/` is empty (not accidentally mounted from host). A mounted host directory would defeat the purpose of sandbox isolation.

## How to Use

**Build the image:**
```bash
docker build -t claudectl-sandbox .
```

**Run interactive shell in container:**
```bash
docker run -it --rm claudectl-sandbox bash
```

**Run claudectl in container:**
```bash
docker run --rm claudectl-sandbox bun run src/index.ts --help
```

**Verify sandbox isolation:**
```bash
docker run --rm claudectl-sandbox sh -c 'echo $CLAUDE_CONFIG_DIR && ls /sandbox/.claude/'
```

---

*Completed: 2026-02-03 | Duration: 3 minutes | Commits: 05ead06, 81878ec*
