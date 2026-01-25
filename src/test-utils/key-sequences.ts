/**
 * Key escape sequences for TUI testing
 * Maps key names to their ANSI escape codes or raw characters
 */
export const Keys = {
  // Arrow keys
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  LEFT: "\x1b[D",
  RIGHT: "\x1b[C",

  // Control keys
  ENTER: "\r",
  ESCAPE: "\x1b",
  TAB: "\t",
  BACKSPACE: "\x7f",
  SPACE: " ",

  // Ctrl combinations
  CTRL_C: "\x03",
  CTRL_UP: "\x1b[1;5A",
  CTRL_DOWN: "\x1b[1;5B",

  // Shift combinations (for blessed)
  SHIFT_A: "A", // Shift+A sends uppercase
  SHIFT_R: "R", // Shift+R sends uppercase

  // vim navigation
  j: "j",
  k: "k",

  // App keybindings (from keybindings.ts)
  SEARCH: "/",
  HELP: "?",
  NEW: "n",
  PROMOTE: "p",
  ARCHIVE: "a",
  ARCHIVE_VIEW: "A",
  RENAME: "r",
  RESTORE_DELETED: "R",
  QUIT: "q",
  COPY: "c",
  MCP: "m",
  UPDATE: "u",
  SKIP_PERMS: "d",
  AGENT_EXPERT: "x",
} as const;

export type KeyName = keyof typeof Keys;
