import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  isStdioServer,
  isHttpServer,
  getServerType,
  getServerDisplay,
  loadProjectMcpConfig,
  getProjectMcpServers,
  type MCPServer,
  type MCPServerStdio,
  type MCPServerHTTP,
} from "./mcp";

describe("mcp", () => {
  describe("isStdioServer", () => {
    test("returns true for stdio server", () => {
      const server: MCPServerStdio = { command: "node", args: ["server.js"] };
      expect(isStdioServer(server)).toBe(true);
    });

    test("returns false for HTTP server", () => {
      const server: MCPServerHTTP = { url: "http://localhost:3000" };
      expect(isStdioServer(server)).toBe(false);
    });
  });

  describe("isHttpServer", () => {
    test("returns true for HTTP server", () => {
      const server: MCPServerHTTP = { url: "http://localhost:3000" };
      expect(isHttpServer(server)).toBe(true);
    });

    test("returns false for stdio server", () => {
      const server: MCPServerStdio = { command: "node" };
      expect(isHttpServer(server)).toBe(false);
    });
  });

  describe("getServerType", () => {
    test("returns stdio for stdio server", () => {
      const server: MCPServerStdio = { command: "python", args: ["-m", "mcp"] };
      expect(getServerType(server)).toBe("stdio");
    });

    test("returns http for HTTP server", () => {
      const server: MCPServerHTTP = { url: "https://api.example.com/mcp" };
      expect(getServerType(server)).toBe("http");
    });
  });

  describe("getServerDisplay", () => {
    test("displays stdio server with command and args", () => {
      const server: MCPServerStdio = { command: "node", args: ["server.js", "--port", "3000"] };
      expect(getServerDisplay(server)).toBe("node server.js --port 3000");
    });

    test("displays stdio server with command only", () => {
      const server: MCPServerStdio = { command: "my-mcp-server" };
      expect(getServerDisplay(server)).toBe("my-mcp-server");
    });

    test("displays HTTP server URL", () => {
      const server: MCPServerHTTP = { url: "http://localhost:8080/mcp" };
      expect(getServerDisplay(server)).toBe("http://localhost:8080/mcp");
    });
  });

  describe("loadProjectMcpConfig", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "mcp-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    test("returns empty mcpServers for non-existent file", async () => {
      const config = await loadProjectMcpConfig(tempDir);
      expect(config.mcpServers).toEqual({});
    });

    test("returns empty mcpServers for invalid JSON", async () => {
      await writeFile(join(tempDir, ".mcp.json"), "not valid json");
      const config = await loadProjectMcpConfig(tempDir);
      expect(config.mcpServers).toEqual({});
    });

    test("loads valid .mcp.json file", async () => {
      const mcpConfig = {
        mcpServers: {
          "my-server": { command: "node", args: ["server.js"] },
        },
      };
      await writeFile(join(tempDir, ".mcp.json"), JSON.stringify(mcpConfig));

      const config = await loadProjectMcpConfig(tempDir);
      expect(config.mcpServers).toEqual(mcpConfig.mcpServers);
    });
  });

  describe("getProjectMcpServers", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "mcp-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    test("returns empty object for non-existent file", async () => {
      const servers = await getProjectMcpServers(tempDir);
      expect(servers).toEqual({});
    });

    test("returns servers from .mcp.json", async () => {
      const mcpConfig = {
        mcpServers: {
          server1: { command: "cmd1" },
          server2: { url: "http://test" },
        },
      };
      await writeFile(join(tempDir, ".mcp.json"), JSON.stringify(mcpConfig));

      const servers = await getProjectMcpServers(tempDir);
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers.server1).toEqual({ command: "cmd1" });
      expect(servers.server2).toEqual({ url: "http://test" });
    });

    test("returns empty object for config without mcpServers", async () => {
      await writeFile(join(tempDir, ".mcp.json"), JSON.stringify({ other: "data" }));
      const servers = await getProjectMcpServers(tempDir);
      expect(servers).toEqual({});
    });
  });
});
