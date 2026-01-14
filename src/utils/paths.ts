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
 * /Users/anshul/.claudectl/scratch → -Users-anshul--claudectl-scratch (hidden folders use --)
 * C:\Users\anshul\Code → C--Users-anshul-Code (Windows)
 */
export function encodePath(path: string): string {
  // Normalize to forward slashes first
  const normalized = normalizeSeparators(path);

  // Handle Windows drive letters: C:/ → C-
  if (isWindows && /^[A-Za-z]:/.test(normalized)) {
    const drive = normalized[0];
    const rest = normalized.slice(2); // Remove "C:"
    // Hidden directories: /. becomes --
    return drive + rest.replace(/\/\./g, "--").replace(/\//g, "-");
  }

  // Hidden directories: /. becomes --
  // Regular directories: / becomes -
  return normalized.replace(/\/\./g, "--").replace(/\//g, "-");
}

/**
 * Decode a Claude directory name back to a filesystem path.
 * Handles ambiguous cases where folder names contain hyphens by checking filesystem.
 * -Users-anshul-Code-research-hub → /Users/anshul/Code/research-hub
 * -Users-anshul--claudectl-scratch → /Users/anshul/.claudectl/scratch (hidden folders)
 * C--Users-anshul-Code → C:\Users\anshul\Code (Windows)
 */
export function decodePath(encoded: string): string {
  if (!encoded) return "";

  // Handle Windows drive letter encoding: C--Users → C:\Users
  if (/^[A-Za-z]-/.test(encoded)) {
    const drive = encoded[0];
    const rest = encoded.slice(1); // Remove drive letter, keep leading hyphen
    const parts = splitEncodedPath(rest.slice(1)); // Remove leading hyphen, then split
    const resolved = findValidPathWindows(drive, parts);
    return toPlatformPath(resolved);
  }

  // Handle Unix paths (starts with -)
  if (!encoded.startsWith("-")) {
    return encoded.replace(/-/g, "/");
  }

  // Remove leading hyphen and split, handling hidden directories (--folder means .folder)
  // Special case: if path starts with "--", it means a hidden folder at root (/.hidden)
  let withoutLeading = encoded.slice(1);
  let startsWithHidden = false;
  if (withoutLeading.startsWith("-")) {
    // This is a hidden folder at root, mark it and remove the extra hyphen
    startsWithHidden = true;
    withoutLeading = withoutLeading.slice(1);
  }
  const parts = splitEncodedPath(withoutLeading);

  // If we had a leading hidden folder, add the dot prefix to the first part
  if (startsWithHidden && parts.length > 0 && !parts[0].startsWith(".")) {
    parts[0] = "." + parts[0];
  }

  // Try to find the actual path by testing which combinations exist
  const result = "/" + findValidPath(parts);

  // Normalize any remaining double slashes
  return result.replace(/\/+/g, "/");
}

/**
 * Split an encoded path string into parts, handling hidden directories.
 * Double hyphen (--) before a name means it's a hidden folder (.name).
 * Example: "Users-anshul--claudectl-scratch" -> ["Users", "anshul", ".claudectl", "scratch"]
 */
function splitEncodedPath(encoded: string): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;

  while (i < encoded.length) {
    if (encoded[i] === "-") {
      // Check if this is a double hyphen (hidden folder indicator)
      if (i + 1 < encoded.length && encoded[i + 1] === "-") {
        // Save current part if not empty
        if (current) {
          parts.push(current);
          current = "";
        }
        // Skip the double hyphen and start next part with a dot
        i += 2;
        current = ".";
      } else {
        // Single hyphen - end of current part
        if (current) {
          parts.push(current);
          current = "";
        }
        i++;
      }
    } else {
      current += encoded[i];
      i++;
    }
  }

  // Don't forget the last part
  if (current) {
    parts.push(current);
  }

  return parts;
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
