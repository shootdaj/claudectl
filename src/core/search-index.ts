/**
 * SQLite-based search index for fast session discovery and full-text search.
 *
 * The database serves as a cache/index - JSONL files remain the source of truth.
 * Uses FTS5 for full-text search with Porter stemming.
 */

import { Database } from "bun:sqlite";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";
import { parseJsonl, extractMetadata, getMessageContent, type SessionMessage } from "../utils/jsonl";
import { decodePath } from "../utils/paths";

// ============================================
// Types
// ============================================

export interface SyncStats {
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  duration: number;
}

export interface SearchMatch {
  type: "user" | "assistant";
  lineNumber: number;
  snippet: string;
}

export interface SearchResult {
  sessionId: string;
  filePath: string;
  workingDirectory: string;
  shortPath: string;
  slug?: string;
  title: string;
  model?: string;
  lastAccessedAt: Date;
  matches: SearchMatch[];
  totalMatches: number;
}

export interface IndexedSession {
  id: string;
  filePath: string;
  workingDirectory: string;
  shortPath: string;
  encodedPath: string;
  slug?: string;
  firstUserMessage?: string;
  gitBranch?: string;
  model?: string;
  createdAt: Date;
  lastAccessedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  customTitle?: string;
}

interface FileInfo {
  filePath: string;
  mtimeMs: number;
  sizeBytes: number;
  sessionId: string;
  encodedPath: string;
}

// ============================================
// Constants
// ============================================

const CLAUDECTL_DIR = join(homedir(), ".claudectl");
const INDEX_DB_PATH = join(CLAUDECTL_DIR, "index.db");
const SCHEMA_VERSION = 1;

// ============================================
// Schema
// ============================================

const SCHEMA_SQL = `
-- Pragma settings for performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = ON;

-- Schema version for migrations
CREATE TABLE IF NOT EXISTS schema_info (
    version INTEGER PRIMARY KEY,
    migrated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- File tracking for change detection
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    mtime_ms INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    indexed_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Parsed session metadata (cached)
    session_id TEXT NOT NULL,
    encoded_path TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    short_path TEXT NOT NULL,
    slug TEXT,
    first_user_message TEXT,
    git_branch TEXT,
    model TEXT,
    created_at TEXT,
    last_accessed_at TEXT,
    message_count INTEGER DEFAULT 0,
    user_message_count INTEGER DEFAULT 0,
    assistant_message_count INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_files_session_id ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_last_accessed ON files(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_working_directory ON files(working_directory);

-- Messages table for content search
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    uuid TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT,
    line_number INTEGER NOT NULL,
    content TEXT,

    UNIQUE(file_id, uuid)
);

CREATE INDEX IF NOT EXISTS idx_messages_file_id ON messages(file_id);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content='messages',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.id, OLD.content);
    INSERT INTO messages_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

-- User-defined session titles
CREATE TABLE IF NOT EXISTS session_titles (
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    renamed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ============================================
// SearchIndex Class
// ============================================

export class SearchIndex {
  private db: Database;
  private projectsDir: string;
  private homeDir: string;

  constructor(dbPath: string = INDEX_DB_PATH, projectsDir?: string) {
    // Ensure directory exists
    const dir = join(dbPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.projectsDir = projectsDir || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
    this.homeDir = homedir();

    this.initSchema();
  }

  private initSchema(): void {
    // Check if schema exists and is current version
    const versionRow = this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_info'").get();

    if (!versionRow) {
      // Fresh database - create schema
      this.db.exec(SCHEMA_SQL);
      this.db.run("INSERT OR REPLACE INTO schema_info (version) VALUES (?)", [SCHEMA_VERSION]);
    } else {
      // Check version and migrate if needed
      const currentVersion = this.db.query("SELECT MAX(version) as v FROM schema_info").get() as { v: number } | null;
      if (!currentVersion || currentVersion.v < SCHEMA_VERSION) {
        // Future: handle migrations here
        this.db.run("INSERT OR REPLACE INTO schema_info (version) VALUES (?)", [SCHEMA_VERSION]);
      }
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Sync the index with the filesystem
   */
  async sync(): Promise<SyncStats> {
    const startTime = Date.now();
    const stats: SyncStats = { added: 0, updated: 0, deleted: 0, unchanged: 0, duration: 0 };

    // Get all session files from filesystem
    const diskFiles = await this.getAllSessionFiles();
    const diskFileMap = new Map(diskFiles.map(f => [f.filePath, f]));

    // Get all indexed files from database
    const indexedFiles = this.db.query("SELECT id, file_path, mtime_ms, size_bytes FROM files").all() as Array<{
      id: number;
      file_path: string;
      mtime_ms: number;
      size_bytes: number;
    }>;
    const indexedMap = new Map(indexedFiles.map(f => [f.file_path, f]));

    // Find files to delete (in DB but not on disk)
    for (const indexed of indexedFiles) {
      if (!diskFileMap.has(indexed.file_path)) {
        this.db.run("DELETE FROM files WHERE id = ?", [indexed.id]);
        stats.deleted++;
      }
    }

    // Find files to add or update
    for (const diskFile of diskFiles) {
      const indexed = indexedMap.get(diskFile.filePath);

      if (!indexed) {
        // New file - index it
        await this.indexFile(diskFile);
        stats.added++;
      } else if (
        indexed.mtime_ms !== diskFile.mtimeMs ||
        indexed.size_bytes !== diskFile.sizeBytes
      ) {
        // Changed file - re-index it
        this.db.run("DELETE FROM files WHERE id = ?", [indexed.id]);
        await this.indexFile(diskFile);
        stats.updated++;
      } else {
        // Unchanged - skip
        stats.unchanged++;
      }
    }

    stats.duration = Date.now() - startTime;
    return stats;
  }

  /**
   * Get all session files from the projects directory
   */
  private async getAllSessionFiles(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    if (!existsSync(this.projectsDir)) {
      return files;
    }

    try {
      const encodedDirs = await readdir(this.projectsDir);

      for (const encodedPath of encodedDirs) {
        const dirPath = join(this.projectsDir, encodedPath);
        const dirStat = await stat(dirPath).catch(() => null);

        if (!dirStat?.isDirectory()) continue;

        const sessionFiles = await readdir(dirPath).catch(() => []);

        for (const file of sessionFiles) {
          if (!file.endsWith(".jsonl")) continue;

          const filePath = join(dirPath, file);
          const fileStat = await stat(filePath).catch(() => null);

          if (!fileStat) continue;

          files.push({
            filePath,
            mtimeMs: Math.floor(fileStat.mtimeMs),
            sizeBytes: fileStat.size,
            sessionId: file.replace(".jsonl", ""),
            encodedPath,
          });
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return files;
  }

  /**
   * Index a single session file
   */
  private async indexFile(fileInfo: FileInfo): Promise<void> {
    const messages = await parseJsonl(fileInfo.filePath);
    const metadata = extractMetadata(messages);

    const workingDirectory = decodePath(fileInfo.encodedPath);
    const shortPath = workingDirectory.startsWith(this.homeDir)
      ? "~" + workingDirectory.slice(this.homeDir.length)
      : workingDirectory;

    // Safely convert dates to ISO strings (fallback to current time if invalid)
    const safeDate = (date: Date): string => {
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date.toISOString();
      }
      return new Date().toISOString();
    };

    // Insert file record
    const result = this.db.run(`
      INSERT INTO files (
        file_path, mtime_ms, size_bytes, session_id, encoded_path,
        working_directory, short_path, slug, first_user_message, git_branch, model,
        created_at, last_accessed_at, message_count, user_message_count,
        assistant_message_count, total_input_tokens, total_output_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fileInfo.filePath,
      fileInfo.mtimeMs,
      fileInfo.sizeBytes,
      fileInfo.sessionId,
      fileInfo.encodedPath,
      workingDirectory,
      shortPath,
      metadata.slug || null,
      metadata.firstUserMessage || null,
      metadata.gitBranch || null,
      metadata.model || null,
      safeDate(metadata.createdAt),
      safeDate(metadata.lastAccessedAt),
      metadata.messageCount,
      metadata.userMessageCount,
      metadata.assistantMessageCount,
      metadata.totalInputTokens,
      metadata.totalOutputTokens,
    ]);

    const fileId = result.lastInsertRowid;

    // Insert messages with searchable content
    const insertMsg = this.db.prepare(`
      INSERT INTO messages (file_id, uuid, type, timestamp, line_number, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertBatch = this.db.transaction((msgs: Array<{ msg: SessionMessage; lineNum: number }>) => {
      for (const { msg, lineNum } of msgs) {
        const content = getMessageContent(msg);
        if (content) {
          insertMsg.run(fileId, msg.uuid, msg.type, msg.timestamp || null, lineNum, content);
        }
      }
    });

    const msgsToInsert: Array<{ msg: SessionMessage; lineNum: number }> = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === "user" || msg.type === "assistant") {
        msgsToInsert.push({ msg, lineNum: i + 1 });
      }
    }

    insertBatch(msgsToInsert);
  }

  /**
   * Get all indexed sessions sorted by last accessed
   */
  getSessions(options: { minMessages?: number; excludeEmpty?: boolean } = {}): IndexedSession[] {
    const { minMessages = 0, excludeEmpty = true } = options;

    let sql = `
      SELECT
        f.*,
        st.title as custom_title
      FROM files f
      LEFT JOIN session_titles st ON f.session_id = st.session_id
      WHERE 1=1
    `;

    if (excludeEmpty) {
      sql += ` AND f.message_count > 0`;
    }
    if (minMessages > 0) {
      sql += ` AND f.message_count >= ${minMessages}`;
    }

    sql += ` ORDER BY f.last_accessed_at DESC`;

    const rows = this.db.query(sql).all() as any[];

    return rows.map(row => ({
      id: row.session_id,
      filePath: row.file_path,
      workingDirectory: row.working_directory,
      shortPath: row.short_path,
      encodedPath: row.encoded_path,
      slug: row.slug,
      firstUserMessage: row.first_user_message,
      gitBranch: row.git_branch,
      model: row.model,
      createdAt: new Date(row.created_at),
      lastAccessedAt: new Date(row.last_accessed_at),
      messageCount: row.message_count,
      userMessageCount: row.user_message_count,
      assistantMessageCount: row.assistant_message_count,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      customTitle: row.custom_title,
    }));
  }

  /**
   * Full-text search across all message content
   */
  searchContent(query: string, options: { maxResults?: number; maxMatchesPerSession?: number } = {}): SearchResult[] {
    const { maxResults = 50, maxMatchesPerSession = 5 } = options;

    if (!query.trim()) {
      return [];
    }

    // Escape special FTS5 characters for simple queries
    const ftsQuery = this.formatFtsQuery(query);

    // First, get all matching messages with snippets (bm25 must be in direct FTS5 query)
    const matchesSql = `
      SELECT
        m.id,
        m.file_id,
        m.type,
        m.line_number,
        snippet(messages_fts, 0, '>>>>', '<<<<', '...', 32) as snippet
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.id
      WHERE messages_fts MATCH ?
      ORDER BY bm25(messages_fts)
    `;

    const matchedMessages = this.db.query(matchesSql).all(ftsQuery) as Array<{
      id: number;
      file_id: number;
      type: string;
      line_number: number;
      snippet: string;
    }>;

    if (matchedMessages.length === 0) {
      return [];
    }

    // Group matches by file_id
    const matchesByFile = new Map<number, typeof matchedMessages>();
    for (const match of matchedMessages) {
      const existing = matchesByFile.get(match.file_id) || [];
      existing.push(match);
      matchesByFile.set(match.file_id, existing);
    }

    // Get file details for matched files
    const fileIds = [...matchesByFile.keys()];
    const placeholders = fileIds.map(() => "?").join(",");

    const filesSql = `
      SELECT
        f.*,
        st.title as custom_title
      FROM files f
      LEFT JOIN session_titles st ON f.session_id = st.session_id
      WHERE f.id IN (${placeholders})
      ORDER BY f.last_accessed_at DESC
      LIMIT ?
    `;

    const files = this.db.query(filesSql).all(...fileIds, maxResults) as any[];

    return files.map(f => {
      const fileMatches = matchesByFile.get(f.id) || [];
      const title = f.custom_title || f.first_user_message || f.slug || f.session_id.slice(0, 8);

      return {
        sessionId: f.session_id,
        filePath: f.file_path,
        workingDirectory: f.working_directory,
        shortPath: f.short_path,
        slug: f.slug,
        title,
        model: f.model,
        lastAccessedAt: new Date(f.last_accessed_at),
        matches: fileMatches.slice(0, maxMatchesPerSession).map(m => ({
          type: m.type as "user" | "assistant",
          lineNumber: m.line_number,
          snippet: m.snippet,
        })),
        totalMatches: fileMatches.length,
      };
    });
  }

  /**
   * Format a query for FTS5
   */
  private formatFtsQuery(query: string): string {
    // If it looks like an advanced query, pass through
    if (query.includes('"') || query.includes(" OR ") || query.includes(" AND ") || query.includes("-") || query.includes("*")) {
      return query;
    }

    // Simple query - escape special chars and use implicit AND
    const escaped = query.replace(/[():]/g, " ").trim();
    const terms = escaped.split(/\s+/).filter(t => t.length > 0);

    // For single words, add prefix matching
    if (terms.length === 1) {
      return `${terms[0]}*`;
    }

    return terms.join(" ");
  }

  /**
   * Set a custom title for a session
   */
  setSessionTitle(sessionId: string, title: string): void {
    this.db.run(`
      INSERT OR REPLACE INTO session_titles (session_id, title, renamed_at)
      VALUES (?, ?, datetime('now'))
    `, [sessionId, title]);
  }

  /**
   * Get custom title for a session
   */
  getSessionTitle(sessionId: string): string | undefined {
    const row = this.db.query("SELECT title FROM session_titles WHERE session_id = ?").get(sessionId) as { title: string } | null;
    return row?.title;
  }

  /**
   * Get index statistics
   */
  getStats(): { sessions: number; messages: number; dbSize: number } {
    const sessions = (this.db.query("SELECT COUNT(*) as c FROM files").get() as { c: number }).c;
    const messages = (this.db.query("SELECT COUNT(*) as c FROM messages").get() as { c: number }).c;

    let dbSize = 0;
    try {
      const statResult = Bun.file(INDEX_DB_PATH).size;
      dbSize = statResult;
    } catch {}

    return { sessions, messages, dbSize };
  }

  /**
   * Rebuild the entire index from scratch
   */
  async rebuild(): Promise<SyncStats> {
    // Clear all data
    this.db.run("DELETE FROM messages");
    this.db.run("DELETE FROM files");
    // Keep session_titles - user renames should persist

    // Re-sync
    return this.sync();
  }
}

// ============================================
// Singleton Instance
// ============================================

let indexInstance: SearchIndex | null = null;

/**
 * Get the shared search index instance
 */
export function getSearchIndex(): SearchIndex {
  if (!indexInstance) {
    indexInstance = new SearchIndex();
  }
  return indexInstance;
}

/**
 * Close the shared search index instance
 */
export function closeSearchIndex(): void {
  if (indexInstance) {
    indexInstance.close();
    indexInstance = null;
  }
}
