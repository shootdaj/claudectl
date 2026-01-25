/**
 * Screen assertion helpers for TUI testing
 */
import { expect } from "bun:test";
import type { BlessedHarness } from "./blessed-harness";

/**
 * Fluent assertions for screen output
 */
export function expectOutput(harness: BlessedHarness) {
  const output = harness.getOutput();

  return {
    /**
     * Assert output contains text
     */
    toContain(text: string) {
      expect(output).toContain(text);
      return this;
    },

    /**
     * Assert output does not contain text
     */
    toNotContain(text: string) {
      expect(output).not.toContain(text);
      return this;
    },

    /**
     * Wait for text to appear, then assert
     */
    async toEventuallyContain(text: string, timeout = 2000) {
      const found = await harness.waitForText(text, timeout);
      expect(found).toBe(true);
      return this;
    },

    /**
     * Assert output matches regex pattern
     */
    toMatch(pattern: RegExp) {
      expect(output).toMatch(pattern);
      return this;
    },

    /**
     * Assert output length is at least n characters
     */
    toHaveMinLength(n: number) {
      expect(output.length).toBeGreaterThanOrEqual(n);
      return this;
    },
  };
}

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Get visible text from output (strips ANSI codes)
 */
export function getVisibleText(harness: BlessedHarness): string {
  return stripAnsi(harness.getOutput());
}
