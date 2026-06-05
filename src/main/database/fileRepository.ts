/**
 * File repository to manage reference document path links (Excel sheets and PDF reports) in the database.
 */

import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { BorewellFile } from '@shared/types';

export const fileRepository = {
  getByBorewellId(borewellId: string): BorewellFile | null {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM files WHERE borewell_id = ?', [borewellId]);
      const mapped = mapResultToObjects<BorewellFile>(res);
      return mapped.length > 0 ? mapped[0] : null;
    } catch (err) {
      console.error(`Failed to get file records for borewell ${borewellId}:`, err);
      return null;
    }
  },

  save(borewellId: string, files: Omit<BorewellFile, 'id' | 'borewellId'>): void {
    const db = getDb();
    try {
      db.run('BEGIN TRANSACTION');

      // Check if entry already exists
      const checkRes = db.exec('SELECT id FROM files WHERE borewell_id = ?', [borewellId]);
      const exists = checkRes.length > 0 && checkRes[0].values.length > 0;

      if (exists) {
        db.run(
          'UPDATE files SET excel_path = ?, pdf_path = ? WHERE borewell_id = ?',
          [files.excelPath || null, files.pdfPath || null, borewellId]
        );
      } else {
        const id = crypto.randomUUID();
        db.run(
          'INSERT INTO files (id, borewell_id, excel_path, pdf_path) VALUES (?, ?, ?, ?)',
          [id, borewellId, files.excelPath || null, files.pdfPath || null]
        );
      }

      db.run('COMMIT');
      saveDatabase();
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr);
      }
      console.error(`Failed to save file attachments for borewell ${borewellId}:`, err);
      throw err;
    }
  }
};
