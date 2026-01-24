// Single source of truth for all keybindings
// Used in footer, help popup, and CLI help

export interface Keybinding {
  key: string;
  label: string;
  description: string;
  color: string;
}

// Theme colors for keybindings
export const keyColors = {
  action: "#00ff00",    // Green - primary actions (launch, restore)
  nav: "#ff00ff",       // Magenta - navigation
  create: "#00ffff",    // Cyan - create/new
  modify: "#ff00ff",    // Magenta - modify existing
  archive: "#ffff00",   // Yellow - archive/promote
  search: "#00ffff",    // Cyan - search
  settings: "#aa88ff",  // Purple - settings/help
  muted: "#888888",     // Gray - quit, muted
  skipOn: "#ff8800",    // Orange - skip permissions enabled
  skipOff: "#666666",   // Gray - skip permissions disabled
  expertOn: "#00ff00",  // Green - agent expert enabled
  expertOff: "#666666", // Gray - agent expert disabled
};

// All keybindings in the session picker
export const keybindings: Record<string, Keybinding> = {
  launch: { key: "↵", label: "Launch", description: "Launch selected session", color: keyColors.action },
  nav: { key: "↑↓", label: "Nav", description: "Navigate sessions", color: keyColors.nav },
  navVim: { key: "jk", label: "", description: "Navigate sessions (vim)", color: keyColors.nav },
  new: { key: "n", label: "New", description: "New session menu", color: keyColors.create },
  promote: { key: "p", label: "Promote", description: "Promote scratch to project", color: keyColors.archive },
  rename: { key: "r", label: "Rename", description: "Rename session", color: keyColors.modify },
  archive: { key: "a", label: "Archive", description: "Archive session", color: keyColors.archive },
  restore: { key: "a", label: "Restore", description: "Restore from archive", color: keyColors.action },
  archiveView: { key: "A", label: "Archive View", description: "Toggle archive view", color: keyColors.settings },
  search: { key: "/", label: "Search", description: "Search sessions", color: keyColors.search },
  copy: { key: "c", label: "Copy", description: "Copy session ID", color: keyColors.modify },
  mcp: { key: "m", label: "MCP", description: "MCP server manager", color: keyColors.settings },
  skipPerms: { key: "d", label: "skip", description: "Toggle skip permissions", color: keyColors.settings },
  agentExpert: { key: "x", label: "expert", description: "Toggle agent-expert", color: keyColors.settings },
  update: { key: "u", label: "Update", description: "Check for updates", color: keyColors.settings },
  help: { key: "?", label: "Help", description: "Show help popup", color: keyColors.settings },
  quit: { key: "q", label: "Quit", description: "Quit", color: keyColors.muted },
  restoreDeleted: { key: "R", label: "Restore", description: "Restore deleted session", color: keyColors.archive },
};

// Format a keybinding for display in footer
export function formatFooterKey(binding: Keybinding, overrideColor?: string): string {
  const color = overrideColor || binding.color;
  return `{${color}-fg}${binding.key}{/${color}-fg} ${binding.label}`;
}

// Build footer string from list of keybinding names
export function buildFooter(keys: string[], settingsState?: { skipPermissions: boolean; autoAddAgentExpert: boolean }): string {
  const parts: string[] = [];

  for (const key of keys) {
    const binding = keybindings[key];
    if (!binding) continue;

    // Special handling for settings indicators
    if (key === "skipPerms" && settingsState) {
      const color = settingsState.skipPermissions ? keyColors.skipOn : keyColors.skipOff;
      parts.push(formatFooterKey(binding, color));
    } else if (key === "agentExpert" && settingsState) {
      const color = settingsState.autoAddAgentExpert ? keyColors.expertOn : keyColors.expertOff;
      parts.push(formatFooterKey(binding, color));
    } else {
      parts.push(formatFooterKey(binding));
    }
  }

  return " " + parts.join("  ");
}

// Footer context for building session picker footer
export interface FooterContext {
  isScratch: boolean;
  isArchiveView: boolean;
  settings: { skipPermissions: boolean; autoAddAgentExpert: boolean };
}

// Base keybindings shown in all footers
const baseKeys = ["launch", "rename", "search", "mcp", "update", "help", "skipPerms", "agentExpert", "quit"];

// Build footer based on session context
export function buildSessionFooter(context: FooterContext): string {
  const keys: string[] = [];

  // Launch is always first
  keys.push("launch");

  // Context-specific keys
  if (context.isArchiveView) {
    keys.push("restore");  // 'a' restores in archive view
  } else {
    if (context.isScratch) {
      keys.push("promote"); // 'p' promotes scratch sessions
    }
    keys.push("new");      // 'n' for new session
    keys.push("archive");  // 'a' archives in normal view
  }

  // Common keys
  keys.push("rename", "search", "mcp", "update", "help", "skipPerms", "agentExpert", "quit");

  return buildFooter(keys, context.settings);
}

// CLI aliases
export const cliAliases = [
  { alias: "ccl", description: "Session picker" },
  { alias: "ccls", description: "Scratch session" },
  { alias: "cclr", description: "Resume last session" },
  { alias: "ccln", description: "New project" },
  { alias: "cclc", description: "Clone from GitHub" },
  { alias: "ccll", description: "List sessions" },
  { alias: "cclw", description: "Web server" },
  { alias: "cclu", description: "Update claudectl" },
  { alias: "cclh", description: "Help" },
];

// Help content order - keybindings shown in help popup
export const helpKeybindingOrder = [
  "launch", "nav", "navVim", "new", "promote", "rename",
  "archive", "archiveView", "search", "copy", "mcp",
  "skipPerms", "agentExpert", "update", "help", "quit",
];

// Build help popup content
export function buildHelpContent(): string {
  const lines: string[] = ["{bold}Keybindings{/bold}", ""];

  for (const name of helpKeybindingOrder) {
    const binding = keybindings[name];
    if (!binding) continue;

    // Special formatting for nav keys (show together)
    if (name === "navVim") {
      // Skip, handled with nav
      continue;
    }
    if (name === "nav") {
      const vim = keybindings.navVim;
      lines.push(`  {${binding.color}-fg}${binding.key}{/${binding.color}-fg} or {${vim.color}-fg}${vim.key}{/${vim.color}-fg}   ${binding.description}`);
      continue;
    }

    const keyPad = binding.key.padEnd(2);
    lines.push(`  {${binding.color}-fg}${keyPad}{/${binding.color}-fg}           ${binding.description}`);
  }

  lines.push("");
  lines.push("{bold}CLI Aliases{/bold}");
  lines.push("");

  for (const { alias, description } of cliAliases) {
    lines.push(`  {${keyColors.action}-fg}${alias.padEnd(12)}{/${keyColors.action}-fg} ${description}`);
  }

  return lines.join("\n");
}
