import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getClaudeDir,
  getProjectsDir,
  getGlobalConfigPath,
  getSettingsPath,
  getGlobalClaudeMdPath,
  getAllConfigPaths,
  generateShortId,
  createScratchDir,
  getClaudectlDir,
} from "./config";
import { homedir } from "os";
import { join } from "path";
import { existsSync, rmdirSync } from "fs";

describe("config", () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });

  describe("getClaudeDir", () => {
    test("returns ~/.claude by default", () => {
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(getClaudeDir()).toBe(join(homedir(), ".claude"));
    });

    test("respects CLAUDE_CONFIG_DIR env var", () => {
      process.env.CLAUDE_CONFIG_DIR = "/custom/path";
      expect(getClaudeDir()).toBe("/custom/path");
    });
  });

  describe("getProjectsDir", () => {
    test("returns projects subdirectory of claude dir", () => {
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(getProjectsDir()).toBe(join(homedir(), ".claude", "projects"));
    });

    test("respects CLAUDE_CONFIG_DIR", () => {
      process.env.CLAUDE_CONFIG_DIR = "/custom";
      expect(getProjectsDir()).toBe("/custom/projects");
    });
  });

  describe("getGlobalConfigPath", () => {
    test("returns .claude.json in home directory", () => {
      expect(getGlobalConfigPath()).toBe(join(homedir(), ".claude.json"));
    });
  });

  describe("getSettingsPath", () => {
    test("returns settings.json in claude dir", () => {
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(getSettingsPath()).toBe(join(homedir(), ".claude", "settings.json"));
    });
  });

  describe("getGlobalClaudeMdPath", () => {
    test("returns CLAUDE.md in claude dir", () => {
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(getGlobalClaudeMdPath()).toBe(join(homedir(), ".claude", "CLAUDE.md"));
    });
  });

  describe("getAllConfigPaths", () => {
    test("returns all paths", () => {
      delete process.env.CLAUDE_CONFIG_DIR;
      const paths = getAllConfigPaths();

      expect(paths.claudeDir).toBe(join(homedir(), ".claude"));
      expect(paths.projectsDir).toBe(join(homedir(), ".claude", "projects"));
      expect(paths.globalConfig).toBe(join(homedir(), ".claude.json"));
      expect(paths.settings).toBe(join(homedir(), ".claude", "settings.json"));
      expect(paths.globalClaudeMd).toBe(join(homedir(), ".claude", "CLAUDE.md"));
    });
  });

  describe("generateShortId", () => {
    test("generates ID of specified length", () => {
      const id6 = generateShortId(6);
      expect(id6.length).toBe(6);

      const id10 = generateShortId(10);
      expect(id10.length).toBe(10);
    });

    test("generates alphanumeric characters only", () => {
      const id = generateShortId(100);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateShortId(6));
      }
      // With 62^6 possibilities, 100 IDs should all be unique
      expect(ids.size).toBe(100);
    });

    test("defaults to length 6", () => {
      const id = generateShortId();
      expect(id.length).toBe(6);
    });
  });

  describe("createScratchDir", () => {
    const createdDirs: string[] = [];

    afterEach(() => {
      // Clean up created directories
      for (const dir of createdDirs) {
        if (existsSync(dir)) {
          try {
            rmdirSync(dir);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
      createdDirs.length = 0;
    });

    test("creates a unique directory each time", () => {
      const dir1 = createScratchDir();
      const dir2 = createScratchDir();
      createdDirs.push(dir1, dir2);

      expect(dir1).not.toBe(dir2);
      expect(existsSync(dir1)).toBe(true);
      expect(existsSync(dir2)).toBe(true);
    });

    test("creates directory inside scratch folder", () => {
      const dir = createScratchDir();
      createdDirs.push(dir);

      const scratchBase = join(getClaudectlDir(), "scratch");
      expect(dir.startsWith(scratchBase)).toBe(true);
    });

    test("creates directory with scratch- prefix", () => {
      const dir = createScratchDir();
      createdDirs.push(dir);

      const dirname = dir.split("/").pop()!;
      expect(dirname.startsWith("scratch-")).toBe(true);
      expect(dirname.length).toBe("scratch-".length + 6);
    });
  });
});
