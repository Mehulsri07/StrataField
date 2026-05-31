import { safeHandle } from './safeHandle';
import { materialRepository } from '../database/materialRepository';
import { IPC_CHANNELS } from '../../shared/types';
import type { Material } from '../../shared/types';

export function registerMaterialHandlers(): void {
  safeHandle(IPC_CHANNELS.MATERIAL_GET_ALL, () => {
    return materialRepository.getAll();
  });

  safeHandle(IPC_CHANNELS.MATERIAL_CREATE, (_event, m: Material) => {
    return materialRepository.create(m);
  });

  safeHandle(IPC_CHANNELS.MATERIAL_UPDATE, (_event, id: string, updates: Partial<Material>) => {
    return materialRepository.update(id, updates);
  });

  safeHandle(IPC_CHANNELS.MATERIAL_DELETE, (_event, id: string) => {
    return materialRepository.delete(id);
  });
}
