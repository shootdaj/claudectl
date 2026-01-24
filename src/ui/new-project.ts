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
  skipPermissions?: boolean; // Use --dangerously-skip-permissions
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
    width: 55,
    height: 10,
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}Start{/#ff00ff-fg} `,
    tags: true,
  });

  const menuList = blessed.list({
    parent: mainBox,
    top: 1,
    left: 2,
    width: "100%-6",
    height: 5,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [
      `{${theme.green}-fg}Quick question{/${theme.green}-fg}   No project, just chat`,
      `{${theme.yellow}-fg}Create new{/${theme.yellow}-fg}      New GitHub repo + project`,
      `{${theme.blue}-fg}Clone repo{/${theme.blue}-fg}       From existing GitHub repo`,
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
      // Quick question in scratch folder
      await startQuickQuestion(options);
    } else if (index === 1) {
      // Create new GitHub repo + project
      await showCreateFlow(options);
    } else {
      // Clone from existing GitHub repo
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
  console.log(`Location: ${scratchDir}`);

  const args = ["claude"];
  if (options.skipPermissions) {
    args.push("--dangerously-skip-permissions");
    console.log(`Mode: --dangerously-skip-permissions`);
  }
  console.log("");

  const claude = Bun.spawn(args, {
    cwd: scratchDir,
    stdio: ["inherit", "inherit", "inherit"],
  });

  await claude.exited;
  options.onComplete?.();
}

/**
 * Create flow - create new GitHub repo and project
 */
async function showCreateFlow(options: NewProjectOptions): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - Create New Project",
    fullUnicode: true,
  });

  const mainBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "70%",
    height: 18,
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}Create New Project{/#ff00ff-fg} `,
    tags: true,
  });

  // Use blessed Form for built-in tab navigation
  const form = blessed.form({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: "100%-2",
    keys: true,
  }) as blessed.Widgets.FormElement<any>;

  // Project name input
  const nameLabel = blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: `{${theme.yellow}-fg}Project name:{/${theme.yellow}-fg}`,
    tags: true,
  });

  const nameInput = blessed.textbox({
    parent: form,
    name: "name",
    top: 1,
    left: 18,
    width: "100%-22",
    height: 1,
    inputOnFocus: true,
    style: {
      fg: "white",
      bg: "#333333",
      focus: { bg: "#444444" },
    },
  });

  // Description input
  const descLabel = blessed.text({
    parent: form,
    top: 3,
    left: 2,
    content: `{${theme.muted}-fg}Description:{/${theme.muted}-fg}`,
    tags: true,
  });

  const descInput = blessed.textbox({
    parent: form,
    name: "desc",
    top: 3,
    left: 18,
    width: "100%-22",
    height: 1,
    inputOnFocus: true,
    style: {
      fg: "white",
      bg: "#333333",
      focus: { bg: "#444444" },
    },
  });

  // Visibility toggle
  const visLabel = blessed.text({
    parent: form,
    top: 5,
    left: 2,
    content: `{${theme.muted}-fg}Visibility:{/${theme.muted}-fg}`,
    tags: true,
  });

  let isPrivate = true;
  const visToggle = blessed.button({
    parent: form,
    name: "visibility",
    top: 5,
    left: 18,
    width: 26,
    height: 1,
    content: isPrivate ? " [x] Private  [ ] Public" : " [ ] Private  [x] Public",
    style: {
      fg: "white",
      focus: { fg: theme.green },
    },
  });

  visToggle.on("press", () => {
    isPrivate = !isPrivate;
    visToggle.setContent(isPrivate ? " [x] Private  [ ] Public" : " [ ] Private  [x] Public");
    screen.render();
  });

  // Template selection
  const templateLabel = blessed.text({
    parent: form,
    top: 7,
    left: 2,
    content: `{${theme.muted}-fg}Template:{/${theme.muted}-fg}`,
    tags: true,
  });

  const templates = [
    { name: "Empty", value: "empty", desc: "Just README" },
    { name: "TypeScript", value: "typescript", desc: "TS + Bun" },
    { name: "React", value: "react", desc: "Vite + React + TS" },
    { name: "Node API", value: "node-api", desc: "Express + TS" },
  ];
  let templateIdx = 0;

  const templateBtn = blessed.button({
    parent: form,
    name: "template",
    top: 7,
    left: 18,
    width: 30,
    height: 1,
    content: ` ${templates[templateIdx].name} - ${templates[templateIdx].desc}`,
    style: {
      fg: "white",
      focus: { fg: theme.blue },
    },
  });

  templateBtn.on("press", () => {
    templateIdx = (templateIdx + 1) % templates.length;
    templateBtn.setContent(` ${templates[templateIdx].name} - ${templates[templateIdx].desc}`);
    screen.render();
  });

  // Create button
  const createBtn = blessed.button({
    parent: form,
    name: "create",
    top: 9,
    left: 18,
    width: 12,
    height: 1,
    content: " [ Create ] ",
    style: {
      fg: "white",
      bg: "#333333",
      focus: { fg: theme.green, bg: "#444444" },
    },
  });

  // Status/output area
  const statusBox = blessed.box({
    parent: mainBox,
    top: 11,
    left: 2,
    width: "100%-6",
    height: 3,
    content: "",
    tags: true,
    style: { fg: theme.muted },
  });

  // Footer
  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: ` {${theme.pink}-fg}Tab{/${theme.pink}-fg} Next  {${theme.pink}-fg}S-Tab{/${theme.pink}-fg} Prev  {${theme.green}-fg}Enter{/${theme.green}-fg} Create  {${theme.muted}-fg}Esc{/${theme.muted}-fg} Cancel`,
    tags: true,
    style: { fg: "gray" },
  });

  async function doCreate() {
    const projectName = nameInput.getValue().trim();
    if (!projectName) {
      statusBox.setContent(`{red-fg}Error: Project name is required{/red-fg}`);
      screen.render();
      return;
    }

    // Validate name (lowercase, hyphens, no spaces)
    if (!/^[a-z0-9-]+$/.test(projectName)) {
      statusBox.setContent(`{red-fg}Error: Name must be lowercase, numbers, hyphens only{/red-fg}`);
      screen.render();
      return;
    }

    await createProject(projectName);
  }

  // Handle form submit
  form.on("submit", doCreate);
  createBtn.on("press", doCreate);

  async function createProject(projectName: string) {
    const description = descInput.getValue().trim();
    const template = templates[templateIdx].value;
    const projectsDir = getDefaultProjectsDir();

    statusBox.setContent(`{${theme.yellow}-fg}Creating GitHub repo...{/${theme.yellow}-fg}`);
    screen.render();

    // Create GitHub repo
    const createArgs = ["gh", "repo", "create", projectName, isPrivate ? "--private" : "--public"];
    if (description) {
      createArgs.push("--description", description);
    }
    createArgs.push("--clone");

    const createResult = Bun.spawnSync(createArgs, {
      cwd: projectsDir,
      stdio: ["inherit", "pipe", "pipe"],
    });

    if (createResult.exitCode !== 0) {
      const error = createResult.stderr.toString();
      statusBox.setContent(`{red-fg}Error: ${error}{/red-fg}`);
      screen.render();
      return;
    }

    const projectPath = join(projectsDir, projectName);
    statusBox.setContent(`{${theme.green}-fg}✓ Created repo{/${theme.green}-fg}\n{${theme.yellow}-fg}Setting up template...{/${theme.yellow}-fg}`);
    screen.render();

    // Apply template
    await applyTemplate(projectPath, template, projectName);

    statusBox.setContent(`{${theme.green}-fg}✓ Created repo\n✓ Applied template{/${theme.green}-fg}\n{${theme.yellow}-fg}Starting Claude...{/${theme.yellow}-fg}`);
    screen.render();

    // Small delay to show status
    await new Promise(r => setTimeout(r, 500));

    screen.destroy();

    // Launch Claude in the new project
    console.log(`\nStarting Claude in ${projectPath}...`);
    if (options.skipPermissions) {
      console.log(`Mode: --dangerously-skip-permissions`);
    }
    console.log("");

    const args = ["claude"];
    if (options.skipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    const claude = Bun.spawn(args, {
      cwd: projectPath,
      stdio: ["inherit", "inherit", "inherit"],
    });

    await claude.exited;
    options.onComplete?.(projectPath);
  }

  // Escape to cancel
  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  nameInput.focus();
  screen.render();
}

/**
 * Apply a template to a new project
 */
async function applyTemplate(projectPath: string, template: string, projectName: string): Promise<void> {
  switch (template) {
    case "typescript": {
      // Create package.json
      const packageJson = {
        name: projectName,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "bun run src/index.ts",
          build: "bun build src/index.ts --outdir dist --target bun",
          test: "bun test",
        },
        devDependencies: {
          "@types/bun": "latest",
          typescript: "^5.0.0",
        },
      };
      await Bun.write(join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));

      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: "dist",
          types: ["bun-types"],
        },
        include: ["src/**/*"],
      };
      await Bun.write(join(projectPath, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

      // Create src/index.ts
      mkdirSync(join(projectPath, "src"), { recursive: true });
      await Bun.write(join(projectPath, "src", "index.ts"), `console.log("Hello from ${projectName}!");\n`);

      // Create .gitignore
      await Bun.write(join(projectPath, ".gitignore"), "node_modules/\ndist/\n.env\n");

      // Install deps
      Bun.spawnSync(["bun", "install"], { cwd: projectPath, stdio: ["inherit", "pipe", "pipe"] });
      break;
    }

    case "react": {
      // Use bun create vite
      Bun.spawnSync(["bun", "create", "vite", ".", "--template", "react-ts"], {
        cwd: projectPath,
        stdio: ["inherit", "pipe", "pipe"],
      });
      Bun.spawnSync(["bun", "install"], { cwd: projectPath, stdio: ["inherit", "pipe", "pipe"] });
      break;
    }

    case "node-api": {
      // Create package.json
      const packageJson = {
        name: projectName,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "bun --watch src/index.ts",
          start: "bun run src/index.ts",
          test: "bun test",
        },
        dependencies: {
          hono: "^4.0.0",
        },
        devDependencies: {
          "@types/bun": "latest",
          typescript: "^5.0.0",
        },
      };
      await Bun.write(join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));

      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          types: ["bun-types"],
        },
        include: ["src/**/*"],
      };
      await Bun.write(join(projectPath, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

      // Create src/index.ts with Hono
      mkdirSync(join(projectPath, "src"), { recursive: true });
      const apiCode = `import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello from ${projectName}!" }));

app.get("/health", (c) => c.json({ status: "ok" }));

export default {
  port: 3000,
  fetch: app.fetch,
};
`;
      await Bun.write(join(projectPath, "src", "index.ts"), apiCode);

      // Create .gitignore
      await Bun.write(join(projectPath, ".gitignore"), "node_modules/\n.env\n");

      // Install deps
      Bun.spawnSync(["bun", "install"], { cwd: projectPath, stdio: ["inherit", "pipe", "pipe"] });
      break;
    }

    case "empty":
    default: {
      // Just create a README
      await Bun.write(join(projectPath, "README.md"), `# ${projectName}\n\nA new project.\n`);
      break;
    }
  }

  // Commit template files
  Bun.spawnSync(["git", "add", "-A"], { cwd: projectPath });
  Bun.spawnSync(["git", "commit", "-m", "Initial project setup"], { cwd: projectPath });
  Bun.spawnSync(["git", "push", "-u", "origin", "main"], { cwd: projectPath });
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

  // 3. Create private GitHub repo and link it
  console.log(`Creating private GitHub repo...`);
  const ghCreate = Bun.spawnSync(
    ["gh", "repo", "create", projectName, "--private", "--clone=false"],
    { cwd: projectPath }
  );

  if (ghCreate.exitCode === 0) {
    // Get GitHub username and add remote
    const whoami = Bun.spawnSync(["gh", "api", "user", "-q", ".login"]);
    const ghUser = whoami.stdout.toString().trim() || "user";
    Bun.spawnSync(["git", "remote", "add", "origin", `git@github.com:${ghUser}/${projectName}.git`], { cwd: projectPath });
    console.log(`Created repo: github.com/${ghUser}/${projectName}`);
  } else {
    console.log(`\nNote: GitHub repo creation failed. You can create it manually.`);
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
