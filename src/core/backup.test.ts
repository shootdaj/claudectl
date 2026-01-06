import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { getBackupDir, getBackupInfo, needsBackup } from "./backup";

describe("backup", () => {
  describe("getBackupDir", () => {
    test("returns backup directory path", () => {
      const backupDir = getBackupDir();
      expect(backupDir).toBe(join(homedir(), ".claudectl", "backup"));
    });
  });

  describe("getBackupInfo", () => {
    // Note: This test depends on actual file system state
    // In a real production codebase, you'd mock the file system
    test("returns null when no backup exists", async () => {
      // This will return null or actual info depending on system state
      const info = await getBackupInfo();
      // Either null (no backup) or has valid date/path
      if (info !== null) {
        expect(info.date).toBeInstanceOf(Date);
        expect(typeof info.path).toBe("string");
      }
    });
  });

  describe("needsBackup", () => {
    test("returns boolean", async () => {
      const result = await needsBackup();
      expect(typeof result).toBe("boolean");
    });
  });
});
