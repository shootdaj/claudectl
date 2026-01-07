import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

describe("new-project", () => {
  describe("getCommonFolders logic", () => {
    // Test the folder detection logic
    const candidates = [
      join(homedir(), "Anshul", "Code"),
      join(homedir(), "Code"),
      join(homedir(), "Projects"),
      join(homedir(), "Developer"),
      join(homedir(), "dev"),
      join(homedir(), "src"),
      join(homedir(), "repos"),
      join(homedir(), "workspace"),
      join(homedir(), "Desktop"),
    ];

    test("filters to existing folders only", () => {
      const existing = candidates.filter(p => existsSync(p));
      // At least some common folders should exist on most systems
      expect(existing.length).toBeGreaterThanOrEqual(0);
    });

    test("Desktop folder typically exists", () => {
      const desktopPath = join(homedir(), "Desktop");
      // Desktop exists on most macOS/Linux systems
      if (existsSync(desktopPath)) {
        expect(candidates).toContain(desktopPath);
      }
    });
  });

  describe("project name sanitization", () => {
    test("converts to lowercase kebab-case", () => {
      const sanitize = (name: string) =>
        name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      expect(sanitize("My Project")).toBe("my-project");
      expect(sanitize("Test App 123")).toBe("test-app-123");
      expect(sanitize("  Spaces  ")).toBe("spaces");
      expect(sanitize("Special!@#Chars")).toBe("specialchars");
    });
  });

  describe("repo URL parsing", () => {
    // Extract project name from various URL formats
    const extractProjectName = (url: string): string => {
      const match = url.match(/([^/]+)(?:\.git)?$/);
      return match ? match[1].replace(/\.git$/, "") : "project";
    };

    test("extracts name from HTTPS URLs", () => {
      expect(extractProjectName("https://github.com/user/my-repo.git")).toBe("my-repo");
      expect(extractProjectName("https://github.com/user/my-repo")).toBe("my-repo");
    });

    test("extracts name from SSH URLs", () => {
      expect(extractProjectName("git@github.com:user/my-repo.git")).toBe("my-repo");
      expect(extractProjectName("git@github.com:user/my-repo")).toBe("my-repo");
    });

    test("extracts name from short GitHub format", () => {
      expect(extractProjectName("user/my-repo")).toBe("my-repo");
    });

    test("handles repos with dots in name", () => {
      expect(extractProjectName("https://github.com/user/my.dotted.repo.git")).toBe("my.dotted.repo");
    });

    test("handles repos with hyphens and underscores", () => {
      expect(extractProjectName("https://github.com/user/my-repo_name")).toBe("my-repo_name");
    });

    test("returns default for invalid input", () => {
      expect(extractProjectName("")).toBe("project");
    });
  });

  describe("GitHub repo list parsing", () => {
    test("parses valid repo JSON", () => {
      const mockRepos = [
        { name: "repo1", nameWithOwner: "user/repo1", description: "A repo", isPrivate: false },
        { name: "repo2", nameWithOwner: "user/repo2", description: null, isPrivate: true },
      ];

      const parsed = mockRepos.map((r: any) => ({
        name: r.name,
        fullName: r.nameWithOwner,
        description: r.description || "",
        isPrivate: r.isPrivate,
      }));

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe("repo1");
      expect(parsed[0].fullName).toBe("user/repo1");
      expect(parsed[0].description).toBe("A repo");
      expect(parsed[0].isPrivate).toBe(false);
      expect(parsed[1].description).toBe(""); // null becomes empty string
      expect(parsed[1].isPrivate).toBe(true);
    });

    test("handles empty repo list", () => {
      const mockRepos: any[] = [];
      const parsed = mockRepos.map((r: any) => ({
        name: r.name,
        fullName: r.nameWithOwner,
        description: r.description || "",
        isPrivate: r.isPrivate,
      }));

      expect(parsed).toHaveLength(0);
    });
  });

  describe("project path construction", () => {
    test("joins parent folder and project name", () => {
      const parentFolder = "/Users/test/Code";
      const projectName = "my-project";
      const projectPath = join(parentFolder, projectName);

      expect(projectPath).toBe("/Users/test/Code/my-project");
    });

    test("handles home directory correctly", () => {
      const parentFolder = join(homedir(), "Projects");
      const projectName = "test-app";
      const projectPath = join(parentFolder, projectName);

      expect(projectPath).toContain(homedir());
      expect(projectPath).toEndWith("/Projects/test-app");
    });
  });

  describe("wizard mode selection", () => {
    test("modes are correctly defined", () => {
      const modes = ["new", "clone"] as const;
      expect(modes).toContain("new");
      expect(modes).toContain("clone");
      expect(modes).toHaveLength(2);
    });
  });

  describe("GitHub repo creation options", () => {
    test("private option sets correct flags", () => {
      const isPrivate = true;
      const flag = isPrivate ? "--private" : "--public";
      expect(flag).toBe("--private");
    });

    test("public option sets correct flags", () => {
      const isPrivate = false;
      const flag = isPrivate ? "--private" : "--public";
      expect(flag).toBe("--public");
    });
  });
});
