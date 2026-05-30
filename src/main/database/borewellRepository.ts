/**
 * Borewell repository to manage SQLite database transactions for borewells.
 */

import { getDb, saveDatabase, mapResultToObjects } from './db';
import type { Borewell, SearchFilters } from '@shared/types';

export const borewellRepository = {
  getAll(): Borewell[] {
    const db = getDb();
    try {
      const res = db.exec('SELECT * FROM borewells ORDER BY date DESC');
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
      const row = stmt.getAsObject();
      stmt.free();
      return row as unknown as Borewell;
    } catch (err) {
      console.error(`Failed to get borewell by id ${id}:`, err);
      return null;
    }
  },

  create(b: Borewell): void {
    const db = getDb();
    try {
      const sql = `
        INSERT INTO borewells (
          id, borewellId, ownerName, houseNo, area, city, address,
          latitude, longitude, boreDia, pipeDia, totalDepth, waterLevel,
          remarks, date, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        b.id, b.borewellId, b.ownerName, b.houseNo, b.area, b.city, b.address,
        b.latitude, b.longitude, b.boreDia, b.pipeDia, b.totalDepth, b.waterLevel,
        b.remarks, b.date, b.createdAt, b.updatedAt
      ]);
      saveDatabase();
    } catch (err) {
      console.error('Failed to create borewell:', err);
      throw err;
    }
  },

  update(id: string, b: Partial<Borewell>): void {
    const db = getDb();
    try {
      const sets: string[] = [];
      const params: any[] = [];

      Object.entries(b).forEach(([key, value]) => {
        // Prevent editing ID or timestamps incorrectly
        if (key !== 'id' && key !== 'createdAt') {
          sets.push(`${key} = ?`);
          params.push(value);
        }
      });

      if (sets.length === 0) return;

      // Add updatedAt timestamp
      const updatedAt = new Date().toISOString();
      sets.push('updatedAt = ?');
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
    const db = getDb();
    try {
      // PRAGMA foreign_keys = ON is executed on connection, so cascade deletes apply automatically
      db.run('DELETE FROM borewells WHERE id = ?', [id]);
      saveDatabase();
    } catch (err) {
      console.error(`Failed to delete borewell ${id}:`, err);
      throw err;
    }
  },

  search(filters: SearchFilters): Borewell[] {
    const db = getDb();
    try {
      let sql = 'SELECT * FROM borewells WHERE 1=1';
      const params: any[] = [];

      if (filters.query) {
        const queryVal = `%${filters.query}%`;
        if (filters.field === 'all') {
          sql += ` AND (
            borewellId LIKE ? OR
            ownerName LIKE ? OR
            area LIKE ? OR
            city LIKE ? OR
            remarks LIKE ?
          )`;
          params.push(queryVal, queryVal, queryVal, queryVal, queryVal);
        } else {
          sql += ` AND ${filters.field} LIKE ?`;
          params.push(queryVal);
        }
      }

      if (filters.city) {
        sql += ' AND city LIKE ?';
        params.push(`%${filters.city}%`);
      }

      if (filters.dateFrom) {
        sql += ' AND date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        sql += ' AND date <= ?';
        params.push(filters.dateTo);
      }

      // If material filter is active, join with strata_layers table
      if (filters.material) {
        sql += ' AND id IN (SELECT DISTINCT borewellId FROM strata_layers WHERE material LIKE ?)';
        params.push(`%${filters.material}%`);
      }

      sql += ' ORDER BY date DESC';

      const res = db.exec(sql, params);
      return mapResultToObjects<Borewell>(res);
    } catch (err) {
      console.error('Failed to search borewells:', err);
      return [];
    }
  }
};
