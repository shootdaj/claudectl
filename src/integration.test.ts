import { describe, test, expect } from "bun:test";

// Test all core modules load
describe("Module Loading", () => {
  test("sessions module", async () => {
    const mod = await import("./core/sessions");
    expect(mod.discoverSessions).toBeDefined();
    expect(mod.launchSession).toBeDefined();
    expect(mod.moveSession).toBeDefined();
    expect(mod.getSessionById).toBeDefined();
  });

  test("search-index module", async () => {
    const mod = await import("./core/search-index");
    expect(mod.getSearchIndex).toBeDefined();
    expect(mod.closeSearchIndex).toBeDefined();
  });

  test("new-project UI", async () => {
    const mod = await import("./ui/new-project");
    expect(mod.showNewProjectWizard).toBeDefined();
  });

  test("session-picker UI", async () => {
    const mod = await import("./ui/session-picker");
    expect(mod.showSessionPicker).toBeDefined();
  });
});

// Test actual functionality
describe("Session Operations", () => {
  test("discover sessions returns array", async () => {
    const { discoverSessions } = await import("./core/sessions");
    const sessions = await discoverSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
  });

  test("search returns results", async () => {
    const { searchSessionContent } = await import("./core/sessions");
    const results = searchSessionContent("test", { maxResults: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  test("getSessionById finds session", async () => {
    const { discoverSessions, getSessionById } = await import("./core/sessions");
    const sessions = await discoverSessions();
    const found = await getSessionById(sessions[0].id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(sessions[0].id);
  });
});

// Test path encoding for scratchpad
describe("Path Encoding", () => {
  test("hidden directory encoding", async () => {
    const { encodePath, decodePath } = await import("./utils/paths");

    const scratchPath = "/Users/anshul/.claudectl/scratch";
    const encoded = encodePath(scratchPath);
    expect(encoded).toBe("-Users-anshul--claudectl-scratch");

    const decoded = decodePath(encoded);
    expect(decoded).toBe(scratchPath);
  });
});

// Test moveSession (promote)
describe("Promote Flow", () => {
  test("moveSession works", async () => {
    const { discoverSessions, moveSession } = await import("./core/sessions");
    const { existsSync, rmSync, mkdirSync, cpSync } = await import("fs");

    const sessions = await discoverSessions();
    const scratchSession = sessions.find(s => s.workingDirectory.includes(".claudectl/scratch"));

    if (!scratchSession) {
      console.log("No scratch session to test promote");
      return;
    }

    const testDir = "/tmp/test-promote-integration";
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });

    // Backup
    const backup = "/tmp/promote-backup.jsonl";
    cpSync(scratchSession.filePath, backup);

    try {
      // Move to test dir
      const moved = await moveSession(scratchSession, testDir);
      expect(existsSync(moved.filePath)).toBe(true);
      expect(moved.workingDirectory).toBe(testDir);

      // Move back
      const restored = await moveSession(moved, scratchSession.workingDirectory);
      expect(existsSync(restored.filePath)).toBe(true);
    } finally {
      // Cleanup
      rmSync(testDir, { recursive: true, force: true });
      rmSync(backup, { force: true });
    }
  });
});

// Test rename
describe("Rename Flow", () => {
  test("renameSession works", async () => {
    const { discoverSessions } = await import("./core/sessions");
    const { renameSession, getRenamedTitle } = await import("./core/title-generator");

    const sessions = await discoverSessions();
    const session = sessions[0];
    const originalTitle = session.title;

    await renameSession(session.id, "INTEGRATION-TEST-TITLE");
    const newTitle = await getRenamedTitle(session.id);
    expect(newTitle).toBe("INTEGRATION-TEST-TITLE");

    // Restore
    await renameSession(session.id, originalTitle || "untitled");
  });
});
