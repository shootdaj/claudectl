/**
 * Session Manager - handles PTY sessions and WebSocket clients
 * Uses node-pty for PTY management (Node.js compatible)
 */

import * as pty from "node-pty";
import type { ServerWebSocket } from "bun";
import { findSession, type Session } from "../core/sessions";
import { sendPushNotification } from "./push";

export interface WebSocketData {
  sessionId: string;
  authenticated: boolean;
}

type WSClient = ServerWebSocket<WebSocketData>;

interface ManagedSession {
  id: string;
  session: Session;
  pty: pty.IPty | null;
  clients: Set<WSClient>;
  scrollback: string;
  isActive: boolean;
}

const MAX_SCROLLBACK = 50 * 1024; // 50KB of scrollback buffer
const sessions = new Map<string, ManagedSession>();

/**
 * Get or create a managed session
 */
export async function getOrCreateManagedSession(
  sessionId: string
): Promise<ManagedSession | null> {
  // Return existing if already managed
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  // Find the session metadata
  const session = await findSession(sessionId);
  if (!session) {
    return null;
  }

  // Create managed session (PTY not spawned yet)
  const managed: ManagedSession = {
    id: sessionId,
    session,
    pty: null,
    clients: new Set(),
    scrollback: "",
    isActive: false,
  };

  sessions.set(sessionId, managed);
  return managed;
}

/**
 * Spawn the PTY for a session if not already running
 */
export function spawnPty(managed: ManagedSession, cols = 120, rows = 30): void {
  if (managed.pty) {
    console.log(`[PTY] Session ${managed.id} already has PTY running`);
    return;
  }

  console.log(`[PTY] Spawning Claude for session ${managed.id}`);
  console.log(`[PTY] Working directory: ${managed.session.workingDirectory}`);
  console.log(`[PTY] Terminal size: ${cols}x${rows}`);

  const command = "claude";
  const args = ["--resume", managed.id];

  console.log(`[PTY] Command: ${command} ${args.join(" ")}`);

  try {
    managed.pty = pty.spawn(command, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: managed.session.workingDirectory,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      } as Record<string, string>,
    });

    console.log(`[PTY] Spawned successfully, PID: ${managed.pty.pid}`);
    managed.isActive = true;

    // Handle PTY output
    managed.pty.onData((data) => {
      console.log(`[PTY] Output from ${managed.id}: ${data.length} bytes`);

      // Add to scrollback
      managed.scrollback += data;
      if (managed.scrollback.length > MAX_SCROLLBACK) {
        managed.scrollback = managed.scrollback.slice(-MAX_SCROLLBACK);
      }

      // Broadcast to all clients
      console.log(`[PTY] Broadcasting to ${managed.clients.size} clients`);
      broadcastToClients(managed, {
        type: "output",
        data,
      });

      // Check for patterns that might need push notification
      checkForNotificationTriggers(managed, data);
    });

    // Handle PTY exit
    managed.pty.onExit(({ exitCode }) => {
      console.log(`[PTY] Session ${managed.id} exited with code ${exitCode}`);
      managed.isActive = false;
      managed.pty = null;

      broadcastToClients(managed, {
        type: "exit",
        code: exitCode,
      });
    });

  } catch (err) {
    console.error(`[PTY] Failed to spawn PTY for session ${managed.id}:`, err);
    managed.isActive = false;
    managed.pty = null;
  }
}

/**
 * Send input to a session's PTY
 */
export function sendInput(sessionId: string, data: string): boolean {
  const managed = sessions.get(sessionId);
  if (!managed || !managed.pty) {
    console.log(`[PTY] sendInput failed - no managed session or PTY for ${sessionId}`);
    return false;
  }

  console.log(`[PTY] Sending input to ${sessionId}: ${data.length} bytes`);
  managed.pty.write(data);
  return true;
}

/**
 * Resize a session's PTY
 */
export function resizePty(sessionId: string, cols: number, rows: number): boolean {
  const managed = sessions.get(sessionId);
  if (!managed || !managed.pty) {
    return false;
  }

  console.log(`[PTY] Resizing ${sessionId} to ${cols}x${rows}`);
  managed.pty.resize(cols, rows);
  return true;
}

/**
 * Add a WebSocket client to a session
 */
export function addClient(
  sessionId: string,
  ws: WSClient
): ManagedSession | null {
  const managed = sessions.get(sessionId);
  if (!managed) {
    console.log(`[WS] addClient failed - no managed session for ${sessionId}`);
    return null;
  }

  managed.clients.add(ws);
  console.log(`[WS] Added client to ${sessionId}, now ${managed.clients.size} clients`);

  // Send scrollback to new client
  if (managed.scrollback) {
    console.log(`[WS] Sending ${managed.scrollback.length} bytes scrollback to new client`);
    ws.send(
      JSON.stringify({
        type: "scrollback",
        data: managed.scrollback,
      })
    );
  }

  // Send current status
  console.log(`[WS] Sending status: isActive=${managed.isActive}, title=${managed.session.title}`);
  ws.send(
    JSON.stringify({
      type: "status",
      isActive: managed.isActive,
      sessionTitle: managed.session.title,
      workingDirectory: managed.session.workingDirectory,
    })
  );

  return managed;
}

/**
 * Remove a WebSocket client from a session
 */
export function removeClient(sessionId: string, ws: WSClient): void {
  const managed = sessions.get(sessionId);
  if (!managed) {
    return;
  }

  managed.clients.delete(ws);
  console.log(
    `[WS] Client disconnected from ${sessionId}, ${managed.clients.size} clients remaining`
  );
}

/**
 * Get the number of connected clients for a session
 */
export function getClientCount(sessionId: string): number {
  const managed = sessions.get(sessionId);
  return managed ? managed.clients.size : 0;
}

/**
 * Check if a session has an active PTY
 */
export function isSessionActive(sessionId: string): boolean {
  const managed = sessions.get(sessionId);
  return managed?.isActive ?? false;
}

/**
 * Get all managed session IDs
 */
export function getManagedSessionIds(): string[] {
  return Array.from(sessions.keys());
}

/**
 * Get session info for API
 */
export function getSessionInfo(sessionId: string): {
  id: string;
  title: string;
  workingDirectory: string;
  isActive: boolean;
  clientCount: number;
} | null {
  const managed = sessions.get(sessionId);
  if (!managed) {
    return null;
  }

  return {
    id: managed.id,
    title: managed.session.title,
    workingDirectory: managed.session.workingDirectory,
    isActive: managed.isActive,
    clientCount: managed.clients.size,
  };
}

/**
 * Broadcast a message to all clients of a session
 */
function broadcastToClients(
  managed: ManagedSession,
  message: Record<string, unknown>
): void {
  const data = JSON.stringify(message);
  for (const client of managed.clients) {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    } catch (err) {
      console.error(`[WS] Error sending to client:`, err);
      managed.clients.delete(client);
    }
  }
}

/**
 * Check output for patterns that should trigger push notifications
 */
function checkForNotificationTriggers(
  managed: ManagedSession,
  data: string
): void {
  // Check for question patterns (Claude asking for input)
  const questionPatterns = [
    /\?\s*$/,                    // Ends with question mark
    /\(y\/n\)/i,                 // Yes/no prompt
    /Press Enter/i,             // Press enter prompt
    /Continue\?/i,              // Continue prompt
    /Would you like/i,          // Would you like...
    /Do you want/i,             // Do you want...
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(data)) {
      sendPushNotification({
        title: "Claude needs input",
        body: `Session: ${managed.session.title}`,
        tag: `session-${managed.id}`,
        data: { sessionId: managed.id },
      });
      break;
    }
  }

  // Check for completion patterns
  const completionPatterns = [
    /Task completed/i,
    /Done!/i,
    /Finished/i,
    /Successfully/i,
  ];

  for (const pattern of completionPatterns) {
    if (pattern.test(data)) {
      sendPushNotification({
        title: "Task completed",
        body: `Session: ${managed.session.title}`,
        tag: `session-${managed.id}-complete`,
        data: { sessionId: managed.id },
      });
      break;
    }
  }
}

/**
 * Kill a session's PTY
 */
export function killSession(sessionId: string): boolean {
  const managed = sessions.get(sessionId);
  if (!managed || !managed.pty) {
    return false;
  }

  managed.pty.kill();
  return true;
}

/**
 * Cleanup all sessions (for graceful shutdown)
 */
export function cleanup(): void {
  for (const [id, managed] of sessions) {
    if (managed.pty) {
      console.log(`[PTY] Killing session ${id}`);
      managed.pty.kill();
    }
  }
  sessions.clear();
}
