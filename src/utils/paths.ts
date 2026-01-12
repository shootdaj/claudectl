import { existsSync } from "fs";
import { homedir } from "os";
import { sep, join } from "path";

// Platform detection
const isWindows = process.platform === "win32";

/**
 * Normalize path separators to forward slashes (for encoding/storage)
 */
function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Convert to platform-native separators
 */
function toPlatformPath(path: string): string {
  if (isWindows) {
    return path.replace(/\//g, "\\");
  }
  return path;
}

/**
 * Encode a filesystem path to Claude's directory name format.
 * /Users/anshul/Code → -Users-anshul-Code
 * C:\Users\anshul\Code → C--Users-anshul-Code (Windows)
 */
export function encodePath(path: string): string {
  // Normalize to forward slashes first
  const normalized = normalizeSeparators(path);

  // Handle Windows drive letters: C:/ → C-
  if (isWindows && /^[A-Za-z]:/.test(normalized)) {
    const drive = normalized[0];
    const rest = normalized.slice(2); // Remove "C:"
    return drive + rest.replace(/\//g, "-");
  }

  return normalized.replace(/\//g, "-");
}

/**
 * Decode a Claude directory name back to a filesystem path.
 * Handles ambiguous cases where folder names contain hyphens by checking filesystem.
 * -Users-anshul-Code-research-hub → /Users/anshul/Code/research-hub
 * C--Users-anshul-Code → C:\Users\anshul\Code (Windows)
 */
export function decodePath(encoded: string): string {
  if (!encoded) return "";

  // Handle Windows drive letter encoding: C--Users → C:\Users
  if (/^[A-Za-z]-/.test(encoded)) {
    const drive = encoded[0];
    const rest = encoded.slice(1); // Remove drive letter, keep leading hyphen
    const parts = rest.slice(1).split("-").filter(Boolean); // Remove leading hyphen, split, filter empty
    const resolved = findValidPathWindows(drive, parts);
    return toPlatformPath(resolved);
  }

  // Handle Unix paths (starts with -)
  if (!encoded.startsWith("-")) {
    return encoded.replace(/-/g, "/");
  }

  // Remove leading hyphen
  const withoutLeading = encoded.slice(1);
  const parts = withoutLeading.split("-").filter(Boolean); // Filter empty strings from double hyphens

  // Try to find the actual path by testing which combinations exist
  const result = "/" + findValidPath(parts);

  // Normalize any remaining double slashes
  return result.replace(/\/+/g, "/");
}

/**
 * Find valid path on Windows starting from a drive letter
 */
function findValidPathWindows(drive: string, parts: string[]): string {
  if (parts.length === 0) return `${drive}:/`;

  const base = `${drive}:/`;
  const result = findValidPathFromBase(base, parts);
  return base + result;
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

  // Normalize base path for testing
  const normalizedBase = normalizeSeparators(base);

  // Try progressively longer first segments
  for (let i = 1; i <= parts.length; i++) {
    const firstPart = parts.slice(0, i).join("-");
    const testPath = normalizedBase + "/" + firstPart;

    // Check if this path exists as a directory
    if (existsSync(testPath) || existsSync(toPlatformPath(testPath))) {
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
  const home = homeDir || homedir();
  // Normalize both paths for comparison
  const normalizedPath = normalizeSeparators(path);
  const normalizedHome = normalizeSeparators(home);

  if (normalizedPath.startsWith(normalizedHome)) {
    return "~" + normalizedPath.slice(normalizedHome.length);
  }
  return path;
}

/**
 * Get the basename of a path (last component)
 */
export function basename(path: string): string {
  // Handle both separators
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

/**
 * Get the home directory (cross-platform)
 */
export function getHomeDir(): string {
  return homedir();
}

/**
 * Join paths using platform separator
 */
export function joinPath(...parts: string[]): string {
  return join(...parts);
}

/**
 * Check if running on Windows
 */
export function isWindowsPlatform(): boolean {
  return isWindows;
}
