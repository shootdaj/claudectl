import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getClaudeDir,
  getProjectsDir,
  getGlobalConfigPath,
  getSettingsPath,
  getGlobalClaudeMdPath,
  getAllConfigPaths,
} from "./config";
import { homedir } from "os";
import { join } from "path";

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
});
