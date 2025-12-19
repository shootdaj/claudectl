import { homedir } from "os";
import { join } from "path";

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
