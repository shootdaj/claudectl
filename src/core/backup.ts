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

/**
 * Find sessions that exist in backup but not in source (deleted sessions)
 */
export async function findDeletedSessions(): Promise<Array<{ id: string; filePath: string; backupPath: string }>> {
  const { readdir, stat: fsStat } = await import("fs/promises");
  const projectsDir = getProjectsDir();
  const deleted: Array<{ id: string; filePath: string; backupPath: string }> = [];

  try {
    await fsStat(SESSIONS_BACKUP);
  } catch {
    return []; // No backup exists
  }

  // Scan backup directories
  const backupDirs = await readdir(SESSIONS_BACKUP).catch(() => []);

  for (const encodedDir of backupDirs) {
    const backupDirPath = join(SESSIONS_BACKUP, encodedDir);
    const sourceDirPath = join(projectsDir, encodedDir);

    const backupStat = await fsStat(backupDirPath).catch(() => null);
    if (!backupStat?.isDirectory()) continue;

    const backupFiles = await readdir(backupDirPath).catch(() => []);

    for (const file of backupFiles) {
      if (!file.endsWith(".jsonl")) continue;

      const sourceFile = join(sourceDirPath, file);
      const backupFile = join(backupDirPath, file);

      // Check if source file exists
      try {
        await fsStat(sourceFile);
      } catch {
        // Source doesn't exist - this session was deleted
        deleted.push({
          id: file.replace(".jsonl", ""),
          filePath: sourceFile,
          backupPath: backupFile,
        });
      }
    }
  }

  return deleted;
}

/**
 * Restore a specific session from backup
 */
export async function restoreSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const deleted = await findDeletedSessions();
  const session = deleted.find(s => s.id === sessionId || s.id.startsWith(sessionId));

  if (!session) {
    return { success: false, error: "Session not found in backup or already exists" };
  }

  try {
    // Ensure parent directory exists
    const parentDir = join(session.filePath, "..");
    await mkdir(parentDir, { recursive: true });

    // Copy from backup to source
    await cp(session.backupPath, session.filePath);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Restore all deleted sessions from backup
 */
export async function restoreAllSessions(): Promise<{ restored: number; failed: number }> {
  const deleted = await findDeletedSessions();
  let restored = 0;
  let failed = 0;

  for (const session of deleted) {
    const result = await restoreSession(session.id);
    if (result.success) {
      restored++;
    } else {
      failed++;
    }
  }

  return { restored, failed };
}
