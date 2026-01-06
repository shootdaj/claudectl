import { describe, test, expect } from "bun:test";
import { join } from "path";
import {
  discoverSessions,
  findSession,
  getSessionsForDirectory,
  formatRelativeTime,
  type Session,
} from "./sessions";

const FIXTURES_DIR = join(import.meta.dir, "../test-fixtures/sessions/projects");

describe("sessions", () => {
  // Note: Tests use useIndex: false to test file-based discovery
  // Index-based discovery is tested in search-index.test.ts

  describe("discoverSessions", () => {
    test("discovers all sessions from projects directory", async () => {
      const sessions = await discoverSessions({
        projectsDir: FIXTURES_DIR,
        homeDir: "/Users/test",
        useIndex: false,
      });

      expect(sessions).toHaveLength(2);
    });

    test("sessions are sorted by last accessed (most recent first)", async () => {
      const sessions = await discoverSessions({
        projectsDir: FIXTURES_DIR,
        homeDir: "/Users/test",
        useIndex: false,
      });

      // session-xyz789 was last accessed on 2025-12-19, session-abc123 on 2025-12-18
      expect(sessions[0].id).toBe("session-xyz789");
      expect(sessions[1].id).toBe("session-abc123");
    });

    test("extracts session metadata correctly", async () => {
      const sessions = await discoverSessions({
        projectsDir: FIXTURES_DIR,
        homeDir: "/Users/test",
        useIndex: false,
      });

      const session1 = sessions.find((s) => s.id === "session-abc123")!;
      expect(session1).toBeDefined();
      expect(session1.title).toBe("Hello");
      expect(session1.slug).toBe("first-session");
      expect(session1.workingDirectory).toBe("/Users/test/project1");
      expect(session1.shortPath).toBe("~/project1");
      expect(session1.gitBranch).toBe("main");
      expect(session1.model).toBe("claude-opus-4-5-20251101");
      expect(session1.messageCount).toBe(2);
      expect(session1.userMessageCount).toBe(1);
      expect(session1.assistantMessageCount).toBe(1);
      expect(session1.machine).toBe("local");

      const session2 = sessions.find((s) => s.id === "session-xyz789")!;
      expect(session2).toBeDefined();
      expect(session2.title).toBe("Help me");
      expect(session2.slug).toBe("second-session");
      expect(session2.workingDirectory).toBe("/Users/test/project2");
      expect(session2.gitBranch).toBe("feature");
      expect(session2.model).toBe("claude-sonnet-4-20250514");
      expect(session2.messageCount).toBe(4);
    });

    test("returns empty array if projects directory doesn't exist", async () => {
      const sessions = await discoverSessions({
        projectsDir: "/nonexistent/path",
        useIndex: false,
      });

      expect(sessions).toHaveLength(0);
    });
  });

  describe("findSession", () => {
    test("finds session by exact ID", async () => {
      const session = await findSession("session-abc123", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeDefined();
      expect(session?.id).toBe("session-abc123");
    });

    test("finds session by exact slug", async () => {
      const session = await findSession("first-session", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeDefined();
      expect(session?.id).toBe("session-abc123");
    });

    test("finds session by partial ID prefix", async () => {
      const session = await findSession("session-abc", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeDefined();
      expect(session?.id).toBe("session-abc123");
    });

    test("finds session by partial slug (case-insensitive)", async () => {
      const session = await findSession("FIRST", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeDefined();
      expect(session?.id).toBe("session-abc123");
    });

    test("finds session by partial title (case-insensitive)", async () => {
      const session = await findSession("help", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeDefined();
      expect(session?.id).toBe("session-xyz789");
    });

    test("returns undefined for non-existent session", async () => {
      const session = await findSession("nonexistent", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(session).toBeUndefined();
    });
  });

  describe("getSessionsForDirectory", () => {
    test("returns sessions for specific directory", async () => {
      const sessions = await getSessionsForDirectory("/Users/test/project1", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("session-abc123");
    });

    test("returns empty array for directory with no sessions", async () => {
      const sessions = await getSessionsForDirectory("/nonexistent", {
        projectsDir: FIXTURES_DIR,
        useIndex: false,
      });

      expect(sessions).toHaveLength(0);
    });
  });

  describe("formatRelativeTime", () => {
    test("formats just now", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");
    });

    test("formats minutes", () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe("5m ago");
    });

    test("formats hours", () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe("3h ago");
    });

    test("formats days", () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe("2d ago");
    });

    test("formats weeks", () => {
      const date = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe("2w ago");
    });

    test("formats months", () => {
      const date = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe("1mo ago");
    });
  });
});
