/**
 * Database Backup Service.
 * Manages copying of SQLite database to a backup directory, with automatic cleanup of old backups.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const backupService = {
  getSettings() {
    const filePath = path.join(app.getPath('userData'), 'settings.json');
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('BackupService: Failed to read settings file:', err);
    }
    return {
      databasePath: path.join(app.getPath('userData'), 'stratafield.db'),
      backupPath: path.join(app.getPath('home'), 'StrataFieldBackups')
    };
  },

  performBackup(): boolean {
    try {
      const settings = this.getSettings();
      const dbPath = settings.databasePath || path.join(app.getPath('userData'), 'stratafield.db');
      const backupDir = settings.backupPath || path.join(app.getPath('home'), 'StrataFieldBackups');

      if (!fs.existsSync(dbPath)) {
        console.warn('BackupService: Active database file not found at:', dbPath);
        return false;
      }

      // Create backup directory if it does not exist
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate filename: stratafield_backup_YYYYMMDD_HHMMSS.db
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      
      const destPath = path.join(backupDir, `stratafield_backup_${timestamp}.db`);
      fs.copyFileSync(dbPath, destPath);
      console.log('BackupService: Database backed up successfully to:', destPath);

      // Clean up old backups (keep only the 10 most recent)
      this.cleanupOldBackups(backupDir);
      return true;
    } catch (err) {
      console.error('BackupService: Automatic backup execution failed:', err);
      return false;
    }
  },

  cleanupOldBackups(backupDir: string): void {
    try {
      const files = fs.readdirSync(backupDir);
      const backupFiles = files
        .filter((f) => f.startsWith('stratafield_backup_') && f.endsWith('.db'))
        .map((f) => {
          const fullPath = path.join(backupDir, f);
          return {
            name: f,
            path: fullPath,
            time: fs.statSync(fullPath).mtime.getTime()
          };
        })
        .sort((a, b) => b.time - a.time); // Newest first

      // Keep only 10 most recent backups
      if (backupFiles.length > 10) {
        const oldFiles = backupFiles.slice(10);
        for (const file of oldFiles) {
          fs.unlinkSync(file.path);
          console.log('BackupService: Pruned historical backup file:', file.name);
        }
      }
    } catch (err) {
      console.error('BackupService: Failed to prune historical backup files:', err);
    }
  }
};
