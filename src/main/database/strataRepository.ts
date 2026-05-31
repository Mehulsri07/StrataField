import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { StrataLayer } from '@shared/types';
import { validateStrata } from '../../shared/validation';
import { borewellRepository } from './borewellRepository';

export const strataRepository = {
  getByBorewellId(borewellId: string): StrataLayer[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM strata_layers WHERE borewell_id = ? ORDER BY start_depth ASC', [borewellId]);
      return mapResultToObjects<StrataLayer>(res);
    } catch (err) {
      console.error(`Failed to get strata layers for borewell ${borewellId}:`, err);
      return [];
    }
  },

  save(borewellId: string, layers: StrataLayer[]): void {
    const db = getDb();
    
    // Fetch total depth to validate layers limit
    const borewell = borewellRepository.getById(borewellId);
    const totalDepth = borewell ? borewell.totalDepth : null;

    // Validate layers sequence before inserting
    const errors = validateStrata(layers, totalDepth);
    if (errors.length > 0) {
      throw new Error(`Strata validation failed:\n${errors.join('\n')}`);
    }

    try {
      // Execute in a transaction sequence
      db.run('BEGIN TRANSACTION');

      // Clear existing layers
      db.run('DELETE FROM strata_layers WHERE borewell_id = ?', [borewellId]);

      // Bulk insert new layers
      const sql = `
        INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, color, pattern, remarks)
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
