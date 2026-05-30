/**
 * IPC handlers for strata layer database operations.
 */

import { safeHandle } from './safeHandle';
import { strataRepository } from '../database/strataRepository';
import { IPC_CHANNELS } from '../../shared/types';

export function registerStrataHandlers(): void {
  safeHandle(IPC_CHANNELS.STRATA_GET, (_event, borewellId: string) => {
    return strataRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.STRATA_SAVE, (_event, borewellId: string, layers: any[]) => {
    return strataRepository.save(borewellId, layers);
  });
}
