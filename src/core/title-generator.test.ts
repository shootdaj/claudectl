import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock better-sqlite3 to avoid "not supported in Bun" error
// See: https://github.com/oven-sh/bun/issues/4290
const mockTitles = new Map<string, string>();

class MockDatabase {
  prepare(sql: string) {
    return {
      run: (...args: any[]) => {
        // Handle setSessionTitle: INSERT OR REPLACE INTO session_titles
        if (sql.includes("session_titles") && sql.includes("INSERT")) {
          const [sessionId, title] = args;
          mockTitles.set(sessionId, title);
        }
        return { lastInsertRowid: 1 };
      },
      get: (...args: any[]) => {
        // Handle getSessionTitle: SELECT title FROM session_titles
        if (sql.includes("session_titles") && sql.includes("SELECT")) {
          const [sessionId] = args;
          const title = mockTitles.get(sessionId);
          return title ? { title } : null;
        }
        return null;
      },
      all: () => [],
    };
  }
  exec() {}
  close() {}
  transaction(fn: Function) { return fn; }
}

mock.module("better-sqlite3", () => ({
  default: MockDatabase,
}));

// Import after mocking
const { getRenamedTitle, renameSession, clearRenameCache } = await import("./title-generator");

describe("title-generator", () => {
  beforeEach(() => {
    // Clear mock state before each test
    mockTitles.clear();
  });

  describe("getRenamedTitle", () => {
    test("returns undefined for non-renamed session", async () => {
      const title = await getRenamedTitle("non-existent-session-id");
      expect(title).toBeUndefined();
    });
  });

  describe("renameSession", () => {
    test("renames a session and retrieves it", async () => {
      await renameSession("test-session-1", "My Custom Title");
      const title = await getRenamedTitle("test-session-1");
      expect(title).toBe("My Custom Title");
    });

    test("overwrites existing rename", async () => {
      await renameSession("test-session-2", "First Title");
      await renameSession("test-session-2", "Second Title");
      const title = await getRenamedTitle("test-session-2");
      expect(title).toBe("Second Title");
    });
  });

  describe("clearRenameCache", () => {
    test("clears without error", async () => {
      // Just verify it doesn't throw
      await clearRenameCache();
    });
  });
});
