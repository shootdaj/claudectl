import blessed from "blessed";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { getScratchDir, getDefaultProjectsDir } from "../core/config";
import { moveSession, type Session } from "../core/sessions";

export interface NewProjectOptions {
  onComplete?: (projectPath?: string) => void;
  onCancel?: () => void;
  scratchSession?: Session; // If set, show promote flow instead
}

// Fetch user's GitHub repos
async function fetchGitHubRepos(): Promise<Array<{ name: string; fullName: string; description: string; isPrivate: boolean }>> {
  try {
    const result = Bun.spawnSync(["gh", "repo", "list", "--json", "name,nameWithOwner,description,isPrivate", "--limit", "50"]);
    if (result.exitCode !== 0) return [];
    const repos = JSON.parse(result.stdout.toString());
    return repos.map((r: any) => ({
      name: r.name,
      fullName: r.nameWithOwner,
      description: r.description || "",
      isPrivate: r.isPrivate,
    }));
  } catch {
    return [];
  }
}

// Neon theme
const theme = {
  pink: "#ff00ff",
  blue: "#00ffff",
  green: "#00ff00",
  yellow: "#ffff00",
  orange: "#ff8800",
  muted: "#888888",
  fg: "#ffffff",
  selectedBg: "#333333",
  selectedFg: "#00ff00",
};

export async function showNewProjectWizard(options: NewProjectOptions = {}): Promise<void> {
  // If coming from a scratch session, show promote flow
  if (options.scratchSession) {
    return showPromoteFlow(options.scratchSession, options);
  }

  // Otherwise show simple two-option menu
  return showNewSessionMenu(options);
}

/**
 * Simple two-option menu: New (quick question) or Existing (clone)
 */
async function showNewSessionMenu(options: NewProjectOptions): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - New Session",
    fullUnicode: true,
  });

  const mainBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 50,
    height: 10,
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}New Session{/#ff00ff-fg} `,
    tags: true,
  });

  const menuList = blessed.list({
    parent: mainBox,
    top: 1,
    left: 2,
    width: "100%-6",
    height: 4,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [
      `{${theme.green}-fg}New{/${theme.green}-fg}        Quick question (no project)`,
      `{${theme.blue}-fg}Existing{/${theme.blue}-fg}    Clone from GitHub`,
    ],
  });

  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: ` {${theme.pink}-fg}↑↓{/${theme.pink}-fg} Select  {${theme.green}-fg}↵{/${theme.green}-fg} Confirm  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Cancel`,
    tags: true,
    style: { fg: "gray" },
  });

  menuList.on("select", async (item, index) => {
    screen.destroy();
    if (index === 0) {
      // New - start quick question in scratch folder
      await startQuickQuestion(options);
    } else {
      // Existing - clone from GitHub
      await showCloneFlow(options);
    }
  });

  menuList.key(["escape"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  menuList.focus();
  screen.render();
}

/**
 * Start a quick question session in scratch folder
 */
async function startQuickQuestion(options: NewProjectOptions): Promise<void> {
  const scratchDir = getScratchDir();

  console.log(`\nStarting quick question session...`);
  console.log(`Location: ${scratchDir}\n`);

  const claude = Bun.spawn(["claude"], {
    cwd: scratchDir,
    stdio: ["inherit", "inherit", "inherit"],
  });

  await claude.exited;
  options.onComplete?.();
}

/**
 * Clone flow - select or enter a GitHub repo
 */
async function showCloneFlow(options: NewProjectOptions): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - Clone Repository",
    fullUnicode: true,
  });

  const mainBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "80%",
    height: "70%",
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}Clone from GitHub{/#ff00ff-fg} `,
    tags: true,
  });

  const loadingText = blessed.text({
    parent: mainBox,
    top: 2,
    left: 2,
    tags: true,
    content: `{${theme.yellow}-fg}Loading your repositories...{/${theme.yellow}-fg}`,
  });

  const repoList = blessed.list({
    parent: mainBox,
    top: 2,
    left: 2,
    width: "100%-6",
    height: "100%-6",
    hidden: true,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: { ch: "▌", style: { fg: theme.pink } },
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [],
  });

  const urlInput = blessed.textbox({
    parent: mainBox,
    top: 2,
    left: 2,
    width: "80%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    style: { fg: "white", bg: theme.muted },
  });

  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: ` {${theme.pink}-fg}↑↓{/${theme.pink}-fg} Select  {${theme.green}-fg}↵{/${theme.green}-fg} Clone  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Cancel`,
    tags: true,
    style: { fg: "gray" },
  });

  screen.render();

  // Fetch repos
  const repos = await fetchGitHubRepos();
  loadingText.hide();

  const items = repos.map(r => {
    const privacy = r.isPrivate ? `{${theme.muted}-fg}private{/${theme.muted}-fg}` : `{${theme.green}-fg}public{/${theme.green}-fg}`;
    const desc = r.description ? ` - ${r.description.slice(0, 40)}` : "";
    return `{${theme.blue}-fg}${r.name}{/${theme.blue}-fg} ${privacy}${desc}`;
  });
  items.push(`{${theme.yellow}-fg}Enter URL manually...{/${theme.yellow}-fg}`);

  repoList.setItems(items);
  repoList.show();
  repoList.focus();
  screen.render();

  repoList.on("select", async (item, index) => {
    if (index === repos.length) {
      // Manual URL entry
      repoList.hide();
      urlInput.show();
      urlInput.setValue("");
      urlInput.focus();
      footer.setContent(` {${theme.green}-fg}↵{/${theme.green}-fg} Clone  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Back`);
      screen.render();
    } else {
      const repo = repos[index];
      screen.destroy();
      await cloneAndStart(repo.fullName, repo.name, options);
    }
  });

  urlInput.on("submit", async (value: string) => {
    if (value && value.trim()) {
      const url = value.trim();
      const match = url.match(/([^/]+)(?:\.git)?$/);
      const name = match ? match[1].replace(/\.git$/, "") : "project";
      screen.destroy();
      await cloneAndStart(url, name, options);
    }
  });

  urlInput.key(["escape"], () => {
    urlInput.hide();
    repoList.show();
    repoList.focus();
    footer.setContent(` {${theme.pink}-fg}↑↓{/${theme.pink}-fg} Select  {${theme.green}-fg}↵{/${theme.green}-fg} Clone  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Cancel`);
    screen.render();
  });

  repoList.key(["escape"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onCancel?.();
  });
}

/**
 * Clone a repo and start Claude
 */
async function cloneAndStart(repoUrl: string, projectName: string, options: NewProjectOptions): Promise<void> {
  const projectsDir = getDefaultProjectsDir();
  const projectPath = join(projectsDir, projectName);

  console.log(`\nCloning: ${repoUrl}`);
  console.log(`Into: ${projectPath}\n`);

  // Clone the repo
  const ghClone = Bun.spawnSync(["gh", "repo", "clone", repoUrl, projectPath], {
    stdio: ["inherit", "inherit", "inherit"],
  });

  if (ghClone.exitCode !== 0) {
    // Try with git clone as fallback
    console.log(`Trying git clone...`);
    const gitClone = Bun.spawnSync(["git", "clone", repoUrl, projectPath], {
      stdio: ["inherit", "inherit", "inherit"],
    });

    if (gitClone.exitCode !== 0) {
      console.log(`\nFailed to clone repository. Check the URL and try again.`);
      options.onCancel?.();
      return;
    }
  }

  console.log(`\nStarting Claude session in ${projectPath}...\n`);

  const claude = Bun.spawn(["claude"], {
    cwd: projectPath,
    stdio: ["inherit", "inherit", "inherit"],
  });

  await claude.exited;
  options.onComplete?.(projectPath);
}

/**
 * Promote flow - move scratch session to a real project
 */
async function showPromoteFlow(session: Session, options: NewProjectOptions): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - Promote to Project",
    fullUnicode: true,
  });

  const mainBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height: 12,
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}Promote to Project{/#ff00ff-fg} `,
    tags: true,
  });

  blessed.text({
    parent: mainBox,
    top: 1,
    left: 2,
    tags: true,
    content: `{${theme.muted}-fg}Current session:{/${theme.muted}-fg} {${theme.blue}-fg}${session.title}{/${theme.blue}-fg}`,
  });

  blessed.text({
    parent: mainBox,
    top: 3,
    left: 2,
    tags: true,
    content: `{${theme.fg}-fg}Project name:{/${theme.fg}-fg}`,
  });

  const nameInput = blessed.textbox({
    parent: mainBox,
    top: 4,
    left: 2,
    width: "80%",
    height: 1,
    inputOnFocus: true,
    style: { fg: "white", bg: theme.muted },
  });

  const infoText = blessed.text({
    parent: mainBox,
    top: 6,
    left: 2,
    tags: true,
    content: "",
  });

  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: ` {${theme.green}-fg}↵{/${theme.green}-fg} Create  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Cancel`,
    tags: true,
    style: { fg: "gray" },
  });

  function updateInfo() {
    const name = nameInput.getValue().trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (name) {
      const projectPath = join(getDefaultProjectsDir(), name);
      infoText.setContent(
        `{${theme.muted}-fg}Creates:{/${theme.muted}-fg} {${theme.blue}-fg}${projectPath}{/${theme.blue}-fg}\n` +
        `{${theme.muted}-fg}•{/${theme.muted}-fg} git init\n` +
        `{${theme.muted}-fg}•{/${theme.muted}-fg} Private GitHub repo`
      );
    } else {
      infoText.setContent("");
    }
    screen.render();
  }

  nameInput.on("keypress", () => {
    setTimeout(updateInfo, 10);
  });

  nameInput.on("submit", async (value: string) => {
    if (!value || !value.trim()) return;

    const projectName = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const projectPath = join(getDefaultProjectsDir(), projectName);

    if (existsSync(projectPath)) {
      infoText.setContent(`{#ff0000-fg}Error: ${projectPath} already exists{/#ff0000-fg}`);
      screen.render();
      return;
    }

    screen.destroy();
    await promoteSession(session, projectPath, projectName, options);
  });

  nameInput.key(["escape"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  nameInput.focus();
  screen.render();
}

/**
 * Promote a scratch session to a real project
 */
async function promoteSession(
  session: Session,
  projectPath: string,
  projectName: string,
  options: NewProjectOptions
): Promise<void> {
  console.log(`\nPromoting session to project: ${projectName}`);
  console.log(`Path: ${projectPath}\n`);

  // 1. Create directory
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
    console.log(`Created directory: ${projectPath}`);
  }

  // 2. Initialize git
  const gitInit = Bun.spawnSync(["git", "init"], { cwd: projectPath });
  if (gitInit.exitCode === 0) {
    console.log(`Initialized git repository`);
  }

  // 3. Create private GitHub repo
  console.log(`Creating private GitHub repo...`);
  const ghCreate = Bun.spawnSync(
    ["gh", "repo", "create", projectName, "--private", "--source", ".", "--push"],
    {
      cwd: projectPath,
      stdio: ["inherit", "inherit", "inherit"],
    }
  );

  if (ghCreate.exitCode !== 0) {
    console.log(`\nNote: GitHub repo creation may have failed. You can create it manually.`);
  }

  // 4. Move the session to new location
  console.log(`Moving session to new project...`);
  const movedSession = await moveSession(session, projectPath);

  // 5. Resume the session in new location
  console.log(`\nResuming session in ${projectPath}...\n`);

  const claude = Bun.spawn(["claude", "--resume", movedSession.id], {
    cwd: projectPath,
    stdio: ["inherit", "inherit", "inherit"],
  });

  await claude.exited;
  options.onComplete?.(projectPath);
}
