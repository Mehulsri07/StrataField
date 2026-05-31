import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { PipeSegment } from '@shared/types';
import { validatePipeSegments } from '../../shared/validation';
import { borewellRepository } from './borewellRepository';

export const pipeRepository = {
  getByBorewellId(borewellId: string): PipeSegment[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM pipe_assemblies WHERE borewell_id = ? ORDER BY start_depth ASC', [borewellId]);
      return mapResultToObjects<PipeSegment>(res);
    } catch (err) {
      console.error(`Failed to get pipe segments for borewell ${borewellId}:`, err);
      return [];
    }
  },

  save(borewellId: string, segments: PipeSegment[]): void {
    const db = getDb();

    // Fetch total depth to validate segments limit
    const borewell = borewellRepository.getById(borewellId);
    const totalDepth = borewell ? borewell.totalDepth : null;

    // Validate segments before inserting
    const errors = validatePipeSegments(segments, totalDepth);
    if (errors.length > 0) {
      throw new Error(`Pipe assembly validation failed:\n${errors.join('\n')}`);
    }

    try {
      db.run('BEGIN TRANSACTION');

      // Clear existing pipes lowering entries
      db.run('DELETE FROM pipe_assemblies WHERE borewell_id = ?', [borewellId]);

      // Bulk insert new segments
      const sql = `
        INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type)
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
