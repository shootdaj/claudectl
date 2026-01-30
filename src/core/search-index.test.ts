import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SearchIndex } from "./search-index";

// Tests now work with bun:sqlite (replaced better-sqlite3)
describe("SearchIndex", () => {
  let tempDir: string;
  let dbPath: string;
  let projectsDir: string;
  let index: SearchIndex | null;

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
      expect(() => index!.close()).not.toThrow();
    });
  });

  describe("archive", () => {
    test("archives a session", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Verify session exists and is not archived
      let sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(false);

      // Archive the session
      index.archiveSession("session1");

      // Should still be in DB but marked as archived
      sessions = index.getSessions({ includeArchived: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
      expect(sessions[0].archivedAt).toBeDefined();
    });

    test("getSessions excludes archived sessions by default", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive the session
      index.archiveSession("session1");

      // Default query should exclude archived
      const sessions = index.getSessions();
      expect(sessions.length).toBe(0);
    });

    test("getSessions includes archived sessions when includeArchived is true", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive the session
      index.archiveSession("session1");

      // Should appear with includeArchived: true
      const sessions = index.getSessions({ includeArchived: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
    });

    test("getSessions returns only archived sessions when archivedOnly is true", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Active session"));
      await writeFile(join(sessionDir, "session2.jsonl"), createTestSession("Archived session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive only session2
      index.archiveSession("session2");

      // archivedOnly should return only archived sessions
      const archivedSessions = index.getSessions({ archivedOnly: true });
      expect(archivedSessions.length).toBe(1);
      expect(archivedSessions[0].id).toBe("session2");
      expect(archivedSessions[0].isArchived).toBe(true);

      // Regular query should return only active sessions
      const activeSessions = index.getSessions();
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].id).toBe("session1");
      expect(activeSessions[0].isArchived).toBe(false);
    });

    test("unarchives a session", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive then unarchive
      index.archiveSession("session1");
      let sessions = index.getSessions();
      expect(sessions.length).toBe(0); // Archived, not in default view

      index.unarchiveSession("session1");
      sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(false);
      expect(sessions[0].archivedAt).toBeUndefined();
    });

    test("isSessionArchived returns correct status", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      expect(index.isSessionArchived("session1")).toBe(false);

      index.archiveSession("session1");
      expect(index.isSessionArchived("session1")).toBe(true);

      index.unarchiveSession("session1");
      expect(index.isSessionArchived("session1")).toBe(false);
    });

    test("archived sessions can also be deleted", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive the session
      index.archiveSession("session1");

      // Delete the file from disk
      await rm(sessionFile);
      await index.sync();

      // Session should be both archived and deleted
      const sessions = index.getSessions({ includeArchived: true, includeDeleted: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
      expect(sessions[0].isDeleted).toBe(true);
    });

    test("archive survives rebuild", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();
      index.archiveSession("session1");

      // Rebuild the index
      await index.rebuild();

      // Archive status should be preserved during rebuild
      const sessions = index.getSessions({ includeArchived: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
    });
  });

  describe("deleteSession", () => {
    test("deletes session and returns preserved state", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Test session"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive and set title
      index.archiveSession("session1");
      index.setSessionTitle("session1", "My Custom Title");

      // Delete and verify preserved state
      const preserved = index.deleteSession("session1");
      expect(preserved).not.toBeNull();
      expect(preserved!.isArchived).toBe(true);
      expect(preserved!.archivedAt).toBeDefined();
      expect(preserved!.title).toBe("My Custom Title");

      // Session should be gone from index
      const sessions = index.getSessions({ includeArchived: true, includeDeleted: true });
      expect(sessions.length).toBe(0);
    });

    test("returns null for non-existent session", async () => {
      index = new SearchIndex(dbPath, projectsDir);
      const preserved = index.deleteSession("non-existent");
      expect(preserved).toBeNull();
    });

    test("cascade deletes messages", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "session1.jsonl"), createTestSession("Hello", "World"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Verify messages exist
      let stats = index.getStats();
      expect(stats.messages).toBe(2);

      // Delete session
      index.deleteSession("session1");

      // Messages should be gone too
      stats = index.getStats();
      expect(stats.sessions).toBe(0);
      expect(stats.messages).toBe(0);
    });
  });

  describe("indexFileByPath", () => {
    test("indexes file at given path", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test message"));

      index = new SearchIndex(dbPath, projectsDir);

      // Index directly without sync
      await index.indexFileByPath(sessionFile);

      const sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("session1");
    });

    test("restores preserved state when indexing", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test message"));

      index = new SearchIndex(dbPath, projectsDir);

      // Index with preserved state
      await index.indexFileByPath(sessionFile, {
        isArchived: true,
        archivedAt: "2024-01-01T00:00:00Z",
        title: "Preserved Title",
      });

      // Verify state was restored
      const sessions = index.getSessions({ includeArchived: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
      expect(sessions[0].customTitle).toBe("Preserved Title");
    });

    test("works without preserved state", async () => {
      const sessionDir = join(projectsDir, "-Users-test-project");
      await mkdir(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "session1.jsonl");
      await writeFile(sessionFile, createTestSession("Test message"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.indexFileByPath(sessionFile);

      const sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(false);
    });
  });

  describe("atomic move (deleteSession + indexFileByPath)", () => {
    test("move preserves archive status", async () => {
      const oldDir = join(projectsDir, "-Users-test-old");
      const newDir = join(projectsDir, "-Users-test-new");
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });

      const oldFile = join(oldDir, "session1.jsonl");
      const newFile = join(newDir, "session1.jsonl");
      await writeFile(oldFile, createTestSession("Test message"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Archive the session
      index.archiveSession("session1");
      index.setSessionTitle("session1", "My Title");

      // Simulate atomic move: delete, rename file, re-index
      const preserved = index.deleteSession("session1");
      await Bun.write(newFile, await Bun.file(oldFile).text());
      await index.indexFileByPath(newFile, preserved ?? undefined);

      // Verify state preserved at new location
      const sessions = index.getSessions({ includeArchived: true });
      expect(sessions.length).toBe(1);
      expect(sessions[0].isArchived).toBe(true);
      expect(sessions[0].customTitle).toBe("My Title");
      expect(sessions[0].filePath).toBe(newFile);
    });

    test("no duplicate if sync runs between delete and re-index", async () => {
      const oldDir = join(projectsDir, "-Users-test-old");
      const newDir = join(projectsDir, "-Users-test-new");
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });

      const oldFile = join(oldDir, "session1.jsonl");
      const newFile = join(newDir, "session1.jsonl");
      await writeFile(oldFile, createTestSession("Test message"));

      index = new SearchIndex(dbPath, projectsDir);
      await index.sync();

      // Step 1: Delete from index
      const preserved = index.deleteSession("session1");

      // Step 2: Move file on disk
      await Bun.write(newFile, await Bun.file(oldFile).text());
      await rm(oldFile);

      // Step 3: Simulate sync running (this would have caused the bug before)
      await index.sync();

      // Verify only one entry exists
      let sessions = index.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].filePath).toBe(newFile);

      // Step 4: Now indexFileByPath runs - should not create duplicate
      // (In real code this happens, but sync already indexed it)
      // The point is: no UNIQUE constraint error

      sessions = index.getSessions();
      expect(sessions.length).toBe(1);
    });
  });

  describe("settings", () => {
    test("getSetting returns default for missing key", () => {
      index = new SearchIndex(dbPath, projectsDir);
      expect(index.getSetting("nonexistent", "default")).toBe("default");
      expect(index.getSetting("nonexistent", 42)).toBe(42);
      expect(index.getSetting("nonexistent", true)).toBe(true);
    });

    test("setSetting and getSetting work correctly", () => {
      index = new SearchIndex(dbPath, projectsDir);
      index.setSetting("testString", "hello");
      expect(index.getSetting("testString", "default")).toBe("hello");

      index.setSetting("testNumber", 123);
      expect(index.getSetting("testNumber", 0)).toBe(123);

      index.setSetting("testBoolean", true);
      expect(index.getSetting("testBoolean", false)).toBe(true);

      index.setSetting("testObject", { foo: "bar" });
      expect(index.getSetting("testObject", {})).toEqual({ foo: "bar" });
    });

    test("setSetting overwrites existing value", () => {
      index = new SearchIndex(dbPath, projectsDir);
      index.setSetting("testKey", "first");
      expect(index.getSetting("testKey", "")).toBe("first");

      index.setSetting("testKey", "second");
      expect(index.getSetting("testKey", "")).toBe("second");
    });

    test("getAllSettings returns all settings", () => {
      index = new SearchIndex(dbPath, projectsDir);
      index.setSetting("setting1", "value1");
      index.setSetting("setting2", 42);
      index.setSetting("setting3", true);

      const all = index.getAllSettings();
      expect(all.setting1).toBe("value1");
      expect(all.setting2).toBe(42);
      expect(all.setting3).toBe(true);
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
