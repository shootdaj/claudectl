import blessed, { Widgets } from "blessed";
import {
  getAllMcpServers,
  getServerDisplay,
  getServerType,
  removeGlobalMcpServer,
  removeProjectMcpServer,
  setGlobalMcpServer,
  setProjectMcpServer,
  isStdioServer,
  type MCPServer,
  type MCPServerWithMeta,
} from "../core/mcp";

interface ListWithSelected extends Widgets.ListElement {
  selected: number;
}

interface McpManagerOptions {
  projectDir?: string;
  onExit?: () => void;
}

// Dark Midnight theme (same as session-picker)
const theme = {
  purple: "#b48ead",
  blue: "#81a1c1",
  cyan: "#88c0d0",
  green: "#a3be8c",
  yellow: "#ebcb8b",
  red: "#bf616a",
  muted: "#5c6773",
  fg: "#d8dee9",
  selectedBg: "#3b4252",
  selectedFg: "#a3be8c",
};

export async function showMcpManager(options: McpManagerOptions = {}): Promise<void> {
  let servers = await getAllMcpServers(options.projectDir);

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
    style: { border: { fg: theme.purple } },
  });

  // Title bar
  const titleBar = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    content: `{bold}{#b48ead-fg} ◆ claudectl{/#b48ead-fg}{/bold} {#5c6773-fg}│{/#5c6773-fg} {#81a1c1-fg}MCP servers{/#81a1c1-fg}`,
    tags: true,
    style: { fg: "white" },
  });

  // Server count
  function updateCount() {
    countBox.setContent(`{#a3be8c-fg}${servers.length}{/#a3be8c-fg} {#5c6773-fg}servers{/#5c6773-fg}`);
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
    content: `{#81a1c1-fg}${headerLine}{/#81a1c1-fg}`,
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
      style: { fg: theme.purple },
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
    content: ` {#b48ead-fg}↑↓{/#b48ead-fg} Navigate  {#a3be8c-fg}a{/#a3be8c-fg} Add  {#bf616a-fg}x{/#bf616a-fg} Remove  {#81a1c1-fg}e{/#81a1c1-fg} Edit  {#88c0d0-fg}q{/#88c0d0-fg} Back`,
    tags: true,
    style: { fg: "gray" },
  });

  function formatServerRow(s: MCPServerWithMeta): string {
    const name = s.name.slice(0, 20).padEnd(20);
    const type = getServerType(s.server).padEnd(6);
    const source = s.source.padEnd(8);
    const details = getServerDisplay(s.server).slice(0, 50);
    const sourceColor = s.source === "global" ? theme.cyan : theme.green;
    return ` ${name} {#5c6773-fg}${type}{/#5c6773-fg} {${sourceColor}-fg}${source}{/${sourceColor}-fg} {#5c6773-fg}${details}{/#5c6773-fg}`;
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
      detailsBox.setContent("{#5c6773-fg}No servers configured{/#5c6773-fg}");
      screen.render();
      return;
    }

    const lines: string[] = [];
    lines.push(`{bold}{#b48ead-fg}${server.name}{/#b48ead-fg}{/bold}  {#5c6773-fg}${server.source}{/#5c6773-fg}`);

    if (isStdioServer(server.server)) {
      lines.push(`{#5c6773-fg}command{/#5c6773-fg} {#d8dee9-fg}${server.server.command}{/#d8dee9-fg}  {#5c6773-fg}args{/#5c6773-fg} {#a3be8c-fg}${server.server.args?.join(" ") || "—"}{/#a3be8c-fg}`);
    } else {
      lines.push(`{#5c6773-fg}url{/#5c6773-fg} {#88c0d0-fg}${server.server.url}{/#88c0d0-fg}`);
    }

    if (server.server.env && Object.keys(server.server.env).length > 0) {
      const envKeys = Object.keys(server.server.env).join(", ");
      lines.push(`{#5c6773-fg}env{/#5c6773-fg} {#ebcb8b-fg}${envKeys}{/#ebcb8b-fg}`);
    }

    detailsBox.setContent(lines.join("\n"));
    screen.render();
  }

  table.on("select item", updateDetails);
  table.select(0);
  updateDetails();

  // Add server form
  async function showAddForm(scope: "global" | "project") {
    const formBox = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 60,
      height: 16,
      border: { type: "line" },
      style: { border: { fg: theme.purple } },
      label: ` {#b48ead-fg}Add ${scope} MCP Server{/#b48ead-fg} `,
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
        content: `{#81a1c1-fg}${field}:{/#81a1c1-fg}`,
        tags: true,
      });

      if (field === "type") {
        blessed.text({
          parent: formBox,
          top: fieldY[i],
          left: 16,
          content: `{#a3be8c-fg}stdio{/#a3be8c-fg} {#5c6773-fg}(tab to toggle){/#5c6773-fg}`,
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
      content: `{#5c6773-fg}Enter: Save  Esc: Cancel  Tab: Next field{/#5c6773-fg}`,
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
        detailsBox.setContent(`{#bf616a-fg}Error: Name and command/URL are required{/#bf616a-fg}`);
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

      if (scope === "global") {
        await setGlobalMcpServer(name, server);
      } else if (options.projectDir) {
        await setProjectMcpServer(options.projectDir, name, server);
      }

      servers = await getAllMcpServers(options.projectDir);
      formBox.destroy();
      updateTable();
      detailsBox.setContent(`{#a3be8c-fg}✓{/#a3be8c-fg} Added ${name}`);
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
      width: 40,
      height: 8,
      border: { type: "line" },
      style: { border: { fg: theme.purple } },
      label: ` {#b48ead-fg}Add MCP Server{/#b48ead-fg} `,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 1,
      left: 2,
      content: `{#d8dee9-fg}Where to add the server?{/#d8dee9-fg}`,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 3,
      left: 2,
      content: `{#88c0d0-fg}g{/#88c0d0-fg} Global (~/.claude.json)`,
      tags: true,
    });

    blessed.text({
      parent: scopeBox,
      top: 4,
      left: 2,
      content: `{#a3be8c-fg}p{/#a3be8c-fg} Project (.mcp.json)`,
      tags: true,
    });

    scopeBox.key(["g"], () => {
      scopeBox.destroy();
      showAddForm("global");
    });

    scopeBox.key(["p"], () => {
      if (!options.projectDir) {
        detailsBox.setContent(`{#bf616a-fg}No project directory specified{/#bf616a-fg}`);
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
      label: ` {#bf616a-fg}Remove Server{/#bf616a-fg} `,
      tags: true,
    });

    blessed.text({
      parent: confirmBox,
      top: 1,
      left: 2,
      content: `{#d8dee9-fg}Remove {#b48ead-fg}${server.name}{/#b48ead-fg}?{/#d8dee9-fg}`,
      tags: true,
    });

    blessed.text({
      parent: confirmBox,
      top: 3,
      left: 2,
      content: `{#a3be8c-fg}y{/#a3be8c-fg} Yes  {#5c6773-fg}n{/#5c6773-fg} No`,
      tags: true,
    });

    confirmBox.key(["y"], async () => {
      if (server.source === "global") {
        await removeGlobalMcpServer(server.name);
      } else if (server.projectPath) {
        await removeProjectMcpServer(server.projectPath, server.name);
      }
      servers = await getAllMcpServers(options.projectDir);
      confirmBox.destroy();
      updateTable();
      detailsBox.setContent(`{#a3be8c-fg}✓{/#a3be8c-fg} Removed ${server.name}`);
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

    detailsBox.setContent(`{#ebcb8b-fg}Edit not yet implemented. Remove and re-add to modify.{/#ebcb8b-fg}`);
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
