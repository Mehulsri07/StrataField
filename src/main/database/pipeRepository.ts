/**
 * Pipe assembly repository to manage SQLite transactions for casing and slotted pipe sections.
 */

import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { PipeSegment } from '@shared/types';

export const pipeRepository = {
  getByBorewellId(borewellId: string): PipeSegment[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM pipe_assemblies WHERE borewellId = ? ORDER BY startDepth ASC', [borewellId]);
      return mapResultToObjects<PipeSegment>(res);
    } catch (err) {
      console.error(`Failed to get pipe segments for borewell ${borewellId}:`, err);
      return [];
    }
  },

  save(borewellId: string, segments: PipeSegment[]): void {
    const db = getDb();
    try {
      db.run('BEGIN TRANSACTION');

      // Clear existing pipes lowering entries
      db.run('DELETE FROM pipe_assemblies WHERE borewellId = ?', [borewellId]);

      // Bulk insert new segments
      const sql = `
        INSERT INTO pipe_assemblies (id, borewellId, startDepth, endDepth, pipeType)
        VALUES (?, ?, ?, ?, ?)
      `;

      segments.forEach((p) => {
        db.run(sql, [
          p.id,
          borewellId,
          p.startDepth,
          p.endDepth,
          p.pipeType
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
      console.error(`Failed to save pipe assembly for borewell ${borewellId}:`, err);
      throw err;
    }
  }
};
