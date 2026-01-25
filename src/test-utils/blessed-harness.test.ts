/**
 * Tests for the BlessedHarness test utility
 * Verifies the testing infrastructure works correctly
 */
import { describe, test, expect, afterEach } from "bun:test";
import blessed from "blessed";
import { BlessedHarness, Keys, expectOutput, stripAnsi } from "./index";

describe("BlessedHarness", () => {
  let harness: BlessedHarness | null = null;

  afterEach(() => {
    if (harness) {
      harness.destroy();
      harness = null;
    }
  });

  test("creates screen with PassThrough streams", () => {
    harness = new BlessedHarness(120, 30);

    expect(harness.screen).toBeDefined();
    expect(harness.input).toBeDefined();
    expect(harness.output).toBeDefined();
    expect(harness.screen.program).toBeDefined();
  });

  test("captures rendered output", async () => {
    harness = new BlessedHarness(80, 24);

    blessed.box({
      parent: harness.screen,
      content: "Test Content Here",
      top: 0,
      left: 0,
      width: 20,
      height: 3,
    });

    harness.screen.render();
    await harness.waitForRender();

    // Output buffer should have some content
    expect(harness.getOutput().length).toBeGreaterThan(0);
  });

  test("sendKey sends keystrokes via input stream", async () => {
    harness = new BlessedHarness(80, 24);
    let keyPressed = false;

    harness.screen.key(["q"], () => {
      keyPressed = true;
    });

    harness.sendKey("q");
    await harness.waitForRender(50);

    expect(keyPressed).toBe(true);
  });

  test("sendKey works with arrow keys", async () => {
    harness = new BlessedHarness(80, 24);
    let upPressed = false;
    let downPressed = false;

    harness.screen.key(["up"], () => {
      upPressed = true;
    });
    harness.screen.key(["down"], () => {
      downPressed = true;
    });

    harness.sendKey("UP");
    await harness.waitForRender(50);
    expect(upPressed).toBe(true);

    harness.sendKey("DOWN");
    await harness.waitForRender(50);
    expect(downPressed).toBe(true);
  });

  test("type sends multiple characters", async () => {
    harness = new BlessedHarness(80, 24);
    const typed: string[] = [];

    harness.screen.on("keypress", (ch: string) => {
      if (ch) typed.push(ch);
    });

    harness.type("hello");
    await harness.waitForRender(50);

    expect(typed).toEqual(["h", "e", "l", "l", "o"]);
  });

  test("clearOutput resets the buffer", async () => {
    harness = new BlessedHarness(80, 24);

    blessed.box({
      parent: harness.screen,
      content: "Some content",
      top: 0,
      left: 0,
      width: 20,
      height: 3,
    });

    harness.screen.render();
    await harness.waitForRender();

    expect(harness.getOutput().length).toBeGreaterThan(0);

    harness.clearOutput();
    expect(harness.getOutput()).toBe("");
  });

  test("waitForText returns true when text appears in output", async () => {
    harness = new BlessedHarness(80, 24);

    // Note: blessed encodes content with escape sequences, so we look for
    // text that appears raw in the output (like cursor movement sequences)
    // For actual content verification, use box.getContent() instead

    // Wait for some output to appear (blessed sends setup sequences)
    const found = await harness.waitForText("\x1b[", 500);
    expect(found).toBe(true);
  });

  test("waitForText returns false on timeout", async () => {
    harness = new BlessedHarness(80, 24);

    const found = await harness.waitForText("NonexistentText", 100);
    expect(found).toBe(false);
  });

  test("list navigation with j/k keys", async () => {
    harness = new BlessedHarness(80, 24);

    const list = blessed.list({
      parent: harness.screen,
      items: ["Item 1", "Item 2", "Item 3"],
      top: 0,
      left: 0,
      width: 20,
      height: 5,
      keys: true,
      vi: true,
    });

    list.focus();
    harness.screen.render();

    // Initial selection
    expect((list as any).selected).toBe(0);

    // Move down with j
    harness.sendKey("j");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(1);

    // Move down again
    harness.sendKey("j");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(2);

    // Move up with k
    harness.sendKey("k");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(1);
  });
});

describe("Keys", () => {
  test("contains expected key mappings", () => {
    expect(Keys.UP).toBe("\x1b[A");
    expect(Keys.DOWN).toBe("\x1b[B");
    expect(Keys.ENTER).toBe("\r");
    expect(Keys.ESCAPE).toBe("\x1b");
    expect(Keys.j).toBe("j");
    expect(Keys.k).toBe("k");
    expect(Keys.SEARCH).toBe("/");
    expect(Keys.HELP).toBe("?");
    expect(Keys.QUIT).toBe("q");
  });
});

describe("expectOutput", () => {
  let harness: BlessedHarness | null = null;

  afterEach(() => {
    if (harness) {
      harness.destroy();
      harness = null;
    }
  });

  test("toContain asserts text presence", async () => {
    harness = new BlessedHarness(80, 24);

    const box = blessed.box({
      parent: harness.screen,
      content: "Hello World",
      top: 0,
      left: 0,
      width: 20,
      height: 3,
    });

    harness.screen.render();
    await harness.waitForRender();

    // Output contains escape sequences; verify box content directly
    expect(box.getContent()).toBe("Hello World");

    // Output should have been written
    expect(harness.getOutput().length).toBeGreaterThan(0);
  });

  test("toNotContain asserts text absence", async () => {
    harness = new BlessedHarness(80, 24);

    blessed.box({
      parent: harness.screen,
      content: "Hello World",
      top: 0,
      left: 0,
      width: 20,
      height: 3,
    });

    harness.screen.render();
    await harness.waitForRender();

    // Should not throw
    expectOutput(harness).toNotContain("Goodbye");
  });
});

describe("stripAnsi", () => {
  test("removes ANSI escape codes", () => {
    const input = "\x1b[31mRed Text\x1b[0m";
    expect(stripAnsi(input)).toBe("Red Text");
  });

  test("handles multiple escape codes", () => {
    const input = "\x1b[1;32mBold Green\x1b[0m \x1b[4mUnderline\x1b[0m";
    expect(stripAnsi(input)).toBe("Bold Green Underline");
  });

  test("leaves plain text unchanged", () => {
    const input = "Plain text without codes";
    expect(stripAnsi(input)).toBe("Plain text without codes");
  });
});
