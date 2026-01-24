import { Command } from "commander";
import { homedir } from "os";
import { join } from "path";
import { showSessionPicker } from "./ui/session-picker";
import { discoverSessions, findSession, launchSession, formatRelativeTime, searchSessions, syncIndex, rebuildIndex, getIndexStats } from "./core/sessions";
import { getAllConfigPaths } from "./core/config";
import { renameSession } from "./core/title-generator";
import { backupSessions, getBackupInfo, getBackupDir, findDeletedSessions, restoreSession, restoreAllSessions } from "./core/backup";
import pc from "picocolors";

const program = new Command();
const isWindows = process.platform === "win32";

// Get version from .version file (set by installer)
function getVersion(): string {
  try {
    const versionFile = join(homedir(), ".claudectl", ".version");
    const file = Bun.file(versionFile);
    const text = file.toString();
    // Synchronous file read
    const result = Bun.spawnSync(isWindows ? ["cmd", "/c", "type", versionFile] : ["cat", versionFile]);
    return result.stdout.toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

program
  .name("claudectl")
  .description("Global Claude Code session manager with rich TUI")
  .version(getVersion());

// Default command - show TUI session picker
program
  .action(async () => {
    await showSessionPicker();
  });

// New session command with mode shortcuts
program
  .command("new")
  .description("Start a new session")
  .option("-m, --mode <mode>", "Mode: scratch, create, clone")
  .option("-s, --skip-permissions", "Use --dangerously-skip-permissions")
  .action(async (options) => {
    const { startQuickQuestion, showCreateFlow, showCloneFlow } = await import("./ui/new-project");

    const wizardOptions = {
      skipPermissions: options.skipPermissions,
      onComplete: () => process.exit(0),
      onCancel: () => process.exit(0),
    };

    switch (options.mode) {
      case "scratch":
        await startQuickQuestion(wizardOptions);
        break;
      case "clone":
        await showCloneFlow(wizardOptions);
        break;
      case "create":
        await showCreateFlow(wizardOptions);
        break;
      default:
        // No mode specified, show the menu
        const { showNewSessionMenu } = await import("./ui/new-project");
        await showNewSessionMenu(wizardOptions);
        break;
    }
  });

// Sessions subcommand
const sessions = program.command("sessions").description("Manage sessions");

sessions
  .command("list")
  .description("List all sessions")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    const allSessions = await discoverSessions();

    if (options.json) {
      console.log(JSON.stringify(allSessions, null, 2));
      return;
    }

    if (allSessions.length === 0) {
      console.log("No sessions found.");
      return;
    }

    // Table header
    console.log("");
    console.log(
      "TITLE".padEnd(35) +
        "PATH".padEnd(25) +
        "LAST USED".padEnd(12) +
        "MSGS".padEnd(6) +
        "MODEL"
    );
    console.log("─".repeat(85));

    for (const session of allSessions) {
      const title = session.title.slice(0, 34).padEnd(35);
      const path = session.shortPath.slice(0, 24).padEnd(25);
      const time = formatRelativeTime(session.lastAccessedAt).padEnd(12);
      const msgs = String(session.messageCount).padEnd(6);
      const model = session.model?.includes("opus")
        ? "opus"
        : session.model?.includes("sonnet")
          ? "sonnet"
          : session.model?.includes("haiku")
            ? "haiku"
            : "N/A";

      console.log(`${title}${path}${time}${msgs}${model}`);
    }
    console.log("");
  });

sessions
  .command("launch [id]")
  .description("Launch a session by ID or name")
  .option("-c, --continue", "Continue most recent session")
  .option("-d, --dry-run", "Show what would happen without launching")
  .option("-p, --prompt <prompt>", "Add a prompt when resuming")
  .action(async (id, options) => {
    if (options.continue) {
      // Continue most recent session
      const allSessions = await discoverSessions();
      if (allSessions.length === 0) {
        console.log("No sessions found.");
        process.exit(1);
      }
      const mostRecent = allSessions[0]; // Already sorted by lastAccessedAt
      const result = await launchSession(mostRecent, {
        dryRun: options.dryRun,
        prompt: options.prompt,
      });
      if (options.dryRun) {
        console.log("\n┌─ Dry Run ─────────────────────────────────┐");
        console.log(`│ Session: ${mostRecent.title.slice(0, 32).padEnd(32)}│`);
        console.log(`│ Command: ${result.command.slice(0, 32).padEnd(32)}│`);
        console.log(`│ CWD: ${result.cwd.slice(0, 36).padEnd(36)}│`);
        console.log("└────────────────────────────────────────────┘\n");
      }
      return;
    }

    if (!id) {
      // Show TUI picker
      await showSessionPicker({ dryRun: options.dryRun });
      return;
    }

    const session = await findSession(id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }

    const result = await launchSession(session, {
      dryRun: options.dryRun,
      prompt: options.prompt,
    });

    if (options.dryRun) {
      console.log("\n┌─ Dry Run ─────────────────────────────────┐");
      console.log(`│ Session: ${session.title.slice(0, 32).padEnd(32)}│`);
      console.log(`│ Command: ${result.command.slice(0, 32).padEnd(32)}│`);
      console.log(`│ CWD: ${result.cwd.slice(0, 36).padEnd(36)}│`);
      console.log("└────────────────────────────────────────────┘\n");
    }
  });

sessions
  .command("rename <id> <title>")
  .description("Rename a session")
  .action(async (id, title) => {
    const session = await findSession(id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }

    await renameSession(session.id, title);
    console.log(`\nRenamed session "${session.title}" → "${title}"\n`);
  });

sessions
  .command("stats")
  .description("Show usage statistics")
  .action(async () => {
    const allSessions = await discoverSessions();

    if (allSessions.length === 0) {
      console.log("No sessions found.");
      return;
    }

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalMessages = 0;
    const projectCounts = new Map<string, number>();
    const modelCounts = new Map<string, number>();

    for (const session of allSessions) {
      totalTokensIn += session.totalInputTokens;
      totalTokensOut += session.totalOutputTokens;
      totalMessages += session.messageCount;

      const project = session.shortPath;
      projectCounts.set(project, (projectCounts.get(project) || 0) + 1);

      if (session.model) {
        const model = session.model.includes("opus")
          ? "opus"
          : session.model.includes("sonnet")
            ? "sonnet"
            : session.model.includes("haiku")
              ? "haiku"
              : session.model;
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      }
    }

    console.log("\n┌─ Session Statistics ────────────────────────┐");
    console.log(`│ Total Sessions:  ${String(allSessions.length).padEnd(25)}│`);
    console.log(`│ Total Messages:  ${String(totalMessages).padEnd(25)}│`);
    console.log(`│ Input Tokens:    ${formatLargeNumber(totalTokensIn).padEnd(25)}│`);
    console.log(`│ Output Tokens:   ${formatLargeNumber(totalTokensOut).padEnd(25)}│`);
    console.log("├──────────────────────────────────────────────┤");
    console.log("│ Projects (top 5):                            │");

    const topProjects = [...projectCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [project, count] of topProjects) {
      console.log(`│   ${project.slice(0, 30).padEnd(30)} ${String(count).padStart(5)} │`);
    }

    console.log("├──────────────────────────────────────────────┤");
    console.log("│ Models:                                      │");

    for (const [model, count] of modelCounts) {
      console.log(`│   ${model.padEnd(30)} ${String(count).padStart(5)} │`);
    }

    console.log("└──────────────────────────────────────────────┘\n");
  });

sessions
  .command("search <query>")
  .description("Search through all session content")
  .option("-c, --case-sensitive", "Case-sensitive search")
  .option("-j, --json", "Output as JSON")
  .option("-m, --max <n>", "Max matches per session", "5")
  .action(async (query, options) => {
    const results = await searchSessions(query, {
      caseSensitive: options.caseSensitive,
      maxMatchesPerSession: parseInt(options.max, 10),
    });

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`\nNo results found for "${query}"\n`);
      return;
    }

    console.log(`\n${pc.bold(`Found ${results.reduce((acc, r) => acc + r.totalMatches, 0)} matches in ${results.length} sessions:`)}\n`);

    for (const result of results) {
      const { session, matches, totalMatches } = result;
      console.log(pc.cyan(`━━━ ${session.title.slice(0, 50)} ━━━`));
      console.log(pc.dim(`    ${session.shortPath} • ${formatRelativeTime(session.lastAccessedAt)} • ${totalMatches} match${totalMatches > 1 ? "es" : ""}`));
      console.log(pc.dim(`    ID: ${session.id}`));
      console.log("");

      for (const match of matches) {
        const icon = match.type === "user" ? pc.green("→") : pc.blue("←");
        // Highlight the match in context
        const highlighted = match.context.replace(
          new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options.caseSensitive ? "g" : "gi"),
          (m) => pc.bgYellow(pc.black(m))
        );
        console.log(`    ${icon} ${highlighted}`);
      }

      if (totalMatches > matches.length) {
        console.log(pc.dim(`    ... and ${totalMatches - matches.length} more matches`));
      }
      console.log("");
    }
  });

// Index subcommand
const index = program.command("index").description("Manage the search index");

index
  .command("stats")
  .description("Show search index statistics")
  .action(() => {
    const stats = getIndexStats();

    console.log("\n┌─ Search Index Statistics ───────────────────┐");
    console.log(`│ Indexed Sessions:  ${String(stats.sessions).padEnd(24)}│`);
    console.log(`│ Indexed Messages:  ${String(stats.messages).padEnd(24)}│`);
    console.log(`│ Database Size:     ${formatBytes(stats.dbSize).padEnd(24)}│`);
    console.log("└──────────────────────────────────────────────┘\n");
  });

index
  .command("sync")
  .description("Sync index with filesystem (incremental)")
  .action(async () => {
    console.log(pc.cyan("\nSyncing search index..."));
    const startTime = Date.now();
    const stats = await syncIndex();
    const duration = Date.now() - startTime;

    console.log(pc.green(`✓ Sync complete in ${duration}ms\n`));
    console.log(`  Added:     ${pc.green(String(stats.added))}`);
    console.log(`  Updated:   ${pc.yellow(String(stats.updated))}`);
    console.log(`  Deleted:   ${pc.red(String(stats.deleted))}`);
    console.log(`  Unchanged: ${pc.dim(String(stats.unchanged))}\n`);
  });

index
  .command("rebuild")
  .description("Rebuild index from scratch (slow)")
  .action(async () => {
    console.log(pc.cyan("\nRebuilding search index from scratch..."));
    console.log(pc.dim("This may take a while for large session histories.\n"));

    const startTime = Date.now();
    const stats = await rebuildIndex();
    const duration = Date.now() - startTime;

    console.log(pc.green(`✓ Rebuild complete in ${(duration / 1000).toFixed(1)}s\n`));
    console.log(`  Indexed ${pc.green(String(stats.added))} sessions\n`);
  });

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

// Config command
program
  .command("config")
  .description("Show configuration paths")
  .action(() => {
    const paths = getAllConfigPaths();
    console.log("\n┌─ Claude Code Paths ─────────────────────────┐");
    console.log(`│ Config Dir:    ${paths.claudeDir.padEnd(28)}│`);
    console.log(`│ Projects:      ${paths.projectsDir.padEnd(28)}│`);
    console.log(`│ Global Config: ${paths.globalConfig.padEnd(28)}│`);
    console.log(`│ Settings:      ${paths.settings.padEnd(28)}│`);
    console.log(`│ CLAUDE.md:     ${paths.globalClaudeMd.padEnd(28)}│`);
    console.log("└──────────────────────────────────────────────┘\n");
  });

// Update command
program
  .command("update")
  .description("Update claudectl to the latest version")
  .option("-c, --check", "Check for updates without installing")
  .option("-f, --force", "Force reinstall even if on latest version")
  .action(async (options) => {
    const installDir = join(homedir(), ".claudectl");
    const versionFile = join(installDir, ".version");

    // Get current version
    let currentVersion = "unknown";
    try {
      const file = Bun.file(versionFile);
      currentVersion = (await file.text()).trim();
    } catch {
      // Version file doesn't exist
    }

    // Fetch latest version from GitHub
    console.log(pc.cyan("\nChecking for updates..."));

    let latestVersion = "unknown";
    try {
      const response = await fetch("https://api.github.com/repos/shootdaj/claudectl/releases/latest");
      const data = await response.json() as { tag_name: string };
      latestVersion = data.tag_name;
    } catch (error) {
      console.log(pc.red("Failed to check for updates. Check your internet connection."));
      process.exit(1);
    }

    console.log(`Current version: ${pc.yellow(currentVersion)}`);
    console.log(`Latest version:  ${pc.green(latestVersion)}`);

    if (currentVersion === latestVersion && !options.force) {
      console.log(pc.green("\n✓ You're on the latest version!\n"));
      return;
    }

    if (options.check) {
      console.log(pc.yellow(`\n↑ Update available! Run ${pc.cyan("ccl update")} to install.\n`));
      return;
    }

    if (options.force && currentVersion === latestVersion) {
      console.log(pc.yellow("\nForce reinstalling..."));
    }

    // Run the install script (platform-specific)
    console.log(pc.cyan("\nUpdating..."));

    let proc;
    if (isWindows) {
      proc = Bun.spawn(["powershell", "-ExecutionPolicy", "Bypass", "-Command", "irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
    } else {
      proc = Bun.spawn(["bash", "-c", "curl -fsSL https://raw.githubusercontent.com/shootdaj/claudectl/main/install.sh | bash"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
    }

    const exitCode = await proc.exited;
    process.exit(exitCode);
  });

function formatLargeNumber(n: number): string {
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return String(n);
}

// Backup command group
const backup = program.command("backup").description("Backup and restore sessions");

backup
  .command("now")
  .description("Create a backup now")
  .action(async () => {
    const info = await getBackupInfo();

    if (info) {
      console.log(`\n${pc.bold("Current Backup:")}`);
      console.log(`  ${pc.green("●")} ${info.path}`);
      console.log(`  ${pc.dim(`Last updated: ${formatRelativeTime(info.date)}`)}\n`);
    }

    console.log(pc.cyan("Backing up sessions..."));
    const result = await backupSessions();

    if (result.success) {
      console.log(pc.green(`✓ Backup updated: ${result.path}\n`));
    } else {
      console.log(pc.red(`✗ Backup failed: ${result.error}\n`));
    }
  });

backup
  .command("status")
  .description("Show backup status")
  .action(async () => {
    const info = await getBackupInfo();

    if (!info) {
      console.log(pc.yellow("\nNo backup found. Run `claudectl backup now` to create one.\n"));
      return;
    }

    console.log(`\n${pc.bold("Backup Status:")}`);
    console.log(`  Location: ${info.path}`);
    console.log(`  Last updated: ${pc.green(formatRelativeTime(info.date))}`);

    const deleted = await findDeletedSessions();
    if (deleted.length > 0) {
      console.log(`  ${pc.yellow(`${deleted.length} deleted session(s) can be restored`)}`);
    } else {
      console.log(`  ${pc.dim("All sessions are current")}`);
    }
    console.log("");
  });

backup
  .command("deleted")
  .description("List sessions that can be restored from backup")
  .action(async () => {
    const deleted = await findDeletedSessions();

    if (deleted.length === 0) {
      console.log(pc.green("\nNo deleted sessions found. All backed up sessions still exist.\n"));
      return;
    }

    console.log(`\n${pc.bold(`Found ${deleted.length} deleted session(s):`)}\n`);

    for (const session of deleted) {
      console.log(`  ${pc.yellow("●")} ${session.id.slice(0, 8)}...`);
      console.log(`    ${pc.dim(session.backupPath)}`);
    }

    console.log(`\n${pc.dim("Restore with:")} claudectl backup restore <id>\n`);
    console.log(`${pc.dim("Restore all:")} claudectl backup restore --all\n`);
  });

backup
  .command("restore [id]")
  .description("Restore deleted session(s) from backup")
  .option("-a, --all", "Restore all deleted sessions")
  .action(async (id, options) => {
    if (options.all) {
      const deleted = await findDeletedSessions();
      if (deleted.length === 0) {
        console.log(pc.green("\nNo deleted sessions to restore.\n"));
        return;
      }

      console.log(pc.cyan(`\nRestoring ${deleted.length} session(s)...`));
      const result = await restoreAllSessions();

      console.log(pc.green(`✓ Restored: ${result.restored}`));
      if (result.failed > 0) {
        console.log(pc.red(`✗ Failed: ${result.failed}`));
      }
      console.log("");
      return;
    }

    if (!id) {
      console.log(pc.red("\nPlease specify a session ID or use --all\n"));
      console.log(pc.dim("List deleted sessions: claudectl backup deleted\n"));
      return;
    }

    console.log(pc.cyan(`\nRestoring session ${id}...`));
    const result = await restoreSession(id);

    if (result.success) {
      console.log(pc.green(`✓ Session restored\n`));
    } else {
      console.log(pc.red(`✗ ${result.error}\n`));
    }
  });

// Default backup action (backwards compat)
backup
  .action(async () => {
    // Same as "backup now"
    const info = await getBackupInfo();

    if (info) {
      console.log(`\n${pc.bold("Current Backup:")}`);
      console.log(`  ${pc.green("●")} ${info.path}`);
      console.log(`  ${pc.dim(`Last updated: ${formatRelativeTime(info.date)}`)}\n`);
    }

    console.log(pc.cyan("Backing up sessions..."));
    const result = await backupSessions();

    if (result.success) {
      console.log(pc.green(`✓ Backup updated: ${result.path}\n`));
    } else {
      console.log(pc.red(`✗ Backup failed: ${result.error}\n`));
    }
  });

// Serve subcommand - remote web access
const serve = program.command("serve").description("Start remote web server for Claude Code access");

serve
  .command("start", { isDefault: true })
  .description("Start the web server")
  .option("-p, --port <port>", "Port to listen on", "3847")
  .option("-t, --tunnel", "Start Cloudflare Tunnel for remote access")
  .action(async (options) => {
    const { startServer } = await import("./server/index");
    await startServer({
      port: parseInt(options.port, 10),
      tunnel: options.tunnel,
    });
  });

serve
  .command("auth")
  .description("Set or reset the server password")
  .argument("[action]", "Action: set or reset", "set")
  .action(async (action) => {
    const { interactivePasswordSetup, setServerPassword } = await import("./server/index");

    if (action === "reset") {
      // Clear password
      const { getClaudectlDir } = await import("./core/config");
      const fs = await import("fs");
      const path = await import("path");
      const configPath = path.join(getClaudectlDir(), "server-config.json");

      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        delete config.passwordHash;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(pc.yellow("Password reset. Run 'claudectl serve auth set' to set a new password."));
      } else {
        console.log("No password configured.");
      }
      return;
    }

    await interactivePasswordSetup();
  });

export { program };
