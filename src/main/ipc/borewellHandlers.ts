import { safeHandle } from './safeHandle';
import { borewellRepository } from '../database/borewellRepository';
import { IPC_CHANNELS } from '../../shared/types';
import type { Borewell, SearchFilters } from '../../shared/types';
import { getDb, saveDatabase } from '../database/db';

export function registerBorewellHandlers(): void {
  safeHandle(IPC_CHANNELS.BOREWELL_GET_ALL, () => {
    return borewellRepository.getAll(false);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_GET_BY_ID, (_event, id: string) => {
    return borewellRepository.getById(id);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_CREATE, (_event, b: Borewell) => {
    return borewellRepository.create(b);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_UPDATE, (_event, id: string, updates: Partial<Borewell>) => {
    return borewellRepository.update(id, updates);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_DELETE, (_event, id: string) => {
    return borewellRepository.delete(id);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_SEARCH, (_event, filters: SearchFilters) => {
    return borewellRepository.search(filters);
  });

  // Recycle Bin / Trash Handlers
  safeHandle(IPC_CHANNELS.BOREWELL_GET_TRASH, () => {
    return borewellRepository.getAll(true);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_RESTORE, (_event, id: string) => {
    return borewellRepository.restore(id);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_DELETE_PERMANENT, (_event, id: string) => {
    return borewellRepository.deletePermanently(id);
  });

  safeHandle('borewell:checkDuplicate', (_event, borewellId: string, project: string, date: string) => {
    return borewellRepository.checkDuplicate(borewellId, project, date);
  });

  safeHandle('import:save', (_event, data: { borewell: any; strata: any[]; pipes: any[] }) => {
    const db = getDb();
    try {
      db.run('BEGIN TRANSACTION');

      // Wipe old logs if overwriting
      db.run('DELETE FROM strata_layers WHERE borewell_id = ?', [data.borewell.id]);
      db.run('DELETE FROM pipe_assemblies WHERE borewell_id = ?', [data.borewell.id]);
      db.run('DELETE FROM borewells WHERE id = ?', [data.borewell.id]);

      // 1. Insert Borewell
      const b = data.borewell;
      const bSql = `
        INSERT INTO borewells (
          id, borewell_id, project, owner_name, house_no, area, city, address,
          latitude, longitude, bore_dia, pipe_dia, total_depth, water_level,
          remarks, date, created_at, updated_at, import_source, import_method, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(bSql, [
        b.id, b.borewellId, b.project, b.ownerName, b.houseNo || null, b.area || null,
        b.city, b.address || null, b.latitude || null, b.longitude || null,
        b.boreDia || null, b.pipeDia || null, b.totalDepth || null, b.waterLevel || null,
        b.remarks || '', b.date, b.createdAt, b.updatedAt,
        b.importSource || null, b.importMethod || 'excel', null
      ]);

      // 2. Insert Strata Layers
      const sSql = `
        INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, color, pattern, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      data.strata.forEach((s) => {
        db.run(sSql, [
          s.id, b.id, s.startDepth, s.endDepth, s.material, s.color, s.pattern, s.remarks || ''
        ]);
      });

      // 3. Insert Pipe Assembly
      const pSql = `
        INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type)
        VALUES (?, ?, ?, ?, ?)
      `;
      data.pipes.forEach((p) => {
        db.run(pSql, [
          p.id, b.id, p.startDepth, p.endDepth, p.pipeType
        ]);
      });

      db.run('COMMIT');
      saveDatabase();
      return { success: true };
    } catch (err: any) {
      try {
        db.run('ROLLBACK');
      } catch (e) {
        // Rollback failed (e.g. transaction wasn't active)
      }
      console.error('Import save transaction failed, rolled back completely:', err);
      throw err;
    }
  });
}
