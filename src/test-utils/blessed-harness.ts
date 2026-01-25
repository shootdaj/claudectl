/**
 * Test harness for blessed TUI testing using PassThrough streams
 */
import { PassThrough } from "stream";
import blessed from "blessed";
import { createScreen } from "../ui/create-screen";
import { Keys, type KeyName } from "./key-sequences";

export class BlessedHarness {
  public readonly input: PassThrough;
  public readonly output: PassThrough;
  public readonly screen: blessed.Widgets.Screen;
  private outputBuffer: string = "";

  constructor(cols = 120, rows = 30) {
    this.input = new PassThrough();
    this.output = new PassThrough();

    // Capture all output to buffer
    this.output.on("data", (chunk) => {
      this.outputBuffer += chunk.toString();
    });

    this.screen = createScreen({
      input: this.input,
      output: this.output,
      cols,
      rows,
    });
  }

  /**
   * Send a single keystroke to the input stream
   */
  sendKey(key: KeyName | string): void {
    const sequence = Keys[key as KeyName] ?? key;
    this.input.write(sequence);
  }

  /**
   * Type a string character by character
   */
  type(text: string): void {
    for (const char of text) {
      this.input.write(char);
    }
  }

  /**
   * Get the raw output buffer (contains ANSI escape codes)
   */
  getOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Clear the output buffer
   */
  clearOutput(): void {
    this.outputBuffer = "";
  }

  /**
   * Wait for specific text to appear in output
   * @param text Text to wait for
   * @param timeout Maximum time to wait in ms
   * @returns true if text found, false if timeout
   */
  async waitForText(text: string, timeout = 2000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.outputBuffer.includes(text)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  /**
   * Wait for render cycle to complete
   */
  async waitForRender(ms = 100): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    this.screen.render();
  }

  /**
   * Get a focused element (useful for checking what's active)
   */
  getFocused(): blessed.Widgets.Node | undefined {
    return this.screen.focused;
  }

  /**
   * Get all children of the screen
   */
  getChildren(): blessed.Widgets.Node[] {
    return this.screen.children;
  }

  /**
   * Find a widget by type
   */
  findByType<T extends blessed.Widgets.Node>(
    type: string
  ): T | undefined {
    const find = (node: blessed.Widgets.Node): T | undefined => {
      if (node.type === type) return node as T;
      for (const child of node.children || []) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    };
    return find(this.screen);
  }

  /**
   * Destroy the screen and clean up
   */
  destroy(): void {
    this.screen.destroy();
  }
}
