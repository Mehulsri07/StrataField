/**
 * Preload script — Safe IPC context bridge.
 * Exposes SQLite database CRUD, file dialogs, configurations, and geocoding methods to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/types';
import type { Borewell, SearchFilters, StrataLayer, PipeSegment, Material, Photo, BorewellFile, AppSettings, ExcelParseResult, UnmappedMaterial } from './shared/types';

contextBridge.exposeInMainWorld('api', {
  db: {
    getAllBorewells: (): Promise<Borewell[]> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_ALL),
    getBorewellById: (id: string): Promise<Borewell | null> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_BY_ID, id),
    createBorewell: (b: Borewell): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_CREATE, b),
    updateBorewell: (id: string, updates: Partial<Borewell>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_UPDATE, id, updates),
    deleteBorewell: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_DELETE, id),
    searchBorewells: (filters: SearchFilters): Promise<Borewell[]> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_SEARCH, filters),
    checkDuplicate: (borewellId: string, project: string, date: string): Promise<Borewell | null> => ipcRenderer.invoke('borewell:checkDuplicate', borewellId, project, date),
    
    // Recycle Bin / Trash
    getTrash: (): Promise<Borewell[]> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_TRASH),
    restoreBorewell: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_RESTORE, id),
    deleteBorewellPermanent: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_DELETE_PERMANENT, id),

    getStrata: (borewellId: string): Promise<StrataLayer[]> => ipcRenderer.invoke(IPC_CHANNELS.STRATA_GET, borewellId),
    saveStrata: (borewellId: string, layers: StrataLayer[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.STRATA_SAVE, borewellId, layers),
    getUnmappedMaterials: (): Promise<UnmappedMaterial[]> => ipcRenderer.invoke(IPC_CHANNELS.STRATA_GET_UNMAPPED),
    remapMaterial: (oldMaterial: string, newMaterialId: string): Promise<number> => ipcRenderer.invoke(IPC_CHANNELS.STRATA_REMAP_MATERIAL, oldMaterial, newMaterialId),
    
    getPipes: (borewellId: string): Promise<PipeSegment[]> => ipcRenderer.invoke(IPC_CHANNELS.PIPE_GET, borewellId),
    savePipes: (borewellId: string, segments: PipeSegment[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.PIPE_SAVE, borewellId, segments),

    // Central Materials Dictionary Table
    getAllMaterials: (): Promise<Material[]> => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_GET_ALL),
    createMaterial: (m: Material): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_CREATE, m),
    updateMaterial: (id: string, updates: Partial<Material>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_UPDATE, id, updates),
    deleteMaterial: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_DELETE, id),

    getPhotos: (borewellId: string): Promise<Photo[]> => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_GET, borewellId),
    addPhoto: (photo: Photo): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_ADD, photo),
    deletePhoto: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_DELETE, id),

    getFiles: (borewellId: string): Promise<BorewellFile | null> => ipcRenderer.invoke(IPC_CHANNELS.FILE_GET, borewellId),
    saveFiles: (borewellId: string, files: Omit<BorewellFile, 'id' | 'borewellId'>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, borewellId, files),
    openPath: (filePath: string): Promise<string> => ipcRenderer.invoke('file:openPath', filePath),
    parseExcel: (filePath: string): Promise<{ cells: Record<string, { v: any; w: string }>; rows: any[][] }> => ipcRenderer.invoke(IPC_CHANNELS.EXCEL_PARSE, filePath),
    smartParseExcel: (filePath: string): Promise<ExcelParseResult> => ipcRenderer.invoke(IPC_CHANNELS.EXCEL_SMART_PARSE, filePath),
    importSave: (data: { borewell: Borewell; strata: StrataLayer[]; pipes: PipeSegment[] }): Promise<{ success: boolean }> => ipcRenderer.invoke('import:save', data),
  },

  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    save: (updates: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, updates),
    backupDatabase: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP),
    getBackupsList: (): Promise<any[]> => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_LIST),
    restoreBackup: (filename: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_RESTORE, filename),
    restoreBackupExternal: (filePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_RESTORE_EXTERNAL, filePath),
    getBackupStatus: (): Promise<{ lastBackupTime: string | null; status: 'success' | 'failed' | null; integrity: 'ok' | 'failed' | null }> => ipcRenderer.invoke('settings:getBackupStatus'),
  },

  geocode: {
    address: (addressQuery: string): Promise<{ latitude: number; longitude: number; displayName: string } | null> => ipcRenderer.invoke(IPC_CHANNELS.GEOCODE_ADDRESS, addressQuery),
  },

  export: {
    pdf: (borewellIds: string[], savePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PDF, borewellIds, savePath),
    excel: (borewellIds: string[], savePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_EXCEL, borewellIds, savePath),
    png: (dataUrl: string, savePath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PNG, dataUrl, savePath),
    onProgress: (callback: (current: number, total: number) => void) => {
      const subscription = (_event: any, current: number, total: number) => callback(current, total);
      ipcRenderer.on('export:progress', subscription);
      return () => {
        ipcRenderer.removeListener('export:progress', subscription);
      };
    }
  },

  dialog: {
    openFile: (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
    openDirectory: (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, options),
    saveFile: (options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, options),
  }
});
