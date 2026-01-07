import blessed, { Widgets } from "blessed";
import {
  getAllMcpServersGlobal,
  getProjectMcpServers,
  getServerDisplay,
  getServerType,
  removeUserMcpServer,
  removeLocalMcpServer,
  removeProjectMcpServer,
  setUserMcpServer,
  setLocalMcpServer,
  setProjectMcpServer,
  isStdioServer,
  type MCPServer,
  type MCPServerWithMeta,
  type MCPScope,
} from "../core/mcp";
import { basename } from "../utils/paths";

interface ListWithSelected extends Widgets.ListElement {
  selected: number;
}

interface McpManagerOptions {
  projectDir?: string;
  onExit?: () => void;
}

// Neon color scheme (same as session-picker)
const theme = {
  pink: "#ff00ff",
  blue: "#00ffff",
  cyan: "#00ff00",
  green: "#00ff00",
  yellow: "#ffff00",
  orange: "#ff8800",
  purple: "#aa88ff",
  red: "#ff0000",
  muted: "#888888",
  fg: "#ffffff",
  selectedBg: "#333333",
  selectedFg: "#00ff00",
};

async function loadAllServers(projectDir?: string): Promise<MCPServerWithMeta[]> {
  // Get user + local scope servers from all projects
  const servers = await getAllMcpServersGlobal();

  // Also add project-scope servers from .mcp.json if projectDir provided
  if (projectDir) {
    const projectServers = await getProjectMcpServers(projectDir);
    for (const [name, server] of Object.entries(projectServers)) {
      servers.push({ name, server, scope: "project", projectPath: projectDir });
    }
  }

  return servers;
}

export async function showMcpManager(options: McpManagerOptions = {}): Promise<void> {
  let servers = await loadAllServers(options.projectDir);

  const screen = blessed.screen({
    smartCSR: true,
    title: "claudectl - MCP Manager",
    fullUnicode: true,
  });

  // Main container
  const mainBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: { type: "line" },
    style: { border: { fg: theme.pink } },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: `{bold}{#ff00ff-fg} ◆ claudectl{/#ff00ff-fg}{/bold} {#888888-fg}│{/#888888-fg} {#00ffff-fg}MCP servers{/#00ffff-fg}`,
    tags: true,
    style: { fg: "white" },
  });

  // Server count
  function updateCount() {
    countBox.setContent(`{#00ff00-fg}${servers.length}{/#00ff00-fg} {#888888-fg}servers{/#888888-fg}`);
  }

  const countBox = blessed.text({
    parent: titleBar,
    top: 0,
    right: 1,
    content: "",
    tags: true,
  });
  updateCount();

  // Header line
  const headerLine = ` ${"NAME".padEnd(20)} ${"TYPE".padEnd(6)} ${"SOURCE".padEnd(8)} ${"DETAILS"}`;
  blessed.text({
    parent: mainBox,
    top: 1,
    left: 1,
    width: "100%-4",
    height: 1,
    content: `{#00ffff-fg}${headerLine}{/#00ffff-fg}`,
    tags: true,
  });

  // Server list
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
    items: servers.map(formatServerRow),
  }) as ListWithSelected;

  // Separator
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

  // Footer
  blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: ` {#ff00ff-fg}↑↓{/#ff00ff-fg} Navigate  {#00ff00-fg}a{/#00ff00-fg} Add  {#ff0000-fg}x{/#ff0000-fg} Remove  {#00ffff-fg}e{/#00ffff-fg} Edit  {#bd93f9-fg}q{/#bd93f9-fg} Back`,
    tags: true,
    style: { fg: "gray" },
  });

  function formatServerRow(s: MCPServerWithMeta): string {
    const name = s.name.slice(0, 20).padEnd(20);
    const type = getServerType(s.server).padEnd(6);
    const scope = s.scope.padEnd(8);
    const details = getServerDisplay(s.server).slice(0, 50);
    // Color by scope: user=cyan, local=yellow, project=green
    const scopeColor = s.scope === "user" ? theme.cyan : s.scope === "local" ? theme.yellow : theme.green;
    return ` ${name} {#888888-fg}${type}{/#888888-fg} {${scopeColor}-fg}${scope}{/${scopeColor}-fg} {#888888-fg}${details}{/#888888-fg}`;
  }

  function updateTable() {
    table.setItems(servers.map(formatServerRow));
    updateCount();
    updateDetails();
    screen.render();
  }

  function updateDetails() {
    const idx = table.selected;
    const server = servers[idx];
    if (!server) {
      detailsBox.setContent("{#888888-fg}No servers configured{/#888888-fg}");
      screen.render();
      return;
    }

    const lines: string[] = [];
    lines.push(`{bold}{#ff00ff-fg}${server.name}{/#ff00ff-fg}{/bold}  {#888888-fg}${server.scope}${server.projectPath ? ` (${basename(server.projectPath)})` : ""}{/#888888-fg}`);

    if (isStdioServer(server.server)) {
      lines.push(`{#888888-fg}command{/#888888-fg} {#ffffff-fg}${server.server.command}{/#ffffff-fg}  {#888888-fg}args{/#888888-fg} {#00ff00-fg}${server.server.args?.join(" ") || "—"}{/#00ff00-fg}`);
    } else {
      lines.push(`{#888888-fg}url{/#888888-fg} {#00ffff-fg}${server.server.url}{/#00ffff-fg}`);
    }

    if (server.server.env && Object.keys(server.server.env).length > 0) {
      const envKeys = Object.keys(server.server.env).join(", ");
      lines.push(`{#888888-fg}env{/#888888-fg} {#ffff00-fg}${envKeys}{/#ffff00-fg}`);
    }

    detailsBox.setContent(lines.join("\n"));
    screen.render();
  }

  table.on("select item", updateDetails);
  table.select(0);
  updateDetails();

  // Add server form
  async function showAddForm(scope: MCPScope) {
    const formBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 60,
      height: 16,
      border: { type: "line" },
      style: { border: { fg: theme.pink } },
      label: ` {#ff00ff-fg}Add ${scope} MCP Server{/#ff00ff-fg} `,
      tags: true,
    });

    let currentField = 0;
    const fields = ["name", "type", "command/url", "args", "env"];
    const values: Record<string, string> = { name: "", type: "stdio", "command/url": "", args: "", env: "" };

    // Field labels and inputs
    const fieldY = [1, 3, 5, 7, 9];
    const inputs: Widgets.TextboxElement[] = [];

    fields.forEach((field, i) => {
      blessed.text({
        parent: formBox,
        top: fieldY[i],
        left: 2,
        content: `{#00ffff-fg}${field}:{/#00ffff-fg}`,
        tags: true,
      });

      if (field === "type") {
        blessed.text({
          parent: formBox,
          top: fieldY[i],
          left: 16,
          content: `{#00ff00-fg}stdio{/#00ff00-fg} {#888888-fg}(tab to toggle){/#888888-fg}`,
          tags: true,
        });
      } else {
        const input = blessed.textbox({
          parent: formBox,
          top: fieldY[i],
          left: 16,
          width: 40,
          height: 1,
          inputOnFocus: true,
          style: { fg: "white", bg: theme.selectedBg },
        });
        inputs.push(input);
      }
    });

    // Help text
    blessed.text({
      parent: formBox,
      bottom: 1,
      left: 2,
      content: `{#888888-fg}Enter: Save  Esc: Cancel  Tab: Next field{/#888888-fg}`,
      tags: true,
    });

    let serverType: "stdio" | "http" = "stdio";

    // Handle form submission
    const submitForm = async () => {
      const name = inputs[0].getValue().trim();
      const cmdOrUrl = inputs[1].getValue().trim();
      const args = inputs[2].getValue().trim();
      const envStr = inputs[3].getValue().trim();

      if (!name || !cmdOrUrl) {
        detailsBox.setContent(`{#ff0000-fg}Error: Name and command/URL are required{/#ff0000-fg}`);
        formBox.destroy();
        screen.render();
        return;
      }

      let server: MCPServer;
      if (serverType === "stdio") {
        server = {
          command: cmdOrUrl,
          args: args ? args.split(" ") : undefined,
        };
      } else {
        server = { url: cmdOrUrl };
      }

      // Parse env if provided (format: KEY=value,KEY2=value2)
      if (envStr) {
        server.env = {};
        envStr.split(",").forEach((pair) => {
          const [key, val] = pair.split("=");
          if (key && val) server.env![key.trim()] = val.trim();
        });
      }

      if (scope === "user") {
        await setUserMcpServer(name, server);
      } else if (scope === "local" && options.projectDir) {
        await setLocalMcpServer(options.projectDir, name, server);
      } else if (scope === "project" && options.projectDir) {
        await setProjectMcpServer(options.projectDir, name, server);
      }

      servers = await loadAllServers(options.projectDir);
      formBox.destroy();
      updateTable();
      detailsBox.setContent(`{#00ff00-fg}✓{/#00ff00-fg} Added ${name}`);
      table.focus();
      screen.render();
    };

    inputs[0].focus();

    inputs.forEach((input, i) => {
      input.key(["tab"], () => {
        const next = (i + 1) % inputs.length;
        inputs[next].focus();
      });
      input.key(["enter"], submitForm);
      input.key(["escape"], () => {
        formBox.destroy();
        table.focus();
        screen.render();
      });
    });

    screen.render();
  }

  // Add keybindings
  table.key(["a"], () => {
    // Show scope selection
    const scopeBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 10,
      border: { type: "line" },
      style: { border: { fg: theme.pink } },
      label: ` {#ff00ff-fg}Add MCP Server{/#ff00ff-fg} `,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 1,
      left: 2,
      content: `{#ffffff-fg}Select scope:{/#ffffff-fg}`,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 3,
      left: 2,
      content: `{#00ffff-fg}u{/#00ffff-fg} User   - all projects (~/.claude.json)`,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 4,
      left: 2,
      content: `{#ffff00-fg}l{/#ffff00-fg} Local  - this project, private (~/.claude.json)`,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 5,
      left: 2,
      content: `{#00ff00-fg}p{/#00ff00-fg} Project - this project, shared (.mcp.json)`,
      tags: true,
    });

    scopeBox.key(["u"], () => {
      scopeBox.destroy();
      showAddForm("user");
    });

    scopeBox.key(["l"], () => {
      if (!options.projectDir) {
        detailsBox.setContent(`{#ff0000-fg}No project directory specified{/#ff0000-fg}`);
        scopeBox.destroy();
        table.focus();
        screen.render();
        return;
      }
      scopeBox.destroy();
      showAddForm("local");
    });

    scopeBox.key(["p"], () => {
      if (!options.projectDir) {
        detailsBox.setContent(`{#ff0000-fg}No project directory specified{/#ff0000-fg}`);
        scopeBox.destroy();
        table.focus();
        screen.render();
        return;
      }
      scopeBox.destroy();
      showAddForm("project");
    });

    scopeBox.key(["escape"], () => {
      scopeBox.destroy();
      table.focus();
      screen.render();
    });

    scopeBox.focus();
    screen.render();
  });

  // Remove server
  table.key(["x"], async () => {
    const idx = table.selected;
    const server = servers[idx];
    if (!server) return;

    const confirmBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 6,
      border: { type: "line" },
      style: { border: { fg: theme.red } },
      label: ` {#ff0000-fg}Remove Server{/#ff0000-fg} `,
      tags: true,
    });

    blessed.text({
      parent: confirmBox,
      top: 1,
      left: 2,
      content: `{#ffffff-fg}Remove {#ff00ff-fg}${server.name}{/#ff00ff-fg}?{/#ffffff-fg}`,
      tags: true,
    });

    blessed.text({
      parent: confirmBox,
      top: 3,
      left: 2,
      content: `{#00ff00-fg}y{/#00ff00-fg} Yes  {#888888-fg}n{/#888888-fg} No`,
      tags: true,
    });

    confirmBox.key(["y"], async () => {
      if (server.scope === "user") {
        await removeUserMcpServer(server.name);
      } else if (server.scope === "local" && server.projectPath) {
        await removeLocalMcpServer(server.projectPath, server.name);
      } else if (server.scope === "project" && server.projectPath) {
        await removeProjectMcpServer(server.projectPath, server.name);
      }
      servers = await loadAllServers(options.projectDir);
      confirmBox.destroy();
      updateTable();
      detailsBox.setContent(`{#00ff00-fg}✓{/#00ff00-fg} Removed ${server.name}`);
      table.focus();
      screen.render();
    });

    confirmBox.key(["n", "escape"], () => {
      confirmBox.destroy();
      table.focus();
      screen.render();
    });

    confirmBox.focus();
    screen.render();
  });

  // Edit server (simplified - just shows details for now)
  table.key(["e"], () => {
    const idx = table.selected;
    const server = servers[idx];
    if (!server) return;

    detailsBox.setContent(`{#ffff00-fg}Edit not yet implemented. Remove and re-add to modify.{/#ffff00-fg}`);
    screen.render();
  });

  // Exit
  screen.key(["q", "C-c"], () => {
    screen.destroy();
    options.onExit?.();
  });

  table.focus();
  screen.render();
}
