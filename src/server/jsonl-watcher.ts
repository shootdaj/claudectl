/**
 * JSONL File Watcher
 *
 * Watches Claude Code session JSONL files for changes and emits
 * new messages as they are appended. Uses file size polling to
 * detect changes efficiently.
 */

import { EventEmitter } from "events";
import { stat, open } from "fs/promises";
import { join } from "path";
import { getClaudeDir } from "../core/config";
import { encodePath } from "../utils/paths";

export interface JsonlMessage {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  timestamp: string;
  type: "user" | "assistant" | "summary";
  cwd?: string;
  version?: string;
  costUSD?: number;
  durationMs?: number;
  message: {
    role?: string;
    content: string | ContentBlock[];
    model?: string;
  };
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface WatcherOptions {
  pollInterval?: number; // ms between polls, default 100
  readFromStart?: boolean; // read existing messages on start
}

export class JsonlWatcher extends EventEmitter {
  private filePath: string;
  private sessionId: string;
  private lastSize: number = 0;
  private lastPosition: number = 0;
  private pollInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private readFromStart: boolean;

  constructor(sessionId: string, workingDirectory: string, options: WatcherOptions = {}) {
    super();
    this.sessionId = sessionId;
    this.pollInterval = options.pollInterval ?? 100;
    this.readFromStart = options.readFromStart ?? true;

    // Construct the JSONL file path
    const claudeDir = getClaudeDir();
    const encodedPath = encodePath(workingDirectory);
    this.filePath = join(claudeDir, "projects", encodedPath, `${sessionId}.jsonl`);
  }

  /**
   * Get the JSONL file path being watched
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Start watching the file
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;

    // Check if file exists and get initial size
    try {
      const stats = await stat(this.filePath);

      if (this.readFromStart) {
        // Read all existing messages
        await this.readNewLines(0, stats.size);
      }

      this.lastSize = stats.size;
      this.lastPosition = stats.size;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // File doesn't exist yet, that's okay
        this.lastSize = 0;
        this.lastPosition = 0;
      } else {
        throw err;
      }
    }

    // Start polling
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);

    this.emit("started", { filePath: this.filePath });
  }

  /**
   * Stop watching the file
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isWatching = false;
    this.emit("stopped");
  }

  /**
   * Check if watcher is active
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Poll for file changes
   */
  private async poll(): Promise<void> {
    try {
      const stats = await stat(this.filePath);

      if (stats.size > this.lastSize) {
        // File has grown, read new content
        await this.readNewLines(this.lastPosition, stats.size);
        this.lastSize = stats.size;
        this.lastPosition = stats.size;
      } else if (stats.size < this.lastSize) {
        // File was truncated (rare), reset
        this.lastSize = stats.size;
        this.lastPosition = 0;
        this.emit("truncated");
      }
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // File doesn't exist (yet), reset
        if (this.lastSize > 0) {
          this.lastSize = 0;
          this.lastPosition = 0;
          this.emit("deleted");
        }
      } else {
        this.emit("error", err);
      }
    }
  }

  /**
   * Read new lines from the file between two byte positions
   */
  private async readNewLines(startPos: number, endPos: number): Promise<void> {
    if (startPos >= endPos) {
      return;
    }

    const fileHandle = await open(this.filePath, "r");

    try {
      const buffer = Buffer.alloc(endPos - startPos);
      await fileHandle.read(buffer, 0, endPos - startPos, startPos);

      const content = buffer.toString("utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const message = JSON.parse(line) as JsonlMessage;
          this.emit("message", message);
        } catch (parseErr) {
          // Skip malformed lines
          this.emit("parse_error", { line, error: parseErr });
        }
      }
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Read all messages from the file (for initial load)
   */
  async readAllMessages(): Promise<JsonlMessage[]> {
    const messages: JsonlMessage[] = [];

    try {
      const stats = await stat(this.filePath);
      const fileHandle = await open(this.filePath, "r");

      try {
        const buffer = Buffer.alloc(stats.size);
        await fileHandle.read(buffer, 0, stats.size, 0);

        const content = buffer.toString("utf-8");
        const lines = content.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            messages.push(JSON.parse(line) as JsonlMessage);
          } catch {
            // Skip malformed lines
          }
        }
      } finally {
        await fileHandle.close();
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    return messages;
  }
}

/**
 * Find the JSONL file path for a session
 * Searches through all project directories
 */
export async function findSessionFile(sessionId: string): Promise<string | null> {
  const claudeDir = getClaudeDir();
  const projectsDir = join(claudeDir, "projects");

  try {
    const { readdir } = await import("fs/promises");
    const encodedDirs = await readdir(projectsDir);

    for (const encodedDir of encodedDirs) {
      const filePath = join(projectsDir, encodedDir, `${sessionId}.jsonl`);
      try {
        await stat(filePath);
        return filePath;
      } catch {
        // File doesn't exist in this directory
      }
    }
  } catch {
    // Projects directory doesn't exist
  }

  return null;
}

/**
 * Get the working directory from a session file path
 */
export function getWorkingDirectoryFromPath(filePath: string): string {
  const parts = filePath.split("/");
  const projectsIdx = parts.indexOf("projects");

  if (projectsIdx >= 0 && projectsIdx < parts.length - 2) {
    const encodedDir = parts[projectsIdx + 1];
    // Inline decode: replace leading dash with slash, other dashes with slashes
    // This is a simplified version - the full decodePath handles edge cases
    return encodedDir.replace(/^-/, "/").replace(/-/g, "/");
  }

  return "/";
}
