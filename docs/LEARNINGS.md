# Learnings

## 2026-01-12

### Session Renames Persistence
- **Issue**: Renames weren't persisting across updates
- **Cause**: Dual storage (JSON file + SQLite) with `renameSession()` only writing to JSON, but `discoverSessions()` reading from SQLite
- **Fix**: Consolidated to SQLite-only storage in `session_titles` table

### Claude Code Skills
- Skills are defined in `~/.claude/commands/*.md`
- Format: YAML frontmatter (`description`, `argument-hint`) + markdown body
- `$ARGUMENTS` placeholder for user arguments
- Skills appear in Skill tool and can be invoked with `/skillname`

### Blessed Keybinding Gotcha
- `table.key(['n'], handler)` captures lowercase only
- `table.key(['S-n'], handler)` for Shift+N
- Footer hints should match actual keybindings exactly
