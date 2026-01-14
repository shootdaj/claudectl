import blessed, { Widgets } from "blessed";
import { homedir } from "os";
import { join } from "path";
import {
  discoverSessions,
  formatRelativeTime,
  launchSession,
  syncIndex,
  getIndexStats,
  searchSessionContent,
  closeSearchIndex,
  type Session,
  type ContentSearchResult,
} from "../core/sessions";
import { renameSession, migrateRenamesToIndex } from "../core/title-generator";
import {
  loadClaudectlSettings,
  saveClaudectlSettings,
  ensureMaxSessionRetention,
  isScratchPath,
  type ClaudectlSettings,
} from "../core/config";
import { showMcpManager } from "./mcp-manager";
import { showNewProjectWizard } from "./new-project";
import { autoBackup, restoreSession as restoreSessionFromBackup } from "../core/backup";
import { basename as pathBasename } from "../utils/paths";

const isWindows = process.platform === "win32";

// Get version from .version file
function getVersion(): string {
  try {
    const versionFile = join(homedir(), ".claudectl", ".version");
    const result = Bun.spawnSync(isWindows ? ["cmd", "/c", "type", versionFile] : ["cat", versionFile]);
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
  selectedIndex?: number;  // Restore selection when returning from Claude
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
  // Ensure session cleanup is disabled (don't auto-delete old sessions)
  const retentionUpdated = await ensureMaxSessionRetention();
  if (retentionUpdated) {
    console.log("Session cleanup disabled (sessions won't be auto-deleted)");
  }

  // Auto-backup sessions on startup (if more than 1 hour since last backup)
  await autoBackup();

  // Sync the search index on startup (fast incremental update)
  const stats = getIndexStats();
  if (stats.sessions === 0) {
    console.log("Building session index...");
  }
  await syncIndex();

  // Migrate any renames from JSON file to SQLite index
  await migrateRenamesToIndex();

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

  // Marquee animation for long titles in details panel only
  // (List marquee disabled - causes stack overflow with blessed setItems)
  const marqueeAnimation = setInterval(() => {
    if (currentMarqueeTitle.length > 0) {
      marqueeOffset = (marqueeOffset + 1) % (currentMarqueeTitle.length + 10);
      updateDetailsWithMarquee();
      screen.render();
    }
  }, 150);
  animationIntervals.push(marqueeAnimation);

  // Format session row
  function formatSessionRow(session: Session): string {
    const titleWidth = getTitleWidth();
    const title = session.title.length > titleWidth
      ? session.title.slice(0, titleWidth - 1) + "…"
      : session.title.padEnd(titleWidth);

    const project = (pathBasename(session.workingDirectory) || "~").slice(0, 16).padEnd(16);
    const time = formatRelativeTime(session.lastAccessedAt).padEnd(7);
    const msgs = String(session.messageCount).padStart(4);
    const tokens = formatTokens(session.totalInputTokens + session.totalOutputTokens).padStart(5);
    const model = formatModelName(session.model).padStart(4);

    // Deleted sessions shown in dim gray with [DEL] prefix
    if (session.isDeleted) {
      return ` {#666666-fg}[DEL] ${title.slice(0, titleWidth - 6)} ${project} ${time} ${msgs} ${tokens} ${model}{/#666666-fg}`;
    }

    return ` ${title} {#ff8800-fg}${project}{/#ff8800-fg} {#00ffff-fg}${time}{/#00ffff-fg} ${msgs} {#00ff00-fg}${tokens}{/#00ff00-fg} {#aa88ff-fg}${model}{/#aa88ff-fg}`;
  }

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

  // Session list - keys:false so we can handle Ctrl+Up/Down separately
  const table = blessed.list({
    parent: mainBox,
    top: 2,
    left: 0,
    width: "100%-2",
    height: "100%-9",
    tags: true,
    keys: false,  // Disable built-in key handling
    vi: false,    // Disable vi mode
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
  const defaultFooter = " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}m{/#aa88ff-fg} MCP  {#aa88ff-fg}q{/#aa88ff-fg} Quit";
  const scratchFooter = " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#ffff00-fg}p{/#ffff00-fg} Promote  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}q{/#aa88ff-fg} Quit";

  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: defaultFooter,
    tags: true,
    style: { fg: "gray" },
  });

  // Update footer based on selected session
  function updateFooter() {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (session && isScratchPath(session.workingDirectory)) {
      footer.setContent(scratchFooter);
    } else {
      footer.setContent(defaultFooter);
    }
  }

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

  // Context preview popup (shown during search)
  const contextPreview = blessed.box({
    parent: screen,
    top: "center",
    right: 1,
    width: "45%",
    height: "60%",
    hidden: true,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: theme.yellow },
      fg: "white",
    },
    scrollable: true,
    keys: true,
    vi: true,
    scrollbar: {
      ch: "▌",
      style: { fg: theme.yellow },
    },
    label: ` {#ffff00-fg}Match Preview{/#ffff00-fg} `,
  });

  let filteredSessions = [...sessions];
  let searchQuery = "";
  let searchResults: ContentSearchResult[] = [];
  let isSearchMode = false;
  let searchDebounceTimer: NodeJS.Timeout | null = null;

  // Debounced FTS search function
  function performSearch(query: string) {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (!query.trim()) {
      // Empty search - show all sessions
      isSearchMode = false;
      searchResults = [];
      filteredSessions = [...sessions];
      contextPreview.hide();
      updateTable();
      return;
    }

    // Debounce 150ms for real-time search
    searchDebounceTimer = setTimeout(() => {
      try {
        isSearchMode = true;
        searchResults = searchSessionContent(query, { maxResults: 50, maxMatchesPerSession: 3 });

        // Map search results to sessions for display
        filteredSessions = searchResults.map(r => {
          // Find matching session or create placeholder
          const session = sessions.find(s => s.id === r.sessionId);
          if (session) {
            return { ...session, title: r.title }; // Use search result title (may include custom title)
          }
          // Create placeholder session from search result
          return {
            id: r.sessionId,
            title: r.title,
            slug: r.slug,
            workingDirectory: r.workingDirectory,
            shortPath: r.shortPath,
            encodedPath: "",
            filePath: r.filePath,
            createdAt: r.lastAccessedAt,
            lastAccessedAt: r.lastAccessedAt,
            messageCount: r.totalMatches,
            userMessageCount: 0,
            assistantMessageCount: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            model: r.model,
            machine: "local" as const,
          };
        });

        updateTable();
        if (filteredSessions.length > 0) {
          table.select(0);
        }
        updateContextPreview();
        updateSearchPreview();
      } catch (e) {
        // Fallback to simple filter if FTS fails
        isSearchMode = false;
        filteredSessions = sessions.filter(
          (s) =>
            s.title?.toLowerCase().includes(query.toLowerCase()) ||
            s.slug?.toLowerCase().includes(query.toLowerCase()) ||
            s.id.toLowerCase().includes(query.toLowerCase()) ||
            s.workingDirectory.toLowerCase().includes(query.toLowerCase())
        );
        updateTable();
      }
    }, 150);
  }

  // Update details panel with search match preview
  function updateSearchPreview() {
    if (!isSearchMode || searchResults.length === 0) return;

    const idx = table.selected;
    const result = searchResults[idx];
    if (!result || result.matches.length === 0) {
      updateDetails();
      return;
    }

    // Show first match snippet in details panel
    const match = result.matches[0];
    const matchType = match.type === "user" ? "{#00ffff-fg}user{/#00ffff-fg}" : "{#aa88ff-fg}assistant{/#aa88ff-fg}";
    const snippet = formatSnippet(match.highlightedSnippet);

    const lines = [
      `{bold}{#ff00ff-fg}${result.title}{/#ff00ff-fg}{/bold}  {#888888-fg}${result.totalMatches} matches{/#888888-fg}`,
      `{#888888-fg}in{/#888888-fg} ${result.shortPath}`,
      `${matchType}: ${snippet}`,
    ];

    detailsBox.setContent(lines.join("\n"));
    screen.render();
  }

  // Format snippet with highlighted search terms
  function formatSnippet(snippet: string, maxLen = 80): string {
    // Replace >>>> and <<<< markers with background highlight (yellow bg, black text)
    return snippet
      .replace(/>>>>/g, "{black-fg}{yellow-bg}")
      .replace(/<<<<</g, "{/yellow-bg}{/black-fg}")
      .replace(/<<<<(?!<)/g, "{/yellow-bg}{/black-fg}") // Handle 4 < as well
      .replace(/\n/g, " ")
      .slice(0, maxLen);
  }

  // Update the context preview popup with all matches
  function updateContextPreview() {
    if (!isSearchMode || searchResults.length === 0) {
      contextPreview.hide();
      return;
    }

    const idx = table.selected;
    const result = searchResults[idx];
    if (!result || result.matches.length === 0) {
      contextPreview.hide();
      return;
    }

    const lines: string[] = [
      `{bold}{#ff00ff-fg}${result.title.slice(0, 40)}{/#ff00ff-fg}{/bold}`,
      `{#888888-fg}${result.shortPath}{/#888888-fg}`,
      ``,
      `{#00ffff-fg}${result.totalMatches} match${result.totalMatches > 1 ? "es" : ""} for "{#ffff00-fg}${searchQuery}{/#ffff00-fg}"{/#00ffff-fg}`,
      ``,
    ];

    for (let i = 0; i < result.matches.length; i++) {
      const match = result.matches[i];
      const typeLabel = match.type === "user" ? "{#00ffff-fg}→{/#00ffff-fg}" : "{#aa88ff-fg}←{/#aa88ff-fg}";
      const snippet = formatSnippet(match.highlightedSnippet, 200);
      lines.push(`${typeLabel} ${snippet}`);
      lines.push(``);
    }

    if (result.totalMatches > result.matches.length) {
      lines.push(`{#888888-fg}...and ${result.totalMatches - result.matches.length} more{/#888888-fg}`);
    }

    contextPreview.setContent(lines.join("\n"));
    contextPreview.show();
    contextPreview.setScrollPerc(0);
  }

  function updateTable() {
    table.setItems(filteredSessions.map(formatSessionRow));
    updateDetails();
    screen.render();
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

    // Show search preview if in search mode, otherwise show normal details
    if (isSearchMode && searchResults.length > 0) {
      updateContextPreview();
      updateSearchPreview();
    } else {
      updateDetails();
    }
    // Update footer to show 'p Promote' for scratch sessions
    updateFooter();
    screen.render();
  });

  // Focus first row (or restore previous selection)
  const initialIndex = Math.min(options.selectedIndex ?? 0, filteredSessions.length - 1);
  table.select(Math.max(0, initialIndex));
  updateDetails();
  updateFooter();

  // Keybindings
  table.key(["enter"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    // Cannot launch deleted sessions - must restore first
    if (session.isDeleted) {
      detailsBox.setContent(`{#ff0000-fg}Cannot launch deleted session.{/#ff0000-fg} Press {#ffff00-fg}Shift+R{/#ffff00-fg} to restore first.`);
      screen.render();
      return;
    }

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
      options.onLaunch?.(session);
    } else {
      console.log(`\nLaunching: ${session.title}`);
      console.log(`Directory: ${session.workingDirectory}`);
      if (settings.skipPermissions) {
        console.log(`Mode: --dangerously-skip-permissions`);
      }
      console.log();
      await launchSession(session, { skipPermissions: settings.skipPermissions });
      // Return to session picker after Claude exits, restoring the same row
      options.onLaunch?.(session);
      // Close the database connection to avoid stale connection errors
      closeSearchIndex();
      await showSessionPicker({ ...options, selectedIndex: idx });
    }
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
    let install;
    if (isWindows) {
      install = Bun.spawn(["powershell", "-ExecutionPolicy", "Bypass", "-Command", "irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
    } else {
      install = Bun.spawn(["bash", "-c", "curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
    }
    await install.exited;
    // Relaunch ccl with the updated version
    const cclPath = isWindows
      ? join(homedir(), ".bun", "bin", "ccl.cmd")
      : join(homedir(), ".bun", "bin", "ccl");
    const relaunch = Bun.spawn([cclPath], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await relaunch.exited;
    process.exit(0);
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

  // Restore deleted session (Shift+R)
  table.key(["S-r"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    if (!session.isDeleted) {
      detailsBox.setContent(`{#ffff00-fg}Session is not deleted{/#ffff00-fg}`);
      screen.render();
      return;
    }

    detailsBox.setContent(`{#ffff00-fg}Restoring...{/#ffff00-fg} ${session.title}`);
    screen.render();

    const result = await restoreSessionFromBackup(session.id);
    if (result.success) {
      // Re-sync index to pick up restored file and clear deleted status
      await syncIndex();
      // Refresh sessions list
      const newSessions = await discoverSessions();
      sessions.length = 0;
      sessions.push(...newSessions);
      filteredSessions = [...sessions];
      updateTable();
      detailsBox.setContent(`{#00ff00-fg}✓ Restored:{/#00ff00-fg} ${session.title}`);
    } else {
      detailsBox.setContent(`{#ff0000-fg}✗ Restore failed:{/#ff0000-fg} ${result.error}`);
    }
    screen.render();
  });

  // Real-time search as user types
  let lastSearchValue = "";

  table.key(["/"], () => {
    searchBox.setValue("");
    lastSearchValue = "";
    searchBox.show();
    searchBox.focus();
    footer.setContent(
      " {#ff00ff-fg}↑↓{/#ff00ff-fg} Navigate  {#ffff00-fg}C-↑↓{/#ffff00-fg} Scroll Preview  {#00ff00-fg}↵{/#00ff00-fg} Done  {#aa88ff-fg}Esc{/#aa88ff-fg} Clear"
    );
    screen.render();
  });
  searchBox.on("keypress", (ch: string) => {
    // Get current value + new character (if printable)
    setTimeout(() => {
      const value = searchBox.getValue();
      // Only trigger search if the value actually changed (ignore arrow keys, etc.)
      if (value !== lastSearchValue) {
        lastSearchValue = value;
        searchQuery = value;
        performSearch(value);
      }
    }, 0);
  });

  searchBox.on("submit", (value: string) => {
    // Keep search results, just hide the box and focus list
    searchBox.hide();
    table.focus();
    // Show context hint if we have search results
    if (isSearchMode && searchResults.length > 0) {
      footer.setContent(
        " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#ffff00-fg}C-↑↓{/#ffff00-fg} Scroll  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#ffff00-fg}c{/#ffff00-fg} Context  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}Esc{/#aa88ff-fg} Clear  {#aa88ff-fg}q{/#aa88ff-fg} Quit"
      );
    } else {
      footer.setContent(
        " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#ffff00-fg}R{/#ffff00-fg} Restore  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}m{/#aa88ff-fg} MCP  {#aa88ff-fg}q{/#aa88ff-fg} Quit"
      );
    }
    screen.render();
  });

  searchBox.key(["escape"], () => {
    searchBox.hide();
    searchBox.setValue("");
    searchQuery = "";
    isSearchMode = false;
    searchResults = [];
    filteredSessions = [...sessions];
    contextPreview.hide();
    updateTable();
    table.focus();
    footer.setContent(
      " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#ffff00-fg}R{/#ffff00-fg} Restore  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}m{/#aa88ff-fg} MCP  {#aa88ff-fg}q{/#aa88ff-fg} Quit"
    );
    screen.render();
  });

  // Ctrl+Up/Down to scroll the preview while staying in search box
  searchBox.key(["C-up"], () => {
    if (isSearchMode && searchResults.length > 0 && !contextPreview.hidden) {
      contextPreview.scroll(-3);
      screen.render();
    }
  });

  searchBox.key(["C-down"], () => {
    if (isSearchMode && searchResults.length > 0 && !contextPreview.hidden) {
      contextPreview.scroll(3);
      screen.render();
    }
  });

  // Navigate list with arrow keys while search box is focused
  searchBox.key(["up"], () => {
    if (filteredSessions.length === 0) return;
    const current = table.selected;
    const newIdx = Math.max(0, current - 1);
    table.select(newIdx);
    if (isSearchMode && searchResults.length > 0) {
      updateContextPreview();
      updateSearchPreview();
    } else {
      updateDetails();
    }
    screen.render();
  });

  searchBox.key(["down"], () => {
    if (filteredSessions.length === 0) return;
    const current = table.selected;
    const newIdx = Math.min(filteredSessions.length - 1, current + 1);
    table.select(newIdx);
    if (isSearchMode && searchResults.length > 0) {
      updateContextPreview();
      updateSearchPreview();
    } else {
      updateDetails();
    }
    screen.render();
  });

  // Show context popup for search results
  table.key(["c"], async () => {
    if (!isSearchMode || searchResults.length === 0) return;

    const idx = table.selected;
    const result = searchResults[idx];
    if (!result || result.matches.length === 0) return;

    // Create popup showing all matches with context
    const lines: string[] = [
      `{bold}{#ff00ff-fg}Search Matches: "${searchQuery}"{/#ff00ff-fg}{/bold}`,
      `{#888888-fg}Session: ${result.title}{/#888888-fg}`,
      `{#888888-fg}Path: ${result.shortPath}{/#888888-fg}`,
      ``,
      `{#00ffff-fg}${result.totalMatches} matches found:{/#00ffff-fg}`,
      ``,
    ];

    for (let i = 0; i < result.matches.length; i++) {
      const match = result.matches[i];
      const typeLabel = match.type === "user" ? "{#00ffff-fg}[user]{/#00ffff-fg}" : "{#aa88ff-fg}[assistant]{/#aa88ff-fg}";
      const snippet = formatSnippet(match.highlightedSnippet);
      lines.push(`${i + 1}. ${typeLabel} line ${match.lineNumber}`);
      lines.push(`   ${snippet}`);
      lines.push(``);
    }

    if (result.totalMatches > result.matches.length) {
      lines.push(`{#888888-fg}...and ${result.totalMatches - result.matches.length} more matches{/#888888-fg}`);
    }

    lines.push(``);
    lines.push(`{#888888-fg}Press ESC or q to close{/#888888-fg}`);

    const contextBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "80%",
      height: "70%",
      content: lines.join("\n"),
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
      label: ` {#ffff00-fg}Match Context{/#ffff00-fg} `,
    });

    contextBox.key(["escape", "q", "c"], () => {
      contextBox.destroy();
      table.focus();
      screen.render();
    });

    contextBox.focus();
    screen.render();
  });

  // Helper to install agent-expert in a directory
  async function installAgentExpert(cwd: string): Promise<boolean> {
    console.log(`Installing agent-expert...`);
    let proc;
    if (isWindows) {
      // On Windows, use PowerShell to download and run
      proc = Bun.spawn(["powershell", "-ExecutionPolicy", "Bypass", "-Command", "irm https://raw.githubusercontent.com/shootdaj/agent-expert/main/install.ps1 | iex"], {
        cwd,
        stdio: ["inherit", "inherit", "inherit"],
      });
    } else {
      proc = Bun.spawn(["bash", "-c", "curl -sL https://raw.githubusercontent.com/shootdaj/agent-expert/main/install.sh | bash"], {
        cwd,
        stdio: ["inherit", "inherit", "inherit"],
      });
    }
    const code = await proc.exited;
    return code === 0;
  }

  // New session (n) - always shows new session menu (Quick question / Clone repo)
  table.key(["n"], async () => {
    const idx = table.selected;

    stopAnimations();
    screen.destroy();
    await showNewProjectWizard({
      onComplete: () => showSessionPicker({ ...options, selectedIndex: idx }),
      onCancel: () => showSessionPicker({ ...options, selectedIndex: idx }),
    });
  });

  // Promote (p) - directly promote scratch session to project
  table.key(["p"], async () => {
    const idx = table.selected;
    const session = filteredSessions[idx];
    if (!session) return;

    // Only works for scratch sessions
    if (!isScratchPath(session.workingDirectory)) {
      // Show preview instead (existing behavior)
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
      return;
    }

    // For scratch sessions, show promote flow
    stopAnimations();
    screen.destroy();
    await showNewProjectWizard({
      scratchSession: session,
      onComplete: () => showSessionPicker({ ...options, selectedIndex: idx }),
      onCancel: () => showSessionPicker({ ...options, selectedIndex: idx }),
    });
  });

  // Manual navigation since we disabled keys:true on table
  // This gives us full control over Ctrl+Up/Down for scrolling preview
  function navigateTable(direction: "up" | "down") {
    if (filteredSessions.length === 0) return;
    const current = table.selected;
    const newIdx = direction === "up"
      ? Math.max(0, current - 1)
      : Math.min(filteredSessions.length - 1, current + 1);
    table.select(newIdx);
    if (isSearchMode && searchResults.length > 0) {
      updateContextPreview();
      updateSearchPreview();
    } else {
      updateDetails();
    }
    updateFooter();
    screen.render();
  }

  table.on("keypress", (ch: string, key: any) => {
    if (!key) return;

    // Ctrl+Up/Down: scroll preview
    if (key.ctrl && (key.name === "up" || key.name === "down")) {
      if (isSearchMode && searchResults.length > 0 && !contextPreview.hidden) {
        contextPreview.scroll(key.name === "up" ? -3 : 3);
        screen.render();
      }
      return;
    }

    // Normal Up/Down/j/k: navigate table
    if (key.name === "up" || key.name === "k") {
      navigateTable("up");
      return;
    }
    if (key.name === "down" || key.name === "j") {
      navigateTable("down");
      return;
    }
  });

  // Clear search with escape when table is focused
  table.key(["escape"], () => {
    if (isSearchMode) {
      searchQuery = "";
      isSearchMode = false;
      searchResults = [];
      filteredSessions = [...sessions];
      contextPreview.hide();
      updateTable();
      footer.setContent(
        " {#ff00ff-fg}↑↓{/#ff00ff-fg} Nav  {#00ff00-fg}↵{/#00ff00-fg} Launch  {#00ffff-fg}n{/#00ffff-fg} New  {#ff00ff-fg}r{/#ff00ff-fg} Rename  {#ffff00-fg}R{/#ffff00-fg} Restore  {#00ffff-fg}/{/#00ffff-fg} Search  {#aa88ff-fg}m{/#aa88ff-fg} MCP  {#aa88ff-fg}q{/#aa88ff-fg} Quit"
      );
      screen.render();
    }
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
