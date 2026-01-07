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

  let step = 1;
  let selectedFolder = "";
  let projectName = "";
  let createGitHub = true;
  let isPrivate = true;

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

  // Folder list (step 1)
  const folderList = blessed.list({
    parent: contentBox,
    top: 2,
    left: 0,
    width: "100%",
    height: "100%-4",
    hidden: false,
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

  // Project name input (step 2)
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

  // GitHub options (step 3)
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

  function updateStep() {
    const steps = [
      `{#888888-fg}Step ${step}/3:{/#888888-fg}`,
      step === 1 ? " {#00ffff-fg}Select parent folder{/#00ffff-fg}" :
      step === 2 ? " {#00ffff-fg}Enter project name{/#00ffff-fg}" :
      " {#00ffff-fg}GitHub repository{/#00ffff-fg}",
    ].join("");
    stepIndicator.setContent(steps);

    // Update content visibility
    folderList.hide();
    nameInput.hide();
    githubList.hide();
    customPathInput.hide();

    if (step === 1) {
      folderList.show();
      folderList.focus();
    } else if (step === 2) {
      nameInput.show();
      nameInput.focus();
      footer.setContent(" {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
    } else if (step === 3) {
      githubList.show();
      githubList.focus();
      footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Create  {#aa88ff-fg}Esc{/#aa88ff-fg} Back");
    }

    screen.render();
  }

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

  customPathInput.on("submit", (value: string) => {
    if (value && existsSync(value)) {
      selectedFolder = value;
      step = 2;
      updateStep();
    } else {
      // Show error - path doesn't exist
      contentBox.setContent(`{#ff0000-fg}Path doesn't exist: ${value}{/#ff0000-fg}`);
      screen.render();
      setTimeout(() => {
        customPathInput.show();
        customPathInput.focus();
        screen.render();
      }, 1500);
    }
  });

  customPathInput.key(["escape"], () => {
    customPathInput.hide();
    folderList.show();
    folderList.focus();
    footer.setContent(" {#ff00ff-fg}↑↓{/#ff00ff-fg} Select  {#00ff00-fg}↵{/#00ff00-fg} Confirm  {#aa88ff-fg}Esc{/#aa88ff-fg} Cancel");
    screen.render();
  });

  // Step 2: Enter project name
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

  // Step 3: GitHub options
  githubList.on("select", async (item, index) => {
    createGitHub = index < 2;
    isPrivate = index === 0;

    // Create the project
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

  folderList.key(["escape"], () => {
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

  console.log(`\n{#ff00ff-fg}Creating project:{/#ff00ff-fg} ${projectName}`);
  console.log(`{#888888-fg}Path:{/#888888-fg} ${projectPath}\n`);

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
      console.log(`\n{#ffff00-fg}Note:{/#ffff00-fg} GitHub repo creation may have failed. You can create it manually.`);
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
