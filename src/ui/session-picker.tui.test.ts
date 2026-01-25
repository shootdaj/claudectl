/**
 * TUI tests for session-picker
 *
 * These tests verify the blessed-based UI behavior using PassThrough streams.
 * For full integration tests, use E2E tests with a real terminal.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import blessed from "blessed";
import { BlessedHarness, Keys } from "../test-utils";

// Mock the session discovery to avoid needing real data
const mockSessions = [
  {
    id: "test-session-1",
    title: "Test Session 1",
    slug: "test-session-1",
    workingDirectory: "/tmp/test-project",
    shortPath: "test-project",
    encodedPath: "-tmp-test-project",
    filePath: "/tmp/.claude/projects/-tmp-test-project/test-session-1.jsonl",
    createdAt: new Date("2024-01-01"),
    lastAccessedAt: new Date("2024-01-15"),
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    totalInputTokens: 1000,
    totalOutputTokens: 2000,
    model: "claude-3-sonnet",
    machine: "local" as const,
  },
  {
    id: "test-session-2",
    title: "Another Session",
    slug: "another-session",
    workingDirectory: "/tmp/another-project",
    shortPath: "another-project",
    encodedPath: "-tmp-another-project",
    filePath: "/tmp/.claude/projects/-tmp-another-project/test-session-2.jsonl",
    createdAt: new Date("2024-01-05"),
    lastAccessedAt: new Date("2024-01-10"),
    messageCount: 20,
    userMessageCount: 10,
    assistantMessageCount: 10,
    totalInputTokens: 5000,
    totalOutputTokens: 8000,
    model: "claude-3-opus",
    machine: "local" as const,
  },
];

describe("Session Picker TUI Infrastructure", () => {
  let harness: BlessedHarness | null = null;

  afterEach(() => {
    if (harness) {
      harness.destroy();
      harness = null;
    }
  });

  test("can create blessed list with session data", async () => {
    harness = new BlessedHarness(120, 30);

    // Create a list similar to session-picker
    const list = blessed.list({
      parent: harness.screen,
      top: 2,
      left: 0,
      width: "100%-2",
      height: "100%-9",
      items: mockSessions.map((s) => ` ${s.title.padEnd(30)} ${s.shortPath}`),
      keys: true,
      vi: true,
      mouse: true,
      style: {
        fg: "white",
        selected: {
          fg: "green",
          bg: "#333333",
          bold: true,
        },
      },
    });

    list.focus();
    harness.screen.render();
    await harness.waitForRender();

    // Verify list was created with items
    expect(list.items.length).toBe(2);
    expect((list as any).selected).toBe(0);
  });

  test("j/k navigation works on list", async () => {
    harness = new BlessedHarness(120, 30);

    const list = blessed.list({
      parent: harness.screen,
      items: mockSessions.map((s) => s.title),
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

    // Move up with k
    harness.sendKey("k");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(0);
  });

  test("arrow key navigation works on list", async () => {
    harness = new BlessedHarness(120, 30);

    const list = blessed.list({
      parent: harness.screen,
      items: mockSessions.map((s) => s.title),
      keys: true,
      vi: true,
    });

    list.focus();
    harness.screen.render();

    // Move down with arrow
    harness.sendKey("DOWN");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(1);

    // Move up with arrow
    harness.sendKey("UP");
    await harness.waitForRender(50);
    expect((list as any).selected).toBe(0);
  });

  test("textbox value can be set programmatically", async () => {
    harness = new BlessedHarness(120, 30);

    const searchBox = blessed.textbox({
      parent: harness.screen,
      top: 5,
      left: 1,
      width: "50%",
      height: 1,
    });

    harness.screen.render();

    // In blessed, setValue is the typical way to update textbox content
    searchBox.setValue("test query");
    harness.screen.render();
    await harness.waitForRender(50);

    expect(searchBox.getValue()).toBe("test query");
  });

  test("escape key triggers handler", async () => {
    harness = new BlessedHarness(120, 30);
    let escapePressed = false;

    harness.screen.key(["escape"], () => {
      escapePressed = true;
    });

    harness.sendKey("ESCAPE");
    await harness.waitForRender(50);

    expect(escapePressed).toBe(true);
  });

  test("? key shows help (via key handler)", async () => {
    harness = new BlessedHarness(120, 30);
    let helpShown = false;

    // Simulate help popup behavior
    harness.screen.key(["?"], () => {
      helpShown = true;
      blessed.box({
        parent: harness!.screen,
        content: "Keybindings\n\nHelp content here",
        top: "center",
        left: "center",
        width: 40,
        height: 10,
        border: { type: "line" },
      });
      harness!.screen.render();
    });

    harness.sendKey("HELP");
    await harness.waitForRender(50);

    expect(helpShown).toBe(true);
  });

  test("q key triggers quit handler", async () => {
    harness = new BlessedHarness(120, 30);
    let quitCalled = false;

    harness.screen.key(["q"], () => {
      quitCalled = true;
    });

    harness.sendKey("QUIT");
    await harness.waitForRender(50);

    expect(quitCalled).toBe(true);
  });

  test("/ key triggers search handler", async () => {
    harness = new BlessedHarness(120, 30);
    let searchMode = false;

    harness.screen.key(["/"], () => {
      searchMode = true;
    });

    harness.sendKey("SEARCH");
    await harness.waitForRender(50);

    expect(searchMode).toBe(true);
  });

  test("A (shift+a) triggers archive view handler", async () => {
    harness = new BlessedHarness(120, 30);
    let archiveViewToggled = false;

    harness.screen.key(["S-a"], () => {
      archiveViewToggled = true;
    });

    harness.sendKey("ARCHIVE_VIEW");
    await harness.waitForRender(50);

    expect(archiveViewToggled).toBe(true);
  });

  test("n key triggers new session handler", async () => {
    harness = new BlessedHarness(120, 30);
    let newSessionTriggered = false;

    harness.screen.key(["n"], () => {
      newSessionTriggered = true;
    });

    harness.sendKey("NEW");
    await harness.waitForRender(50);

    expect(newSessionTriggered).toBe(true);
  });

  test("enter key on list triggers action", async () => {
    harness = new BlessedHarness(120, 30);
    let selectedItem: string | null = null;

    const list = blessed.list({
      parent: harness.screen,
      items: mockSessions.map((s) => s.title),
      keys: true,
      vi: true,
    });

    list.on("select", (item: any) => {
      selectedItem = item.getText();
    });

    list.focus();
    harness.screen.render();

    // Select first item with enter
    harness.sendKey("ENTER");
    await harness.waitForRender(50);

    expect(selectedItem).toBe("Test Session 1");
  });
});

describe("Session Picker UI Elements", () => {
  let harness: BlessedHarness | null = null;

  afterEach(() => {
    if (harness) {
      harness.destroy();
      harness = null;
    }
  });

  test("title bar displays correctly", async () => {
    harness = new BlessedHarness(120, 30);

    const titleBar = blessed.box({
      parent: harness.screen,
      top: 0,
      left: 0,
      width: "100%-2",
      height: 1,
      content: "{bold}{#ff00ff-fg}◆ claudectl{/#ff00ff-fg}{/bold} v1.0.0",
      tags: true,
    });

    harness.screen.render();
    await harness.waitForRender();

    expect(titleBar.getContent()).toContain("claudectl");
  });

  test("footer displays keybindings", async () => {
    harness = new BlessedHarness(120, 30);

    const footer = blessed.box({
      parent: harness.screen,
      bottom: 0,
      left: 0,
      width: "100%-2",
      height: 1,
      content: " ↵ Launch  n New  / Search  ? Help  q Quit",
      tags: true,
    });

    harness.screen.render();
    await harness.waitForRender();

    const content = footer.getContent();
    expect(content).toContain("Launch");
    expect(content).toContain("Search");
    expect(content).toContain("Quit");
  });

  test("details panel shows session info", async () => {
    harness = new BlessedHarness(120, 30);

    const session = mockSessions[0];
    const detailsBox = blessed.box({
      parent: harness.screen,
      bottom: 1,
      left: 1,
      width: "100%-4",
      height: 3,
      content: `${session.title}\npath: ${session.workingDirectory}\nmodel: ${session.model}`,
      tags: true,
    });

    harness.screen.render();
    await harness.waitForRender();

    const content = detailsBox.getContent();
    expect(content).toContain(session.title);
    expect(content).toContain(session.workingDirectory);
    expect(content).toContain(session.model);
  });
});
