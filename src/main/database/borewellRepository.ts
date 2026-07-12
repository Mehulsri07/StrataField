import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { Borewell, SearchFilters } from '@shared/types';
import { validateBorewell } from '../../shared/validation';

export const borewellRepository = {
  getAll(showDeleted = false): Borewell[] {
    const db = getDb();
    try {
      const sql = showDeleted 
        ? 'SELECT * FROM borewells WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
        : 'SELECT * FROM borewells WHERE deleted_at IS NULL ORDER BY date DESC';
      const res = db.exec(sql);
      return mapResultToObjects<Borewell>(res);
    } catch (err) {
      console.error('Failed to get all borewells:', err);
      return [];
    }
  },

  getById(id: string): Borewell | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM borewells WHERE id = ?');
      stmt.bind([id]);
      const hasRow = stmt.step();
      if (!hasRow) {
        stmt.free();
        return null;
      }
      const res = stmt.getAsObject();
      stmt.free();
      
      // Convert database row to typed object
      const mapped = mapResultToObjects<Borewell>([{
        columns: Object.keys(res),
        values: [Object.values(res)]
      }]);
      return mapped[0] || null;
    } catch (err) {
      console.error(`Failed to get borewell by id ${id}:`, err);
      return null;
    }
  },

  checkDuplicate(borewellId: string, project: string, date: string): Borewell | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM borewells WHERE borewell_id = ? AND project = ? AND date = ? AND deleted_at IS NULL');
      stmt.bind([borewellId, project, date]);
      const hasRow = stmt.step();
      if (!hasRow) {
        stmt.free();
        return null;
      }
      const res = stmt.getAsObject();
      stmt.free();
      
      const mapped = mapResultToObjects<Borewell>([{
        columns: Object.keys(res),
        values: [Object.values(res)]
      }]);
      return mapped[0] || null;
    } catch (err) {
      console.error('Failed to check duplicate:', err);
      return null;
    }
  },

  create(b: Borewell): void {
    const db = getDb();
    
    // Validate record before inserting
    const errors = validateBorewell(b);
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    try {
      const sql = `
        INSERT INTO borewells (
          id, borewell_id, project, owner_name, house_no, area, city, address,
          latitude, longitude, bore_dia, pipe_dia, total_depth, water_level,
          remarks, date, created_at, updated_at, import_source, import_method, deleted_at,
          drilling_method, depth_unit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        b.id,
        b.borewellId,
        b.project || 'Default Project',
        b.ownerName,
        b.houseNo || null,
        b.area || null,
        b.city,
        b.address || null,
        b.latitude !== undefined ? b.latitude : null,
        b.longitude !== undefined ? b.longitude : null,
        b.boreDia !== undefined ? b.boreDia : null,
        b.pipeDia !== undefined ? b.pipeDia : null,
        b.totalDepth !== undefined ? b.totalDepth : null,
        b.waterLevel !== undefined ? b.waterLevel : null,
        b.remarks || '',
        b.date,
        b.createdAt,
        b.updatedAt,
        b.importSource || null,
        b.importMethod || 'manual',
        b.deletedAt || null,
        b.drillingMethod || null,
        b.depthUnit || 'ft'
      ]);
      saveDatabase();
    } catch (err) {
      console.error('Failed to create borewell:', err);
      throw err;
    }
  },

  update(id: string, b: Partial<Borewell>): void {
    const db = getDb();
    
    // Get existing record to validate full update
    const existing = this.getById(id);
    if (existing) {
      const fullUpdate = { ...existing, ...b };
      const errors = validateBorewell(fullUpdate);
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n${errors.join('\n')}`);
      }
    }

    try {
      const sets: string[] = [];
      const params: any[] = [];

      Object.entries(b).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt') {
          // Convert camelCase key to snake_case column name
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          sets.push(`${snakeKey} = ?`);
          params.push(value);
        }
      });

      if (sets.length === 0) return;

      const updatedAt = new Date().toISOString();
      sets.push('updated_at = ?');
      params.push(updatedAt);

      params.push(id);

      const sql = `UPDATE borewells SET ${sets.join(', ')} WHERE id = ?`;
      db.run(sql, params);
      saveDatabase();
    } catch (err) {
      console.error(`Failed to update borewell ${id}:`, err);
      throw err;
    }
  },

  delete(id: string): void {
    // Soft Delete: sets deleted_at instead of deleting rows
    const db = getDb();
    try {
      const deletedAt = new Date().toISOString();
      db.run('UPDATE borewells SET deleted_at = ? WHERE id = ?', [deletedAt, id]);
      saveDatabase();
      console.log(`Soft deleted borewell ${id}`);
    } catch (err) {
      console.error(`Failed to soft-delete borewell ${id}:`, err);
      throw err;
    }
  },

  restore(id: string): void {
    const db = getDb();
    try {
      db.run('UPDATE borewells SET deleted_at = NULL WHERE id = ?', [id]);
      saveDatabase();
      console.log(`Restored soft-deleted borewell ${id}`);
    } catch (err) {
      console.error(`Failed to restore borewell ${id}:`, err);
      throw err;
    }
  },

  deletePermanently(id: string): void {
    // Hard Delete: performs actual database deletion (triggers cascade deletes)
    const db = getDb();
    try {
      db.run('DELETE FROM borewells WHERE id = ?', [id]);
      saveDatabase();
      console.log(`Permanently deleted borewell ${id} and all related logs.`);
    } catch (err) {
      console.error(`Failed to permanently delete borewell ${id}:`, err);
      throw err;
    }
  },

  search(filters: SearchFilters): Borewell[] {
    const db = getDb();
    try {
      let sql = 'SELECT * FROM borewells WHERE 1=1';
      const params: any[] = [];

      // Filter soft-deleted
      if (filters.showDeleted) {
        sql += ' AND deleted_at IS NOT NULL';
      } else {
        sql += ' AND deleted_at IS NULL';
      }

      if (filters.query) {
        const queryVal = `%${filters.query}%`;
        if (filters.field === 'all') {
          sql += ` AND (
            borewell_id LIKE ? OR
            owner_name LIKE ? OR
            area LIKE ? OR
            city LIKE ? OR
            project LIKE ? OR
            remarks LIKE ? OR
            id IN (SELECT DISTINCT borewell_id FROM strata_layers WHERE material LIKE ?)
          )`;
          params.push(queryVal, queryVal, queryVal, queryVal, queryVal, queryVal, queryVal);
        } else {
          // Whitelist allowed column names to prevent SQL injection
          const ALLOWED_FIELDS: Record<string, string> = {
            borewellId: 'borewell_id',
            ownerName:  'owner_name',
            area:       'area',
            city:       'city',
            date:       'date',
            project:    'project',
          };
          const snakeField = ALLOWED_FIELDS[filters.field];
          if (!snakeField) throw new Error(`Invalid search field: ${filters.field}`);
          sql += ` AND ${snakeField} LIKE ?`;
          params.push(queryVal);
        }
      }

      if (filters.city) {
        sql += ' AND city LIKE ?';
        params.push(`%${filters.city}%`);
      }

      if (filters.project) {
        sql += ' AND project LIKE ?';
        params.push(`%${filters.project}%`);
      }

      if (filters.dateFrom) {
        sql += ' AND date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        sql += ' AND date <= ?';
        params.push(filters.dateTo);
      }

      if (filters.material) {
        sql += ' AND id IN (SELECT DISTINCT borewell_id FROM strata_layers WHERE material LIKE ?)';
        params.push(`%${filters.material}%`);
      }

      if (filters.minDepth != null) {
        sql += ' AND total_depth >= ?';
        params.push(filters.minDepth);
      }

      if (filters.maxDepth != null) {
        sql += ' AND total_depth <= ?';
        params.push(filters.maxDepth);
      }

      if (filters.showDeleted) {
        sql += ' ORDER BY deleted_at DESC';
      } else {
        sql += ' ORDER BY date DESC';
      }

      const res = db.exec(sql, params);
      return mapResultToObjects<Borewell>(res);
    } catch (err) {
      console.error('Failed to search borewells:', err);
      return [];
    }
  }
};
