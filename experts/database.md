# Database Expert

> Mental model for SQLite search index operations in this codebase.
> **Last Updated**: 2026-01-07 (v2.0.1 - soft-delete)
> **Expertise Level**: expert

## Quick Reference

### Key Files
| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/core/search-index.ts` | SQLite FTS5 search index | Schema changes, new query types |
| `src/core/search-index.test.ts` | Index tests | Adding new features |
| `src/core/sessions.ts` | Session discovery & search wrappers | Adding new search options |

### Common Operations
| Operation | How To |
|-----------|--------|
| Sync index | `syncIndex()` or `claudectl index sync` |
| Rebuild index | `rebuildIndex()` or `claudectl index rebuild` |
| Search content | `searchSessionContent(query)` |
| Get sessions from index | `discoverSessions({ useIndex: true })` |

---

## Architecture Overview

The search index is a SQLite database with FTS5 (Full-Text Search 5) that caches session metadata and message content for fast queries. JSONL files remain the source of truth.

### Component Map
```
~/.claudectl/index.db
    ├── files          (session metadata cache)
    ├── messages       (message content for search)
    ├── messages_fts   (FTS5 virtual table)
    └── session_titles (user-defined renames)
```

### Data Flow
1. **Sync**: Compare file mtime/size with indexed → add/update/delete as needed
2. **Discovery**: Read from `files` table (fast) vs parsing JSONL (slow fallback)
3. **Search**: FTS5 query on `messages_fts` → join with `files` for metadata

---

## Patterns & Conventions

### Pattern: Incremental Sync
**Purpose**: Fast updates by only re-indexing changed files
**When to Use**: On every app startup, background sync

```typescript
const index = getSearchIndex();
const stats = await index.sync();
// stats: { added: 5, updated: 2, deleted: 1, unchanged: 443, duration: 89 }
```

### Pattern: FTS5 Search with Snippets
**Purpose**: Full-text search with highlighted match context
**When to Use**: Content search across all sessions

```typescript
const results = index.searchContent("authentication", {
  maxResults: 50,
  maxMatchesPerSession: 5,
});
// Returns snippets with >>>> and <<<< markers around matches
```

### Pattern: Soft-Delete for Sessions
**Purpose**: Keep deleted sessions in DB for recovery/display
**When to Use**: When files are deleted from disk but should remain discoverable

```typescript
// Sessions deleted from disk get is_deleted = 1, deleted_at = timestamp
// They still appear in getSessions() by default
const sessions = index.getSessions();  // includes deleted
const activeOnly = index.getSessions({ includeDeleted: false });

// When file reappears (restored from backup), is_deleted is cleared
await index.sync();  // Detects restored file and clears deleted flag
```

**Key columns**: `is_deleted INTEGER DEFAULT 0`, `deleted_at TEXT`

**Anti-pattern** (don't do this):
```typescript
// DON'T: Parse all JSONL files for every search
for (const session of sessions) {
  const messages = await parseJsonl(session.filePath);
  // This is O(n) disk reads - very slow
}
```

---

## File Locations

### Database
- `~/.claudectl/index.db` - SQLite database file
  - Uses WAL mode for better concurrent access
  - ~1-2 bytes per character of message content

### Source Code
- `src/core/search-index.ts` - Main implementation
  - `SearchIndex` class - database operations
  - `SyncStats` interface - sync result type
  - `SearchResult` interface - search result type

---

## Gotchas & Edge Cases

### BM25 Must Be In Direct FTS5 Query
**Symptom**: "unable to use function bm25 in the requested context"
**Cause**: bm25() ranking function can only be used in direct FTS5 queries, not in CTEs or subqueries
**Solution**: Run FTS5 query first, then join results separately

### Session Titles Persist Through Rebuild
**Symptom**: Custom session names survive `rebuild()`
**Cause**: `session_titles` table is deliberately not cleared during rebuild
**Solution**: This is intentional - user renames should persist

### Singleton Instance
**Symptom**: Database connection issues
**Cause**: `getSearchIndex()` returns singleton, `closeSearchIndex()` closes it
**Solution**: Let the singleton manage lifecycle; only close on app exit

---

## Dependencies

### Internal
- `src/utils/jsonl.ts`: JSONL parsing for indexing
- `src/utils/paths.ts`: Path decoding for working directories

### External
- `bun:sqlite`: Bun's native SQLite bindings (no npm dependency)

---

## Testing

### How to Test
```bash
bun test src/core/search-index.test.ts
```

### Common Test Scenarios
- New database: Schema creation from scratch
- Sync with empty dir: Returns zero stats
- File changes: Updates detected by mtime/size
- Search: FTS queries return correct snippets
- Soft-delete: Deleted files marked in DB, not removed
- Restore: File reappearing clears is_deleted flag
- Sorting: Active sessions before deleted sessions

---

## Change Log

| Date | Change | Source |
|------|--------|--------|
| 2026-01-07 | Initial implementation with FTS5 | SQLite search index plan |
| 2026-01-07 | Added CLI commands: index sync/rebuild/stats | Phase 5 |
| 2026-01-07 | Integrated with session-picker for real-time search | Phase 4 |
| 2026-01-07 | Soft-delete: deleted files stay in DB with is_deleted flag | User request |
| 2026-01-07 | Schema v2: Added is_deleted, deleted_at columns with migration | Soft-delete feature |
| 2026-01-12 | Session renames now SQLite-only (removed JSON file dual storage) | Simplification |
| 2026-01-12 | Added `updateSessionPath()` for session move/promote | Feature |

---

## Open Questions

- [ ] Should we add automatic index cleanup for very old sessions?
- [ ] Consider adding search history/recent searches feature
