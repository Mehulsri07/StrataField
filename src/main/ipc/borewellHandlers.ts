/**
 * IPC handlers for borewell CRUD database operations.
 */

import { safeHandle } from './safeHandle';
import { borewellRepository } from '../database/borewellRepository';
import { IPC_CHANNELS } from '../../shared/types';

export function registerBorewellHandlers(): void {
  safeHandle(IPC_CHANNELS.BOREWELL_GET_ALL, () => {
    return borewellRepository.getAll();
  });

  safeHandle(IPC_CHANNELS.BOREWELL_GET_BY_ID, (_event, id: string) => {
    return borewellRepository.getById(id);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_CREATE, (_event, b: any) => {
    return borewellRepository.create(b);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_UPDATE, (_event, id: string, updates: any) => {
    return borewellRepository.update(id, updates);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_DELETE, (_event, id: string) => {
    return borewellRepository.delete(id);
  });

  safeHandle(IPC_CHANNELS.BOREWELL_SEARCH, (_event, filters: any) => {
    return borewellRepository.search(filters);
  });
}
