import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { getRenamedTitle, renameSession, clearRenameCache } from "./title-generator";

describe("title-generator", () => {
  // Note: These tests use the actual cache file in ~/.claudectl
  // They're designed to be idempotent

  const testSessionId = "__test_session_" + Date.now();

  afterEach(async () => {
    // Clean up our test session
    const cache = await loadTestCache();
    delete cache[testSessionId];
    await saveTestCache(cache);
  });

  describe("getRenamedTitle", () => {
    test("returns undefined for non-renamed session", async () => {
      const title = await getRenamedTitle("non-existent-session-id-" + Date.now());
      expect(title).toBeUndefined();
    });
  });

  describe("renameSession", () => {
    test("renames a session and retrieves it", async () => {
      await renameSession(testSessionId, "My Custom Title");
      const title = await getRenamedTitle(testSessionId);
      expect(title).toBe("My Custom Title");
    });

    test("overwrites existing rename", async () => {
      await renameSession(testSessionId, "First Title");
      await renameSession(testSessionId, "Second Title");
      const title = await getRenamedTitle(testSessionId);
      expect(title).toBe("Second Title");
    });
  });

  describe("clearRenameCache", () => {
    test("clears without error", async () => {
      // Just verify it doesn't throw
      await clearRenameCache();
      // Cache should be empty now
    });
  });
});

// Helper functions to manage test state
async function loadTestCache(): Promise<Record<string, any>> {
  try {
    const file = Bun.file(join(homedir(), ".claudectl", "renamed-sessions.json"));
    if (await file.exists()) {
      return await file.json();
    }
  } catch {}
  return {};
}

async function saveTestCache(cache: Record<string, any>): Promise<void> {
  const dir = join(homedir(), ".claudectl");
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "renamed-sessions.json"), JSON.stringify(cache, null, 2));
}
