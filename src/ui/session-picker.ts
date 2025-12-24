import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  discoverSessions,
  formatRelativeTime,
  launchSession,
  type Session,
} from "../core/sessions";
import { renameSession } from "../core/title-generator";

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
    p.log.warn("No sessions found.");
    return;
  }

  p.intro(pc.cyan("◆ claudectl") + " │ Session Manager");

  while (true) {
    const sessionOptions = sessions.map((s) => {
      const project = s.workingDirectory.split("/").pop() || "~";
      const time = formatRelativeTime(s.lastAccessedAt);
      const tokens = formatTokens(s.totalInputTokens + s.totalOutputTokens);
      const model = formatModelName(s.model);

      return {
        value: s.id,
        label: s.title.slice(0, 40),
        hint: `${pc.dim(project)} · ${time} · ${s.messageCount} msgs · ${tokens} · ${model}`,
      };
    });

    const selected = await p.select({
      message: `Select a session (${sessions.length} total)`,
      options: [
        ...sessionOptions,
        { value: "__new__", label: pc.green("+ New session here") },
        { value: "__exit__", label: pc.dim("Exit") },
      ],
      maxItems: 15,
    });

    if (p.isCancel(selected) || selected === "__exit__") {
      p.outro(pc.dim("Goodbye!"));
      options.onExit?.();
      return;
    }

    if (selected === "__new__") {
      p.outro(`Starting new session in: ${process.cwd()}`);
      const proc = Bun.spawn(["claude"], {
        cwd: process.cwd(),
        stdio: ["inherit", "inherit", "inherit"],
      });
      await proc.exited;
      process.exit(0);
    }

    const session = sessions.find((s) => s.id === selected);
    if (!session) continue;

    // Show session details and actions
    const action = await p.select({
      message: `${pc.cyan(session.title)}`,
      options: [
        { value: "launch", label: "Launch", hint: "Resume this session" },
        { value: "new", label: "New here", hint: `New session in ${session.workingDirectory.split("/").pop()}` },
        { value: "rename", label: "Rename", hint: "Give it a new name" },
        { value: "preview", label: "Preview", hint: "Show details" },
        { value: "back", label: pc.dim("← Back") },
      ],
    });

    if (p.isCancel(action) || action === "back") {
      continue;
    }

    if (action === "launch") {
      if (options.dryRun) {
        const result = await launchSession(session, { dryRun: true });
        p.log.info(`Would run: ${pc.cyan(result.command)}`);
        p.log.info(`In directory: ${result.cwd}`);
        continue;
      }

      p.outro(`Launching: ${session.title}`);
      console.log(`Directory: ${session.workingDirectory}\n`);
      await launchSession(session);
      options.onLaunch?.(session);
      return;
    }

    if (action === "new") {
      p.outro(`Starting new session in: ${session.workingDirectory}`);
      const proc = Bun.spawn(["claude"], {
        cwd: session.workingDirectory,
        stdio: ["inherit", "inherit", "inherit"],
      });
      await proc.exited;
      process.exit(0);
    }

    if (action === "rename") {
      const newName = await p.text({
        message: "New name:",
        placeholder: session.title,
        defaultValue: session.title,
        validate: (value) => {
          if (!value.trim()) return "Name cannot be empty";
          if (value.length > 50) return "Name too long (max 50 chars)";
        },
      });

      if (!p.isCancel(newName) && newName) {
        await renameSession(session.id, newName.trim());
        session.title = newName.trim();
        p.log.success(`Renamed to: ${newName}`);
      }
      continue;
    }

    if (action === "preview") {
      console.log("");
      console.log(pc.cyan("─".repeat(50)));
      console.log(pc.bold(session.title));
      console.log(pc.dim(`ID: ${session.id}`));
      console.log("");
      console.log(`${pc.yellow("Path:")}      ${session.workingDirectory}`);
      console.log(`${pc.yellow("Branch:")}    ${session.gitBranch || "N/A"}`);
      console.log(`${pc.yellow("Model:")}     ${session.model || "N/A"}`);
      console.log("");
      console.log(`${pc.yellow("Created:")}   ${session.createdAt.toLocaleString()}`);
      console.log(`${pc.yellow("Last used:")} ${session.lastAccessedAt.toLocaleString()}`);
      console.log("");
      console.log(`${pc.yellow("Messages:")}  ${session.messageCount} (${session.userMessageCount} user / ${session.assistantMessageCount} assistant)`);
      console.log(`${pc.yellow("Tokens:")}    ${formatTokens(session.totalInputTokens)} in / ${formatTokens(session.totalOutputTokens)} out`);
      console.log(pc.cyan("─".repeat(50)));
      console.log("");

      await p.text({
        message: pc.dim("Press Enter to continue..."),
        placeholder: "",
      });
      continue;
    }
  }
}

function formatModelName(model?: string): string {
  if (!model) return pc.dim("-");
  if (model.includes("opus")) return pc.magenta("opus");
  if (model.includes("sonnet")) return pc.blue("sonnet");
  if (model.includes("haiku")) return pc.green("haiku");
  return pc.dim(model.slice(0, 6));
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return String(tokens);
}
