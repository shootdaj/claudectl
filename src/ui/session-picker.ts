import blessed, { Widgets } from "blessed";
import {
  discoverSessions,
  formatRelativeTime,
  launchSession,
  type Session,
} from "../core/sessions";
import { renameSession } from "../core/title-generator";
import {
  loadClaudectlSettings,
  saveClaudectlSettings,
  type ClaudectlSettings,
} from "../core/config";
import { showMcpManager } from "./mcp-manager";
import { autoBackup } from "../core/backup";

// Get version from .version file
function getVersion(): string {
  try {
    const versionFile = `${process.env.HOME}/.claudectl/.version`;
    const result = Bun.spawnSync(["cat", versionFile]);
    return result.stdout.toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

// Check for updates in background
async function checkForUpdate(): Promise<string | null> {
  try {
    const currentVersion = getVersion();
    if (currentVersion === "dev" || currentVersion === "main") return null;

    const response = await fetch("https://api.github.com/repos/shootdaj/claudectl/releases/latest");
    const data = await response.json() as { tag_name: string };
    const latestVersion = data.tag_name;

    if (latestVersion && latestVersion !== currentVersion) {
      return latestVersion;
    }
  } catch {
    // Silently fail - update check is non-critical
  }
  return null;
}

// Extend blessed types to include runtime 'selected' property
interface ListTableWithSelected extends Widgets.ListElement {
  selected: number;
}

interface SessionPickerOptions {
  onLaunch?: (session: Session) => void;
  onExit?: () => void;
  dryRun?: boolean;
}

// Neon color scheme
const theme = {
  pink: "#ff00ff",        // Neon magenta - titles, accents
  blue: "#00ffff",        // Neon cyan - time, info
  cyan: "#00ff00",        // Neon green - highlights, success
  green: "#00ff00",       // Neon green - tokens, success
  yellow: "#ffff00",      // Neon yellow - warnings, labels
  orange: "#ff8800",      // Neon orange - project names
  purple: "#aa88ff",      // Bright purple - model names
  muted: "#888888",       // Gray
  fg: "#ffffff",          // White foreground
  border: "#ff00ff",      // Magenta border
  selectedBg: "#333333",  // Selection background
  selectedFg: "#00ff00",  // Selection foreground - neon green
};

// Sparkle characters for title animation
const sparkles = ["✦", "✧", "★", "☆", "✴", "✵", "❋", "❊"];

export async function showSessionPicker(
  options: SessionPickerOptions = {}
): Promise<void> {
  // Auto-backup sessions on startup (if more than 1 hour since last backup)
  await autoBackup();

  const sessions = await discoverSessions();
  let settings = loadClaudectlSettings();

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
      border: { fg: theme.pink },
    },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: "",
    tags: true,
    style: {
      fg: "white",
    },
  });

  let updateAvailable: string | null = null;

  function updateTitleBar() {
    const version = getVersion();
    const badges: string[] = [];
    if (updateAvailable) {
      badges.push(`{#ffff00-fg}[UPDATE ${updateAvailable}]{/#ffff00-fg}`);
    }
    if (settings.skipPermissions) {
      badges.push("{#ff8800-fg}[SKIP PERMS]{/#ff8800-fg}");
    }
    if (settings.autoAddAgentExpert) {
      badges.push("{#00ff00-fg}[AGENT EXPERT]{/#00ff00-fg}");
    }
    const badgeStr = badges.length > 0 ? " " + badges.join(" ") : "";
    titleBar.setContent(
      `{bold}{#ff00ff-fg} ◆ claudectl{/#ff00ff-fg}{/bold} {#888888-fg}${version} │{/#888888-fg} {#00ffff-fg}sessions{/#00ffff-fg}${badgeStr}`
    );
  }
  updateTitleBar();

  // Check for updates in background
  checkForUpdate().then((latest) => {
    if (latest) {
      updateAvailable = latest;
      updateTitleBar();
      screen.render();
    }
  });

  // Animation state
  let sparkleIndex = 0;
  let blinkState = true;
  let marqueeOffset = 0;
  let currentMarqueeTitle = "";
  const animationIntervals: NodeJS.Timeout[] = [];

  // Blinking update badge (only when update available)
  const blinkAnimation = setInterval(() => {
    if (updateAvailable) {
      blinkState = !blinkState;
      updateTitleBar();
      screen.render();
    }
  }, 500);
  animationIntervals.push(blinkAnimation);

  // Update title bar with optional blink effect
  function updateTitleBarAnimated() {
    const version = getVersion();
    const sparkle = sparkles[sparkleIndex % sparkles.length];
    sparkleIndex++;

    const badges: string[] = [];
    if (updateAvailable) {
      const color = blinkState ? "#ffff00" : "#ff8800";
      badges.push(`{${color}-fg}[UPDATE ${updateAvailable}]{/${color}-fg}`);
    }
    if (settings.skipPermissions) {
      badges.push("{#ff8800-fg}[SKIP PERMS]{/#ff8800-fg}");
    }
    if (settings.autoAddAgentExpert) {
      badges.push("{#00ff00-fg}[AGENT EXPERT]{/#00ff00-fg}");
    }
    const badgeStr = badges.length > 0 ? " " + badges.join(" ") : "";
    titleBar.setContent(
      `{bold}{#ff00ff-fg} ${sparkle} claudectl{/#ff00ff-fg}{/bold} {#888888-fg}${version} │{/#888888-fg} {#00ffff-fg}sessions{/#00ffff-fg}${badgeStr}`
    );
  }

  // Sparkle animation in title
  const sparkleAnimation = setInterval(() => {
    updateTitleBarAnimated();
    screen.render();
  }, 300);
  animationIntervals.push(sparkleAnimation);

  // Marquee animation for long titles in details panel
  const marqueeAnimation = setInterval(() => {
    if (currentMarqueeTitle.length > 0) {
      marqueeOffset = (marqueeOffset + 1) % (currentMarqueeTitle.length + 10);
      updateDetailsWithMarquee();
      screen.render();
    }
  }, 150);
  animationIntervals.push(marqueeAnimation);

  // Cleanup animations on exit
  function stopAnimations() {
    animationIntervals.forEach(interval => clearInterval(interval));
  }

  // Session count on right
  blessed.text({
    parent: titleBar,
    top: 0,
    right: 1,
    content: `{#00ff00-fg}${sessions.length}{/#00ff00-fg} {#888888-fg}sessions{/#888888-fg}`,
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
    content: `{#00ffff-fg}${headerLine}{/#00ffff-fg}`,
    tags: true,
  });

  // Session list
  const table = blessed.list({
    parent: mainBox,
    top: 2,
    left: 0,
    width: "100%-2",
    height: "100%-9",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: {
      ch: "▌",
      style: { fg: theme.pink },
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
    bottom: 4,
    left: 0,
    width: "100%-2",
    orientation: "horizontal",
    style: { fg: "gray" },
  });

  // Details panel
  const detailsBox = blessed.box({
    parent: mainBox,
    bottom: 1,
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
      " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}m{/#aa88ff-fg} MCP  {#ffff00-fg}u{/#ffff00-fg} Update  {#aa88ff-fg}q{/#aa88ff-fg} Quit",
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

  // Get the visible portion of marquee text
  function getMarqueeText(text: string, maxWidth: number, offset: number): string {
    const padding = "     ";  // Space between repetitions
    const scrollText = text + padding;
    const start = offset % scrollText.length;
    let visible = "";
    for (let i = 0; i < maxWidth; i++) {
      visible += scrollText[(start + i) % scrollText.length];
    }
    return visible;
  }

  // Fixed width for marquee - titles longer than this will scroll
  const MARQUEE_WIDTH = 60;

  function updateDetailsWithMarquee() {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    let displayTitle: string;

    if (currentMarqueeTitle.length > 0) {
      displayTitle = getMarqueeText(currentMarqueeTitle, MARQUEE_WIDTH, marqueeOffset);
    } else {
      displayTitle = session.title;
    }

    const lines = [
      `{bold}{#ff00ff-fg}${displayTitle}{/#ff00ff-fg}{/bold}  {#888888-fg}${session.id.slice(0, 8)}{/#888888-fg}`,
      `{#888888-fg}path{/#888888-fg} {#ffffff-fg}${session.workingDirectory}{/#ffffff-fg}  {#888888-fg}branch{/#888888-fg} {#00ff00-fg}${session.gitBranch || "—"}{/#00ff00-fg}`,
      `{#888888-fg}created{/#888888-fg} {#ffffff-fg}${session.createdAt.toLocaleString()}{/#ffffff-fg}  {#888888-fg}model{/#888888-fg} {#aa88ff-fg}${session.model || "—"}{/#aa88ff-fg}`,
    ];

    detailsBox.setContent(lines.join("\n"));
  }

  function updateDetails() {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) {
      currentMarqueeTitle = "";
      detailsBox.setContent("");
      screen.render();
      return;
    }

    // Set up marquee for long titles (> 60 chars)
    if (session.title.length > MARQUEE_WIDTH) {
      currentMarqueeTitle = session.title;
      marqueeOffset = 0;  // Reset marquee position on selection change
    } else {
      currentMarqueeTitle = "";
    }

    updateDetailsWithMarquee();
    screen.render();
  }

  table.on("select item", () => {
    // Only scroll when selection is outside visible area
    const selected = table.selected;
    const scrollPos = (table as any).childBase || 0;
    const visibleHeight = (table.height as number) - 2;
    const lastVisible = scrollPos + visibleHeight - 1;

    // Scroll down only when selection goes past the last visible item
    if (selected > lastVisible) {
      table.scrollTo(selected - visibleHeight + 1);
    }
    // Scroll up only when selection goes above the first visible item
    else if (selected < scrollPos) {
      table.scrollTo(selected);
    }

    updateDetails();
    screen.render();
  });

  // Focus first row
  table.select(0);
  updateDetails();

  // Keybindings
  table.key(["enter"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    stopAnimations();
    screen.destroy();

    if (options.dryRun) {
      const result = await launchSession(session, {
        dryRun: true,
        skipPermissions: settings.skipPermissions,
      });
      console.log(`\n┌─ Dry Run ─────────────────────────────────┐`);
      console.log(`│ Session: ${session.title.slice(0, 32).padEnd(32)}│`);
      console.log(`│ Command: ${result.command.padEnd(32)}│`);
      console.log(`│ CWD: ${result.cwd.slice(0, 36).padEnd(36)}│`);
      console.log(`└────────────────────────────────────────────┘\n`);
    } else {
      console.log(`\nLaunching: ${session.title}`);
      console.log(`Directory: ${session.workingDirectory}`);
      if (settings.skipPermissions) {
        console.log(`Mode: --dangerously-skip-permissions`);
      }
      console.log();
      await launchSession(session, { skipPermissions: settings.skipPermissions });
    }

    options.onLaunch?.(session);
  });

  // Toggle dangerous mode (skip permissions)
  table.key(["d"], async () => {
    settings.skipPermissions = !settings.skipPermissions;
    await saveClaudectlSettings(settings);
    updateTitleBar();

    const status = settings.skipPermissions
      ? "{#ff8800-fg}ON{/#ff8800-fg} - launches will use --dangerously-skip-permissions"
      : "{#00ff00-fg}OFF{/#00ff00-fg} - normal permission prompts";
    detailsBox.setContent(`{#ff00ff-fg}Dangerous Mode:{/#ff00ff-fg} ${status}`);
    screen.render();
  });

  // Toggle agent-expert auto-add
  table.key(["a"], async () => {
    settings.autoAddAgentExpert = !settings.autoAddAgentExpert;
    await saveClaudectlSettings(settings);
    updateTitleBar();

    const status = settings.autoAddAgentExpert
      ? "{#00ff00-fg}ON{/#00ff00-fg} - new sessions will auto-install agent-expert"
      : "{#888888-fg}OFF{/#888888-fg} - new sessions start without agent-expert";
    detailsBox.setContent(`{#ff00ff-fg}Agent Expert:{/#ff00ff-fg} ${status}`);
    screen.render();
  });

  // Open MCP manager
  table.key(["m"], async () => {
    stopAnimations();
    screen.destroy();
    await showMcpManager({
      projectDir: process.cwd(),
      onExit: () => {
        // Re-show session picker after MCP manager closes
        showSessionPicker(options);
      },
    });
  });

  // Run update
  table.key(["u"], async () => {
    stopAnimations();
    screen.destroy();
    console.log("\nUpdating claudectl...\n");
    const install = Bun.spawn(["bash", "-c", "curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash"], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await install.exited;
    // Relaunch ccl with the updated version (v1.0.37 test)
    const relaunch = Bun.spawn([`${process.env.HOME}/.bun/bin/ccl`], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await relaunch.exited;
    process.exit(0);
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
        border: { fg: theme.pink },
        fg: "white",
      },
      scrollable: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: "▌",
        style: { fg: theme.pink },
      },
      label: ` {#ff00ff-fg}${session.title || session.id}{/#ff00ff-fg} `,
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

    detailsBox.setContent(`{#ff00ff-fg}rename ›{/#ff00ff-fg} {#ffffff-fg}${session.title}{/#ffffff-fg}`);
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
    detailsBox.setContent(`{#00ff00-fg}✓{/#00ff00-fg} {#ffffff-fg}${newTitle}{/#ffffff-fg}`);
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

  // Helper to install agent-expert in a directory
  async function installAgentExpert(cwd: string): Promise<boolean> {
    console.log(`Installing agent-expert...`);
    const proc = Bun.spawn(["bash", "-c", "curl -sL https://raw.githubusercontent.com/shootdaj/agent-expert/main/install.sh | bash"], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });
    const code = await proc.exited;
    return code === 0;
  }

  // New session in current folder
  table.key(["n"], async () => {
    stopAnimations();
    screen.destroy();
    const cwd = process.cwd();
    console.log(`\nStarting new session in: ${cwd}\n`);

    if (settings.autoAddAgentExpert) {
      await installAgentExpert(cwd);
    }

    const proc = Bun.spawn(["claude"], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });

    proc.exited.then((code) => process.exit(code));
  });

  // New session in selected session's folder
  table.key(["S-n"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    stopAnimations();
    screen.destroy();
    const cwd = session.workingDirectory;
    console.log(`\nStarting new session in: ${cwd}\n`);

    if (settings.autoAddAgentExpert) {
      await installAgentExpert(cwd);
    }

    const proc = Bun.spawn(["claude"], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });

    proc.exited.then((code) => process.exit(code));
  });

  screen.key(["q", "C-c"], () => {
    stopAnimations();
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

  // Add vibrant color hints to row data
  return ` ${title} {#ff8800-fg}${project}{/#ff8800-fg} {#00ffff-fg}${time}{/#00ffff-fg} ${msgs} {#00ff00-fg}${tokens}{/#00ff00-fg} {#aa88ff-fg}${model}{/#aa88ff-fg}`;
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
    `{bold}{#ff00ff-fg}Session Details{/#ff00ff-fg}{/bold}`,
    ``,
    `{#00ffff-fg}title{/#00ffff-fg}      ${session.title}`,
    `{#00ffff-fg}id{/#00ffff-fg}         {#888888-fg}${session.id}{/#888888-fg}`,
    `{#00ffff-fg}slug{/#00ffff-fg}       ${session.slug || "—"}`,
    `{#00ffff-fg}path{/#00ffff-fg}       ${session.workingDirectory}`,
    `{#00ffff-fg}branch{/#00ffff-fg}     {#00ff00-fg}${session.gitBranch || "—"}{/#00ff00-fg}`,
    `{#00ffff-fg}model{/#00ffff-fg}      {#aa88ff-fg}${session.model || "—"}{/#aa88ff-fg}`,
    ``,
    `{#00ffff-fg}created{/#00ffff-fg}    ${session.createdAt.toLocaleString()}`,
    `{#00ffff-fg}last used{/#00ffff-fg}  ${session.lastAccessedAt.toLocaleString()}`,
    ``,
    `{#00ffff-fg}messages{/#00ffff-fg}   ${session.messageCount} total`,
    `           {#888888-fg}${session.userMessageCount} user / ${session.assistantMessageCount} assistant{/#888888-fg}`,
    `{#00ffff-fg}tokens{/#00ffff-fg}     {#00ff00-fg}${formatTokens(session.totalInputTokens)}{/#00ff00-fg} in / {#00ff00-fg}${formatTokens(session.totalOutputTokens)}{/#00ff00-fg} out`,
    ``,
    `{#888888-fg}press q or esc to close{/#888888-fg}`,
  ];

  return lines.join("\n");
}
