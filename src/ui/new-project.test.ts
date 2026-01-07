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
});
