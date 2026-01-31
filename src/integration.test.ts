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
    // In CI, there may be no sessions - that's OK
  });

  test("search returns results", async () => {
    const { searchSessionContent } = await import("./core/sessions");
    const results = searchSessionContent("test", { maxResults: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  test("getSessionById finds session", async () => {
    const { discoverSessions, getSessionById } = await import("./core/sessions");
    const sessions = await discoverSessions();
    if (sessions.length === 0) {
      console.log("No sessions to test getSessionById - skipping");
      return;
    }
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

  test("moveSession is atomic - syncIndex after move doesn't create duplicates", async () => {
    const { discoverSessions, moveSession, syncIndex } = await import("./core/sessions");
    const { existsSync, rmSync, mkdirSync, cpSync } = await import("fs");

    const sessions = await discoverSessions();
    const scratchSession = sessions.find(s => s.workingDirectory.includes(".claudectl/scratch"));

    if (!scratchSession) {
      console.log("No scratch session to test atomic move");
      return;
    }

    const testDir = "/tmp/test-atomic-move-integration";
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });

    // Backup original file
    const backup = "/tmp/atomic-move-backup.jsonl";
    cpSync(scratchSession.filePath, backup);
    const originalId = scratchSession.id;

    try {
      // Move session
      const moved = await moveSession(scratchSession, testDir);

      // Run syncIndex - this used to create duplicates before the fix
      await syncIndex();

      // Verify only ONE session with this ID exists
      const allSessions = await discoverSessions();
      const matches = allSessions.filter(s => s.id === originalId);
      expect(matches.length).toBe(1);
      expect(matches[0].workingDirectory).toBe(testDir);

      // Move back
      await moveSession(moved, scratchSession.workingDirectory);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
      rmSync(backup, { force: true });
    }
  });
});

// Test configurable scratch folder location
describe("Scratch Folder Configuration", () => {
  test("getScratchDir uses defaultProjectDir when configured", async () => {
    const { getSearchIndex } = await import("./core/search-index");
    const { getScratchDir, getClaudectlDir } = await import("./core/config");
    const { join } = await import("path");
    const { existsSync, rmSync, mkdirSync } = await import("fs");

    const index = getSearchIndex();
    const originalValue = index.getSetting<string | null>("defaultProjectDir", null);

    // Create temp directory for test
    const testProjectDir = "/tmp/test-scratch-config";
    if (existsSync(testProjectDir)) rmSync(testProjectDir, { recursive: true });
    mkdirSync(testProjectDir, { recursive: true });

    try {
      // Set defaultProjectDir
      index.setSetting("defaultProjectDir", testProjectDir);

      // Get scratch dir - should be under testProjectDir
      const scratchDir = getScratchDir();
      expect(scratchDir).toBe(join(testProjectDir, "scratch"));
      expect(existsSync(scratchDir)).toBe(true);
    } finally {
      // Restore original setting
      if (originalValue === null) {
        index.setSetting("defaultProjectDir", null);
      } else {
        index.setSetting("defaultProjectDir", originalValue);
      }
      // Cleanup
      rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test("getScratchDir falls back to ~/.claudectl/scratch when not configured", async () => {
    const { getSearchIndex } = await import("./core/search-index");
    const { getScratchDir, getClaudectlDir } = await import("./core/config");
    const { join } = await import("path");

    const index = getSearchIndex();
    const originalValue = index.getSetting<string | null>("defaultProjectDir", null);

    try {
      // Clear defaultProjectDir
      index.setSetting("defaultProjectDir", null);

      // Get scratch dir - should be under claudectl dir
      const scratchDir = getScratchDir();
      expect(scratchDir).toBe(join(getClaudectlDir(), "scratch"));
    } finally {
      // Restore original setting
      if (originalValue !== null) {
        index.setSetting("defaultProjectDir", originalValue);
      }
    }
  });

  test("isScratchPath detects both old and new locations", async () => {
    const { getSearchIndex } = await import("./core/search-index");
    const { isScratchPath, getClaudectlDir } = await import("./core/config");
    const { join } = await import("path");

    const index = getSearchIndex();
    const originalValue = index.getSetting<string | null>("defaultProjectDir", null);

    try {
      // Set up test project dir
      const testProjectDir = "/tmp/test-scratch-detect";
      index.setSetting("defaultProjectDir", testProjectDir);

      // Old location should be detected
      const oldPath = join(getClaudectlDir(), "scratch", "scratch-abc123");
      expect(isScratchPath(oldPath)).toBe(true);

      // New location should be detected
      const newPath = join(testProjectDir, "scratch", "scratch-xyz789");
      expect(isScratchPath(newPath)).toBe(true);

      // Non-scratch paths should not be detected
      expect(isScratchPath("/Users/test/projects/myapp")).toBe(false);
    } finally {
      // Restore original setting
      if (originalValue === null) {
        index.setSetting("defaultProjectDir", null);
      } else {
        index.setSetting("defaultProjectDir", originalValue);
      }
    }
  });

  test("createScratchDir creates in configured location", async () => {
    const { getSearchIndex } = await import("./core/search-index");
    const { createScratchDir } = await import("./core/config");
    const { existsSync, rmSync, mkdirSync } = await import("fs");

    const index = getSearchIndex();
    const originalValue = index.getSetting<string | null>("defaultProjectDir", null);

    // Create temp directory for test
    const testProjectDir = "/tmp/test-create-scratch";
    if (existsSync(testProjectDir)) rmSync(testProjectDir, { recursive: true });
    mkdirSync(testProjectDir, { recursive: true });

    try {
      // Set defaultProjectDir
      index.setSetting("defaultProjectDir", testProjectDir);

      // Create scratch dir
      const scratchDir = createScratchDir();

      // Should be under testProjectDir/scratch/
      expect(scratchDir.startsWith(testProjectDir + "/scratch/")).toBe(true);
      expect(existsSync(scratchDir)).toBe(true);

      // Should have scratch- prefix
      const dirname = scratchDir.split("/").pop()!;
      expect(dirname.startsWith("scratch-")).toBe(true);
    } finally {
      // Restore original setting
      if (originalValue === null) {
        index.setSetting("defaultProjectDir", null);
      } else {
        index.setSetting("defaultProjectDir", originalValue);
      }
      // Cleanup
      rmSync(testProjectDir, { recursive: true, force: true });
    }
  });
});

// Test rename
describe("Rename Flow", () => {
  test("renameSession works", async () => {
    const { discoverSessions } = await import("./core/sessions");
    const { renameSession, getRenamedTitle } = await import("./core/title-generator");

    const sessions = await discoverSessions();
    if (sessions.length === 0) {
      console.log("No sessions to test rename - skipping");
      return;
    }
    const session = sessions[0];
    const originalTitle = session.title;

    await renameSession(session.id, "INTEGRATION-TEST-TITLE");
    const newTitle = await getRenamedTitle(session.id);
    expect(newTitle).toBe("INTEGRATION-TEST-TITLE");

    // Restore
    await renameSession(session.id, originalTitle || "untitled");
  });
});
