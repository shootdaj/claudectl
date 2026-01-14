/**
 * claudectl serve - Web server for remote Claude Code access
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  authenticate,
  verifyToken,
  isPasswordSet,
  setPassword,
  savePushSubscription,
  getVapidKeys,
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
  isSessionActive,
  type WebSocketData,
} from "./session-manager";
import { getPublicVapidKey } from "./push";
import { discoverSessions } from "../core/sessions";

const WEB_DIR = join(import.meta.dir, "..", "web");

interface ServeOptions {
  port?: number;
  tunnel?: boolean;
}

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

  const server = Bun.serve<WebSocketData>({
    port,

    async fetch(req, server) {
      const url = new URL(req.url);
      const path = url.pathname;

      // CORS headers for API
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // API Routes
      if (path.startsWith("/api/")) {
        return handleApi(req, path, corsHeaders);
      }

      // WebSocket upgrade
      if (path.startsWith("/ws/")) {
        return handleWebSocketUpgrade(req, server, url);
      }

      // Static files (web client)
      return serveStaticFile(path);
    },

    websocket: {
      async open(ws) {
        const sessionId = ws.data.sessionId;
        console.log(`[WS] Client connected to session ${sessionId}`);

        // First ensure the managed session exists
        const managed = await getOrCreateManagedSession(sessionId);
        if (!managed) {
          console.log(`[WS] Session ${sessionId} not found`);
          ws.close(1008, "Session not found");
          return;
        }

        // Add this client to the session
        addClient(sessionId, ws);

        // Spawn PTY if not already active
        if (!managed.isActive) {
          spawnPty(managed);
        }
      },

      message(ws, message) {
        try {
          const data = JSON.parse(message.toString());
          const sessionId = ws.data.sessionId;

          switch (data.type) {
            case "input":
              sendInput(sessionId, data.data);
              break;

            case "resize":
              resizePty(sessionId, data.cols, data.rows);
              break;

            case "spawn":
              // Request to spawn/respawn PTY
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
      },

      close(ws) {
        const sessionId = ws.data.sessionId;
        removeClient(sessionId, ws);
      },
    },
  });

  console.log(`[Server] Server running at http://localhost:${port}`);
  console.log(`[Server] Open in browser or connect from mobile\n`);

  if (options.tunnel) {
    startTunnel(port);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    cleanup();
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Server] Shutting down...");
    cleanup();
    server.stop();
    process.exit(0);
  });
}

/**
 * Handle API requests
 */
async function handleApi(
  req: Request,
  path: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const jsonHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };

  // Auth endpoints (no token required)
  if (path === "/api/auth/login" && req.method === "POST") {
    console.log("[Auth] Login attempt received");
    try {
      const body = await req.json() as { password: string };
      console.log("[Auth] Password length:", body.password?.length || 0);
      const token = await authenticate(body.password);

      if (token) {
        console.log("[Auth] Login successful, token generated");
        return Response.json({ token, expiresIn: "7d" }, { headers: jsonHeaders });
      } else {
        console.log("[Auth] Login failed - invalid password");
        return Response.json(
          { error: "Invalid password" },
          { status: 401, headers: jsonHeaders }
        );
      }
    } catch (err) {
      console.log("[Auth] Login error:", err);
      return Response.json(
        { error: "Invalid request" },
        { status: 400, headers: jsonHeaders }
      );
    }
  }

  // Check if password is set
  if (path === "/api/auth/status") {
    return Response.json(
      { passwordSet: isPasswordSet() },
      { headers: jsonHeaders }
    );
  }

  // All other API endpoints require authentication
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || !verifyToken(token)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: jsonHeaders }
    );
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
        isActive: isSessionActive(s.id),  // PTY is running in server
      }));
      return Response.json({ sessions: sessionList }, { headers: jsonHeaders });
    } catch (err) {
      return Response.json(
        { error: "Failed to load sessions" },
        { status: 500, headers: jsonHeaders }
      );
    }
  }

  // VAPID public key for push subscriptions
  if (path === "/api/push/vapid-key") {
    return Response.json(
      { publicKey: getPublicVapidKey() },
      { headers: jsonHeaders }
    );
  }

  // Save push subscription
  if (path === "/api/push/subscribe" && req.method === "POST") {
    try {
      const subscription = await req.json() as PushSubscription;
      savePushSubscription(subscription);
      return Response.json({ success: true }, { headers: jsonHeaders });
    } catch (err) {
      return Response.json(
        { error: "Invalid subscription" },
        { status: 400, headers: jsonHeaders }
      );
    }
  }

  return Response.json(
    { error: "Not found" },
    { status: 404, headers: jsonHeaders }
  );
}

/**
 * Handle WebSocket upgrade requests
 */
function handleWebSocketUpgrade(
  req: Request,
  server: ReturnType<typeof Bun.serve>,
  url: URL
): Response | undefined {
  // Extract session ID from path: /ws/session/:id
  const match = url.pathname.match(/^\/ws\/session\/([^/]+)$/);
  if (!match) {
    return new Response("Invalid WebSocket path", { status: 400 });
  }

  const sessionId = match[1];

  // Check auth token from query param
  const token = url.searchParams.get("token");
  if (!token || !verifyToken(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Upgrade to WebSocket
  const success = server.upgrade(req, {
    data: {
      sessionId,
      authenticated: true,
    },
  });

  if (!success) {
    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  // Prepare the session (but don't spawn PTY yet)
  getOrCreateManagedSession(sessionId);

  return undefined; // Bun handles the response
}

/**
 * Serve static files from the web directory
 */
function serveStaticFile(path: string): Response {
  // Default to index.html
  if (path === "/" || path === "") {
    path = "/index.html";
  }

  const filePath = join(WEB_DIR, path);

  // Security: prevent directory traversal
  if (!filePath.startsWith(WEB_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    // For SPA, return index.html for non-file paths
    const indexPath = join(WEB_DIR, "index.html");
    if (existsSync(indexPath) && !path.includes(".")) {
      return new Response(readFileSync(indexPath), {
        headers: { "Content-Type": "text/html" },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  const content = readFileSync(filePath);
  const contentType = getContentType(path);

  return new Response(content, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": path.includes(".") ? "max-age=31536000" : "no-cache",
    },
  });
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
    const which = Bun.spawn(["which", "cloudflared"]);
    await which.exited;

    if (which.exitCode !== 0) {
      console.log("[Tunnel] cloudflared not found. Install with:");
      console.log("  brew install cloudflared");
      console.log("\nOr manually from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n");
      return;
    }

    // Start quick tunnel (no config required)
    const tunnel = Bun.spawn(["cloudflared", "tunnel", "--url", `http://localhost:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Parse tunnel URL from output
    const reader = tunnel.stderr.getReader();
    const decoder = new TextDecoder();

    const readOutput = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        // Look for the tunnel URL
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          console.log(`\n[Tunnel] Your public URL: ${match[0]}\n`);
          console.log("[Tunnel] Share this URL to access claudectl from anywhere!");
          console.log("[Tunnel] Note: This URL changes each time you restart.\n");
        }
      }
    };

    readOutput();
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
