/**
 * IPC handlers for strata layer database operations.
 */

import { safeHandle } from './safeHandle';
import { strataRepository } from '../database/strataRepository';
import { IPC_CHANNELS } from '../../shared/types';
import type { StrataLayer } from '../../shared/types';
import { validateStrataLayerInput } from '../../shared/ipcValidation';

export function registerStrataHandlers(): void {
  safeHandle(IPC_CHANNELS.STRATA_GET, (_event, borewellId: string) => {
    return strataRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.STRATA_SAVE, (_event, borewellId: string, layers: StrataLayer[]) => {
    // Validate each layer at the IPC boundary before touching the database
    const validated = (layers || []).map(l => validateStrataLayerInput(l));
    return strataRepository.save(borewellId, validated);
  });

  safeHandle(IPC_CHANNELS.STRATA_GET_UNMAPPED, () => {
    return strataRepository.getUnmappedMaterials();
  });

  safeHandle(IPC_CHANNELS.STRATA_REMAP_MATERIAL, (_event, oldMaterial: string, newMaterialId: string) => {
    return strataRepository.remapMaterial(oldMaterial, newMaterialId);
  });
}
