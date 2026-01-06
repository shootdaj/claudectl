import { describe, test, expect } from "bun:test";
import {
  formatTokens,
  formatModelName,
  getTitleWidth,
  getMarqueeText,
  truncateWithEllipsis,
  formatCost,
  formatBytes,
} from "./format";

describe("format", () => {
  describe("formatTokens", () => {
    test("formats zero", () => {
      expect(formatTokens(0)).toBe("0");
    });

    test("formats small numbers as-is", () => {
      expect(formatTokens(1)).toBe("1");
      expect(formatTokens(100)).toBe("100");
      expect(formatTokens(999)).toBe("999");
    });

    test("formats thousands with K suffix", () => {
      expect(formatTokens(1000)).toBe("1K");
      expect(formatTokens(1500)).toBe("2K");
      expect(formatTokens(10000)).toBe("10K");
      expect(formatTokens(999999)).toBe("1000K");
    });

    test("formats millions with M suffix", () => {
      expect(formatTokens(1000000)).toBe("1M");
      expect(formatTokens(1500000)).toBe("2M");
      expect(formatTokens(10000000)).toBe("10M");
    });
  });

  describe("formatModelName", () => {
    test("returns dash for undefined", () => {
      expect(formatModelName(undefined)).toBe("—");
      expect(formatModelName()).toBe("—");
    });

    test("returns dash for empty string", () => {
      expect(formatModelName("")).toBe("—");
    });

    test("formats opus models", () => {
      expect(formatModelName("claude-opus-4-5-20251101")).toBe("opus");
      expect(formatModelName("opus")).toBe("opus");
    });

    test("formats sonnet models", () => {
      expect(formatModelName("claude-sonnet-4-20250514")).toBe("son");
      expect(formatModelName("claude-3-5-sonnet-20241022")).toBe("son");
    });

    test("formats haiku models", () => {
      expect(formatModelName("claude-3-5-haiku-20241022")).toBe("hai");
      expect(formatModelName("haiku")).toBe("hai");
    });

    test("truncates unknown models", () => {
      expect(formatModelName("custom-model")).toBe("cust");
      expect(formatModelName("gpt-4")).toBe("gpt-");
    });
  });

  describe("getTitleWidth", () => {
    test("calculates width from terminal width", () => {
      expect(getTitleWidth(120)).toBe(66); // 120 - 54 reserved
      expect(getTitleWidth(80)).toBe(26);  // 80 - 54 reserved
    });

    test("has minimum width of 20", () => {
      expect(getTitleWidth(50)).toBe(20);
      expect(getTitleWidth(0)).toBe(20);
    });
  });

  describe("getMarqueeText", () => {
    test("returns full text when shorter than width", () => {
      const text = "Hello";
      const result = getMarqueeText(text, 20, 0);
      expect(result.startsWith("Hello")).toBe(true);
    });

    test("scrolls text based on offset", () => {
      const text = "ABCDE";
      expect(getMarqueeText(text, 5, 0)).toBe("ABCDE");
      expect(getMarqueeText(text, 5, 1)).toBe("BCDE ");
      expect(getMarqueeText(text, 5, 2)).toBe("CDE  ");
    });

    test("wraps around for long offsets", () => {
      const text = "ABC";
      const padding = "     ";
      const fullText = text + padding; // "ABC     "
      // offset 8 = same as offset 0 (length is 8)
      expect(getMarqueeText(text, 3, 0)).toBe(getMarqueeText(text, 3, 8));
    });
  });

  describe("truncateWithEllipsis", () => {
    test("returns text unchanged when shorter than max", () => {
      expect(truncateWithEllipsis("Hello", 10)).toBe("Hello");
      expect(truncateWithEllipsis("Hello", 5)).toBe("Hello");
    });

    test("truncates and adds ellipsis when too long", () => {
      expect(truncateWithEllipsis("Hello World", 8)).toBe("Hello W…");
      expect(truncateWithEllipsis("Hello World", 6)).toBe("Hello…");
    });

    test("handles edge cases", () => {
      expect(truncateWithEllipsis("", 5)).toBe("");
      expect(truncateWithEllipsis("A", 1)).toBe("A");
      expect(truncateWithEllipsis("AB", 1)).toBe("…");
    });
  });

  describe("formatCost", () => {
    test("formats zero", () => {
      expect(formatCost(0)).toBe("$0");
    });

    test("formats small costs with 4 decimal places", () => {
      expect(formatCost(0.001)).toBe("$0.0010");
      expect(formatCost(0.0099)).toBe("$0.0099");
    });

    test("formats cents with 2 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.01");
      expect(formatCost(0.50)).toBe("$0.50");
      expect(formatCost(0.99)).toBe("$0.99");
    });

    test("formats dollars with 2 decimal places", () => {
      expect(formatCost(1)).toBe("$1.00");
      expect(formatCost(10.5)).toBe("$10.50");
      expect(formatCost(100)).toBe("$100.00");
    });
  });

  describe("formatBytes", () => {
    test("formats zero bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    test("formats bytes", () => {
      expect(formatBytes(100)).toBe("100 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    test("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
    });

    test("formats megabytes", () => {
      expect(formatBytes(1048576)).toBe("1.0 MB");
      expect(formatBytes(5242880)).toBe("5.0 MB");
    });

    test("formats gigabytes", () => {
      expect(formatBytes(1073741824)).toBe("1.0 GB");
    });
  });
});
