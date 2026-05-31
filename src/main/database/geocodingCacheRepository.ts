import { getDb, saveDatabase } from './db';
import type { GeocodeResult } from '@shared/types';

export const geocodingCacheRepository = {
  get(query: string): GeocodeResult | null {
    const db = getDb();
    try {
      const cleanQuery = query.trim().toLowerCase();
      const stmt = db.prepare('SELECT latitude, longitude, display_name FROM geocoding_cache WHERE query = ?');
      stmt.bind([cleanQuery]);
      const hasRow = stmt.step();
      if (!hasRow) {
        stmt.free();
        return null;
      }
      const res = stmt.getAsObject();
      stmt.free();
      
      return {
        latitude: res.latitude as number,
        longitude: res.longitude as number,
        displayName: res.display_name as string
      };
    } catch (err) {
      console.error('Failed to read geocoding cache:', err);
      return null;
    }
  },

  set(query: string, result: GeocodeResult): void {
    const db = getDb();
    try {
      const cleanQuery = query.trim().toLowerCase();
      const cachedAt = new Date().toISOString();
      const sql = `
        INSERT OR REPLACE INTO geocoding_cache (query, latitude, longitude, display_name, cached_at)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        cleanQuery,
        result.latitude,
        result.longitude,
        result.displayName,
        cachedAt
      ]);
      saveDatabase();
    } catch (err) {
      console.error('Failed to write geocoding cache:', err);
    }
  }
};
