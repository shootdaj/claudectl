import { mkdir, readdir, cp, rm, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { getProjectsDir } from "./config";

const BACKUP_DIR = join(homedir(), ".claudectl", "backups");
const MAX_BACKUPS = 10; // Keep last 10 backups

/**
 * Get backup directory path
 */
export function getBackupDir(): string {
  return BACKUP_DIR;
}

/**
 * Create a timestamped backup of all Claude Code sessions
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

    // Create timestamped backup folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(BACKUP_DIR, `sessions-${timestamp}`);

    // Copy all sessions
    await cp(projectsDir, backupPath, { recursive: true });

    // Cleanup old backups (keep only MAX_BACKUPS)
    await cleanupOldBackups();

    return { success: true, path: backupPath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove old backups, keeping only the most recent MAX_BACKUPS
 */
async function cleanupOldBackups(): Promise<void> {
  try {
    const entries = await readdir(BACKUP_DIR);
    const backups = entries
      .filter(e => e.startsWith("sessions-"))
      .sort()
      .reverse(); // Most recent first

    // Remove old backups
    for (let i = MAX_BACKUPS; i < backups.length; i++) {
      const oldBackup = join(BACKUP_DIR, backups[i]);
      await rm(oldBackup, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * List all available backups
 */
export async function listBackups(): Promise<{ name: string; date: Date; path: string }[]> {
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const entries = await readdir(BACKUP_DIR);

    const backups = await Promise.all(
      entries
        .filter(e => e.startsWith("sessions-"))
        .map(async (name) => {
          const path = join(BACKUP_DIR, name);
          const stats = await stat(path);
          return {
            name,
            date: stats.mtime,
            path,
          };
        })
    );

    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch {
    return [];
  }
}

/**
 * Check if backup is needed (more than 1 hour since last backup)
 */
export async function needsBackup(): Promise<boolean> {
  const backups = await listBackups();

  if (backups.length === 0) {
    return true;
  }

  const lastBackup = backups[0];
  const hoursSinceBackup = (Date.now() - lastBackup.date.getTime()) / (1000 * 60 * 60);

  return hoursSinceBackup >= 1; // Backup if more than 1 hour old
}

/**
 * Run backup if needed (called on app startup)
 */
export async function autoBackup(): Promise<void> {
  if (await needsBackup()) {
    await backupSessions();
  }
}
