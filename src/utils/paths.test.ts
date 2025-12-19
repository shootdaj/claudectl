import { describe, test, expect } from "bun:test";
import { encodePath, decodePath, shortenPath, basename } from "./paths";

describe("paths", () => {
  describe("encodePath", () => {
    test("encodes root path", () => {
      expect(encodePath("/")).toBe("-");
    });

    test("encodes absolute path", () => {
      expect(encodePath("/Users/anshul/Code")).toBe("-Users-anshul-Code");
    });

    test("encodes deeply nested path", () => {
      expect(encodePath("/Users/anshul/Anshul/Code/project"))
        .toBe("-Users-anshul-Anshul-Code-project");
    });

    test("handles path with no leading slash", () => {
      expect(encodePath("relative/path")).toBe("relative-path");
    });
  });

  describe("decodePath", () => {
    test("decodes to root path", () => {
      expect(decodePath("-")).toBe("/");
    });

    test("decodes absolute path", () => {
      expect(decodePath("-Users-anshul-Code")).toBe("/Users/anshul/Code");
    });

    test("decodes deeply nested path", () => {
      expect(decodePath("-Users-anshul-Anshul-Code-project"))
        .toBe("/Users/anshul/Anshul/Code/project");
    });

    test("handles empty string", () => {
      expect(decodePath("")).toBe("");
    });

    test("roundtrip: encode then decode", () => {
      const original = "/Users/anshul/Anshul/Code/myproject";
      expect(decodePath(encodePath(original))).toBe(original);
    });
  });

  describe("shortenPath", () => {
    test("replaces home directory with ~", () => {
      expect(shortenPath("/Users/anshul/Code", "/Users/anshul"))
        .toBe("~/Code");
    });

    test("leaves non-home paths unchanged", () => {
      expect(shortenPath("/var/log", "/Users/anshul"))
        .toBe("/var/log");
    });

    test("handles exact home path", () => {
      expect(shortenPath("/Users/anshul", "/Users/anshul"))
        .toBe("~");
    });
  });

  describe("basename", () => {
    test("returns last path component", () => {
      expect(basename("/Users/anshul/Code/project")).toBe("project");
    });

    test("handles trailing slash", () => {
      expect(basename("/Users/anshul/Code/")).toBe("Code");
    });

    test("handles single component", () => {
      expect(basename("/root")).toBe("root");
    });

    test("handles empty path", () => {
      expect(basename("")).toBe("");
    });
  });
});
