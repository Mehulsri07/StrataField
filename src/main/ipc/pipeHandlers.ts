/**
 * IPC handlers for pipe assembly database operations.
 */

import { safeHandle } from './safeHandle';
import { pipeRepository } from '../database/pipeRepository';
import { IPC_CHANNELS } from '../../shared/types';
import type { PipeSegment } from '../../shared/types';
import { validatePipeSegmentInput } from '../../shared/ipcValidation';

export function registerPipeHandlers(): void {
  safeHandle(IPC_CHANNELS.PIPE_GET, (_event, borewellId: string) => {
    return pipeRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.PIPE_SAVE, (_event, borewellId: string, segments: PipeSegment[]) => {
    // Validate each segment at the IPC boundary before touching the database
    const validated = (segments || []).map(s => validatePipeSegmentInput(s));
    return pipeRepository.save(borewellId, validated);
  });
}
