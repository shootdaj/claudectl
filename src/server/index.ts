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
  sendInput,
  resizePty,
  addClient,
  removeClient,
  cleanup,
} from "./session-manager";
import { getPublicVapidKey } from "./push";
import { discoverSessions } from "../core/sessions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = join(__dirname, "..", "web");

interface ServeOptions {
  port?: number;
  tunnel?: boolean;
}

// Store WebSocket session associations
const wsSessionMap = new WeakMap<WebSocket, string>();

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

    // Extract session ID from path: /ws/session/:id
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
            const success = sendInput(sessionId, data.data);
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
  res.setHeader("Cache-Control", path.includes(".") ? "max-age=31536000" : "no-cache");
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
