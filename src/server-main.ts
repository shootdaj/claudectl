#!/usr/bin/env node
/**
 * Dedicated entry point for the claudectl server
 * This avoids loading the TUI components that have Node.js ESM issues
 */

import { startServer, setServerPassword, interactivePasswordSetup } from "./server/index";

const args = process.argv.slice(2);

async function main() {
  const command = args[0];

  if (command === "auth" && args[1] === "set") {
    // Interactive password setup
    await interactivePasswordSetup();
    process.exit(0);
  }

  if (command === "auth" && args[1] === "set-password") {
    const password = args[2];
    if (!password) {
      console.error("Usage: claudectl-server auth set-password <password>");
      process.exit(1);
    }
    await setServerPassword(password);
    process.exit(0);
  }

  // Default: start server
  const port = parseInt(args.find(a => a.startsWith("--port="))?.split("=")[1] || "3847");
  const tunnel = args.includes("--tunnel");

  await startServer({ port, tunnel });
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
