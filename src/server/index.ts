/**
 * claudectl serve - Web server for remote Claude Code access
 * Node.js compatible version using http + ws
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { existsSync, readFileSync } from "fs";
import { parse as parseUrl } from "url";
import { fileURLToPath } from "url";
import {
  authenticate,
  verifyToken,
  isPasswordSet,
  setPassword,
  savePushSubscription,
  type PushSubscription,
} from "./auth";
import {
  getOrCreateManagedSession,
  spawnPty,
  sendInput as sendPtyInput,
  resizePty,
  addClient,
  removeClient,
  cleanup,
} from "./session-manager";
import { getPublicVapidKey } from "./push";
import { discoverSessions, getSessionById } from "../core/sessions";
import { JsonlWatcher, type JsonlMessage } from "./jsonl-watcher";
import { toChatMessage, toTerminalMessage, type ChatMessage, type TerminalMessage } from "./message-converter";
import {
  isTmuxAvailable,
  listTmuxSessions,
  isSessionRunning,
  startSession as startTmuxSession,
  sendInput as sendTmuxInput,
  sendKey as sendTmuxKey,
  sendCancel as sendTmuxCancel,
} from "./tmux-manager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = join(__dirname, "..", "web");

interface ServeOptions {
  port?: number;
  tunnel?: boolean;
}

// Store WebSocket session associations
const wsSessionMap = new WeakMap<WebSocket, string>();

// Store active JSONL watchers per session
const sessionWatchers = new Map<string, JsonlWatcher>();

// Store WebSocket clients per session for v2 (JSONL-based) connections
const v2Clients = new Map<string, Set<WebSocket>>();

// Track which mode each client is using
const clientMode = new WeakMap<WebSocket, "terminal" | "chat">();

/**
 * Start the claudectl web server
 */
export async function startServer(options: ServeOptions = {}): Promise<void> {
  const port = options.port || 3847;

  // Check if password is set
  if (!isPasswordSet()) {
    console.log("\n[Server] No password set. Please set a password first:");
    console.log("  claudectl serve auth set\n");
    process.exit(1);
  }

  console.log(`\n[Server] Starting claudectl server on port ${port}...`);

  // Create HTTP server
  const server = createServer(async (req, res) => {
    const url = parseUrl(req.url || "/", true);
    const path = url.pathname || "/";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // API Routes
    if (path.startsWith("/api/")) {
      await handleApi(req, res, path);
      return;
    }

    // Static files
    serveStaticFile(path, res);
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    const url = parseUrl(req.url || "/", true);
    const path = url.pathname || "/";

    // V2 path: /ws/v2/session/:id - JSONL-based
    const v2Match = path.match(/^\/ws\/v2\/session\/([^/]+)$/);
    if (v2Match) {
      await handleV2WebSocket(ws, v2Match[1], url.query.token as string, url.query.mode as string);
      return;
    }

    // V1 path: /ws/session/:id - PTY-based (legacy)
    const match = path.match(/^\/ws\/session\/([^/]+)$/);
    if (!match) {
      ws.close(1002, "Invalid WebSocket path");
      return;
    }

    const sessionId = match[1];
    const token = url.query.token as string;

    // Verify token
    if (!token || !verifyToken(token)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    console.log(`[WS] Client connected to session ${sessionId}`);

    // Store session ID for this WebSocket
    wsSessionMap.set(ws, sessionId);

    // Prepare the session
    const managed = await getOrCreateManagedSession(sessionId);
    if (!managed) {
      console.error(`[WS] Failed to get session ${sessionId}`);
      ws.close(1011, "Session not found");
      return;
    }

    // Add client and spawn PTY if needed
    addClient(sessionId, ws);
    if (!managed.isActive) {
      spawnPty(managed);
    }

    // Handle messages
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`[WS] Message received: type=${data.type} sessionId=${sessionId}`);

        switch (data.type) {
          case "input":
            console.log(`[WS] Processing input: ${data.data?.length} bytes`);
            const success = sendPtyInput(sessionId, data.data);
            console.log(`[WS] sendInput result: ${success}`);
            break;

          case "resize":
            resizePty(sessionId, data.cols, data.rows);
            break;

          case "spawn":
            getOrCreateManagedSession(sessionId).then((managed) => {
              if (managed) {
                spawnPty(managed, data.cols, data.rows);
              }
            });
            break;

          default:
            console.log(`[WS] Unknown message type: ${data.type}`);
        }
      } catch (err) {
        console.error(`[WS] Error processing message:`, err);
      }
    });

    // Handle close
    ws.on("close", () => {
      const sid = wsSessionMap.get(ws);
      if (sid) {
        removeClient(sid, ws);
      }
    });
  });

  /**
   * Handle V2 WebSocket connections (JSONL-based)
   */
  async function handleV2WebSocket(
    ws: WebSocket,
    sessionId: string,
    token: string,
    mode: string = "chat"
  ): Promise<void> {
    // Verify token
    if (!token || !verifyToken(token)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    // Get session info
    const session = await getSessionById(sessionId);
    if (!session) {
      ws.close(1011, "Session not found");
      return;
    }

    console.log(`[WS v2] Client connected to session ${sessionId} (mode: ${mode})`);

    // Store associations
    wsSessionMap.set(ws, sessionId);
    clientMode.set(ws, mode === "terminal" ? "terminal" : "chat");

    // Add to v2 clients
    if (!v2Clients.has(sessionId)) {
      v2Clients.set(sessionId, new Set());
    }
    v2Clients.get(sessionId)!.add(ws);

    // Get or create watcher for this session
    let watcher = sessionWatchers.get(sessionId);
    if (!watcher) {
      watcher = new JsonlWatcher(sessionId, session.workingDirectory, { readFromStart: true });

      // Forward messages to all connected clients
      let msgCount = 0;
      watcher.on("message", (msg: JsonlMessage) => {
        msgCount++;
        const clients = v2Clients.get(sessionId);
        if (!clients) {
          console.log(`[WS v2] No clients for session ${sessionId}`);
          return;
        }

        // Always convert to chat format (has all info, client can display as terminal)
        const converted = toChatMessage(msg);

        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "message",
              data: converted,
            }));
          } else {
            console.log(`[WS v2] Client not open, readyState: ${client.readyState}`);
          }
        }
        if (msgCount % 100 === 0) {
          console.log(`[WS v2] Sent ${msgCount} messages for ${sessionId}`);
        }
      });

      watcher.on("error", (err) => {
        console.error(`[WS v2] Watcher error for ${sessionId}:`, err);
      });

      sessionWatchers.set(sessionId, watcher);
      console.log(`[WS v2] Starting watcher for ${sessionId}, file: ${watcher.getFilePath()}`);
      await watcher.start();
      console.log(`[WS v2] Watcher started, total messages sent: ${msgCount}`);
    } else {
      // Send existing messages to new client (always in chat format)
      const existingMessages = await watcher.readAllMessages();

      for (const msg of existingMessages) {
        ws.send(JSON.stringify({
          type: "message",
          data: toChatMessage(msg),
        }));
      }
    }

    // Send initial status
    const tmuxRunning = await isSessionRunning(sessionId);
    ws.send(JSON.stringify({
      type: "status",
      sessionId,
      title: session.title,
      workingDirectory: session.workingDirectory,
      tmuxRunning,
    }));

    // Handle client messages
    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`[WS v2] Message received: type=${data.type}`);

        switch (data.type) {
          case "send":
            // Send text to tmux
            if (data.text) {
              const running = await isSessionRunning(sessionId);
              if (!running) {
                await startTmuxSession(sessionId, session.workingDirectory);
                await new Promise((r) => setTimeout(r, 1000));
              }
              await sendTmuxInput(sessionId, data.text);
            }
            break;

          case "key":
            // Send single key to tmux
            if (data.key) {
              const running = await isSessionRunning(sessionId);
              if (running) {
                await sendTmuxKey(sessionId, data.key);
              }
            }
            break;

          case "cancel":
            // Send Ctrl+C
            const running = await isSessionRunning(sessionId);
            if (running) {
              await sendTmuxCancel(sessionId);
            }
            break;

          case "mode":
            // Switch between chat and terminal mode
            if (data.mode === "chat" || data.mode === "terminal") {
              clientMode.set(ws, data.mode);
              ws.send(JSON.stringify({ type: "mode_changed", mode: data.mode }));
            }
            break;

          default:
            console.log(`[WS v2] Unknown message type: ${data.type}`);
        }
      } catch (err) {
        console.error(`[WS v2] Error processing message:`, err);
      }
    });

    // Handle close
    ws.on("close", () => {
      console.log(`[WS v2] Client disconnected from session ${sessionId}`);

      const clients = v2Clients.get(sessionId);
      if (clients) {
        clients.delete(ws);

        // Stop watcher if no more clients
        if (clients.size === 0) {
          const watcher = sessionWatchers.get(sessionId);
          if (watcher) {
            watcher.stop();
            sessionWatchers.delete(sessionId);
          }
          v2Clients.delete(sessionId);
        }
      }
    });
  }

  server.listen(port, () => {
    console.log(`[Server] Server running at http://localhost:${port}`);
    console.log(`[Server] Open in browser or connect from mobile\n`);
  });

  if (options.tunnel) {
    startTunnel(port);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    cleanup();
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Server] Shutting down...");
    cleanup();
    server.close();
    process.exit(0);
  });
}

/**
 * Handle API requests
 */
async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<void> {
  res.setHeader("Content-Type", "application/json");

  // Helper to read body
  const readBody = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  };

  // Auth endpoints (no token required)
  if (path === "/api/auth/login" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody()) as { password: string };
      const token = await authenticate(body.password);

      if (token) {
        res.writeHead(200);
        res.end(JSON.stringify({ token, expiresIn: "7d" }));
      } else {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Invalid password" }));
      }
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid request" }));
    }
    return;
  }

  // Check if password is set
  if (path === "/api/auth/status") {
    res.writeHead(200);
    res.end(JSON.stringify({ passwordSet: isPasswordSet() }));
    return;
  }

  // All other API endpoints require authentication
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token || !verifyToken(token)) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Sessions list
  if (path === "/api/sessions" && req.method === "GET") {
    try {
      const sessions = await discoverSessions();
      const sessionList = sessions.map((s) => ({
        id: s.id,
        title: s.title,
        workingDirectory: s.workingDirectory,
        shortPath: s.shortPath,
        lastAccessedAt: s.lastAccessedAt,
        messageCount: s.messageCount,
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ sessions: sessionList }));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Failed to load sessions" }));
    }
    return;
  }

  // VAPID public key
  if (path === "/api/push/vapid-key") {
    res.writeHead(200);
    res.end(JSON.stringify({ publicKey: getPublicVapidKey() }));
    return;
  }

  // Save push subscription
  if (path === "/api/push/subscribe" && req.method === "POST") {
    try {
      const subscription = JSON.parse(await readBody()) as PushSubscription;
      savePushSubscription(subscription);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid subscription" }));
    }
    return;
  }

  // ===== V2 API: JSONL-based chat/terminal =====

  // Get session messages (chat or terminal format)
  const messagesMatch = path.match(/^\/api\/session\/([^/]+)\/messages$/);
  if (messagesMatch && req.method === "GET") {
    const sessionId = messagesMatch[1];
    const url = parseUrl(req.url || "/", true);
    const format = url.query.format as string || "chat";

    try {
      const session = await getSessionById(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      // Create temporary watcher to read all messages
      const watcher = new JsonlWatcher(sessionId, session.workingDirectory, { readFromStart: false });
      const messages = await watcher.readAllMessages();

      if (format === "terminal") {
        const terminalMessages = messages.map(toTerminalMessage);
        res.writeHead(200);
        res.end(JSON.stringify({ messages: terminalMessages, format: "terminal" }));
      } else {
        const chatMessages = messages.map(toChatMessage);
        res.writeHead(200);
        res.end(JSON.stringify({ messages: chatMessages, format: "chat" }));
      }
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Failed to load messages" }));
    }
    return;
  }

  // Send message to session (via tmux)
  const sendMatch = path.match(/^\/api\/session\/([^/]+)\/send$/);
  if (sendMatch && req.method === "POST") {
    const sessionId = sendMatch[1];

    try {
      const body = JSON.parse(await readBody()) as { text: string };

      if (!body.text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "text is required" }));
        return;
      }

      // Check if session exists in tmux
      const running = await isSessionRunning(sessionId);
      if (!running) {
        // Try to start it
        const session = await getSessionById(sessionId);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        // Start Claude in tmux
        await startTmuxSession(sessionId, session.workingDirectory);
        // Wait a moment for it to start
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Send input via tmux
      await sendTmuxInput(sessionId, body.text);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Failed to send message" }));
    }
    return;
  }

  // Send single key to session (via tmux)
  const keyMatch = path.match(/^\/api\/session\/([^/]+)\/key$/);
  if (keyMatch && req.method === "POST") {
    const sessionId = keyMatch[1];

    try {
      const body = JSON.parse(await readBody()) as { key: string };

      if (!body.key) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "key is required" }));
        return;
      }

      const running = await isSessionRunning(sessionId);
      if (!running) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Session not running in tmux" }));
        return;
      }

      await sendTmuxKey(sessionId, body.key);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Failed to send key" }));
    }
    return;
  }

  // Cancel current operation (Ctrl+C via tmux)
  const cancelMatch = path.match(/^\/api\/session\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === "POST") {
    const sessionId = cancelMatch[1];

    try {
      const running = await isSessionRunning(sessionId);
      if (!running) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Session not running in tmux" }));
        return;
      }

      await sendTmuxCancel(sessionId);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Failed to cancel" }));
    }
    return;
  }

  // Get tmux status
  if (path === "/api/tmux/status" && req.method === "GET") {
    try {
      const available = await isTmuxAvailable();
      const sessions = available ? await listTmuxSessions() : [];
      res.writeHead(200);
      res.end(JSON.stringify({ available, sessions }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Start session in tmux
  const startMatch = path.match(/^\/api\/session\/([^/]+)\/start$/);
  if (startMatch && req.method === "POST") {
    const sessionId = startMatch[1];

    try {
      const session = await getSessionById(sessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      const running = await isSessionRunning(sessionId);
      if (running) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, alreadyRunning: true }));
        return;
      }

      await startTmuxSession(sessionId, session.workingDirectory);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, alreadyRunning: false }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Failed to start session" }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
}

/**
 * Serve static files
 */
function serveStaticFile(path: string, res: ServerResponse): void {
  // Default to index.html
  if (path === "/" || path === "") {
    path = "/index.html";
  }

  const filePath = join(WEB_DIR, path);

  // Security: prevent directory traversal
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    // For SPA, return index.html for non-file paths
    const indexPath = join(WEB_DIR, "index.html");
    if (existsSync(indexPath) && !path.includes(".")) {
      res.setHeader("Content-Type", "text/html");
      res.writeHead(200);
      res.end(readFileSync(indexPath));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const content = readFileSync(filePath);
  const contentType = getContentType(path);

  res.setHeader("Content-Type", contentType);
  // Only cache static assets (not HTML/JS/CSS during development)
  const isStaticAsset = /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|svg)$/i.test(path);
  res.setHeader("Cache-Control", isStaticAsset ? "max-age=86400" : "no-cache, no-store, must-revalidate");
  res.writeHead(200);
  res.end(content);
}

/**
 * Get content type from file extension
 */
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Start Cloudflare Tunnel
 */
async function startTunnel(port: number): Promise<void> {
  console.log("[Tunnel] Starting Cloudflare Tunnel...");

  try {
    // Check if cloudflared is installed
    const which = spawn("which", ["cloudflared"]);
    const exitCode = await new Promise<number>((resolve) => {
      which.on("close", resolve);
    });

    if (exitCode !== 0) {
      console.log("[Tunnel] cloudflared not found. Install with:");
      console.log("  brew install cloudflared");
      console.log("\nOr manually from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n");
      return;
    }

    // Start quick tunnel
    const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`]);

    tunnel.stderr.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        console.log(`\n[Tunnel] Your public URL: ${match[0]}\n`);
        console.log("[Tunnel] Share this URL to access claudectl from anywhere!");
        console.log("[Tunnel] Note: This URL changes each time you restart.\n");
      }
    });
  } catch (err) {
    console.error("[Tunnel] Failed to start tunnel:", err);
  }
}

/**
 * Set the server password (CLI command)
 */
export async function setServerPassword(password: string): Promise<void> {
  await setPassword(password);
  console.log("[Auth] Password set successfully");
}

/**
 * Interactive password setup
 */
export async function interactivePasswordSetup(): Promise<void> {
  const prompts = await import("@clack/prompts");

  const password = await prompts.password({
    message: "Enter a password for remote access:",
  });

  if (prompts.isCancel(password)) {
    console.log("Cancelled");
    process.exit(0);
  }

  const confirm = await prompts.password({
    message: "Confirm password:",
  });

  if (prompts.isCancel(confirm)) {
    console.log("Cancelled");
    process.exit(0);
  }

  if (password !== confirm) {
    console.log("Passwords do not match");
    process.exit(1);
  }

  await setServerPassword(password as string);
}
