import blessed from "blessed";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

interface NewProjectOptions {
  onComplete?: (projectPath: string) => void;
  onCancel?: () => void;
}

// Common parent folders for projects
function getCommonFolders(): string[] {
  const home = homedir();
  const candidates = [
    join(home, "Anshul", "Code"),
    join(home, "Code"),
    join(home, "Projects"),
    join(home, "Developer"),
    join(home, "dev"),
    join(home, "src"),
    join(home, "repos"),
    join(home, "workspace"),
    join(home, "Desktop"),
  ];

  return candidates.filter(p => existsSync(p));
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

// Neon theme (same as session-picker)
const theme = {
  pink: "#ff00ff",
  blue: "#00ffff",
  green: "#00ff00",
  yellow: "#ffff00",
  orange: "#ff8800",
  purple: "#aa88ff",
  muted: "#888888",
  fg: "#ffffff",
  border: "#ff00ff",
  selectedBg: "#333333",
  selectedFg: "#00ff00",
};

export async function showNewProjectWizard(options: NewProjectOptions = {}): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - New Project",
    fullUnicode: true,
  });

  // Main container
  const mainBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "80%",
    height: "80%",
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
    label: ` {#ff00ff-fg}New Project{/#ff00ff-fg} `,
    tags: true,
  });

  // State
  let mode: "new" | "clone" = "new";
  let step = 0; // 0 = mode select, 1 = folder, 2 = name/repo, 3 = github options
  let selectedFolder = "";
  let projectName = "";
  let createGitHub = true;
  let isPrivate = true;
  let selectedRepo = "";
  let githubRepos: Array<{ name: string; fullName: string; description: string; isPrivate: boolean }> = [];

  const folders = getCommonFolders();

  // Step indicator
  const stepIndicator = blessed.text({
    parent: mainBox,
    top: 1,
    left: 2,
    content: "",
    tags: true,
  });

  // Content area
  const contentBox = blessed.box({
    parent: mainBox,
    top: 3,
    left: 2,
    width: "100%-6",
    height: "100%-8",
    tags: true,
  });

  // Mode selection (step 0)
  const modeList = blessed.list({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "100%",
    height: 6,
    hidden: false,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [
      "{#00ff00-fg}Create new project{/#00ff00-fg}",
      "{#00ffff-fg}Clone from GitHub{/#00ffff-fg}",
    ],
  });

  // Folder list (step 1)
  const folderList = blessed.list({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "100%",
    height: "100%-4",
    hidden: true,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [...folders.map(f => f.replace(homedir(), "~")), "{#ffff00-fg}Custom path...{/#ffff00-fg}"],
  });

  // Project name input (step 2 for new)
  const nameInput = blessed.textbox({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "60%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    style: { fg: "white", bg: theme.muted },
  });

  // Repo selection list (step 2 for clone)
  const repoList = blessed.list({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "100%",
    height: "100%-4",
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

  // Custom repo URL input
  const repoUrlInput = blessed.textbox({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "80%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    style: { fg: "white", bg: theme.muted },
  });

  // GitHub options (step 3 for new)
  const githubList = blessed.list({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "100%",
    height: 6,
    hidden: true,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { fg: theme.selectedFg, bg: theme.selectedBg, bold: true },
    },
    items: [
      "{#00ff00-fg}Yes, create private repo{/#00ff00-fg}",
      "{#00ffff-fg}Yes, create public repo{/#00ffff-fg}",
      "{#888888-fg}No, just local git{/#888888-fg}",
    ],
  });

  // Custom path input
  const customPathInput = blessed.textbox({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "80%",
    height: 1,
    hidden: true,
    inputOnFocus: true,
    style: { fg: "white", bg: theme.muted },
  });

  // Loading indicator
  const loadingText = blessed.text({
    parent: contentBox,
    top: 2,
    left: 0,
    hidden: true,
    tags: true,
    content: "{#ffff00-fg}Loading your repositories...{/#ffff00-fg}",
  });

  // Footer
  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: " {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Cancel",
    tags: true,
    style: { fg: "gray" },
  });

  function hideAll() {
    modeList.hide();
    folderList.hide();
    nameInput.hide();
    repoList.hide();
    repoUrlInput.hide();
    githubList.hide();
    customPathInput.hide();
    loadingText.hide();
  }

  function updateStep() {
    hideAll();

    if (step === 0) {
      stepIndicator.setContent("{#888888-fg}Step 1:{/#888888-fg} {#00ffff-fg}Choose project type{/#00ffff-fg}");
      modeList.show();
      modeList.focus();
      footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Cancel");
    } else if (step === 1) {
      stepIndicator.setContent("{#888888-fg}Step 2:{/#888888-fg} {#00ffff-fg}Select parent folder{/#00ffff-fg}");
      folderList.show();
      folderList.focus();
      footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
    } else if (step === 2) {
      if (mode === "new") {
        stepIndicator.setContent("{#888888-fg}Step 3:{/#888888-fg} {#00ffff-fg}Enter project name{/#00ffff-fg}");
        nameInput.show();
        nameInput.focus();
        footer.setContent(" {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
      } else {
        stepIndicator.setContent("{#888888-fg}Step 3:{/#888888-fg} {#00ffff-fg}Select repository{/#00ffff-fg}");
        if (githubRepos.length === 0) {
          loadingText.show();
          screen.render();
          fetchGitHubRepos().then(repos => {
            githubRepos = repos;
            loadingText.hide();
            const items = repos.map(r => {
              const privacy = r.isPrivate ? "{#888888-fg}private{/#888888-fg}" : "{#00ff00-fg}public{/#00ff00-fg}";
              const desc = r.description ? ` - ${r.description.slice(0, 40)}` : "";
              return `{#00ffff-fg}${r.name}{/#00ffff-fg} ${privacy}${desc}`;
            });
            items.push("{#ffff00-fg}Enter URL manually...{/#ffff00-fg}");
            repoList.setItems(items);
            repoList.show();
            repoList.focus();
            screen.render();
          });
        } else {
          repoList.show();
          repoList.focus();
        }
        footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Clone  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
      }
    } else if (step === 3) {
      stepIndicator.setContent("{#888888-fg}Step 4:{/#888888-fg} {#00ffff-fg}GitHub repository{/#00ffff-fg}");
      githubList.show();
      githubList.focus();
      footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Create  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
    }

    screen.render();
  }

  // Step 0: Mode selection
  modeList.on("select", (item, index) => {
    mode = index === 0 ? "new" : "clone";
    step = 1;
    updateStep();
  });

  modeList.key(["escape"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  // Step 1: Select folder
  folderList.on("select", async (item, index) => {
    if (index === folders.length) {
      // Custom path
      customPathInput.show();
      folderList.hide();
      customPathInput.setValue(homedir() + "/");
      customPathInput.focus();
      footer.setContent(" {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
      screen.render();
    } else {
      selectedFolder = folders[index];
      step = 2;
      updateStep();
    }
  });

  folderList.key(["escape"], () => {
    step = 0;
    updateStep();
  });

  customPathInput.on("submit", (value: string) => {
    if (value && existsSync(value)) {
      selectedFolder = value;
      step = 2;
      updateStep();
    } else {
      contentBox.setContent(`{#ff0000-fg}Path doesn't exist: ${value}{/#ff0000-fg}`);
      screen.render();
      setTimeout(() => {
        hideAll();
        customPathInput.show();
        customPathInput.focus();
        screen.render();
      }, 1500);
    }
  });

  customPathInput.key(["escape"], () => {
    step = 1;
    updateStep();
  });

  // Step 2: Enter project name (new mode)
  nameInput.on("submit", (value: string) => {
    if (value && value.trim()) {
      projectName = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      step = 3;
      updateStep();
    }
  });

  nameInput.key(["escape"], () => {
    step = 1;
    updateStep();
  });

  // Step 2: Select repo (clone mode)
  repoList.on("select", async (item, index) => {
    if (index === githubRepos.length) {
      // Manual URL entry
      repoList.hide();
      repoUrlInput.show();
      repoUrlInput.setValue("");
      repoUrlInput.focus();
      footer.setContent(" {#00ff00-fg}↵{/#00ff00-fg} Clone  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
      screen.render();
    } else {
      selectedRepo = githubRepos[index].fullName;
      projectName = githubRepos[index].name;
      screen.destroy();
      await cloneRepo(selectedFolder, selectedRepo, projectName, options);
    }
  });

  repoList.key(["escape"], () => {
    step = 1;
    updateStep();
  });

  repoUrlInput.on("submit", async (value: string) => {
    if (value && value.trim()) {
      selectedRepo = value.trim();
      // Extract project name from URL
      const match = selectedRepo.match(/([^/]+)(?:\.git)?$/);
      projectName = match ? match[1].replace(/\.git$/, "") : "project";
      screen.destroy();
      await cloneRepo(selectedFolder, selectedRepo, projectName, options);
    }
  });

  repoUrlInput.key(["escape"], () => {
    step = 2;
    updateStep();
  });

  // Step 3: GitHub options (new mode)
  githubList.on("select", async (item, index) => {
    createGitHub = index < 2;
    isPrivate = index === 0;
    screen.destroy();
    await createProject(selectedFolder, projectName, createGitHub, isPrivate, options);
  });

  githubList.key(["escape"], () => {
    step = 2;
    updateStep();
  });

  // Global escape
  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onCancel?.();
  });

  updateStep();
  screen.render();
}

async function createProject(
  parentFolder: string,
  projectName: string,
  createGitHub: boolean,
  isPrivate: boolean,
  options: NewProjectOptions
): Promise<void> {
  const projectPath = join(parentFolder, projectName);

  console.log(`\nCreating project: ${projectName}`);
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

  // 3. Create GitHub repo if requested
  if (createGitHub) {
    console.log(`Creating GitHub repo (${isPrivate ? "private" : "public"})...`);
    const ghArgs = ["repo", "create", projectName, isPrivate ? "--private" : "--public", "--source", ".", "--push"];
    const ghCreate = Bun.spawnSync(["gh", ...ghArgs], {
      cwd: projectPath,
      stdio: ["inherit", "inherit", "inherit"],
    });

    if (ghCreate.exitCode !== 0) {
      console.log(`\nNote: GitHub repo creation may have failed. You can create it manually.`);
    }
  }

  // 4. Start Claude session
  console.log(`\nStarting Claude session in ${projectPath}...\n`);

  const claude = Bun.spawn(["claude"], {
    cwd: projectPath,
    stdio: ["inherit", "inherit", "inherit"],
  });

  await claude.exited;
  options.onComplete?.(projectPath);
}

async function cloneRepo(
  parentFolder: string,
  repoUrl: string,
  projectName: string,
  options: NewProjectOptions
): Promise<void> {
  const projectPath = join(parentFolder, projectName);

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
