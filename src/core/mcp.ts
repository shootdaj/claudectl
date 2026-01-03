import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ============================================
// Types
// ============================================

export interface MCPServerStdio {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPServerHTTP {
  url: string;
  env?: Record<string, string>;
}

export type MCPServer = MCPServerStdio | MCPServerHTTP;

export type MCPScope = "user" | "local" | "project";

export interface MCPServerWithMeta {
  name: string;
  server: MCPServer;
  scope: MCPScope;
  projectPath?: string;
}

// ============================================
// Config Paths
// ============================================

function getGlobalConfigPath(): string {
  return join(homedir(), ".claude.json");
}

function getProjectMcpPath(projectDir: string): string {
  return join(projectDir, ".mcp.json");
}

// ============================================
// Read Operations
// ============================================

/**
 * Load the global Claude config file (~/.claude.json)
 */
export async function loadGlobalConfig(): Promise<Record<string, any>> {
  const path = getGlobalConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const text = await Bun.file(path).text();
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Load a project's .mcp.json file
 */
export async function loadProjectMcpConfig(projectDir: string): Promise<{ mcpServers: Record<string, MCPServer> }> {
  const path = getProjectMcpPath(projectDir);
  if (!existsSync(path)) {
    return { mcpServers: {} };
  }
  try {
    const text = await Bun.file(path).text();
    return JSON.parse(text);
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Get user-scope MCP servers (top-level in ~/.claude.json)
 */
export async function getUserMcpServers(): Promise<Record<string, MCPServer>> {
  const config = await loadGlobalConfig();
  return config.mcpServers || {};
}

/**
 * Get local-scope MCP servers (project-specific in ~/.claude.json)
 */
export async function getLocalMcpServers(projectDir: string): Promise<Record<string, MCPServer>> {
  const config = await loadGlobalConfig();
  // Local scope servers are stored under the project path key
  const projectConfig = config[projectDir];
  if (projectConfig && projectConfig.mcpServers) {
    return projectConfig.mcpServers;
  }
  return {};
}

/**
 * Get project-scope MCP servers (from .mcp.json)
 */
export async function getProjectMcpServers(projectDir: string): Promise<Record<string, MCPServer>> {
  const config = await loadProjectMcpConfig(projectDir);
  return config.mcpServers || {};
}

/**
 * Get all MCP servers across all scopes with metadata
 */
export async function getAllMcpServers(projectDir?: string): Promise<MCPServerWithMeta[]> {
  const servers: MCPServerWithMeta[] = [];

  // User scope servers (top-level in ~/.claude.json)
  const userServers = await getUserMcpServers();
  for (const [name, server] of Object.entries(userServers)) {
    servers.push({ name, server, scope: "user" });
  }

  if (projectDir) {
    // Local scope servers (project-specific in ~/.claude.json)
    const localServers = await getLocalMcpServers(projectDir);
    for (const [name, server] of Object.entries(localServers)) {
      servers.push({ name, server, scope: "local", projectPath: projectDir });
    }

    // Project scope servers (from .mcp.json)
    const projectServers = await getProjectMcpServers(projectDir);
    for (const [name, server] of Object.entries(projectServers)) {
      servers.push({ name, server, scope: "project", projectPath: projectDir });
    }
  }

  return servers;
}

/**
 * Get all MCP servers from ALL projects in ~/.claude.json
 * Useful for showing a global view of all configured servers
 */
export async function getAllMcpServersGlobal(): Promise<MCPServerWithMeta[]> {
  const servers: MCPServerWithMeta[] = [];
  const config = await loadGlobalConfig();

  // User scope servers
  if (config.mcpServers) {
    for (const [name, server] of Object.entries(config.mcpServers as Record<string, MCPServer>)) {
      servers.push({ name, server, scope: "user" });
    }
  }

  // Local scope servers from all projects
  for (const [key, value] of Object.entries(config)) {
    // Project paths start with /
    if (key.startsWith("/") && typeof value === "object" && value !== null) {
      const projectConfig = value as Record<string, any>;
      if (projectConfig.mcpServers) {
        for (const [name, server] of Object.entries(projectConfig.mcpServers as Record<string, MCPServer>)) {
          servers.push({ name, server, scope: "local", projectPath: key });
        }
      }
    }
  }

  return servers;
}

// ============================================
// Write Operations
// ============================================

/**
 * Save the global Claude config
 */
export async function saveGlobalConfig(config: Record<string, any>): Promise<void> {
  const path = getGlobalConfigPath();
  await Bun.write(path, JSON.stringify(config, null, 2));
}

/**
 * Save a project's .mcp.json
 */
export async function saveProjectMcpConfig(
  projectDir: string,
  config: { mcpServers: Record<string, MCPServer> }
): Promise<void> {
  const path = getProjectMcpPath(projectDir);
  await Bun.write(path, JSON.stringify(config, null, 2));
}

/**
 * Add or update a user-scope MCP server (top-level in ~/.claude.json)
 */
export async function setUserMcpServer(name: string, server: MCPServer): Promise<void> {
  const config = await loadGlobalConfig();
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  config.mcpServers[name] = server;
  await saveGlobalConfig(config);
}

/**
 * Add or update a local-scope MCP server (project-specific in ~/.claude.json)
 */
export async function setLocalMcpServer(
  projectDir: string,
  name: string,
  server: MCPServer
): Promise<void> {
  const config = await loadGlobalConfig();
  if (!config[projectDir]) {
    config[projectDir] = {};
  }
  if (!config[projectDir].mcpServers) {
    config[projectDir].mcpServers = {};
  }
  config[projectDir].mcpServers[name] = server;
  await saveGlobalConfig(config);
}

/**
 * Add or update a project-scope MCP server (in .mcp.json)
 */
export async function setProjectMcpServer(
  projectDir: string,
  name: string,
  server: MCPServer
): Promise<void> {
  const config = await loadProjectMcpConfig(projectDir);
  config.mcpServers[name] = server;
  await saveProjectMcpConfig(projectDir, config);
}

/**
 * Remove a user-scope MCP server
 */
export async function removeUserMcpServer(name: string): Promise<boolean> {
  const config = await loadGlobalConfig();
  if (!config.mcpServers || !config.mcpServers[name]) {
    return false;
  }
  delete config.mcpServers[name];
  await saveGlobalConfig(config);
  return true;
}

/**
 * Remove a local-scope MCP server
 */
export async function removeLocalMcpServer(projectDir: string, name: string): Promise<boolean> {
  const config = await loadGlobalConfig();
  if (!config[projectDir]?.mcpServers?.[name]) {
    return false;
  }
  delete config[projectDir].mcpServers[name];
  await saveGlobalConfig(config);
  return true;
}

/**
 * Remove a project-scope MCP server
 */
export async function removeProjectMcpServer(projectDir: string, name: string): Promise<boolean> {
  const config = await loadProjectMcpConfig(projectDir);
  if (!config.mcpServers[name]) {
    return false;
  }
  delete config.mcpServers[name];
  await saveProjectMcpConfig(projectDir, config);
  return true;
}

// ============================================
// Helpers
// ============================================

/**
 * Check if a server is stdio type
 */
export function isStdioServer(server: MCPServer): server is MCPServerStdio {
  return "command" in server;
}

/**
 * Check if a server is HTTP type
 */
export function isHttpServer(server: MCPServer): server is MCPServerHTTP {
  return "url" in server;
}

/**
 * Get server type string
 */
export function getServerType(server: MCPServer): "stdio" | "http" {
  return isStdioServer(server) ? "stdio" : "http";
}

/**
 * Get a display string for a server
 */
export function getServerDisplay(server: MCPServer): string {
  if (isStdioServer(server)) {
    const args = server.args?.join(" ") || "";
    return `${server.command} ${args}`.trim();
  }
  return server.url;
}

/**
 * Discover all projects with .mcp.json files
 */
export async function discoverProjectsWithMcp(projectsDir: string): Promise<string[]> {
  const { readdir } = await import("fs/promises");
  const projects: string[] = [];

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const mcpPath = join(projectsDir, entry.name, ".mcp.json");
        if (existsSync(mcpPath)) {
          projects.push(join(projectsDir, entry.name));
        }
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return projects;
}
