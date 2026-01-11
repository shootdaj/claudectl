import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getSearchIndex } from "./search-index";

const CACHE_DIR = join(homedir(), ".claudectl");
const RENAME_CACHE_FILE = join(CACHE_DIR, "renamed-sessions.json");

interface RenameCache {
  [sessionId: string]: {
    title: string;
    renamedAt: string;
  };
}

/**
 * Load rename cache from disk
 */
async function loadRenameCache(): Promise<RenameCache> {
  try {
    const file = Bun.file(RENAME_CACHE_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Cache doesn't exist or is corrupt
  }
  return {};
}

/**
 * Save rename cache to disk
 */
async function saveRenameCache(cache: RenameCache): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  await Bun.write(RENAME_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Get user-renamed title for a session (if renamed)
 */
export async function getRenamedTitle(sessionId: string): Promise<string | undefined> {
  const cache = await loadRenameCache();
  return cache[sessionId]?.title;
}

/**
 * Rename a session (user-assigned custom title)
 */
export async function renameSession(sessionId: string, title: string): Promise<void> {
  // Update JSON file (legacy/backup)
  const cache = await loadRenameCache();
  cache[sessionId] = {
    title,
    renamedAt: new Date().toISOString(),
  };
  await saveRenameCache(cache);

  // Update SQLite index (primary)
  try {
    const index = getSearchIndex();
    index.setSessionTitle(sessionId, title);
  } catch {
    // Index may not be available, JSON file is the fallback
  }
}

/**
 * Clear all renamed sessions
 */
export async function clearRenameCache(): Promise<void> {
  try {
    await Bun.write(RENAME_CACHE_FILE, "{}");
  } catch {
    // Ignore errors
  }
}

/**
 * Migrate renames from JSON file to SQLite index.
 * Call this during startup to ensure index has all renames.
 */
export async function migrateRenamesToIndex(): Promise<number> {
  const cache = await loadRenameCache();
  const entries = Object.entries(cache);

  if (entries.length === 0) {
    return 0;
  }

  try {
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

    return migrated;
  } catch {
    return 0;
  }
}
