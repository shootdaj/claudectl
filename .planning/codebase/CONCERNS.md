# Technical Debt, Known Issues & Concerns

**Last Updated:** 2026-01-25
**Current Version:** 1.0.1
**Status:** Production Ready with Known Limitations

---

## Critical Constraints

### 1. Blessed Library Cannot Be Compiled (HARD CONSTRAINT)

**Status:** Known limitation, permanent architectural constraint
**Impact:** Distribution model locked into source distribution
**Details:**
- `blessed` uses dynamic `require()` calls and runtime terminal detection
- `bun build --compile` produces broken binary with missing terminal capabilities
- This is why claudectl uses source distribution via `bun run` instead of compiled binary
- Package.json still has `build` script but it's non-functional for production

**What This Means:**
- Can never distribute as compiled binary via `dist/claudectl` path
- Install script must download source and run via `bun run`
- No way to solve without replacing `blessed` entirely

**Potential Future Solutions:**
1. Replace `blessed` with a terminal library that supports bundling (major refactoring)
2. Use different bundler/compilation approach (research needed)
3. Stay with source distribution (current approach)

---

## Security Concerns

### 1. JWT Token Implementation (Custom, Not Standard)

**Status:** Working but non-standard
**Severity:** Medium
**File:** `src/server/auth.ts` lines 117-134
**Details:**
```typescript
// Custom JWT implementation using HMAC-SHA256
// NOT using standard jwt library
function generateToken(): string {
  const payload: TokenPayload = {
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.jwtSecret)
    .update(payloadBase64)
    .digest("base64url");
  return `${payloadBase64}.${signature}`;
}
```

**Issues:**
- No standard JWT library (jsonwebtoken) - custom implementation may have edge cases
- Token format is simplified (payload.signature) vs standard JWT (header.payload.signature)
- Minimal token payload - only `iat` and `exp`, no algorithm header
- Not using standard JWT claims (no `iss`, `sub`, etc.)

**Recommendation:** Consider using `jsonwebtoken` library for production security. Test current implementation thoroughly for token forgery vulnerabilities.

### 2. Password Storage Location

**Status:** Functional but could be hardened
**Severity:** Low
**File:** `src/server/auth.ts` lines 38-56
**Details:**
- Password hash stored in `~/.claudectl/server-config.json` (plain JSON file)
- File permissions depend on system defaults (typically 644 or 755)
- JWT secret also stored in same file

**Current Protections:**
- bcrypt with salt rounds = 12 (strong)
- File in user home directory (not world-accessible on most systems)

**Recommendations:**
1. Document that `server-config.json` should not be world-readable
2. Consider adding file permission check on startup: `chmod 600 ~/.claudectl/server-config.json`
3. Document JWT secret rotation procedure (currently no way to rotate)

### 3. Shell Command Injection Risk in New Project Wizard

**Status:** Potential vulnerability area
**Severity:** Medium (mitigated by user control)
**Files:** `src/ui/new-project.ts` (lines 18, 153, 386, 491, 497, 562, 726, 890, 897, 906)
**Details:**
```typescript
// Examples:
Bun.spawn(["gh", "repo", "clone", repoUrl, projectPath], {...});  // repoUrl from user input
Bun.spawn(["git", "clone", repoUrl, projectPath], {...});  // repoUrl from user input
```

**Analysis:**
- All spawn calls use array syntax (good - not shell injection vulnerable)
- However, `repoUrl` comes from user input in wizard
- Git/gh properly handle URLs in array form

**Current Status:** Safe (array syntax prevents injection)

**Recommendation:** Add URL validation before spawning git/gh commands:
- Validate SSH format: `git@github.com:user/repo.git`
- Validate HTTPS format: `https://github.com/user/repo.git`
- Reject URLs with suspicious characters

### 4. Remote Server Password Authentication

**Status:** Basic but functional
**Severity:** Medium
**Details:**
- Server only has single password for all users (no per-user auth)
- Token expiry = 7 days (user must re-login after a week)
- No rate limiting on login attempts
- No logout mechanism (token expires, but no explicit logout)

**Mitigations:**
- Server is intended for personal/team use, not public
- Password is strong (bcrypt + 12 rounds)
- Should only expose via Cloudflare Tunnel with IP restrictions

**Recommendations:**
1. Add rate limiting to `/api/auth/login` (max 5 attempts/minute per IP)
2. Log failed authentication attempts to stderr
3. Document that this auth is suitable for personal use only
4. Consider adding logout endpoint that blacklists tokens (optional)

---

## Performance Concerns

### 1. Bun.spawnSync Blocking Calls

**Status:** Acceptable for current use
**Severity:** Low
**Files:** Multiple (new-project.ts, session-picker.ts, cli.ts)
**Details:**
```typescript
// These block the TUI thread
Bun.spawnSync(["gh", "repo", "list", ...]);  // Can take 2-3 seconds
Bun.spawnSync(["git", "clone", ...]);         // Can take 30+ seconds
```

**Impact:** TUI freezes while waiting for git/gh commands

**Current Mitigations:**
- Spawn calls are modal (user expects to wait)
- Wizard UI indicates "please wait"
- Most calls complete in <5 seconds except git clone

**Not a Priority Fix:** User experience is acceptable for these operations

### 2. No Session Metadata Caching

**Status:** Already implemented via SQLite index
**Details:**
- Sessions are discovered from SQLite `files` table (fast)
- JSONL files are only parsed when needed (for content search)
- FTS5 index for content search is cached

**Status:** Resolved - not a concern

### 3. PTY Buffer Management on Remote Server

**Status:** Functional but unbounded
**File:** `src/server/session-manager.ts`
**Details:**
- PTY output buffered in memory (no size limit currently)
- Long-running sessions might accumulate megabytes of output
- No scrollback history limit

**Current Behavior:**
- xterm.js client handles scrollback rendering
- Server only keeps one scrollback frame in memory per session

**Not Priority:** Real-world sessions haven't hit memory issues

---

## Known Bugs & Workarounds

### 1. Bun Terminal API Bug (CRITICAL - Requires Node.js Workaround)

**Status:** Documented, permanently solved via Node.js migration
**Severity:** Critical (solved)
**GitHub Issue:** https://github.com/oven-sh/bun/issues/25779
**Details:**
```
Bun's Terminal API has a bug where terminal.write() bypasses PTY line discipline.
Input written to the PTY never reaches the underlying process (Claude).
```

**Solution Implemented:**
- Remote server runs under Node.js, not Bun
- Uses `node-pty` (native bindings) instead of Bun Terminal
- CLI spawns Node.js process: `spawn("npx", ["tsx", "src/server-main.ts"])`

**Status:** Resolved for server. CLI TUI uses Bun successfully.

### 2. node-pty spawn-helper Permissions

**Status:** Documented, requires manual fix on some systems
**Severity:** Low (easily fixable)
**Details:**
```bash
# node-pty binary might lose execute permissions after installation
# Symptom: "Cannot find spawn-helper"
# Fix: chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

**When Occurs:**
- Sometimes after `bun install`
- Inconsistent across systems
- More common on macOS with certain permission settings

**Documentation:** See `experts/remote-server.md`

### 3. Blessed Form Tab Navigation

**Status:** Documented, solved
**Severity:** Low (solved)
**Details:**
- Tab key was inserting literal tab character instead of navigating fields
- Root cause: `inputOnFocus: true` textbox captures all keystrokes
- Solution: Use `blessed.form` with `keys: true` as parent

**Documentation:** See `experts/ui.md` and `LEARNINGS.md`

### 4. Hidden Directory Path Encoding (`/.` → `--`)

**Status:** Implemented and working
**Severity:** Low (solved)
**Details:**
- Paths like `~/.claudectl/scratch` encode to `-Users-anshul--claudectl-scratch`
- Double hyphen for hidden directories (`.` → `--`)
- Session discovery handles this correctly

**Documentation:** See `experts/ui.md`

---

## Testing Gaps

### 1. E2E Testing Incomplete

**Status:** Basic E2E tests exist but coverage is limited
**Severity:** Medium
**Files:** `src/integration.test.ts` (56 lines)
**Details:**
- Integration tests are minimal (module loading + basic ops)
- No TUI automation tests (would require node-pty)
- No web server E2E tests (would require Playwright)
- No real session launching tests

**What's Tested:**
- Module loading (can import all modules)
- Session discovery returns array
- Search returns results
- Path encoding/decoding
- Session promotion (moveSession)

**What's Missing:**
- Real TUI keybinding flows (j/k navigation, search, etc.)
- Web server with browser automation
- Session launching with real Claude process
- Keyboard shortcuts (a, A, n, p, etc.)

**Note:** CLAUDE.md explicitly requires E2E testing but current coverage is minimal. This is a known gap.

### 2. Server Authentication Testing

**Status:** Limited testing
**Severity:** Low
**Details:**
- No tests for password hashing/verification
- No tests for token generation/validation
- No tests for token expiry
- No tests for WebSocket auth failures

**Recommendation:** Add auth tests before any security-critical changes

---

## Database Concerns

### 1. bun:sqlite API Differences from better-sqlite3

**Status:** Documented, working correctly
**Severity:** Low (mitigated)
**File:** `src/core/search-index.ts`
**Details:**
```typescript
// WRONG: db.run("SQL", [params])
// CORRECT: db.prepare("SQL").run(params)

// WRONG: db.query("SELECT...")
// CORRECT: db.prepare("SELECT...").all()
```

**Learnings Documented:** See `experts/database.md`

**Current Status:** All code uses correct API

### 2. SQLite Schema Migrations

**Status:** Working but manual
**Severity:** Low
**Details:**
- Schema version stored in `PRAGMA user_version`
- Migrations run sequentially on startup
- Three versions exist: v1, v2 (soft-delete), v3 (archive)

**Potential Issue:** No rollback mechanism
- If migration fails, manual DB repair needed
- No automatic backup before migration

**Recommendation:** Backup index.db before major version upgrades

---

## Architectural Concerns

### 1. Dual Runtime (Bun + Node.js)

**Status:** Necessary design, working but complex
**Severity:** Medium
**Details:**
- CLI (TUI) runs on Bun
- Server spawns Node.js subprocess via `spawn("npx", ["tsx", ...])`
- Bun can't compile to binary (blessed limitation)
- Server must run Node.js (Bun Terminal API bug)

**Complexity:**
- Two different runtimes to test/deploy
- Installation must have both `bun` and `node`
- TypeScript compiled differently per runtime

**Mitigations:**
- Clear separation: CLI = Bun, Server = Node.js
- Both use TypeScript (ts → transpiled)
- Works well in practice despite complexity

**Not a Priority:** Architecture is solid, solves hard constraints

### 2. Session File Duplication During Promote

**Status:** Works but inelegant
**File:** `src/ui/new-project.ts` + `src/core/sessions.ts`
**Details:**
- When promoting scratch → project:
  1. Copy JSONL file to new directory
  2. Update SQLite index
  3. Update `session_titles` table

**Potential Issue:** If step 2 fails, old copy remains

**Current Safeguard:** Try/catch with error logging

**Recommendation:** Implement transaction-like behavior for promote operation

### 3. Web Push Subscription Storage

**Status:** Implemented but fragile
**File:** `src/server/auth.ts`
**Details:**
- Push subscriptions stored in `server-config.json` (plain JSON)
- No per-user tracking (single password = all users same)
- No way to disable push notifications per client

**Limitation:** Not critical for personal use

---

## Dependency Concerns

### 1. Blessed Library Maintenance

**Status:** Library is mature but not heavily maintained
**Severity:** Low
**Package:** blessed@0.1.81
**Details:**
- Blessed hasn't had major updates in years
- Project seems stable/maintained in limited capacity
- No known critical vulnerabilities

**Recommendation:** Monitor for terminal compatibility issues on new OS versions

### 2. External Install Scripts

**Status:** Known risk, necessary for distribution
**Severity:** Medium
**Files:** Referenced in `src/ui/session-picker.ts` and `src/cli.ts`
**Details:**
```typescript
// Installation via piped script (security risk)
spawn(["bash", "-c", "curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash"], {...});
```

**Risk:** If GitHub account compromised, install script could be malicious

**Mitigations:**
- GitHub Actions controls script publishing
- Only admin can push to main
- User sees dialog before executing

**Recommendation:** Consider signed releases or checksums in future

---

## Documentation Gaps

### 1. Incomplete E2E Test Documentation

**Status:** CLAUDE.md specifies requirements but implementation is minimal
**Details:**
- CLAUDE.md lines 89-149 show detailed E2E test expectations
- Actual tests in `integration.test.ts` are basic module loading
- Gap between documented spec and actual coverage

**Not Critical:** Tests exist for core operations, just incomplete

### 2. No Troubleshooting Guide

**Status:** Known issues documented but no user-facing troubleshooting guide
**Recommendation:** Create `docs/TROUBLESHOOTING.md` with:
- Common issues and fixes
- spawn-helper permission errors
- Terminal compatibility
- Port already in use

---

## Production Readiness

### Current Status: PRODUCTION READY

**Version:** 1.0.1
**Tests Passing:** 184+ (bun test)
**TypeScript:** Clean compilation
**Branch:** feature/create-project-wizard (ready to merge to main)

**Known Limitations:**
1. Blessed cannot be compiled (permanent constraint)
2. Custom JWT implementation (needs security review)
3. Single-password auth on server (suitable for personal use)
4. E2E test coverage is minimal (tests exist but limited)
5. No rate limiting on login (should add before public deployment)

**Suitable For:**
- Personal use (single user)
- Team use with password sharing
- Local machine access
- Remote access via Cloudflare Tunnel

**Not Suitable For:**
- Public/multi-user without per-user auth
- High-security environments (use standard JWT library)
- Systems requiring audit trails

---

## Change Log

- **2026-01-25:** Initial concerns analysis
  - Documented blessed compilation constraint
  - Identified JWT custom implementation security concern
  - Flagged missing rate limiting
  - Noted E2E test gaps
  - Documented all known workarounds
  - Production readiness assessment: READY

