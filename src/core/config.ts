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
}

const DEFAULT_SETTINGS: ClaudectlSettings = {
  skipPermissions: false,
  autoAddAgentExpert: true,
};

/**
 * Get the claudectl install/config directory.
 */
export function getClaudectlDir(): string {
  return join(homedir(), ".claudectl");
}

/**
 * Get the path to claudectl's settings file.
 */
export function getClaudectlSettingsPath(): string {
  return join(getClaudectlDir(), "settings.json");
}

/**
 * Load claudectl settings from disk.
 */
export function loadClaudectlSettings(): ClaudectlSettings {
  const settingsPath = getClaudectlSettingsPath();

  if (!existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const file = Bun.file(settingsPath);
    const text = require("fs").readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(text);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save claudectl settings to disk.
 */
export async function saveClaudectlSettings(settings: ClaudectlSettings): Promise<void> {
  const dir = getClaudectlDir();
  const settingsPath = getClaudectlSettingsPath();

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
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
