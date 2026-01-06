/**
 * Format utilities for displaying data in the UI
 */

/**
 * Format token count for compact display
 * - Under 1K: show raw number
 * - 1K-999K: show with K suffix
 * - 1M+: show with M suffix
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return String(tokens);
}

/**
 * Format model name for compact display
 * - opus models -> "opus"
 * - sonnet models -> "son"
 * - haiku models -> "hai"
 * - other -> first 4 chars
 * - undefined -> "—"
 */
export function formatModelName(model?: string): string {
  if (!model) return "—";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "son";
  if (model.includes("haiku")) return "hai";
  return model.slice(0, 4);
}

/**
 * Calculate available width for session title column
 * Based on terminal width minus fixed columns
 */
export function getTitleWidth(terminalWidth?: number): number {
  const termWidth = terminalWidth ?? process.stdout.columns ?? 120;
  // Reserved: project(18) + time(8) + msgs(5) + tokens(6) + model(5) + spacing(8) + margins(4)
  const reserved = 18 + 8 + 5 + 6 + 5 + 8 + 4;
  return Math.max(20, termWidth - reserved);
}

/**
 * Get marquee text for scrolling animation
 * @param text Full text to scroll
 * @param maxWidth Visible width
 * @param offset Current scroll offset
 */
export function getMarqueeText(text: string, maxWidth: number, offset: number): string {
  const padding = "     ";
  const scrollText = text + padding;
  const start = offset % scrollText.length;
  let visible = "";
  for (let i = 0; i < maxWidth; i++) {
    visible += scrollText[(start + i) % scrollText.length];
  }
  return visible;
}

/**
 * Truncate text with ellipsis
 */
export function truncateWithEllipsis(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Format cost in USD for display
 * - Under $0.01: show 4 decimal places
 * - Under $1: show 2 decimal places
 * - $1+: show 2 decimal places with $ prefix
 */
export function formatCost(costUSD: number): string {
  if (costUSD === 0) return "$0";
  if (costUSD < 0.01) return `$${costUSD.toFixed(4)}`;
  if (costUSD < 1) return `$${costUSD.toFixed(2)}`;
  return `$${costUSD.toFixed(2)}`;
}

/**
 * Format byte size for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}
