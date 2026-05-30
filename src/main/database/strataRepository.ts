/**
 * Strata repository to manage SQLite transactions for geological layers.
 */

import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { StrataLayer } from '@shared/types';

export const strataRepository = {
  getByBorewellId(borewellId: string): StrataLayer[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM strata_layers WHERE borewellId = ? ORDER BY startDepth ASC', [borewellId]);
      return mapResultToObjects<StrataLayer>(res);
    } catch (err) {
      console.error(`Failed to get strata layers for borewell ${borewellId}:`, err);
      return [];
    }
  },

  save(borewellId: string, layers: StrataLayer[]): void {
    const db = getDb();
    try {
      // Execute in a transaction sequence
      db.run('BEGIN TRANSACTION');

      // Clear existing layers
      db.run('DELETE FROM strata_layers WHERE borewellId = ?', [borewellId]);

      // Bulk insert new layers
      const sql = `
        INSERT INTO strata_layers (id, borewellId, startDepth, endDepth, material, color, pattern, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      layers.forEach((l) => {
        db.run(sql, [
          l.id,
          borewellId,
          l.startDepth,
          l.endDepth,
          l.material,
          l.color,
          l.pattern,
          l.remarks || ''
        ]);
      });

      db.run('COMMIT');
      saveDatabase();
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr);
      }
      console.error(`Failed to save strata layers for borewell ${borewellId}:`, err);
      throw err;
    }
  }
};
