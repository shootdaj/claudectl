/**
 * tmux Manager for Claude Code sessions
 *
 * Manages Claude sessions running in tmux, allowing:
 * - Starting new Claude sessions in tmux
 * - Attaching to existing tmux sessions
 * - Sending input via tmux send-keys
 * - Listing active Claude tmux sessions
 */

import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export interface TmuxSession {
  name: string;
  sessionId: string; // Claude session ID (extracted from tmux session name)
  attached: boolean;
  created: Date;
  cwd?: string;
}

/**
 * Get the tmux session name for a Claude session
 */
function getTmuxSessionName(sessionId: string): string {
  return `claude-${sessionId}`;
}

/**
 * Check if tmux is installed and available
 */
export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await exec("which tmux");
    return true;
  } catch {
    return false;
  }
}

/**
 * List all active Claude tmux sessions
 */
export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await exec(
      `tmux list-sessions -F '#{session_name}|#{session_attached}|#{session_created}' 2>/dev/null`
    );

    const sessions: TmuxSession[] = [];

    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;

      const [name, attached, created] = line.split("|");

      // Only include Claude sessions (prefixed with "claude-")
      if (name.startsWith("claude-")) {
        const sessionId = name.replace("claude-", "");
        sessions.push({
          name,
          sessionId,
          attached: attached === "1",
          created: new Date(parseInt(created) * 1000),
        });
      }
    }

    return sessions;
  } catch {
    // tmux not running or no sessions
    return [];
  }
}

/**
 * Check if a specific Claude session is running in tmux
 */
export async function isSessionRunning(sessionId: string): Promise<boolean> {
  const sessions = await listTmuxSessions();
  return sessions.some((s) => s.sessionId === sessionId);
}

/**
 * Start a new Claude session in tmux
 */
export async function startSession(
  sessionId: string,
  cwd: string
): Promise<void> {
  const tmuxName = getTmuxSessionName(sessionId);

  // Check if session already exists
  if (await isSessionRunning(sessionId)) {
    throw new Error(`Session ${sessionId} is already running in tmux`);
  }

  // Start Claude in a new detached tmux session
  // Using -d to start detached, -s for session name, -c for working directory
  const cmd = `tmux new-session -d -s "${tmuxName}" -c "${cwd}" "claude --resume '${sessionId}'"`;

  try {
    await exec(cmd);
  } catch (err: any) {
    throw new Error(`Failed to start tmux session: ${err.message}`);
  }
}

/**
 * Send text input to a Claude tmux session
 * This types the text and presses Enter
 */
export async function sendInput(
  sessionId: string,
  input: string
): Promise<void> {
  const tmuxName = getTmuxSessionName(sessionId);

  // Check if session is running
  if (!(await isSessionRunning(sessionId))) {
    throw new Error(`Session ${sessionId} is not running in tmux`);
  }

  // Escape single quotes for shell
  const escaped = input.replace(/'/g, "'\\''");

  // Send the input followed by Enter
  const cmd = `tmux send-keys -t "${tmuxName}" '${escaped}' Enter`;

  try {
    await exec(cmd);
  } catch (err: any) {
    throw new Error(`Failed to send input: ${err.message}`);
  }
}

/**
 * Send a single key to a Claude tmux session
 * Useful for quick actions like 'y', 'n', Enter, Escape, Ctrl+C
 */
export async function sendKey(
  sessionId: string,
  key: string
): Promise<void> {
  const tmuxName = getTmuxSessionName(sessionId);

  // Check if session is running
  if (!(await isSessionRunning(sessionId))) {
    throw new Error(`Session ${sessionId} is not running in tmux`);
  }

  // Map common key names to tmux key names
  const keyMap: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    "ctrl+c": "C-c",
    "ctrl-c": "C-c",
    tab: "Tab",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
  };

  const tmuxKey = keyMap[key.toLowerCase()] || key;
  const cmd = `tmux send-keys -t "${tmuxName}" "${tmuxKey}"`;

  try {
    await exec(cmd);
  } catch (err: any) {
    throw new Error(`Failed to send key: ${err.message}`);
  }
}

/**
 * Send Ctrl+C to cancel current operation
 */
export async function sendCancel(sessionId: string): Promise<void> {
  return sendKey(sessionId, "C-c");
}

/**
 * Kill a Claude tmux session
 */
export async function killSession(sessionId: string): Promise<void> {
  const tmuxName = getTmuxSessionName(sessionId);

  if (!(await isSessionRunning(sessionId))) {
    // Session not running, nothing to do
    return;
  }

  const cmd = `tmux kill-session -t "${tmuxName}"`;

  try {
    await exec(cmd);
  } catch (err: any) {
    throw new Error(`Failed to kill session: ${err.message}`);
  }
}

/**
 * Capture the current visible content of a tmux pane
 * Useful for getting terminal output for the terminal view
 */
export async function capturePane(
  sessionId: string,
  lines: number = 1000
): Promise<string> {
  const tmuxName = getTmuxSessionName(sessionId);

  if (!(await isSessionRunning(sessionId))) {
    throw new Error(`Session ${sessionId} is not running in tmux`);
  }

  // Capture pane content with history
  // -p prints to stdout, -S specifies start line (negative = from end)
  const cmd = `tmux capture-pane -t "${tmuxName}" -p -S -${lines}`;

  try {
    const { stdout } = await exec(cmd);
    return stdout;
  } catch (err: any) {
    throw new Error(`Failed to capture pane: ${err.message}`);
  }
}

/**
 * Get the current working directory of a tmux session
 */
export async function getSessionCwd(sessionId: string): Promise<string | null> {
  const tmuxName = getTmuxSessionName(sessionId);

  if (!(await isSessionRunning(sessionId))) {
    return null;
  }

  try {
    const { stdout } = await exec(
      `tmux display-message -t "${tmuxName}" -p '#{pane_current_path}'`
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
