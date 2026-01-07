import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SearchIndex } from "./search-index";

describe("SearchIndex", () => {
  let tempDir: string;
  let dbPath: string;
  let projectsDir: string;
  let index: SearchIndex;

  beforeEach(async () => {
    // Create temp directories for each test
    tempDir = await mkdtemp(join(tmpdir(), "claudectl-test-"));
    dbPath = join(tempDir, "test.db");
    projectsDir = join(tempDir, "projects");
    await mkdir(projectsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (index) {
      try {
        index.close();
      } catch {}
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("constructor and schema", () => {
    test("creates database and schema", () => {
      index = new SearchIndex(dbPath, projectsDir);
      expect(index).toBeDefined();

      // Verify database was created
      const file = Bun.file(dbPath);
      expect(file.size).toBeGreaterThan(0);
    });

    test("handles non-existent parent directory", async () => {
      const nestedPath = join(tempDir, "nested", "deeply", "test.db");
      index = new SearchIndex(nestedPath, projectsDir);
      expect(index).toBeDefined();
    });

    test("schema is idempotent", () => {
      // Create index twice - should not throw
      const index1 = new SearchIndex(dbPath, projectsDir);
      index1.close();

      index = new SearchIndex(dbPath, projectsDir);
      expect(index).toBeDefined();
    });
  });

  describe("sync", () => {
    test("returns empty stats for empty projects directory", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      const stats = await index.sync();

      expect(stats.added).toBe(0);
      expect(stats.updated).toBe(0);
      expect(stats.deleted).toBe(0);
      expect(stats.unchanged).toBe(0);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });

    test("indexes new session files", async () => {
      // Create a test session file
      const encodedDir = "-Users-test-myproject";
      const sessionDir = join(projectsDir, encodedDir);
      await mkdir(sessionDir, { recursive: true });

      const sessionId = "abc123-def456";
      const sessionFile = join(sessionDir, `${sessionId}.jsonl`);
      await writeFile(sessionFile, createTestSession("Hello world", "Hi there"));

      index = new SearchIndex(dbPath, projectsDir);
      const stats = await index.sync();

      expect(stats.added).toBe(1);
      expect(stats.updated).toBe(0);
      expect(stats.deleted).toBe(0);
      expect(stats.unchanged).toBe(0);
    });

    test("detects deleted files", async () => {
      // Create a test session
      const encodedDir = "-Users-test-myproject";
      const sessionDir = join(projectsDir, encodedDir);
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Delete the file
      await rm(sessionFile);

      // Sync again
      const stats = await index.sync();
      expect(stats.deleted).toBe(1);
    });

    test("detects updated files", async () => {
      // Create a test session
      const encodedDir = "-Users-test-myproject";
      const sessionDir = join(projectsDir, encodedDir);
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Original"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Wait a bit and modify the file
      await Bun.sleep(10);
      await writeFile(sessionFile, createTestSession("Original", "New message"));

      const stats = await index.sync();
      expect(stats.updated).toBe(1);
    });

    test("skips unchanged files", async () => {
      // Create a test session
      const encodedDir = "-Users-test-myproject";
      const sessionDir = join(projectsDir, encodedDir);
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Sync again without changes
      const stats = await index.sync();
      expect(stats.unchanged).toBe(1);
      expect(stats.added).toBe(0);
      expect(stats.updated).toBe(0);
    });

    test("handles non-existent projects directory", async () => {
      const nonExistentDir = join(tempDir, "does-not-exist");
      index = new SearchIndex(dbPath, nonExistentDir);
      const stats = await index.sync();

      expect(stats.added).toBe(0);
    });

    test("ignores non-jsonl files", async () => {
      const encodedDir = "-Users-test-project";
      const sessionDir = join(projectsDir, encodedDir);
      await mkdir(sessionDir, { recursive: true });

      await writeFile(join(sessionDir, "readme.txt"), "not a session");
      await writeFile(join(sessionDir, "config.json"), "{}");

      index = new SearchIndex(dbPath, projectsDir);
      const stats = await index.sync();

      expect(stats.added).toBe(0);
    });
  });

  describe("soft-delete", () => {
    test("marks deleted files as is_deleted instead of removing from DB", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Verify session is indexed
      let sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isDeleted).toBe(false);

      // Delete the file from disk
      await rm(sessionFile);

      // Sync again
      const stats = await index.sync();
      expect(stats.deleted).toBe(1);

      // Session should still be in DB but marked as deleted
      sessions = index.getSessions({ includeDeleted: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isDeleted).toBe(true);
      expect(sessions[0].deletedAt).toBeDefined();
    });

    test("getSessions excludes deleted sessions when includeDeleted is false", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Delete the file
      await rm(sessionFile);
      await index.sync();

      // Should not appear with includeDeleted: false
      const sessions = index.getSessions({ includeDeleted: false });
      expect(sessions.length).toBe(0);
    });

    test("getSessions includes deleted sessions by default", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Delete the file
      await rm(sessionFile);
      await index.sync();

      // Default behavior includes deleted sessions
      const sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isDeleted).toBe(true);
    });

    test("restores deleted session when file reappears", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      const sessionFile = join(sessionDir, "session1.jsonl");
      const content = createTestSession("Test session");
      await writeFile(sessionFile, content);

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Delete the file
      await rm(sessionFile);
      await index.sync();

      // Verify it's marked as deleted
      let sessions = index.getSessions();
      expect(sessions[0].isDeleted).toBe(true);

      // Restore the file (simulate backup restore)
      await writeFile(sessionFile, content);

      // Sync again
      const stats = await index.sync();
      expect(stats.updated).toBe(1);

      // Session should no longer be marked as deleted
      sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isDeleted).toBe(false);
      expect(sessions[0].deletedAt).toBeUndefined();
    });

    test("deleted sessions sorted after active sessions", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      // Create two sessions
      const session1 = join(sessionDir, "session1.jsonl");
      const session2 = join(sessionDir, "session2.jsonl");
      await writeFile(session1, createTestSession("Session 1", undefined, new Date("2024-01-01")));
      await writeFile(session2, createTestSession("Session 2", undefined, new Date("2024-06-01")));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Delete the newer session (session2)
      await rm(session2);
      await index.sync();

      // Active sessions should come first, then deleted ones
      const sessions = index.getSessions();
      expect(sessions.length).toBe(2);
      expect(sessions[0].id).toBe("session1"); // Active session first
      expect(sessions[0].isDeleted).toBe(false);
      expect(sessions[1].id).toBe("session2"); // Deleted session last
      expect(sessions[1].isDeleted).toBe(true);
    });
  });

  describe("getSessions", () => {
    test("returns empty array for empty index", () => {
      index = new SearchIndex(dbPath, projectsDir);
      const sessions = index.getSessions();
      expect(sessions).toEqual([]);
    });

    test("returns indexed sessions sorted by last accessed", async () => {
      // Create multiple sessions
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Old session", undefined, new Date("2024-01-01"))
      );
      await writeFile(
        join(sessionDir, "session2.jsonl"),
        createTestSession("New session", undefined, new Date("2024-06-15"))
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const sessions = index.getSessions();
      expect(sessions.length).toBe(2);
      // Most recent first
      expect(sessions[0].id).toBe("session2");
      expect(sessions[1].id).toBe("session1");
    });

    test("excludes empty sessions by default", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      // Empty session (no messages)
      await writeFile(join(sessionDir, "empty.jsonl"), "");
      await writeFile(join(sessionDir, "notempty.jsonl"), createTestSession("Has content"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("notempty");
    });

    test("includes empty sessions when excludeEmpty is false", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      await writeFile(join(sessionDir, "empty.jsonl"), "");
      await writeFile(join(sessionDir, "notempty.jsonl"), createTestSession("Has content"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const sessions = index.getSessions({ excludeEmpty: false });
      expect(sessions.length).toBe(2);
    });

    test("filters by minMessages", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      // Session with 2 messages
      await writeFile(join(sessionDir, "small.jsonl"), createTestSession("Small"));
      // Session with 4 messages
      await writeFile(
        join(sessionDir, "large.jsonl"),
        createTestSession("Large", "With reply", undefined, "More", "Even more")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const sessions = index.getSessions({ minMessages: 3 });
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("large");
    });

    test("includes custom titles", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Original title"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();
      index.setSessionTitle("session1", "My Custom Title");

      const sessions = index.getSessions();
      expect(sessions[0].customTitle).toBe("My Custom Title");
    });
  });

  describe("searchContent", () => {
    test("returns empty array for empty query", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      const results = index.searchContent("");
      expect(results).toEqual([]);
    });

    test("returns empty array for whitespace query", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      const results = index.searchContent("   ");
      expect(results).toEqual([]);
    });

    test("finds messages matching query", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Fix authentication bug", "Done! The auth is now working")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const results = index.searchContent("authentication");
      expect(results.length).toBe(1);
      expect(results[0].sessionId).toBe("session1");
      expect(results[0].matches.length).toBeGreaterThan(0);
    });

    test("searches across multiple sessions", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Help me with TypeScript")
      );
      await writeFile(
        join(sessionDir, "session2.jsonl"),
        createTestSession("Debug Python issue")
      );
      await writeFile(
        join(sessionDir, "session3.jsonl"),
        createTestSession("JavaScript question")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const results = index.searchContent("TypeScript");
      expect(results.length).toBe(1);
      expect(results[0].sessionId).toBe("session1");
    });

    test("supports prefix matching for single terms", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Implement authentication system")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // "auth" should match "authentication"
      const results = index.searchContent("auth");
      expect(results.length).toBe(1);
    });

    test("respects maxResults option", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });

      // Create many sessions
      for (let i = 0; i < 10; i++) {
        await writeFile(
          join(sessionDir, `session${i}.jsonl`),
          createTestSession(`Test code snippet ${i}`)
        );
      }

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const results = index.searchContent("code", { maxResults: 3 });
      expect(results.length).toBe(3);
    });

    test("includes match snippets", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Please help me fix the database connection error")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const results = index.searchContent("database");
      expect(results.length).toBe(1);
      expect(results[0].matches[0].snippet).toContain("database");
    });
  });

  describe("session titles", () => {
    test("sets and gets session title", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      index.setSessionTitle("session-123", "My Custom Title");

      const title = index.getSessionTitle("session-123");
      expect(title).toBe("My Custom Title");
    });

    test("returns undefined for non-existent title", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      const title = index.getSessionTitle("non-existent");
      expect(title).toBeUndefined();
    });

    test("overwrites existing title", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      index.setSessionTitle("session-123", "First Title");
      index.setSessionTitle("session-123", "Second Title");

      const title = index.getSessionTitle("session-123");
      expect(title).toBe("Second Title");
    });
  });

  describe("getStats", () => {
    test("returns correct counts", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "session1.jsonl"),
        createTestSession("Hello", "World")
      );
      await writeFile(
        join(sessionDir, "session2.jsonl"),
        createTestSession("Foo", "Bar")
      );

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      const stats = index.getStats();
      expect(stats.sessions).toBe(2);
      expect(stats.messages).toBe(4); // 2 sessions x 2 messages each
    });

    test("returns zero for empty index", () => {
      index = new SearchIndex(dbPath, projectsDir);
      const stats = index.getStats();

      expect(stats.sessions).toBe(0);
      expect(stats.messages).toBe(0);
    });
  });

  describe("rebuild", () => {
    test("clears and re-indexes all files", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Verify initial state
      let stats = index.getStats();
      expect(stats.sessions).toBe(1);

      // Rebuild
      const rebuildStats = await index.rebuild();
      expect(rebuildStats.added).toBe(1);
      expect(rebuildStats.updated).toBe(0);
      expect(rebuildStats.deleted).toBe(0);
    });

    test("preserves session titles after rebuild", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();
      index.setSessionTitle("session1", "My Title");

      await index.rebuild();

      // Title should still be there
      const title = index.getSessionTitle("session1");
      expect(title).toBe("My Title");
    });
  });

  describe("close", () => {
    test("closes database connection", () => {
      index = new SearchIndex(dbPath, projectsDir);
      expect(() => index.close()).not.toThrow();
    });
  });
});

// ============================================
// Helper Functions
// ============================================

function createTestSession(
  userMessage: string,
  assistantMessage?: string,
  timestamp?: Date,
  ...additionalMessages: string[]
): string {
  const ts = timestamp || new Date();
  const lines: string[] = [];

  const baseUuid = Math.random().toString(36).substring(2, 10);

  // User message
  lines.push(JSON.stringify({
    uuid: `${baseUuid}-user`,
    sessionId: "test-session",
    timestamp: ts.toISOString(),
    type: "user",
    cwd: "/Users/test/myproject",
    message: { content: userMessage },
  }));

  // Assistant response
  if (assistantMessage) {
    lines.push(JSON.stringify({
      uuid: `${baseUuid}-assistant`,
      parentUuid: `${baseUuid}-user`,
      sessionId: "test-session",
      timestamp: new Date(ts.getTime() + 1000).toISOString(),
      type: "assistant",
      cwd: "/Users/test/myproject",
      message: { content: assistantMessage },
    }));
  }

  // Additional messages (alternating user/assistant)
  for (let i = 0; i < additionalMessages.length; i++) {
    const type = i % 2 === 0 ? "user" : "assistant";
    lines.push(JSON.stringify({
      uuid: `${baseUuid}-extra-${i}`,
      sessionId: "test-session",
      timestamp: new Date(ts.getTime() + (i + 2) * 1000).toISOString(),
      type,
      cwd: "/Users/test/myproject",
      message: { content: additionalMessages[i] },
    }));
  }

  return lines.join("\n");
}
