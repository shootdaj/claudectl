import { describe, test, expect, beforeEach, mock } from "bun:test";

// Store for mock data
const mockTitles = new Map<string, string>();

// Mock the getSearchIndex function directly instead of mocking better-sqlite3
// This avoids conflicts when other tests have already loaded the real database
mock.module("./search-index", () => ({
  getSearchIndex: () => ({
    setSessionTitle: (sessionId: string, title: string) => {
      mockTitles.set(sessionId, title);
    },
    getSessionTitle: (sessionId: string) => {
      return mockTitles.get(sessionId);
    },
  }),
  closeSearchIndex: () => {},
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
