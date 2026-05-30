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
    getStrata: (borewellId: string) => Promise<any[]>;
    saveStrata: (borewellId: string, layers: any[]) => Promise<void>;
    getPipes: (borewellId: string) => Promise<any[]>;
    savePipes: (borewellId: string, segments: any[]) => Promise<void>;
    getPhotos: (borewellId: string) => Promise<any[]>;
    addPhoto: (photo: any) => Promise<void>;
    deletePhoto: (id: string) => Promise<void>;
    getFiles: (borewellId: string) => Promise<any>;
    saveFiles: (borewellId: string, files: any) => Promise<void>;
    parseExcel: (filePath: string) => Promise<any[][]>;
  };
  settings: {
    get: () => Promise<any>;
    save: (updates: any) => Promise<any>;
    backupDatabase: () => Promise<{ success: boolean; error?: string }>;
  };
  geocode: {
    address: (addressQuery: string) => Promise<any>;
  };
  export: {
    pdf: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
    excel: (borewellIds: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
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
