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

// Dark Midnight with color flare
const theme = {
  purple: "#b48ead",      // Soft purple - titles, accents
  blue: "#81a1c1",        // Steel blue - time, info
  cyan: "#88c0d0",        // Teal cyan - highlights
  green: "#a3be8c",       // Sage green - tokens, success
  yellow: "#ebcb8b",      // Warm yellow - warnings
  muted: "#5c6773",       // Muted gray
  fg: "#d8dee9",          // Light foreground
  border: "#b48ead",      // Purple border
  selectedBg: "#3b4252",  // Selection background
  selectedFg: "#a3be8c",  // Selection foreground - green
};

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
    title: "claudectl",
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
      border: { fg: theme.purple },
    },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: "{bold}{#b48ead-fg} ◆ claudectl{/#b48ead-fg}{/bold} {#5c6773-fg}│{/#5c6773-fg} {#81a1c1-fg}sessions{/#81a1c1-fg}",
    tags: true,
    style: {
      fg: "white",
    },
  });

  // Session count on right
  blessed.text({
    parent: titleBar,
    top: 0,
    right: 1,
    content: `{#a3be8c-fg}${sessions.length}{/#a3be8c-fg} {#5c6773-fg}sessions{/#5c6773-fg}`,
    tags: true,
  });

  // Header line
  const titleWidth = getTitleWidth();
  const headerLine = ` ${"TITLE".padEnd(titleWidth)} ${"PROJECT".padEnd(16)} ${"TIME".padEnd(7)} ${"MSGS".padStart(4)} ${"TOK".padStart(5)} ${"MOD".padStart(4)}`;

  blessed.text({
    parent: mainBox,
    top: 1,
    left: 1,
    width: "100%-4",
    height: 1,
    content: `{#81a1c1-fg}${headerLine}{/#81a1c1-fg}`,
    tags: true,
  });

  // Session list
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
      ch: "▌",
      style: { fg: theme.purple },
    },
    style: {
      fg: "white",
      selected: {
        fg: theme.selectedFg,
        bg: theme.selectedBg,
        bold: true,
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
      " {#b48ead-fg}↑↓{/#b48ead-fg} Navigate  {#a3be8c-fg}Enter{/#a3be8c-fg} Launch  {#81a1c1-fg}n{/#81a1c1-fg} New  {#88c0d0-fg}N{/#88c0d0-fg} New@sel  {#b48ead-fg}r{/#b48ead-fg} Rename  {#a3be8c-fg}p{/#a3be8c-fg} Preview  {#81a1c1-fg}/{/#81a1c1-fg} Search  {#88c0d0-fg}q{/#88c0d0-fg} Quit",
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
      bg: theme.blue,
    },
  });

  let filteredSessions = [...sessions];
  let searchQuery = "";

  function updateTable() {
    table.setItems(filteredSessions.map(formatSessionRow));
    updateDetails();
    screen.render();
  }

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + "…";
  }

  function updateDetails() {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) {
      detailsBox.setContent("");
      screen.render();
      return;
    }

    // Calculate max title width: screen width - margins - id suffix (~15 chars)
    const maxTitleWidth = Math.max(40, (screen.width as number) - 20);
    const title = truncate(session.title, maxTitleWidth);

    const lines = [
      `{bold}{#b48ead-fg}${title}{/#b48ead-fg}{/bold}  {#5c6773-fg}${session.id.slice(0, 8)}{/#5c6773-fg}`,
      `{#5c6773-fg}path{/#5c6773-fg} {#d8dee9-fg}${session.workingDirectory}{/#d8dee9-fg}  {#5c6773-fg}branch{/#5c6773-fg} {#a3be8c-fg}${session.gitBranch || "—"}{/#a3be8c-fg}`,
      `{#5c6773-fg}created{/#5c6773-fg} {#d8dee9-fg}${session.createdAt.toLocaleString()}{/#d8dee9-fg}  {#5c6773-fg}model{/#5c6773-fg} {#81a1c1-fg}${session.model || "—"}{/#81a1c1-fg}`,
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
      `{#ebcb8b-fg}DRY RUN:{/#ebcb8b-fg} Would run: {bold}${result.command}{/bold}\n` +
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
        border: { fg: theme.purple },
        fg: "white",
      },
      scrollable: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "▌",
        style: { fg: theme.purple },
      },
      label: ` {#b48ead-fg}${session.title || session.id}{/#b48ead-fg} `,
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
      bg: theme.green,
    },
  });

  table.key(["r"], () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    detailsBox.setContent(`{#b48ead-fg}rename ›{/#b48ead-fg} {#d8dee9-fg}${session.title}{/#d8dee9-fg}`);
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
    detailsBox.setContent(`{#a3be8c-fg}✓{/#a3be8c-fg} {#d8dee9-fg}${newTitle}{/#d8dee9-fg}`);
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

  // New session in current folder
  table.key(["n"], () => {
    screen.destroy();
    const cwd = process.cwd();
    console.log(`\nStarting new session in: ${cwd}\n`);

    const proc = Bun.spawn(["claude"], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });

    proc.exited.then((code) => process.exit(code));
  });

  // New session in selected session's folder
  table.key(["S-n"], () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    screen.destroy();
    const cwd = session.workingDirectory;
    console.log(`\nStarting new session in: ${cwd}\n`);

    const proc = Bun.spawn(["claude"], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });

    proc.exited.then((code) => process.exit(code));
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

  // Add subtle color hints to row data
  return ` ${title} {#88c0d0-fg}${project}{/#88c0d0-fg} {#81a1c1-fg}${time}{/#81a1c1-fg} ${msgs} {#a3be8c-fg}${tokens}{/#a3be8c-fg} {#b48ead-fg}${model}{/#b48ead-fg}`;
}

function formatModelName(model?: string): string {
  if (!model) return "—";
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
    `{bold}{#b48ead-fg}Session Details{/#b48ead-fg}{/bold}`,
    ``,
    `{#81a1c1-fg}title{/#81a1c1-fg}      ${session.title}`,
    `{#81a1c1-fg}id{/#81a1c1-fg}         {#5c6773-fg}${session.id}{/#5c6773-fg}`,
    `{#81a1c1-fg}slug{/#81a1c1-fg}       ${session.slug || "—"}`,
    `{#81a1c1-fg}path{/#81a1c1-fg}       ${session.workingDirectory}`,
    `{#81a1c1-fg}branch{/#81a1c1-fg}     {#a3be8c-fg}${session.gitBranch || "—"}{/#a3be8c-fg}`,
    `{#81a1c1-fg}model{/#81a1c1-fg}      {#b48ead-fg}${session.model || "—"}{/#b48ead-fg}`,
    ``,
    `{#81a1c1-fg}created{/#81a1c1-fg}    ${session.createdAt.toLocaleString()}`,
    `{#81a1c1-fg}last used{/#81a1c1-fg}  ${session.lastAccessedAt.toLocaleString()}`,
    ``,
    `{#81a1c1-fg}messages{/#81a1c1-fg}   ${session.messageCount} total`,
    `           {#5c6773-fg}${session.userMessageCount} user / ${session.assistantMessageCount} assistant{/#5c6773-fg}`,
    `{#81a1c1-fg}tokens{/#81a1c1-fg}     {#a3be8c-fg}${formatTokens(session.totalInputTokens)}{/#a3be8c-fg} in / {#a3be8c-fg}${formatTokens(session.totalOutputTokens)}{/#a3be8c-fg} out`,
    ``,
    `{#5c6773-fg}press q or esc to close{/#5c6773-fg}`,
  ];

  return lines.join("\n");
}
