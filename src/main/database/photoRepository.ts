/**
 * Photo repository to manage SQLite records of site photographs.
 */

import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { Photo } from '@shared/types';

export const photoRepository = {
  getByBorewellId(borewellId: string): Photo[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM photos WHERE borewell_id = ?', [borewellId]);
      return mapResultToObjects<Photo>(res);
    } catch (err) {
      console.error(`Failed to get photos for borewell ${borewellId}:`, err);
      return [];
    }
  },

  add(photo: Photo): void {
    const db = getDb();
    try {
      const sql = 'INSERT INTO photos (id, borewell_id, file_path, capture_date) VALUES (?, ?, ?, ?)';
      db.run(sql, [photo.id, photo.borewellId, photo.filePath, photo.captureDate || null]);
      saveDatabase();
    } catch (err) {
      console.error('Failed to insert photo record:', err);
      throw err;
    }
  },

  delete(id: string): void {
    const db = getDb();
    try {
      db.run('DELETE FROM photos WHERE id = ?', [id]);
      saveDatabase();
    } catch (err) {
      console.error(`Failed to delete photo ${id}:`, err);
      throw err;
    }
  }
};
