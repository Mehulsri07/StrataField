/**
 * TypeScript global window declarations for StrataField.
 */

export interface WindowApi {
  db: {
    getAllBorewells: () => Promise<any[]>;
    getBorewellById: (id: string) => Promise<any>;
    createBorewell: (b: any) => Promise<void>;
    updateBorewell: (id: string, updates: any) => Promise<void>;
    deleteBorewell: (id: string) => Promise<void>;
    searchBorewells: (filters: any) => Promise<any[]>;
    checkDuplicate: (borewellId: string, project: string, date: string) => Promise<any>;
    
    // Recycle Bin / Trash
    getTrash: () => Promise<any[]>;
    restoreBorewell: (id: string) => Promise<void>;
    deleteBorewellPermanent: (id: string) => Promise<void>;

    getStrata: (borewellId: string) => Promise<any[]>;
    saveStrata: (borewellId: string, layers: any[]) => Promise<void>;
    getPipes: (borewellId: string) => Promise<any[]>;
    savePipes: (borewellId: string, segments: any[]) => Promise<void>;
    
    // Central Materials Dictionary Table
    getAllMaterials: () => Promise<any[]>;
    createMaterial: (m: any) => Promise<void>;
    updateMaterial: (id: string, updates: any) => Promise<void>;
    deleteMaterial: (id: string) => Promise<void>;

    getPhotos: (borewellId: string) => Promise<any[]>;
    addPhoto: (photo: any) => Promise<void>;
    deletePhoto: (id: string) => Promise<void>;
    getFiles: (borewellId: string) => Promise<any>;
    saveFiles: (borewellId: string, files: any) => Promise<void>;
    openPath: (filePath: string) => Promise<string>;
    parseExcel: (filePath: string) => Promise<{ cells: Record<string, { v: any; w: string }>; rows: any[][] }>;
    importSave: (data: { borewell: any; strata: any[]; pipes: any[] }) => Promise<{ success: boolean }>;
  };
  settings: {
    get: () => Promise<any>;
    save: (updates: any) => Promise<any>;
    backupDatabase: () => Promise<{ success: boolean; error?: string }>;
    getBackupsList: () => Promise<any[]>;
    restoreBackup: (filename: string) => Promise<{ success: boolean; error?: string }>;
    restoreBackupExternal: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    getBackupStatus: () => Promise<{ lastBackupTime: string | null; status: 'success' | 'failed' | null; integrity: 'ok' | 'failed' | null }>;
  };
  geocode: {
    address: (addressQuery: string) => Promise<any>;
  };
  export: {
    pdf: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
    excel: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
    png: (dataUrl: string, savePath: string) => Promise<{ success: boolean; error?: string }>;
    onProgress: (callback: (current: number, total: number) => void) => () => void;
  };
  dialog: {
    openFile: (options: any) => Promise<any>;
    openDirectory: (options: any) => Promise<any>;
    saveFile: (options: any) => Promise<any>;
  };
}

declare global {
  interface Window {
    api: WindowApi;
  }
}
