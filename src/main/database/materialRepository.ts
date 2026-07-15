import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { Material } from '@shared/types';

export const materialRepository = {
  getAll(): Material[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM materials ORDER BY is_custom ASC, name ASC');
      return mapResultToObjects<Material>(res);
    } catch (err) {
      console.error('Failed to get all materials:', err);
      return [];
    }
  },

  create(m: Material): void {
    const db = getDb();
    try {
      const sql = `
        INSERT INTO materials (id, name, color, pattern, is_custom, lithology_class, lithology_family)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        m.id,
        m.name,
        m.color,
        m.pattern,
        m.isCustom ? 1 : 0,
        m.lithologyClass || null,
        m.lithologyFamily || null
      ]);
      saveDatabase();
    } catch (err) {
      console.error('Failed to create material:', err);
      throw err;
    }
  },

  update(id: string, m: Partial<Material>): void {
    const db = getDb();

    const ALLOWED_UPDATE_KEYS = new Set([
      'name', 'color', 'pattern', 'isCustom', 'lithologyClass', 'lithologyFamily',
    ]);

    try {
      const sets: string[] = [];
      const params: any[] = [];

      Object.entries(m).forEach(([key, value]) => {
        if (key === 'id') return;
        if (!ALLOWED_UPDATE_KEYS.has(key)) {
          throw new Error(`Update rejected: field '${key}' is not an allowed material field.`);
        }
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        sets.push(`${snakeKey} = ?`);
        params.push(key === 'isCustom' ? (value ? 1 : 0) : value);
      });

      if (sets.length === 0) return;

      params.push(id);
      db.run(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    } catch (err) {
      console.error(`Failed to update material ${id}:`, err);
      throw err;
    }
  },

  delete(id: string): void {
    const db = getDb();
    try {
      // Null out any strata layers referencing this material before deleting
      db.run('UPDATE strata_layers SET material_id = NULL WHERE material_id = ?', [id]);
      db.run('DELETE FROM materials WHERE id = ?', [id]);
      saveDatabase();
    } catch (err) {
      console.error(`Failed to delete material ${id}:`, err);
      throw err;
    }
  }
};
