import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDb, reloadDatabase } from '../database/db';

// Load sql.js the same way db.ts does — dynamically from resources/ in packaged
// builds so we don't depend on node_modules being in the asar.
async function loadSqlJs() {
  if (app.isPackaged) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(path.join(process.resourcesPath, 'sql-wasm.js'));
  }
  return (await import('sql.js')).default;
}

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
    const now = new Date();
    let integrityStatus: 'ok' | 'failed' = 'failed';

    try {
      const settings = this.getSettings();
      const dbPath = settings.databasePath || path.join(app.getPath('userData'), 'stratafield.db');
      const backupDir = settings.backupPath || path.join(app.getPath('home'), 'StrataFieldBackups');

      if (!fs.existsSync(dbPath)) {
        console.warn('BackupService: Active database file not found at:', dbPath);
        this.saveBackupStatus({ lastBackupTime: now.toISOString(), status: 'failed', integrity: 'failed' });
        return false;
      }

      // ─── Database Verification ───
      // Run PRAGMA integrity_check on active database instance before backing up
      const db = getDb();
      const integrity = db.exec('PRAGMA integrity_check');
      const status = integrity[0]?.values[0][0] as string;
      if (status !== 'ok') {
        console.error('BackupService: Integrity check failed! Active database is corrupted. Aborting backup. Status:', status);
        this.saveBackupStatus({ lastBackupTime: now.toISOString(), status: 'failed', integrity: 'failed' });
        return false;
      }
      integrityStatus = 'ok';

      // Create backup directory if it does not exist
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate filename: stratafield_backup_YYYYMMDD_HHMMSS.db
      const pad = (n: number) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      
      const destPath = path.join(backupDir, `stratafield_backup_${timestamp}.db`);
      fs.copyFileSync(dbPath, destPath);
      console.log('BackupService: Database verified and backed up successfully to:', destPath);

      // Clean up old backups (keep 30 most recent backups)
      this.cleanupOldBackups(backupDir);
      
      this.saveBackupStatus({ lastBackupTime: now.toISOString(), status: 'success', integrity: 'ok' });
      return true;
    } catch (err) {
      console.error('BackupService: Automatic backup execution failed:', err);
      this.saveBackupStatus({ lastBackupTime: now.toISOString(), status: 'failed', integrity: integrityStatus });
      return false;
    }
  },

  saveBackupStatus(statusObj: { lastBackupTime: string; status: 'success' | 'failed'; integrity: 'ok' | 'failed' }) {
    const filePath = path.join(app.getPath('userData'), 'settings.json');
    try {
      let current: any = {};
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        current = JSON.parse(raw);
      }
      current.lastBackup = statusObj;
      fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8');
    } catch (err) {
      console.error('BackupService: Failed to save last backup status to settings:', err);
    }
  },

  getBackupStatus() {
    try {
      const filePath = path.join(app.getPath('userData'), 'settings.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const settings = JSON.parse(raw);
        return settings.lastBackup || { lastBackupTime: null, status: null, integrity: null };
      }
    } catch (err) {
      console.error('BackupService: Failed to read backup status:', err);
    }
    return { lastBackupTime: null, status: null, integrity: null };
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

      // Keep only 30 most recent backups
      if (backupFiles.length > 30) {
        const oldFiles = backupFiles.slice(30);
        for (const file of oldFiles) {
          fs.unlinkSync(file.path);
          console.log('BackupService: Pruned historical backup file:', file.name);
        }
      }
    } catch (err) {
      console.error('BackupService: Failed to prune historical backup files:', err);
    }
  },

  listBackups(): any[] {
    try {
      const settings = this.getSettings();
      const backupDir = settings.backupPath || path.join(app.getPath('home'), 'StrataFieldBackups');

      if (!fs.existsSync(backupDir)) {
        return [];
      }

      const files = fs.readdirSync(backupDir);
      return files
        .filter((f) => f.startsWith('stratafield_backup_') && f.endsWith('.db'))
        .map((f) => {
          const fullPath = path.join(backupDir, f);
          const stat = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            size: stat.size,
            time: stat.mtime.toISOString(),
            isValid: true // We can check integrity on listing, or verify before restore
          };
        })
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    } catch (err) {
      console.error('BackupService: Failed to list backups:', err);
      return [];
    }
  },

  async verifyBackupIntegrity(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) return false;
      const fileBuffer = fs.readFileSync(filePath);
      
      const wasmPath = app.isPackaged
        ? path.join(process.resourcesPath, 'sql-wasm.wasm')
        : require.resolve('sql.js/dist/sql-wasm.wasm');
      const wasmBinary = fs.readFileSync(wasmPath);
      
      const initSqlJs = await loadSqlJs();
      const SQL = await initSqlJs({ wasmBinary: wasmBinary as any });
      const db = new SQL.Database(fileBuffer);
      const integrity = db.exec('PRAGMA integrity_check');
      const result = integrity[0]?.values[0][0] as string;
      db.close();
      return result === 'ok';
    } catch (e) {
      console.error('BackupService: Failed to verify backup file:', e);
      return false;
    }
  },

  async restoreBackup(filename: string): Promise<boolean> {
    try {
      const settings = this.getSettings();
      const backupDir = settings.backupPath || path.join(app.getPath('home'), 'StrataFieldBackups');
      const backupFilePath = path.join(backupDir, filename);

      if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Backup file not found at: ${backupFilePath}`);
      }

      // Verify integrity before restoring
      const isValid = await this.verifyBackupIntegrity(backupFilePath);
      if (!isValid) {
        throw new Error('Backup file is corrupted or not a valid SQLite database.');
      }

      // Read backup file buffer
      const buffer = fs.readFileSync(backupFilePath);
      
      // Perform database reload
      await reloadDatabase(buffer);
      console.log(`BackupService: Successfully restored database from backup file: ${filename}`);
      return true;
    } catch (err) {
      console.error(`BackupService: Failed to restore backup ${filename}:`, err);
      throw err;
    }
  },

  async restoreFromExternalFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`External file not found at: ${filePath}`);
      }

      // Verify integrity
      const isValid = await this.verifyBackupIntegrity(filePath);
      if (!isValid) {
        throw new Error('Selected file is corrupted or not a valid SQLite database.');
      }

      // Read file buffer
      const buffer = fs.readFileSync(filePath);

      // Perform database reload
      await reloadDatabase(buffer);
      console.log(`BackupService: Successfully restored database from external file: ${filePath}`);
      return true;
    } catch (err) {
      console.error(`BackupService: Failed to restore from external file ${filePath}:`, err);
      throw err;
    }
  }
};
