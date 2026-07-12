/**
 * TypeScript global window declarations for StrataField.
 */

import type {
  Borewell, StrataLayer, PipeSegment, Photo, BorewellFile,
  Material, SearchFilters, AppSettings, GeocodeResult, ExportLogEntry,
  ExcelParseResult, UnmappedMaterial
} from './shared/types';

export interface WindowApi {
  db: {
    getAllBorewells: () => Promise<Borewell[]>;
    getBorewellById: (id: string) => Promise<Borewell | null>;
    createBorewell: (b: Borewell) => Promise<void>;
    updateBorewell: (id: string, updates: Partial<Borewell>) => Promise<void>;
    deleteBorewell: (id: string) => Promise<void>;
    searchBorewells: (filters: SearchFilters) => Promise<Borewell[]>;
    checkDuplicate: (borewellId: string, project: string, date: string) => Promise<Borewell | null>;
    
    // Recycle Bin / Trash
    getTrash: () => Promise<Borewell[]>;
    restoreBorewell: (id: string) => Promise<void>;
    deleteBorewellPermanent: (id: string) => Promise<void>;

    getStrata: (borewellId: string) => Promise<StrataLayer[]>;
    saveStrata: (borewellId: string, layers: StrataLayer[]) => Promise<void>;
    getUnmappedMaterials: () => Promise<UnmappedMaterial[]>;
    remapMaterial: (oldMaterial: string, newMaterialId: string) => Promise<number>;

    getPipes: (borewellId: string) => Promise<PipeSegment[]>;
    savePipes: (borewellId: string, segments: PipeSegment[]) => Promise<void>;
    
    // Central Materials Dictionary Table
    getAllMaterials: () => Promise<Material[]>;
    createMaterial: (m: Material) => Promise<void>;
    updateMaterial: (id: string, updates: Partial<Material>) => Promise<void>;
    deleteMaterial: (id: string) => Promise<void>;

    getPhotos: (borewellId: string) => Promise<Photo[]>;
    addPhoto: (photo: Photo) => Promise<void>;
    deletePhoto: (id: string) => Promise<void>;
    getFiles: (borewellId: string) => Promise<BorewellFile | null>;
    saveFiles: (borewellId: string, files: Omit<BorewellFile, 'id' | 'borewellId'>) => Promise<void>;
    openPath: (filePath: string) => Promise<string>;
    parseExcel: (filePath: string) => Promise<{ cells: Record<string, { v: any; w: string }>; rows: any[][] }>;
    smartParseExcel: (filePath: string) => Promise<ExcelParseResult>;
    importSave: (data: { borewell: Borewell; strata: StrataLayer[]; pipes: PipeSegment[] }) => Promise<{ success: boolean }>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (updates: Partial<AppSettings>) => Promise<AppSettings>;
    backupDatabase: () => Promise<{ success: boolean; error?: string }>;
    getBackupsList: () => Promise<any[]>;
    restoreBackup: (filename: string) => Promise<{ success: boolean; error?: string }>;
    restoreBackupExternal: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    getBackupStatus: () => Promise<{ lastBackupTime: string | null; status: 'success' | 'failed' | null; integrity: 'ok' | 'failed' | null }>;
  };
  geocode: {
    address: (addressQuery: string) => Promise<GeocodeResult | null>;
  };
  export: {
    pdf: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
    excel: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
    png: (dataUrl: string, savePath: string) => Promise<{ success: boolean; error?: string }>;
    onProgress: (callback: (current: number, total: number) => void) => () => void;
  };
  dialog: {
    openFile: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
    openDirectory: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
    saveFile: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  };
}

declare global {
  interface Window {
    api: WindowApi;
  }
}
