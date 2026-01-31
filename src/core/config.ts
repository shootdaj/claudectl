import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * Get the Claude configuration directory.
 * Defaults to ~/.claude, can be overridden via CLAUDE_CONFIG_DIR.
 */
export function getClaudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

/**
 * Get the projects directory where sessions are stored.
 */
export function getProjectsDir(): string {
  return join(getClaudeDir(), "projects");
}

/**
 * Get the path to the global Claude config file (.claude.json in home dir).
 * This contains global MCP servers, OAuth tokens, etc.
 */
export function getGlobalConfigPath(): string {
  return join(homedir(), ".claude.json");
}

/**
 * Get the path to the settings file.
 * Contains plugins, permissions, hooks, etc.
 */
export function getSettingsPath(): string {
  return join(getClaudeDir(), "settings.json");
}

/**
 * Get the path to the global CLAUDE.md file.
 */
export function getGlobalClaudeMdPath(): string {
  return join(getClaudeDir(), "CLAUDE.md");
}

/**
 * All config paths in one object for convenience.
 */
export function getAllConfigPaths() {
  return {
    claudeDir: getClaudeDir(),
    projectsDir: getProjectsDir(),
    globalConfig: getGlobalConfigPath(),
    settings: getSettingsPath(),
    globalClaudeMd: getGlobalClaudeMdPath(),
  };
}

// ============================================
// claudectl's own settings (not Claude's)
// ============================================

export interface ClaudectlSettings {
  skipPermissions: boolean;
  autoAddAgentExpert: boolean;
  defaultProjectDir: string | null;
}

const DEFAULT_SETTINGS: ClaudectlSettings = {
  skipPermissions: false,
  autoAddAgentExpert: true,
  defaultProjectDir: null,
};

/**
 * Get the claudectl install/config directory.
 */
export function getClaudectlDir(): string {
  return join(homedir(), ".claudectl");
}

/**
 * Get the scratch directory for quick questions (no git).
 * If user has configured a default project directory, uses {projectDir}/scratch/
 * Otherwise falls back to ~/.claudectl/scratch/
 * Creates the directory if it doesn't exist.
 *
 * TODO: Add migration function to move existing scratch sessions from
 * ~/.claudectl/scratch/ to the new configured location. This would use
 * moveSession() for each session. One session (X1aBzG) has subagents
 * that would need special handling.
 */
export function getScratchDir(): string {
  let defaultProjectDir: string | null = null;
  try {
    const settings = loadClaudectlSettings();
    defaultProjectDir = settings.defaultProjectDir;
  } catch {
    // Ignore errors (e.g., during tests when DB isn't available)
  }
  const dir = defaultProjectDir
    ? join(defaultProjectDir, "scratch")
    : join(getClaudectlDir(), "scratch");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate a short random ID (alphanumeric).
 * @param length Number of characters (default: 6)
 */
export function generateShortId(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Create a new unique scratch directory for a quick question session.
 * If user has configured a default project directory, creates in {projectDir}/scratch/scratch-{id}/
 * Otherwise creates in ~/.claudectl/scratch/scratch-{id}/
 */
export function createScratchDir(): string {
  const baseDir = getScratchDir();
  const uniqueDir = join(baseDir, `scratch-${generateShortId(6)}`);
  mkdirSync(uniqueDir, { recursive: true });
  return uniqueDir;
}

/**
 * Get the fallback projects directory (~/Code).
 * This is the default when no custom directory is configured.
 */
export function getFallbackProjectsDir(): string {
  return join(homedir(), "Code");
}

/**
 * Get the configured projects directory.
 * Returns the user-configured directory or the fallback (~/Code).
 * Does NOT create the directory - caller should do that if needed.
 */
export function getDefaultProjectsDir(): string {
  const settings = loadClaudectlSettings();
  return settings.defaultProjectDir || getFallbackProjectsDir();
}

/**
 * Check if the user has configured a default project directory.
 */
export function hasConfiguredProjectDir(): boolean {
  const settings = loadClaudectlSettings();
  return settings.defaultProjectDir !== null;
}

/**
 * Set the default projects directory.
 */
export function setDefaultProjectDir(dir: string): void {
  const { getSearchIndex } = require("./search-index");
  const index = getSearchIndex();
  index.setSetting("defaultProjectDir", dir);
}

/**
 * Check if a path is a scratch session path.
 * Handles both old location (~/.claudectl/scratch/) and new location ({projectDir}/scratch/)
 */
export function isScratchPath(path: string): boolean {
  // Check old location: ~/.claudectl/scratch/
  const oldScratchDir = join(getClaudectlDir(), "scratch");
  if (path === oldScratchDir || path.startsWith(oldScratchDir + "/") || path.startsWith(oldScratchDir + "\\")) {
    return true;
  }

  // Check new location: {projectDir}/scratch/
  try {
    const settings = loadClaudectlSettings();
    if (settings.defaultProjectDir) {
      const newScratchDir = join(settings.defaultProjectDir, "scratch");
      if (path === newScratchDir || path.startsWith(newScratchDir + "/") || path.startsWith(newScratchDir + "\\")) {
        return true;
      }
    }
  } catch {
    // Ignore errors (e.g., during tests when DB isn't available)
  }

  return false;
}

/**
 * Get the path to claudectl's settings file (legacy - now uses SQLite).
 * @deprecated Use loadClaudectlSettings() which reads from SQLite
 */
export function getClaudectlSettingsPath(): string {
  return join(getClaudectlDir(), "settings.json");
}

/**
 * Load claudectl settings from SQLite database.
 */
export function loadClaudectlSettings(): ClaudectlSettings {
  // Lazy import to avoid circular dependency
  const { getSearchIndex } = require("./search-index");
  const index = getSearchIndex();

  return {
    skipPermissions: index.getSetting("skipPermissions", DEFAULT_SETTINGS.skipPermissions),
    autoAddAgentExpert: index.getSetting("autoAddAgentExpert", DEFAULT_SETTINGS.autoAddAgentExpert),
    defaultProjectDir: index.getSetting("defaultProjectDir", DEFAULT_SETTINGS.defaultProjectDir),
  };
}

/**
 * Save claudectl settings to SQLite database.
 */
export async function saveClaudectlSettings(settings: ClaudectlSettings): Promise<void> {
  // Lazy import to avoid circular dependency
  const { getSearchIndex } = require("./search-index");
  const index = getSearchIndex();

  for (const [key, value] of Object.entries(settings)) {
    index.setSetting(key, value);
  }
}

// ============================================
// Claude Code settings management
// ============================================

interface ClaudeSettings {
  cleanupPeriodDays?: number;
  [key: string]: unknown;
}

/**
 * Load Claude Code's settings.json
 */
export function loadClaudeSettings(): ClaudeSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const text = require("fs").readFileSync(settingsPath, "utf-8");
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Save Claude Code's settings.json (preserves existing settings)
 */
export async function saveClaudeSettings(updates: Partial<ClaudeSettings>): Promise<void> {
  const settingsPath = getSettingsPath();
  const dir = getClaudeDir();

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Load existing settings and merge
  const existing = loadClaudeSettings();
  const merged = { ...existing, ...updates };

  await Bun.write(settingsPath, JSON.stringify(merged, null, 2));
}

/**
 * Ensure session retention is set to max (don't auto-delete old sessions).
 * WARNING: cleanupPeriodDays=0 DELETES ALL SESSIONS immediately!
 * Use 9999 (~27 years) to effectively keep forever.
 */
export async function ensureMaxSessionRetention(): Promise<boolean> {
  const settings = loadClaudeSettings();

  // 9999 days = ~27 years (effectively forever)
  // WARNING: 0 = immediate deletion, NOT disable!
  const MAX_RETENTION = 9999;

  if (settings.cleanupPeriodDays === MAX_RETENTION) {
    return false; // Already set to max
  }

  await saveClaudeSettings({ cleanupPeriodDays: MAX_RETENTION });
  return true; // Updated
}
