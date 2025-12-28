import { existsSync } from "fs";

/**
 * Encode a filesystem path to Claude's directory name format.
 * /Users/anshul/Code → -Users-anshul-Code
 */
export function encodePath(path: string): string {
  return path.replace(/\//g, "-");
}

/**
 * Decode a Claude directory name back to a filesystem path.
 * Handles ambiguous cases where folder names contain hyphens by checking filesystem.
 * -Users-anshul-Code-research-hub → /Users/anshul/Code/research-hub
 */
export function decodePath(encoded: string): string {
  if (!encoded) return "";

  // Handle the leading hyphen which represents root /
  if (!encoded.startsWith("-")) {
    return encoded.replace(/-/g, "/");
  }

  // Remove leading hyphen
  const withoutLeading = encoded.slice(1);
  const parts = withoutLeading.split("-");

  // Try to find the actual path by testing which combinations exist
  return "/" + findValidPath(parts);
}

/**
 * Recursively find the valid path by testing filesystem existence.
 * This handles folder names that contain hyphens.
 */
function findValidPath(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // Try progressively longer first segments
  for (let i = 1; i <= parts.length; i++) {
    const firstPart = parts.slice(0, i).join("-");
    const testPath = "/" + firstPart;

    if (i === parts.length) {
      // Last iteration - no filesystem match found, join all with slashes
      return parts.join("/");
    }

    // Check if this path exists as a directory
    if (existsSync(testPath)) {
      const remaining = parts.slice(i);
      if (remaining.length === 0) {
        return firstPart;
      }
      // Recursively process remaining parts
      const rest = findValidPathFromBase(testPath, remaining);
      if (rest) {
        return firstPart + "/" + rest;
      }
    }
  }

  // Fallback: just join with slashes
  return parts.join("/");
}

/**
 * Find valid path starting from a known base directory.
 */
function findValidPathFromBase(base: string, parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // Try progressively longer first segments
  for (let i = 1; i <= parts.length; i++) {
    const firstPart = parts.slice(0, i).join("-");
    const testPath = base + "/" + firstPart;

    // Check if this path exists as a directory
    if (existsSync(testPath)) {
      const remaining = parts.slice(i);
      if (remaining.length === 0) {
        return firstPart;
      }
      const rest = findValidPathFromBase(testPath, remaining);
      if (rest) {
        return firstPart + "/" + rest;
      }
    }
  }

  // Fallback: just join with slashes (no hyphenated path found)
  return parts.join("/");
}

/**
 * Shorten a path for display by replacing home directory with ~
 */
export function shortenPath(path: string, homeDir?: string): string {
  const home = homeDir || process.env.HOME || "";
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}

/**
 * Get the basename of a path (last component)
 */
export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}
