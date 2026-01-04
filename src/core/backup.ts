import { mkdir, cp, rm, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { getProjectsDir } from "./config";

const BACKUP_DIR = join(homedir(), ".claudectl", "backup");
const SESSIONS_BACKUP = join(BACKUP_DIR, "sessions");

/**
 * Get backup directory path
 */
export function getBackupDir(): string {
  return BACKUP_DIR;
}

/**
 * Create/update backup of all Claude Code sessions (single snapshot)
 */
export async function backupSessions(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const projectsDir = getProjectsDir();

    // Check if projects dir exists
    try {
      await stat(projectsDir);
    } catch {
      return { success: false, error: "No sessions to backup" };
    }

    // Create backup directory
    await mkdir(BACKUP_DIR, { recursive: true });

    // Remove old backup and replace with new one
    await rm(SESSIONS_BACKUP, { recursive: true, force: true });
    await cp(projectsDir, SESSIONS_BACKUP, { recursive: true });

    // Save timestamp
    const timestampFile = join(BACKUP_DIR, ".last-backup");
    await Bun.write(timestampFile, new Date().toISOString());

    return { success: true, path: SESSIONS_BACKUP };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get last backup info
 */
export async function getBackupInfo(): Promise<{ date: Date; path: string } | null> {
  try {
    const timestampFile = join(BACKUP_DIR, ".last-backup");
    const timestamp = await Bun.file(timestampFile).text();
    return {
      date: new Date(timestamp.trim()),
      path: SESSIONS_BACKUP,
    };
  } catch {
    return null;
  }
}

/**
 * Check if backup is needed (more than 1 hour since last backup)
 */
export async function needsBackup(): Promise<boolean> {
  const info = await getBackupInfo();

  if (!info) {
    return true;
  }

  const hoursSinceBackup = (Date.now() - info.date.getTime()) / (1000 * 60 * 60);
  return hoursSinceBackup >= 1;
}

/**
 * Run backup if needed (called on app startup)
 */
export async function autoBackup(): Promise<void> {
  if (await needsBackup()) {
    await backupSessions();
  }
}
