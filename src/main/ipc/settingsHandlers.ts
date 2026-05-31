/**
 * IPC handlers for application settings configuration.
 * Stores configuration (theme, custom materials, database paths) in settings.json inside userData.
 */

import { app } from 'electron';
import { safeHandle } from './safeHandle';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/types';
import type { AppSettings } from '../../shared/types';
import { backupService } from '../services/backupService';

const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json');

const getDefaultSettings = (): AppSettings => ({
  theme: 'dark',
  databasePath: path.join(app.getPath('userData'), 'stratafield.db'),
  backupPath: path.join(app.getPath('home'), 'StrataFieldBackups'),
  customMaterials: []
});

export function registerSettingsHandlers(): void {
  // Retrieve settings
  safeHandle(IPC_CHANNELS.SETTINGS_GET, () => {
    const filePath = getSettingsFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Merge with defaults to ensure all properties exist
        return { ...getDefaultSettings(), ...parsed };
      }
    } catch (err) {
      console.error('Failed to read settings file, returning defaults:', err);
    }
    return getDefaultSettings();
  });

  // Save settings
  safeHandle(IPC_CHANNELS.SETTINGS_SAVE, (_event, updates: Partial<AppSettings>) => {
    const filePath = getSettingsFilePath();
    try {
      let current = getDefaultSettings();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        current = JSON.parse(raw);
      }
      
      const updated = { ...current, ...updates };
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (err) {
      console.error('Failed to write settings file:', err);
      throw err;
    }
  });

  // Manual DB Backup
  safeHandle(IPC_CHANNELS.DB_BACKUP, () => {
    try {
      const success = backupService.performBackup();
      return { success };
    } catch (err: any) {
      console.error('IPC DB_BACKUP Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Get Backup List
  safeHandle(IPC_CHANNELS.DB_BACKUP_LIST, () => {
    return backupService.listBackups();
  });

  // Get Last Backup Status
  safeHandle('settings:getBackupStatus', () => {
    return backupService.getBackupStatus();
  });

  // Restore database backup
  safeHandle(IPC_CHANNELS.DB_BACKUP_RESTORE, async (_event, filename: string) => {
    try {
      // Perform backup of current database first just in case
      backupService.performBackup();
      const success = await backupService.restoreBackup(filename);
      return { success };
    } catch (err: any) {
      console.error(`IPC DB_BACKUP_RESTORE Failed for ${filename}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Restore database from external file
  safeHandle(IPC_CHANNELS.DB_BACKUP_RESTORE_EXTERNAL, async (_event, filePath: string) => {
    try {
      // Perform backup of current database first just in case
      backupService.performBackup();
      const success = await backupService.restoreFromExternalFile(filePath);
      return { success };
    } catch (err: any) {
      console.error(`IPC DB_BACKUP_RESTORE_EXTERNAL Failed for ${filePath}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
export default registerSettingsHandlers;
