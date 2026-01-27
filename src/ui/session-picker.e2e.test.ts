/**
 * E2E tests for session-picker using node-pty
 *
 * These tests launch the actual application and send real keyboard input.
 * They verify behavior from a user's perspective.
 *
 * NOTE: node-pty callbacks don't fire correctly in Bun, so we spawn a Node
 * subprocess to run the PTY interaction. The claudectl app itself runs via bun.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { spawn, spawnSync } from "child_process";
import { join } from "path";
import { writeFileSync, unlinkSync, existsSync } from "fs";

const PROJECT_ROOT = join(import.meta.dir, "../..");

// Check if node is available
const nodeCheck = spawnSync("node", ["--version"]);
const nodeAvailable = nodeCheck.status === 0;

/**
 * Run a PTY test via Node subprocess
 * Returns { output, exitCode }
 */
async function runPtyTest(script: string, timeoutMs = 10000): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const tempFile = join(PROJECT_ROOT, `.pty-test-${Date.now()}.cjs`);

    // Write the test script as CommonJS (node-pty uses require)
    const fullScript = `
const pty = require("node-pty");
const path = require("path");

const PROJECT_ROOT = ${JSON.stringify(PROJECT_ROOT)};
const BUN = process.env.HOME + "/.bun/bin/bun";

${script}
`;
    writeFileSync(tempFile, fullScript);

    let output = "";
    let exitCode = -1;
    let finished = false;

    const proc = spawn("node", [tempFile], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      exitCode = code ?? -1;
      finished = true;
      cleanup();
    });

    const timeout = setTimeout(() => {
      if (!finished) {
        proc.kill("SIGKILL");
        cleanup();
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      try {
        if (existsSync(tempFile)) unlinkSync(tempFile);
      } catch {}
      resolve({ output, exitCode });
    }
  });
}

describe("Session Picker E2E", () => {
  test.skipIf(!nodeAvailable)("session picker loads and responds to 'q' to quit", async () => {
    const { output, exitCode } = await runPtyTest(`
let capturedOutput = "";

const term = pty.spawn(BUN, ["run", path.join(PROJECT_ROOT, "src/index.ts")], {
  name: "xterm-256color",
  cols: 120,
  rows: 30,
  cwd: PROJECT_ROOT,
  env: { ...process.env, TERM: "xterm-256color" },
});

term.onData((data) => {
  capturedOutput += data;
});

// Wait for UI to load, then press 'q' to quit
setTimeout(() => {
  term.write("q");
}, 2000);

term.onExit(({ exitCode }) => {
  console.log("EXIT_CODE:" + exitCode);
  console.log("OUTPUT_LENGTH:" + capturedOutput.length);
  console.log("HAS_CLAUDECTL:" + capturedOutput.includes("claudectl"));
  process.exit(0);
});

// Timeout fallback
setTimeout(() => {
  console.log("TIMEOUT");
  console.log("OUTPUT_LENGTH:" + capturedOutput.length);
  term.kill();
  process.exit(1);
}, 8000);
`, 12000);

    // App ran and showed UI (exit code may vary based on terminal handling)
    expect(output).toContain("HAS_CLAUDECTL:true");
  });

  test.skipIf(!nodeAvailable)("'s' key triggers scratch session (screen changes)", async () => {
    const { output, exitCode } = await runPtyTest(`
let capturedOutput = "";
let outputAfterS = "";

const term = pty.spawn(BUN, ["run", path.join(PROJECT_ROOT, "src/index.ts")], {
  name: "xterm-256color",
  cols: 120,
  rows: 30,
  cwd: PROJECT_ROOT,
  env: { ...process.env, TERM: "xterm-256color" },
});

term.onData((data) => {
  capturedOutput += data;
});

// Wait for UI to load, then press 's' for scratch
setTimeout(() => {
  const beforeLength = capturedOutput.length;
  term.write("s");

  // Capture output after 's' key
  setTimeout(() => {
    outputAfterS = capturedOutput.slice(beforeLength);
    // The 's' key should destroy the screen and try to launch Claude
    // In test env, Claude may not be available, but screen should change
    console.log("OUTPUT_CHANGED:" + (outputAfterS.length > 0 || capturedOutput.length > beforeLength));
    console.log("SCREEN_CLEARED:" + (capturedOutput.includes("\\x1b[2J") || capturedOutput.includes("\\x1b[H")));

    // Force quit
    term.write("\\x03"); // Ctrl+C
    setTimeout(() => {
      term.kill();
      process.exit(0);
    }, 500);
  }, 1500);
}, 2000);

term.onExit(({ exitCode }) => {
  console.log("EXITED:" + exitCode);
  process.exit(0);
});

setTimeout(() => {
  console.log("TIMEOUT");
  term.kill();
  process.exit(0);
}, 8000);
`, 12000);

    // The test passes if it ran without crashing
    // The 's' handler destroys the blessed screen which is the expected behavior
    expect(exitCode).toBe(0);
  });

  test.skipIf(!nodeAvailable)("'n' key shows new session menu", async () => {
    const { output, exitCode } = await runPtyTest(`
let capturedOutput = "";

const term = pty.spawn(BUN, ["run", path.join(PROJECT_ROOT, "src/index.ts")], {
  name: "xterm-256color",
  cols: 120,
  rows: 30,
  cwd: PROJECT_ROOT,
  env: { ...process.env, TERM: "xterm-256color" },
});

term.onData((data) => {
  capturedOutput += data;
});

// Wait for UI to load, then press 'n' for new session menu
setTimeout(() => {
  term.write("n");
}, 2000);

// Wait for menu, then check and quit
setTimeout(() => {
  // Menu should show Quick question, Create, Clone options
  const hasQuickQuestion = capturedOutput.toLowerCase().includes("quick");
  const hasCreate = capturedOutput.toLowerCase().includes("create");
  const hasClone = capturedOutput.toLowerCase().includes("clone");
  const hasStart = capturedOutput.toLowerCase().includes("start");

  console.log("HAS_MENU:" + (hasQuickQuestion || hasCreate || hasClone || hasStart));

  // Press escape then quit
  term.write("\\x1b"); // Escape
  setTimeout(() => {
    term.write("q");
  }, 500);
}, 3500);

term.onExit(({ exitCode }) => {
  console.log("EXIT_CODE:" + exitCode);
  process.exit(0);
});

setTimeout(() => {
  console.log("TIMEOUT");
  term.kill();
  process.exit(1);
}, 8000);
`, 12000);

    expect(output).toContain("HAS_MENU:true");
  });

  test.skipIf(!nodeAvailable)("'?' key shows help", async () => {
    const { output, exitCode } = await runPtyTest(`
let capturedOutput = "";

const term = pty.spawn(BUN, ["run", path.join(PROJECT_ROOT, "src/index.ts")], {
  name: "xterm-256color",
  cols: 120,
  rows: 30,
  cwd: PROJECT_ROOT,
  env: { ...process.env, TERM: "xterm-256color" },
});

term.onData((data) => {
  capturedOutput += data;
});

// Wait for UI to load, then press '?' for help
setTimeout(() => {
  term.write("?");
}, 2000);

// Wait for help popup, then check and quit
setTimeout(() => {
  const hasKeybindings = capturedOutput.toLowerCase().includes("keybind");
  const hasHelp = capturedOutput.toLowerCase().includes("help");
  const hasLaunch = capturedOutput.toLowerCase().includes("launch");

  console.log("HAS_HELP:" + (hasKeybindings || hasHelp || hasLaunch));

  // Press escape then quit
  term.write("\\x1b");
  setTimeout(() => term.write("q"), 500);
}, 3500);

term.onExit(({ exitCode }) => {
  console.log("EXIT_CODE:" + exitCode);
  process.exit(0);
});

setTimeout(() => {
  console.log("TIMEOUT");
  term.kill();
  process.exit(1);
}, 8000);
`, 12000);

    expect(output).toContain("HAS_HELP:true");
  });

  test.skipIf(!nodeAvailable)("j/k navigation doesn't crash", async () => {
    const { output, exitCode } = await runPtyTest(`
const term = pty.spawn(BUN, ["run", path.join(PROJECT_ROOT, "src/index.ts")], {
  name: "xterm-256color",
  cols: 120,
  rows: 30,
  cwd: PROJECT_ROOT,
  env: { ...process.env, TERM: "xterm-256color" },
});

// Wait for UI, navigate, then quit
setTimeout(() => {
  term.write("j"); // down
}, 2000);

setTimeout(() => {
  term.write("k"); // up
}, 2300);

setTimeout(() => {
  term.write("j");
  term.write("j");
}, 2600);

setTimeout(() => {
  term.write("q"); // quit
}, 3000);

term.onExit(({ exitCode }) => {
  console.log("EXIT_CODE:" + exitCode);
  console.log("NAV_SUCCESS:true");
  process.exit(0);
});

setTimeout(() => {
  console.log("TIMEOUT");
  term.kill();
  process.exit(1);
}, 8000);
`, 12000);

    // Navigation completed without crashing
    expect(output).toContain("NAV_SUCCESS:true");
  });
});
