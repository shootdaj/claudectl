import { readdir, stat, mkdir, rename } from "fs/promises";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { getProjectsDir, getClaudeDir, isScratchPath } from "./config";
import { decodePath, shortenPath, encodePath } from "../utils/paths";
import { parseSessionMetadata, parseJsonl, getMessageContent, type SessionMetadata } from "../utils/jsonl";
import { getRenamedTitle } from "./title-generator";
import { getSearchIndex, closeSearchIndex, type SearchResult as IndexSearchResult, type IndexedSession } from "./search-index";

export { closeSearchIndex };

/**
 * Repair sessions with missing working directories.
 * For scratch sessions: recreates the directory.
 * For project sessions: marks them but doesn't delete.
 * Returns count of repaired sessions.
 */
export function repairOrphanedSessions(): { repaired: number; unfixable: number } {
  const index = getSearchIndex();
  const allSessions = index.getSessions({ includeArchived: true });

  let repaired = 0;
  let unfixable = 0;

  for (const session of allSessions) {
    if (!existsSync(session.workingDirectory)) {
      // Directory is missing - try to recreate it
      if (isScratchPath(session.workingDirectory)) {
        // Scratch session - recreate the directory
        try {
          mkdirSync(session.workingDirectory, { recursive: true });
          repaired++;
        } catch {
          unfixable++;
        }
      } else {
        // Project session - can't recreate project folders
        unfixable++;
      }
    }
  }

  return { repaired, unfixable };
}

/**
 * Repair sessions that have mismatched cwd in their JSONL file.
 * This happens when sessions are promoted/moved but the internal cwd wasn't updated.
 */
export function repairSessionCwd(): { repaired: number; errors: number } {
  const claudeDir = getClaudeDir();
  const projectsDir = join(claudeDir, "projects");

  let repaired = 0;
  let errors = 0;

  if (!existsSync(projectsDir)) {
    return { repaired, errors };
  }

  const encodedDirs = readdirSync(projectsDir);

  for (const encodedDir of encodedDirs) {
    const dirPath = join(projectsDir, encodedDir);
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const expectedCwd = decodePath(encodedDir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        let needsRepair = false;

        // Check if any line has wrong cwd
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.cwd && obj.cwd !== expectedCwd) {
              needsRepair = true;
              break;
            }
          } catch {
            // Skip malformed lines
          }
        }

        if (needsRepair) {
          // Update all cwd fields
          const updatedLines = lines.map((line) => {
            if (!line.trim()) return line;
            try {
              const obj = JSON.parse(line);
              if (obj.cwd && obj.cwd !== expectedCwd) {
                obj.cwd = expectedCwd;
                return JSON.stringify(obj);
              }
              return line;
            } catch {
              return line;
            }
          });
          writeFileSync(filePath, updatedLines.join("\n"));
          repaired++;
        }
      } catch {
        errors++;
      }
    }
  }

  return { repaired, errors };
}

/**
 * Reindex sessions that exist on disk but are missing from the index.
 */
export function reindexMissingSessions(): { added: number; errors: number } {
  const claudeDir = getClaudeDir();
  const projectsDir = join(claudeDir, "projects");
  const index = getSearchIndex();

  let added = 0;
  let errors = 0;

  if (!existsSync(projectsDir)) {
    return { added, errors };
  }

  const encodedDirs = readdirSync(projectsDir);

  for (const encodedDir of encodedDirs) {
    const dirPath = join(projectsDir, encodedDir);
    const dirStat = statSync(dirPath);
    if (!dirStat.isDirectory()) continue;

    const files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const filePath = join(dirPath, file);

      // Check directly in DB if this file path exists
      if (index.hasFilePath(filePath)) continue;

      // Session exists on disk but not in index - add it
      try {
        index.indexFileByPath(filePath);
        added++;
      } catch {
        errors++;
      }
    }
  }

  return { added, errors };
}

/**
 * Options for launching Claude
 */
export interface LaunchClaudeOptions {
  /** Working directory to run in */
  cwd: string;
  /** Session ID to resume (if resuming) */
  resumeSessionId?: string;
  /** Additional prompt to send */
  prompt?: string;
  /** Use --dangerously-skip-permissions */
  skipPermissions?: boolean;
  /** Just return what would happen without actually launching */
  dryRun?: boolean;
  /** Suppress startup logs (for TUI launches) */
  quiet?: boolean;
}

/**
 * Centralized function to launch Claude.
 * ALL session launches should go through this to ensure consistent flag handling.
 */
export async function launchClaude(
  options: LaunchClaudeOptions
): Promise<{ command: string; cwd: string; exitCode?: number }> {
  const args: string[] = [];

  // Skip permissions flag
  if (options.skipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  // Resume flag
  if (options.resumeSessionId) {
    args.push("--resume", options.resumeSessionId);
  }

  // Prompt (must be last)
  if (options.prompt) {
    args.push(options.prompt);
  }

  const command = `claude ${args.join(" ")}`;
  const cwd = options.cwd;

  if (options.dryRun) {
    return { command, cwd };
  }

  // Verify directory exists before proceeding
  const { existsSync, mkdirSync } = await import("fs");
  if (!existsSync(cwd)) {
    // For scratch sessions, we can recreate the directory
    // For other sessions, the project might have been deleted
    if (cwd.includes(".claudectl/scratch")) {
      mkdirSync(cwd, { recursive: true });
    } else {
      throw new Error(`Session directory no longer exists: ${cwd}`);
    }
  }

  // Log what we're doing (unless quiet mode)
  if (!options.quiet) {
    console.log(`\nStarting Claude in ${cwd}...`);
    if (options.skipPermissions) {
      console.log(`Mode: --dangerously-skip-permissions`);
    }
    if (options.resumeSessionId) {
      console.log(`Resuming: ${options.resumeSessionId}`);
    }
    console.log("");
  }

  // Change to session directory so terminal title updates
  process.chdir(cwd);

  // Ignore SIGINT while Claude is running (so Ctrl+C only affects Claude)
  const originalSigint = process.listeners("SIGINT");
  process.removeAllListeners("SIGINT");
  process.on("SIGINT", () => {
    // Ignore - let Claude handle it
  });

  // Spawn Claude with full terminal control
  const proc = Bun.spawn(["claude", ...args], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });

  // Wait for Claude to exit
  const exitCode = await proc.exited;

  // Restore SIGINT handlers
  process.removeAllListeners("SIGINT");
  for (const listener of originalSigint) {
    process.on("SIGINT", listener as () => void);
  }

  return { command, cwd, exitCode };
}

/**
 * Represents a Claude Code session
 */
export interface Session {
  /** Session UUID (filename without .jsonl) */
  id: string;
  /** Display title (first user message, truncated) */
  title: string;
  /** Session slug (auto-generated name like "optimized-plotting-pancake") */
  slug?: string;
  /** Original working directory (decoded from folder name) */
  workingDirectory: string;
  /** Shortened path with ~ for home */
  shortPath: string;
  /** Path-encoded directory name */
  encodedPath: string;
  /** Full path to the .jsonl file */
  filePath: string;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last accessed */
  lastAccessedAt: Date;
  /** Total number of messages */
  messageCount: number;
  /** Number of user messages */
  userMessageCount: number;
  /** Number of assistant messages */
  assistantMessageCount: number;
  /** Git branch at session start */
  gitBranch?: string;
  /** Model used in the session */
  model?: string;
  /** Total input tokens used */
  totalInputTokens: number;
  /** Total output tokens used */
  totalOutputTokens: number;
  /** Machine identifier (for future remote support) */
  machine: "local";
  /** Whether the session was deleted from disk but still in index */
  isDeleted?: boolean;
  /** When the session was deleted */
  deletedAt?: Date;
  /** Whether the session is archived (hidden from main list) */
  isArchived?: boolean;
  /** When the session was archived */
  archivedAt?: Date;
}

/**
 * Options for session discovery
 */
export interface DiscoverOptions {
  /** Custom projects directory (for testing) */
  projectsDir?: string;
  /** Custom home directory (for path shortening) */
  homeDir?: string;
  /** Include empty sessions (0 messages). Default: false */
  includeEmpty?: boolean;
  /** Include subagent sessions (agent-* prefix). Default: false */
  includeAgents?: boolean;
  /** Minimum message count to include. Default: 1 */
  minMessages?: number;
  /** Use SQLite index for fast discovery. Default: true */
  useIndex?: boolean;
  /** Include archived sessions. Default: false */
  includeArchived?: boolean;
  /** Only show archived sessions. Default: false */
  archivedOnly?: boolean;
  /** Filter out sessions with non-existent working directories. Default: false */
  validatePaths?: boolean;
}

/**
 * Discover all sessions across all projects
 * Uses SQLite index for fast discovery by default
 */
export async function discoverSessions(
  options: DiscoverOptions = {}
): Promise<Session[]> {
  const useIndex = options.useIndex ?? true;

  // Try fast index-based discovery first
  if (useIndex) {
    try {
      return discoverSessionsFromIndex(options);
    } catch {
      // Fall back to JSONL parsing
    }
  }

  return discoverSessionsFromFiles(options);
}

/**
 * Fast session discovery using SQLite index
 */
function discoverSessionsFromIndex(options: DiscoverOptions = {}): Session[] {
  const index = getSearchIndex();
  const minMessages = options.minMessages ?? 1;
  const includeEmpty = options.includeEmpty ?? false;
  const includeAgents = options.includeAgents ?? false;
  const includeArchived = options.includeArchived ?? false;
  const archivedOnly = options.archivedOnly ?? false;
  const validatePaths = options.validatePaths ?? false;

  const indexedSessions = index.getSessions({
    minMessages: includeEmpty ? 0 : minMessages,
    excludeEmpty: !includeEmpty,
    includeArchived,
    archivedOnly,
  });

  // Convert IndexedSession to Session
  let sessions: Session[] = indexedSessions.map(s => ({
    id: s.id,
    title: s.customTitle || (s.firstUserMessage ? cleanTitle(s.firstUserMessage) : null) || s.slug || s.id.slice(0, 8),
    slug: s.slug,
    workingDirectory: s.workingDirectory,
    shortPath: s.shortPath,
    encodedPath: s.encodedPath,
    filePath: s.filePath,
    createdAt: s.createdAt,
    lastAccessedAt: s.lastAccessedAt,
    messageCount: s.messageCount,
    userMessageCount: s.userMessageCount,
    assistantMessageCount: s.assistantMessageCount,
    gitBranch: s.gitBranch,
    model: s.model,
    totalInputTokens: s.totalInputTokens,
    totalOutputTokens: s.totalOutputTokens,
    machine: "local",
    isDeleted: s.isDeleted,
    deletedAt: s.deletedAt,
    isArchived: s.isArchived,
    archivedAt: s.archivedAt,
  }));

  // Filter agents if needed
  if (!includeAgents) {
    sessions = sessions.filter(s => !s.id.startsWith("agent-"));
  }

  // Optionally filter out sessions with non-existent working directories
  // This is slower but prevents showing orphaned sessions
  if (validatePaths) {
    const { existsSync } = require("fs");
    sessions = sessions.filter(s => existsSync(s.workingDirectory));
  }

  return sessions;
}

/**
 * Slow session discovery from JSONL files (fallback)
 */
async function discoverSessionsFromFiles(
  options: DiscoverOptions = {}
): Promise<Session[]> {
  const projectsDir = options.projectsDir || getProjectsDir();
  const sessions: Session[] = [];

  let encodedDirs: string[];
  try {
    encodedDirs = await readdir(projectsDir);
  } catch (error) {
    // Projects directory doesn't exist yet
    return [];
  }

  for (const encodedDir of encodedDirs) {
    const dirPath = join(projectsDir, encodedDir);

    // Skip if not a directory
    try {
      const dirStat = await stat(dirPath);
      if (!dirStat.isDirectory()) continue;
    } catch {
      continue;
    }

    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;

      const sessionId = file.replace(".jsonl", "");
      const filePath = join(dirPath, file);

      try {
        const metadata = await parseSessionMetadata(filePath);
        const workingDirectory = decodePath(encodedDir);

        // Check if user renamed this session
        const renamedTitle = await getRenamedTitle(sessionId);

        // Priority: user rename > first user message > slug > session ID prefix
        const title = renamedTitle
          || (metadata.firstUserMessage ? cleanTitle(metadata.firstUserMessage) : null)
          || metadata.slug
          || sessionId.slice(0, 8);

        sessions.push({
          id: sessionId,
          title,
          slug: metadata.slug,
          workingDirectory,
          shortPath: shortenPath(workingDirectory, options.homeDir),
          encodedPath: encodedDir,
          filePath,
          createdAt: metadata.createdAt,
          lastAccessedAt: metadata.lastAccessedAt,
          messageCount: metadata.messageCount,
          userMessageCount: metadata.userMessageCount,
          assistantMessageCount: metadata.assistantMessageCount,
          gitBranch: metadata.gitBranch,
          model: metadata.model,
          totalInputTokens: metadata.totalInputTokens,
          totalOutputTokens: metadata.totalOutputTokens,
          machine: "local",
        });
      } catch {
        // Skip sessions that can't be parsed
        continue;
      }
    }
  }

  // Filter based on options
  const minMessages = options.minMessages ?? 1;
  const includeEmpty = options.includeEmpty ?? false;
  const includeAgents = options.includeAgents ?? false;

  const filtered = sessions.filter((s) => {
    // Filter out empty sessions unless explicitly included
    if (!includeEmpty && s.messageCount < minMessages) {
      return false;
    }

    // Filter out agent sessions (subagents from Task tool) unless explicitly included
    if (!includeAgents && s.id.startsWith("agent-")) {
      return false;
    }

    return true;
  });

  // Sort by last accessed (most recent first)
  return filtered.sort(
    (a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()
  );
}

/**
 * Get a session by exact ID
 */
export async function getSessionById(
  sessionId: string,
  options: DiscoverOptions = {}
): Promise<Session | undefined> {
  const sessions = await discoverSessions({
    ...options,
    includeAgents: true,
    includeEmpty: true,
  });
  return sessions.find((s) => s.id === sessionId);
}

/**
 * Find a session by ID, slug, or title (exact or partial match)
 */
export async function findSession(
  query: string,
  options: DiscoverOptions = {}
): Promise<Session | undefined> {
  // For find, include all sessions (even agents) in case user wants them
  const sessions = await discoverSessions({
    ...options,
    includeAgents: true,
    includeEmpty: true,
  });

  // Try exact ID match first
  const exactIdMatch = sessions.find((s) => s.id === query);
  if (exactIdMatch) return exactIdMatch;

  // Try exact slug match
  const slugMatch = sessions.find((s) => s.slug === query);
  if (slugMatch) return slugMatch;

  // Try partial ID match (prefix)
  const partialIdMatch = sessions.find((s) => s.id.startsWith(query));
  if (partialIdMatch) return partialIdMatch;

  // Try fuzzy match on slug (case-insensitive contains)
  const lowerQuery = query.toLowerCase();
  const fuzzySlugMatch = sessions.find((s) =>
    s.slug?.toLowerCase().includes(lowerQuery)
  );
  if (fuzzySlugMatch) return fuzzySlugMatch;

  // Try fuzzy match on title (case-insensitive contains)
  const fuzzyTitleMatch = sessions.find((s) =>
    s.title.toLowerCase().includes(lowerQuery)
  );
  if (fuzzyTitleMatch) return fuzzyTitleMatch;

  return undefined;
}

/**
 * Get sessions for a specific working directory
 */
export async function getSessionsForDirectory(
  directory: string,
  options: DiscoverOptions = {}
): Promise<Session[]> {
  const sessions = await discoverSessions(options);
  return sessions.filter((s) => s.workingDirectory === directory);
}

/**
 * Launch a session in Claude Code
 * Returns after Claude exits (does not call process.exit)
 *
 * This is a convenience wrapper around launchClaude for resuming sessions.
 */
export async function launchSession(
  session: Session,
  options: { dryRun?: boolean; prompt?: string; skipPermissions?: boolean; quiet?: boolean } = {}
): Promise<{ command: string; cwd: string; exitCode?: number }> {
  // Re-decode from encodedPath to fix any legacy bugs in stored working directory
  // This ensures we always use the current (fixed) path decoding logic
  const cwd = session.encodedPath ? decodePath(session.encodedPath) : session.workingDirectory;

  return launchClaude({
    cwd,
    resumeSessionId: session.id,
    prompt: options.prompt,
    skipPermissions: options.skipPermissions,
    dryRun: options.dryRun,
    quiet: options.quiet,
  });
}

/**
 * Move a session to a new working directory.
 * Moves the JSONL file and updates the SQLite index atomically.
 *
 * The operation is atomic to prevent race conditions with syncIndex():
 * 1. Delete old index entry (preserving user metadata like archive status, title)
 * 2. Rename the file on disk
 * 3. Re-index at the new location (restoring preserved metadata)
 */
export async function moveSession(
  session: Session,
  newWorkingDirectory: string
): Promise<Session> {
  const claudeDir = getClaudeDir();
  const projectsDir = join(claudeDir, "projects");

  // Verify source session file exists
  const { existsSync, readFileSync, writeFileSync } = await import("fs");
  if (!existsSync(session.filePath)) {
    throw new Error(`Session file no longer exists: ${session.filePath}`);
  }

  // Encode new path
  const newEncodedPath = encodePath(newWorkingDirectory);
  const newDirPath = join(projectsDir, newEncodedPath);
  const newShortPath = shortenPath(newWorkingDirectory);

  // Create new directory if needed
  await mkdir(newDirPath, { recursive: true });

  const oldFilePath = session.filePath;
  const newFilePath = join(newDirPath, `${session.id}.jsonl`);

  // Step 1: Delete old index entry, preserving user metadata
  const index = getSearchIndex();
  const preservedState = index.deleteSession(session.id);

  // Step 2: Update cwd field in JSONL file before moving
  // Claude Code checks this field to verify the session belongs to the directory
  const content = readFileSync(oldFilePath, "utf-8");
  const lines = content.split("\n");
  const updatedLines = lines.map((line) => {
    if (!line.trim()) return line;
    try {
      const obj = JSON.parse(line);
      if (obj.cwd && obj.cwd !== newWorkingDirectory) {
        obj.cwd = newWorkingDirectory;
        return JSON.stringify(obj);
      }
      return line;
    } catch {
      return line;
    }
  });
  writeFileSync(oldFilePath, updatedLines.join("\n"));

  // Step 3: Move JSONL file
  await rename(oldFilePath, newFilePath);

  // Step 4: Re-index at new location with preserved metadata
  await index.indexFileByPath(newFilePath, preservedState ?? undefined);

  return {
    ...session,
    workingDirectory: newWorkingDirectory,
    encodedPath: newEncodedPath,
    filePath: newFilePath,
    shortPath: newShortPath,
  };
}

/**
 * Clean a title by removing newlines and excess whitespace (no truncation)
 */
function cleanTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Search result with matching context
 */
export interface SearchResult {
  session: Session;
  matches: SearchMatch[];
  totalMatches: number;
}

/**
 * A single match within a session
 */
export interface SearchMatch {
  type: "user" | "assistant";
  content: string;
  context: string; // Snippet with surrounding context
  lineNumber: number;
}

/**
 * Search options
 */
export interface SearchOptions extends DiscoverOptions {
  /** Case-sensitive search. Default: false */
  caseSensitive?: boolean;
  /** Max matches per session. Default: 5 */
  maxMatchesPerSession?: number;
  /** Context chars around match. Default: 100 */
  contextChars?: number;
  /** Max total results. Default: 50 */
  maxResults?: number;
}

/**
 * Fast full-text search using SQLite FTS5
 * Returns results with highlighted snippets
 */
export function searchSessionContent(
  query: string,
  options: SearchOptions = {}
): ContentSearchResult[] {
  if (!query.trim()) {
    return [];
  }

  const index = getSearchIndex();
  const maxResults = options.maxResults ?? 50;
  const maxMatchesPerSession = options.maxMatchesPerSession ?? 5;

  const indexResults = index.searchContent(query, {
    maxResults,
    maxMatchesPerSession,
  });

  return indexResults.map(r => ({
    sessionId: r.sessionId,
    title: r.title,
    slug: r.slug,
    workingDirectory: r.workingDirectory,
    shortPath: r.shortPath,
    filePath: r.filePath,
    model: r.model,
    lastAccessedAt: r.lastAccessedAt,
    matches: r.matches.map(m => ({
      type: m.type,
      snippet: m.snippet.replace(/>>>>/g, "").replace(/<<<<</g, ""), // Clean markers for display
      lineNumber: m.lineNumber,
      // Highlight markers for UI
      highlightedSnippet: m.snippet,
    })),
    totalMatches: r.totalMatches,
  }));
}

/**
 * Result from content search
 */
export interface ContentSearchResult {
  sessionId: string;
  title: string;
  slug?: string;
  workingDirectory: string;
  shortPath: string;
  filePath: string;
  model?: string;
  lastAccessedAt: Date;
  matches: ContentMatch[];
  totalMatches: number;
}

/**
 * A single content match
 */
export interface ContentMatch {
  type: "user" | "assistant";
  snippet: string;
  lineNumber: number;
  highlightedSnippet: string;
}

/**
 * Search through all session content for a query string
 * Uses FTS index by default for fast search
 */
export async function searchSessions(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Try fast FTS search first
  const useIndex = options.useIndex ?? true;

  if (useIndex) {
    try {
      const contentResults = searchSessionContent(query, options);

      // Convert to legacy SearchResult format for backward compatibility
      return await Promise.all(contentResults.map(async r => {
        // Get the full session for compatibility
        const session = await findSession(r.sessionId, { useIndex: true });
        if (!session) {
          // Create minimal session if not found
          return {
            session: {
              id: r.sessionId,
              title: r.title,
              slug: r.slug,
              workingDirectory: r.workingDirectory,
              shortPath: r.shortPath,
              encodedPath: "",
              filePath: r.filePath,
              createdAt: r.lastAccessedAt,
              lastAccessedAt: r.lastAccessedAt,
              messageCount: 0,
              userMessageCount: 0,
              assistantMessageCount: 0,
              totalInputTokens: 0,
              totalOutputTokens: 0,
              machine: "local" as const,
            },
            matches: r.matches.map(m => ({
              type: m.type,
              content: "",
              context: m.snippet,
              lineNumber: m.lineNumber,
            })),
            totalMatches: r.totalMatches,
          };
        }

        return {
          session,
          matches: r.matches.map(m => ({
            type: m.type,
            content: "",
            context: m.snippet,
            lineNumber: m.lineNumber,
          })),
          totalMatches: r.totalMatches,
        };
      }));
    } catch {
      // Fall back to slow search
    }
  }

  // Fallback: slow JSONL-based search
  const sessions = await discoverSessions({ ...options, useIndex: false });
  const results: SearchResult[] = [];

  const caseSensitive = options.caseSensitive ?? false;
  const maxMatchesPerSession = options.maxMatchesPerSession ?? 5;
  const contextChars = options.contextChars ?? 100;

  const searchQuery = caseSensitive ? query : query.toLowerCase();

  for (const session of sessions) {
    try {
      const messages = await parseJsonl(session.filePath);
      const matches: SearchMatch[] = [];
      let totalMatches = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.type !== "user" && msg.type !== "assistant") continue;

        const content = getMessageContent(msg);
        if (!content) continue;

        const searchContent = caseSensitive ? content : content.toLowerCase();
        let searchIndex = 0;
        let matchIndex: number;

        while ((matchIndex = searchContent.indexOf(searchQuery, searchIndex)) !== -1) {
          totalMatches++;

          // Only store up to maxMatchesPerSession full matches
          if (matches.length < maxMatchesPerSession) {
            // Extract context around match
            const start = Math.max(0, matchIndex - contextChars);
            const end = Math.min(content.length, matchIndex + query.length + contextChars);
            let context = content.slice(start, end);

            // Add ellipsis if truncated
            if (start > 0) context = "..." + context;
            if (end < content.length) context = context + "...";

            matches.push({
              type: msg.type as "user" | "assistant",
              content: content.slice(matchIndex, matchIndex + query.length),
              context: context.replace(/\n/g, " "),
              lineNumber: i + 1,
            });
          }

          searchIndex = matchIndex + 1;
        }
      }

      if (totalMatches > 0) {
        results.push({
          session,
          matches,
          totalMatches,
        });
      }
    } catch {
      // Skip sessions that can't be parsed
      continue;
    }
  }

  // Sort by total matches (most matches first)
  return results.sort((a, b) => b.totalMatches - a.totalMatches);
}

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  // Handle invalid dates
  if (isNaN(diff) || diff < 0) return "unknown";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);
  const months = Math.floor(diff / 2592000000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  return `${months}mo ago`;
}

/**
 * Sync the search index with the filesystem
 * Call this before search operations to ensure index is up-to-date
 */
export async function syncIndex(): Promise<{ added: number; updated: number; deleted: number; unchanged: number; duration: number }> {
  const index = getSearchIndex();
  return index.sync();
}

/**
 * Rebuild the entire search index from scratch
 */
export async function rebuildIndex(): Promise<{ added: number; updated: number; deleted: number; unchanged: number; duration: number }> {
  const index = getSearchIndex();
  return index.rebuild();
}

/**
 * Get search index statistics
 */
export function getIndexStats(): { sessions: number; messages: number; dbSize: number } {
  const index = getSearchIndex();
  return index.getStats();
}

/**
 * Archive a session (hide from main list)
 */
export function archiveSession(sessionId: string): void {
  const index = getSearchIndex();
  index.archiveSession(sessionId);
}

/**
 * Unarchive a session (restore to main list)
 */
export function unarchiveSession(sessionId: string): void {
  const index = getSearchIndex();
  index.unarchiveSession(sessionId);
}

/**
 * Check if a session is archived
 */
export function isSessionArchived(sessionId: string): boolean {
  const index = getSearchIndex();
  return index.isSessionArchived(sessionId);
}
