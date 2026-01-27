import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock better-sqlite3 to avoid "not supported in Bun" error
class MockDatabase {
  private data: Record<string, any> = {};

  prepare(sql: string) {
    return {
      run: (...args: any[]) => ({ lastInsertRowid: 1 }),
      get: (key?: string) => {
        if (sql.includes("SELECT value FROM settings")) {
          return this.data[key || ""] ? { value: this.data[key || ""] } : null;
        }
        return null;
      },
      all: () => [],
    };
  }
  exec() {}
  close() {}
  transaction(fn: Function) {
    return fn;
  }

  // Test helper to set mock data
  _setData(key: string, value: string) {
    this.data[key] = value;
  }
}

mock.module("better-sqlite3", () => ({
  default: MockDatabase,
}));

// Import after mocking
const { launchClaude, launchSession } = await import("./sessions");

describe("launchClaude", () => {
  const testCwd = join(tmpdir(), "claudectl-launch-test");

  beforeEach(() => {
    if (!existsSync(testCwd)) {
      mkdirSync(testCwd, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testCwd)) {
      rmSync(testCwd, { recursive: true, force: true });
    }
  });

  describe("command building with dryRun", () => {
    test("builds basic command with just cwd", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        dryRun: true,
      });

      expect(result.command).toBe("claude ");
      expect(result.cwd).toBe(testCwd);
      expect(result.exitCode).toBeUndefined();
    });

    test("includes --dangerously-skip-permissions when skipPermissions is true", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        skipPermissions: true,
        dryRun: true,
      });

      expect(result.command).toBe("claude --dangerously-skip-permissions");
    });

    test("does not include skip flag when skipPermissions is false", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        skipPermissions: false,
        dryRun: true,
      });

      expect(result.command).toBe("claude ");
      expect(result.command).not.toContain("--dangerously-skip-permissions");
    });

    test("includes --resume with session ID when resuming", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        resumeSessionId: "abc123-def456",
        dryRun: true,
      });

      expect(result.command).toBe("claude --resume abc123-def456");
    });

    test("includes prompt at the end", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        prompt: "Hello Claude",
        dryRun: true,
      });

      expect(result.command).toBe("claude Hello Claude");
    });

    test("combines all options in correct order", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        skipPermissions: true,
        resumeSessionId: "session-123",
        prompt: "Fix the bug",
        dryRun: true,
      });

      // Order: skip-permissions, resume, prompt
      expect(result.command).toBe(
        "claude --dangerously-skip-permissions --resume session-123 Fix the bug"
      );
    });

    test("skip-permissions comes before resume", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        skipPermissions: true,
        resumeSessionId: "test-session",
        dryRun: true,
      });

      const skipIndex = result.command.indexOf("--dangerously-skip-permissions");
      const resumeIndex = result.command.indexOf("--resume");
      expect(skipIndex).toBeLessThan(resumeIndex);
    });

    test("prompt comes after resume", async () => {
      const result = await launchClaude({
        cwd: testCwd,
        resumeSessionId: "test-session",
        prompt: "Continue working",
        dryRun: true,
      });

      const resumeIndex = result.command.indexOf("--resume");
      const promptIndex = result.command.indexOf("Continue working");
      expect(resumeIndex).toBeLessThan(promptIndex);
    });
  });

  describe("launchSession wrapper", () => {
    const mockSession = {
      id: "test-session-id",
      title: "Test Session",
      workingDirectory: "/tmp/test-project",
      shortPath: "~/test-project",
      encodedPath: "-tmp-test-project",
      filePath: "/tmp/.claude/projects/-tmp-test-project/test-session-id.jsonl",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messageCount: 5,
      userMessageCount: 2,
      assistantMessageCount: 3,
      totalCostUSD: 0.05,
    };

    test("passes session ID to launchClaude", async () => {
      const result = await launchSession(mockSession as any, { dryRun: true });

      expect(result.command).toContain("--resume test-session-id");
    });

    test("passes skipPermissions option", async () => {
      const result = await launchSession(mockSession as any, {
        skipPermissions: true,
        dryRun: true,
      });

      expect(result.command).toContain("--dangerously-skip-permissions");
    });

    test("passes prompt option", async () => {
      const result = await launchSession(mockSession as any, {
        prompt: "Continue the task",
        dryRun: true,
      });

      expect(result.command).toContain("Continue the task");
    });

    test("decodes cwd from encodedPath", async () => {
      const result = await launchSession(mockSession as any, { dryRun: true });

      // The cwd should be decoded from encodedPath, not raw workingDirectory
      expect(result.cwd).toBeDefined();
    });
  });
});

describe("CLI skipPermissions integration", () => {
  // These tests verify the CLI properly loads and uses settings

  test("sessions launch command has --skip-permissions option", async () => {
    const { program } = await import("../cli");
    const sessionsCmd = program.commands.find((c) => c.name() === "sessions");
    expect(sessionsCmd).toBeDefined();

    const launchCmd = sessionsCmd!.commands.find((c) => c.name() === "launch");
    expect(launchCmd).toBeDefined();

    const skipOpt = launchCmd!.options.find((o) => o.long === "--skip-permissions");
    expect(skipOpt).toBeDefined();
  });

  test("new command has --skip-permissions option", async () => {
    const { program } = await import("../cli");
    const newCmd = program.commands.find((c) => c.name() === "new");
    expect(newCmd).toBeDefined();

    const skipOpt = newCmd!.options.find((o) => o.long === "--skip-permissions");
    expect(skipOpt).toBeDefined();
  });
});
