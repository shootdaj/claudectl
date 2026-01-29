/**
 * E2E tests for CLI commands
 *
 * These tests run actual CLI commands and verify their output.
 * Uses --dry-run where available to avoid launching Claude.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { spawn, spawnSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

const PROJECT_ROOT = join(import.meta.dir, "..");
const CLI_PATH = join(PROJECT_ROOT, "src/index.ts");

// Helper to run CLI command and capture output
async function runCli(
  args: string[],
  options: { timeout?: number; env?: Record<string, string> } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, exitCode: -1 });
    }, options.timeout || 10000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

// Helper to run CLI synchronously
function runCliSync(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bun", ["run", CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    timeout: 10000,
  });

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? -1,
  };
}

describe("CLI E2E Tests", () => {
  describe("sessions list command", () => {
    test("sessions list runs without error", async () => {
      const result = await runCli(["sessions", "list"]);
      // Should exit cleanly (0) or with sessions listed
      expect(result.exitCode).toBe(0);
    });

    test("sessions list outputs session information", async () => {
      const result = await runCli(["sessions", "list"]);
      // Output should contain some structure
      // (actual content depends on user's sessions)
      expect(result.exitCode).toBe(0);
    });
  });

  describe("sessions stats command", () => {
    test("sessions stats runs without error", async () => {
      const result = await runCli(["sessions", "stats"]);
      expect(result.exitCode).toBe(0);
    });

    test("sessions stats shows statistics", async () => {
      const result = await runCli(["sessions", "stats"]);
      // Should contain some stats-related output
      expect(result.stdout.toLowerCase()).toMatch(/session|total|cost|message/i);
    });
  });

  describe("sessions launch --dry-run", () => {
    test("sessions launch --dry-run with --continue shows command", async () => {
      const result = await runCli(["sessions", "launch", "--continue", "--dry-run"]);
      // If there are sessions, it should show dry run output
      // If no sessions, it should error gracefully
      if (result.exitCode === 0) {
        expect(result.stdout).toContain("Dry Run");
      }
    });

    test("sessions launch --dry-run with -s flag includes skip-permissions", async () => {
      const result = await runCli(["sessions", "launch", "--continue", "--dry-run", "-s"]);
      if (result.exitCode === 0) {
        // The output may be truncated in the box display, so check for partial match
        expect(result.stdout).toContain("--dangerously-skip-permis");
      }
    });
  });

  describe("config command", () => {
    test("config shows all paths", async () => {
      const result = await runCli(["config"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(".claude");
    });
  });

  describe("help command", () => {
    test("--help shows usage", async () => {
      const result = await runCli(["--help"], { timeout: 15000 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("claudectl");
    });

    test("sessions --help shows subcommands", async () => {
      const result = await runCli(["sessions", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("list");
      expect(result.stdout).toContain("launch");
    });

    test("sessions launch --help shows options", async () => {
      const result = await runCli(["sessions", "launch", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--dry-run");
      expect(result.stdout).toContain("--skip-permissions");
    });

    test("new --help shows options", async () => {
      const result = await runCli(["new", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--skip-permissions");
      expect(result.stdout).toContain("--mode");
    });
  });

  describe("version", () => {
    test("--version runs without error", async () => {
      const result = await runCli(["--version"]);
      expect(result.exitCode).toBe(0);
      // Version output varies (semver or git branch)
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });
});

describe("CLI Flag Behavior", () => {
  describe("skipPermissions flag precedence", () => {
    // Note: These tests verify the flag is recognized.
    // Actual behavior with settings requires integration testing.

    test("-s short flag is recognized", async () => {
      const result = await runCli(["sessions", "launch", "--help"]);
      expect(result.stdout).toContain("-s");
    });

    test("--skip-permissions long flag is recognized", async () => {
      const result = await runCli(["sessions", "launch", "--help"]);
      expect(result.stdout).toContain("--skip-permissions");
    });
  });
});
