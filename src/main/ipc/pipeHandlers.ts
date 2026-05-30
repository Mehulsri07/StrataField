/**
 * IPC handlers for pipe assembly database operations.
 */

import { safeHandle } from './safeHandle';
import { pipeRepository } from '../database/pipeRepository';
import { IPC_CHANNELS } from '../../shared/types';

export function registerPipeHandlers(): void {
  safeHandle(IPC_CHANNELS.PIPE_GET, (_event, borewellId: string) => {
    return pipeRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.PIPE_SAVE, (_event, borewellId: string, segments: any[]) => {
    return pipeRepository.save(borewellId, segments);
  });
}
