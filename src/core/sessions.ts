import { readdir, stat } from "fs/promises";
import { join } from "path";
import { getProjectsDir } from "./config";
import { decodePath, shortenPath } from "../utils/paths";
import { parseSessionMetadata, type SessionMetadata } from "../utils/jsonl";
import { getRenamedTitle } from "./title-generator";

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
}

/**
 * Discover all sessions across all projects
 */
export async function discoverSessions(
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
 * When launched (not dry run), this exits the process after Claude exits.
 */
export async function launchSession(
  session: Session,
  options: { dryRun?: boolean; prompt?: string; skipPermissions?: boolean } = {}
): Promise<{ command: string; cwd: string; exitCode?: number }> {
  const args: string[] = [];

  if (options.skipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  args.push("--resume", session.id);

  if (options.prompt) {
    args.push(options.prompt);
  }

  const command = `claude ${args.join(" ")}`;
  const cwd = session.workingDirectory;

  if (options.dryRun) {
    return { command, cwd };
  }

  // Spawn Claude with full terminal control
  const proc = Bun.spawn(["claude", ...args], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });

  // Wait for Claude to exit, then exit with same code
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

/**
 * Clean a title by removing newlines and excess whitespace (no truncation)
 */
function cleanTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
