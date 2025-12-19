import blessed, { Widgets } from "blessed";
import {
  discoverSessions,
  formatRelativeTime,
  launchSession,
  type Session,
} from "../core/sessions";
import { renameSession } from "../core/title-generator";

// Extend blessed types to include runtime 'selected' property
interface ListTableWithSelected extends Widgets.ListElement {
  selected: number;
}

interface SessionPickerOptions {
  onLaunch?: (session: Session) => void;
  onExit?: () => void;
  dryRun?: boolean;
}

export async function showSessionPicker(
  options: SessionPickerOptions = {}
): Promise<void> {
  const sessions = await discoverSessions();

  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - Session Manager",
    fullUnicode: true,
  });

  // Main container with border
  const mainBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: {
      type: "line",
    },
    style: {
      border: { fg: "cyan" },
    },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: "{bold}{cyan-fg} ◆ claudectl{/cyan-fg}{/bold} │ Session Manager",
    tags: true,
    style: {
      fg: "white",
      bg: "black",
    },
  });

  // Session count on right
  blessed.text({
    parent: titleBar,
    top: 0,
    right: 1,
    content: `${sessions.length} sessions`,
    style: { fg: "gray" },
  });

  // Header line - use same formatting as rows
  const titleWidth = getTitleWidth();
  const headerLine = ` ${"TITLE".padEnd(titleWidth)} ${"PROJECT".padEnd(16)} ${"TIME".padEnd(7)} ${"MSGS".padStart(4)} ${"TOK".padStart(5)} ${"MOD".padStart(4)}`;

  blessed.text({
    parent: mainBox,
    top: 1,
    left: 1,
    width: "100%-4",
    height: 1,
    content: `{yellow-fg}${headerLine}{/yellow-fg}`,
    tags: true,
  });

  // Session list (using list instead of listtable for better control)
  const table = blessed.list({
    parent: mainBox,
    top: 2,
    left: 0,
    width: "100%-2",
    height: "100%-8",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: {
      ch: "┃",
      style: { fg: "cyan" },
    },
    style: {
      fg: "white",
      selected: {
        fg: "black",
        bg: "cyan",
      },
    },
    items: sessions.map(formatSessionRow),
  }) as ListTableWithSelected;

  // Separator line
  blessed.line({
    parent: mainBox,
    bottom: 5,
    left: 0,
    width: "100%-2",
    orientation: "horizontal",
    style: { fg: "gray" },
  });

  // Details panel
  const detailsBox = blessed.box({
    parent: mainBox,
    bottom: 2,
    left: 1,
    width: "100%-4",
    height: 3,
    content: "",
    tags: true,
    style: { fg: "white" },
  });

  // Footer keybindings
  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content:
      " {cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Launch  {cyan-fg}r{/cyan-fg} Rename  {cyan-fg}d{/cyan-fg} Dry-run  {cyan-fg}p{/cyan-fg} Preview  {cyan-fg}/{/cyan-fg} Search  {cyan-fg}q{/cyan-fg} Quit",
    tags: true,
    style: { fg: "gray" },
  });

  // Search box (hidden by default)
  const searchBox = blessed.textbox({
    parent: mainBox,
    bottom: 5,
    left: 1,
    width: "50%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    keys: true,
    style: {
      fg: "white",
      bg: "blue",
    },
  });

  let filteredSessions = [...sessions];
  let searchQuery = "";

  function updateTable() {
    table.setItems(filteredSessions.map(formatSessionRow));
    updateDetails();
    screen.render();
  }

  function updateDetails() {
    // list's selected is 0-indexed (no header offset)
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) {
      detailsBox.setContent("");
      screen.render();
      return;
    }

    const lines = [
      `{bold}{cyan-fg}${session.title}{/cyan-fg}{/bold}  {gray-fg}(${session.id.slice(0, 8)}...){/gray-fg}`,
      `{gray-fg}Path:{/gray-fg} ${session.workingDirectory}  {gray-fg}Branch:{/gray-fg} ${session.gitBranch || "N/A"}`,
      `{gray-fg}Created:{/gray-fg} ${session.createdAt.toLocaleString()}  {gray-fg}Model:{/gray-fg} ${session.model || "N/A"}`,
    ];

    detailsBox.setContent(lines.join("\n"));
    screen.render();
  }

  table.on("select item", updateDetails);

  // Focus first row
  table.select(0);
  updateDetails();

  // Keybindings
  table.key(["enter"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    screen.destroy();

    if (options.dryRun) {
      const result = await launchSession(session, { dryRun: true });
      console.log(`\n┌─ Dry Run ─────────────────────────────────┐`);
      console.log(`│ Session: ${session.title.slice(0, 32).padEnd(32)}│`);
      console.log(`│ Command: ${result.command.padEnd(32)}│`);
      console.log(`│ CWD: ${result.cwd.slice(0, 36).padEnd(36)}│`);
      console.log(`└────────────────────────────────────────────┘\n`);
    } else {
      console.log(`\nLaunching: ${session.title}`);
      console.log(`Directory: ${session.workingDirectory}\n`);
      await launchSession(session);
    }

    options.onLaunch?.(session);
  });

  table.key(["d"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    const result = await launchSession(session, { dryRun: true });

    detailsBox.setContent(
      `{yellow-fg}DRY RUN:{/yellow-fg} Would run: {bold}${result.command}{/bold}\n` +
        `         In directory: ${result.cwd}`
    );
    screen.render();
  });

  table.key(["p"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    // Show more details in a popup
    const previewBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "80%",
      height: "80%",
      content: await getSessionPreview(session),
      tags: true,
      border: { type: "line" },
      style: {
        border: { fg: "cyan" },
        fg: "white",
      },
      scrollable: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "┃",
        style: { fg: "cyan" },
      },
      label: ` ${session.title || session.id} `,
    });

    previewBox.key(["escape", "q", "p"], () => {
      previewBox.destroy();
      screen.render();
    });

    previewBox.focus();
    screen.render();
  });

  // Rename textbox (hidden by default)
  const renameBox = blessed.textbox({
    parent: mainBox,
    bottom: 5,
    left: 1,
    width: "60%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    keys: true,
    style: {
      fg: "white",
      bg: "green",
    },
  });

  table.key(["r"], () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    detailsBox.setContent(`{green-fg}Rename:{/green-fg} Enter new title for "${session.title}"`);
    renameBox.setValue(session.title);
    renameBox.show();
    renameBox.focus();
    screen.render();
  });

  renameBox.on("submit", async (value: string) => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session || !value.trim()) {
      renameBox.hide();
      table.focus();
      screen.render();
      return;
    }

    const newTitle = value.trim().slice(0, 40);
    await renameSession(session.id, newTitle);

    // Update session object and refresh table
    session.title = newTitle;
    renameBox.hide();
    updateTable();
    table.focus();
    detailsBox.setContent(`{green-fg}✓ Renamed to:{/green-fg} ${newTitle}`);
    screen.render();
  });

  renameBox.key(["escape"], () => {
    renameBox.hide();
    table.focus();
    updateDetails();
    screen.render();
  });

  table.key(["/"], () => {
    searchBox.show();
    searchBox.focus();
    screen.render();
  });

  searchBox.on("submit", (value: string) => {
    searchQuery = value.toLowerCase();
    searchBox.hide();
    table.focus();

    if (!searchQuery) {
      filteredSessions = [...sessions];
    } else {
      filteredSessions = sessions.filter(
        (s) =>
          s.title?.toLowerCase().includes(searchQuery) ||
          s.slug?.toLowerCase().includes(searchQuery) ||
          s.id.toLowerCase().includes(searchQuery) ||
          s.workingDirectory.toLowerCase().includes(searchQuery)
      );
    }

    updateTable();
    if (filteredSessions.length > 0) {
      table.select(0);
    }
  });

  searchBox.key(["escape"], () => {
    searchBox.hide();
    searchBox.setValue("");
    table.focus();
    screen.render();
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onExit?.();
  });

  table.focus();
  screen.render();
}

// Calculate title width: terminal width minus space for other fixed columns
function getTitleWidth(): number {
  const termWidth = process.stdout.columns || 120;
  // Reserve: project(18) + time(8) + msgs(5) + tokens(6) + model(5) + separators(8) + border(4)
  const reserved = 18 + 8 + 5 + 6 + 5 + 8 + 4;
  return Math.max(20, termWidth - reserved);
}

function formatSessionRow(session: Session): string {
  const titleWidth = getTitleWidth();
  const title = session.title.length > titleWidth
    ? session.title.slice(0, titleWidth - 1) + "…"
    : session.title.padEnd(titleWidth);
  const project = (session.workingDirectory.split("/").pop() || "~").slice(0, 16).padEnd(16);
  const time = formatRelativeTime(session.lastAccessedAt).padEnd(7);
  const msgs = String(session.messageCount).padStart(4);
  const tokens = formatTokens(session.totalInputTokens + session.totalOutputTokens).padStart(5);
  const model = formatModelName(session.model).padStart(4);

  return ` ${title} ${project} ${time} ${msgs} ${tokens} ${model}`;
}

function formatModelName(model?: string): string {
  if (!model) return "-";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "son";
  if (model.includes("haiku")) return "hai";
  return model.slice(0, 4);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return String(tokens);
}

async function getSessionPreview(session: Session): Promise<string> {
  const lines = [
    `{bold}{cyan-fg}Session Details{/cyan-fg}{/bold}`,
    ``,
    `{yellow-fg}Title:{/yellow-fg}     ${session.title}`,
    `{yellow-fg}ID:{/yellow-fg}        ${session.id}`,
    `{yellow-fg}Slug:{/yellow-fg}      ${session.slug || "N/A"}`,
    `{yellow-fg}Path:{/yellow-fg}      ${session.workingDirectory}`,
    `{yellow-fg}Branch:{/yellow-fg}    ${session.gitBranch || "N/A"}`,
    `{yellow-fg}Model:{/yellow-fg}     ${session.model || "N/A"}`,
    ``,
    `{yellow-fg}Created:{/yellow-fg}   ${session.createdAt.toLocaleString()}`,
    `{yellow-fg}Last Used:{/yellow-fg} ${session.lastAccessedAt.toLocaleString()}`,
    ``,
    `{yellow-fg}Messages:{/yellow-fg}  ${session.messageCount} total`,
    `            ${session.userMessageCount} user / ${session.assistantMessageCount} assistant`,
    `{yellow-fg}Tokens:{/yellow-fg}    ${formatTokens(session.totalInputTokens)} in / ${formatTokens(session.totalOutputTokens)} out`,
    ``,
    `{gray-fg}Press q or Escape to close{/gray-fg}`,
  ];

  return lines.join("\n");
}
