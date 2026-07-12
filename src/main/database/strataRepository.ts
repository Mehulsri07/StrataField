import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { StrataLayer, UnmappedMaterial } from '@shared/types';
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
        INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, material_id, color, pattern, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      layers.forEach((l) => {
        db.run(sql, [
          l.id,
          borewellId,
          l.startDepth,
          l.endDepth,
          l.material,
          l.materialId || null,
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
  },

  /**
   * Returns distinct material text values that have no material_id set,
   * along with count and suggested match from the materials dictionary.
   */
  getUnmappedMaterials(): UnmappedMaterial[] {
    const db = getDb();
    try {
      const res = db.exec(`
        SELECT
          sl.material,
          COUNT(*) as layer_count,
          (SELECT m.name FROM materials m WHERE LOWER(m.name) = LOWER(sl.material) LIMIT 1) as suggested_match,
          (SELECT m.id FROM materials m WHERE LOWER(m.name) = LOWER(sl.material) LIMIT 1) as suggested_match_id
        FROM strata_layers sl
        WHERE sl.material_id IS NULL
          AND sl.material IS NOT NULL
          AND sl.material != ''
        GROUP BY sl.material
        ORDER BY COUNT(*) DESC
      `);
      return mapResultToObjects<UnmappedMaterial>(res);
    } catch (err) {
      console.error('Failed to get unmapped materials:', err);
      return [];
    }
  },

  /**
   * Bulk remaps all strata layers with a given free-text material to use a canonical material_id.
   * Also updates the material name, color, and pattern to match the canonical entry.
   */
  remapMaterial(oldMaterial: string, newMaterialId: string): number {
    const db = getDb();
    try {
      // Look up canonical material details
      const matResult = db.exec('SELECT name, color, pattern FROM materials WHERE id = ?', [newMaterialId]);
      if (matResult.length === 0 || matResult[0].values.length === 0) {
        throw new Error(`Material ID '${newMaterialId}' not found in dictionary.`);
      }
      const [newName, newColor, newPattern] = matResult[0].values[0] as [string, string, string];

      db.run(`
        UPDATE strata_layers
        SET material_id = ?, material = ?, color = ?, pattern = ?
        WHERE LOWER(material) = LOWER(?) AND material_id IS NULL
      `, [newMaterialId, newName, newColor, newPattern, oldMaterial]);

      const changes = db.getRowsModified();
      saveDatabase();
      console.log(`Remapped ${changes} strata layers from '${oldMaterial}' → '${newName}' (${newMaterialId})`);
      return changes;
    } catch (err) {
      console.error(`Failed to remap material '${oldMaterial}':`, err);
      throw err;
    }
  }
};
