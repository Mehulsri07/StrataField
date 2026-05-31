/**
 * Preload script — Safe IPC context bridge.
 * Exposes SQLite database CRUD, file dialogs, configurations, and geocoding methods to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/types';

contextBridge.exposeInMainWorld('api', {
  db: {
    getAllBorewells: () => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_ALL),
    getBorewellById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_BY_ID, id),
    createBorewell: (b: any) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_CREATE, b),
    updateBorewell: (id: string, updates: any) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_UPDATE, id, updates),
    deleteBorewell: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_DELETE, id),
    searchBorewells: (filters: any) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_SEARCH, filters),
    checkDuplicate: (borewellId: string, project: string, date: string) => ipcRenderer.invoke('borewell:checkDuplicate', borewellId, project, date),
    
    // Trash / Recycle Bin
    getTrash: () => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_GET_TRASH),
    restoreBorewell: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_RESTORE, id),
    deleteBorewellPermanent: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BOREWELL_DELETE_PERMANENT, id),

    getStrata: (borewellId: string) => ipcRenderer.invoke(IPC_CHANNELS.STRATA_GET, borewellId),
    saveStrata: (borewellId: string, layers: any[]) => ipcRenderer.invoke(IPC_CHANNELS.STRATA_SAVE, borewellId, layers),
    
    getPipes: (borewellId: string) => ipcRenderer.invoke(IPC_CHANNELS.PIPE_GET, borewellId),
    savePipes: (borewellId: string, segments: any[]) => ipcRenderer.invoke(IPC_CHANNELS.PIPE_SAVE, borewellId, segments),

    // Central Materials Dictionary Table
    getAllMaterials: () => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_GET_ALL),
    createMaterial: (m: any) => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_CREATE, m),
    updateMaterial: (id: string, updates: any) => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_UPDATE, id, updates),
    deleteMaterial: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MATERIAL_DELETE, id),

    getPhotos: (borewellId: string) => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_GET, borewellId),
    addPhoto: (photo: any) => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_ADD, photo),
    deletePhoto: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PHOTO_DELETE, id),

    getFiles: (borewellId: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_GET, borewellId),
    saveFiles: (borewellId: string, files: any) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, borewellId, files),
    parseExcel: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXCEL_PARSE, filePath),
    importSave: (data: { borewell: any; strata: any[]; pipes: any[] }) => ipcRenderer.invoke('import:save', data),
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    save: (updates: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, updates),
    backupDatabase: () => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP),
    getBackupsList: () => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_LIST),
    restoreBackup: (filename: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_RESTORE, filename),
    restoreBackupExternal: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP_RESTORE_EXTERNAL, filePath),
  },

  geocode: {
    address: (addressQuery: string) => ipcRenderer.invoke(IPC_CHANNELS.GEOCODE_ADDRESS, addressQuery),
  },

  export: {
    pdf: (borewellIds: string[], savePath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PDF, borewellIds, savePath),
    excel: (borewellIds: string[], savePath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_EXCEL, borewellIds, savePath),
    png: (dataUrl: string, savePath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PNG, dataUrl, savePath),
  },

  dialog: {
    openFile: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
    openDirectory: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, options),
    saveFile: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, options),
  }
});
