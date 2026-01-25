/**
 * Screen factory with dependency injection support for testing
 */
import blessed from "blessed";
import type { Readable, Writable } from "stream";

export interface ScreenOptions {
  /** Custom input stream (for testing) */
  input?: Readable;
  /** Custom output stream (for testing) */
  output?: Writable;
  /** Fixed column width (for testing) */
  cols?: number;
  /** Fixed row height (for testing) */
  rows?: number;
  /** Screen title */
  title?: string;
}

/**
 * Create a blessed screen with optional custom streams for testing.
 * In production, uses process.stdin/stdout.
 * In tests, accepts PassThrough streams for deterministic testing.
 */
export function createScreen(
  options: ScreenOptions = {}
): blessed.Widgets.Screen {
  // Note: @types/blessed has input/output types swapped (bug), so we cast
  return blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    terminal: "xterm-256color",
    title: options.title ?? "claudectl",
    // Use provided streams or default to process stdin/stdout
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    // Fixed size for tests, auto-detect for production
    cols: options.cols,
    rows: options.rows,
  } as blessed.Widgets.IScreenOptions);
}
