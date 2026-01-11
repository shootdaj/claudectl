/**
 * Session title management - uses SQLite as single source of truth.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getSearchIndex } from "./search-index";

const CACHE_DIR = join(homedir(), ".claudectl");
const LEGACY_RENAME_FILE = join(CACHE_DIR, "renamed-sessions.json");

/**
 * Rename a session (user-assigned custom title)
 */
export async function renameSession(sessionId: string, title: string): Promise<void> {
  const index = getSearchIndex();
  index.setSessionTitle(sessionId, title);
}

/**
 * Get user-renamed title for a session (if renamed)
 * Note: This is only used as fallback during file-based discovery.
 * Index-based discovery reads titles directly from SQLite.
 */
export async function getRenamedTitle(sessionId: string): Promise<string | undefined> {
  try {
    const index = getSearchIndex();
    return index.getSessionTitle(sessionId);
  } catch {
    return undefined;
  }
}

/**
 * Clear all renamed sessions
 */
export async function clearRenameCache(): Promise<void> {
  // SQLite titles are preserved - this is a no-op now
  // The session_titles table persists across index rebuilds
}

/**
 * Migrate renames from legacy JSON file to SQLite index.
 * Call this during startup to import any old renames.
 * After migration, the JSON file can be deleted.
 */
export async function migrateRenamesToIndex(): Promise<number> {
  // Check for legacy JSON file
  if (!existsSync(LEGACY_RENAME_FILE)) {
    return 0;
  }

  try {
    const file = Bun.file(LEGACY_RENAME_FILE);
    const cache = await file.json() as Record<string, { title: string; renamedAt: string }>;
    const entries = Object.entries(cache);

    if (entries.length === 0) {
      return 0;
    }

    const index = getSearchIndex();
    let migrated = 0;

    for (const [sessionId, { title }] of entries) {
      // Only migrate if not already in index
      const existingTitle = index.getSessionTitle(sessionId);
      if (!existingTitle) {
        index.setSessionTitle(sessionId, title);
        migrated++;
      }
    }

    // Delete the legacy file after successful migration
    if (migrated > 0 || entries.length > 0) {
      await Bun.write(LEGACY_RENAME_FILE, "{}");
    }

    return migrated;
  } catch {
    return 0;
  }
}
