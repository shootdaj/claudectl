import { Command } from "commander";
import { showSessionPicker } from "./ui/session-picker";
import { discoverSessions, findSession, launchSession, formatRelativeTime } from "./core/sessions";
import { getAllConfigPaths } from "./core/config";
import { renameSession } from "./core/title-generator";

const program = new Command();

program
  .name("claudectl")
  .description("Global Claude Code session manager with rich TUI")
  .version("0.1.0");

// Default command - show TUI session picker
program
  .action(async () => {
    await showSessionPicker();
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
  .option("-d, --dry-run", "Show what would happen without launching")
  .option("-p, --prompt <prompt>", "Add a prompt when resuming")
  .action(async (id, options) => {
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

function formatLargeNumber(n: number): string {
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return String(n);
}

export { program };
