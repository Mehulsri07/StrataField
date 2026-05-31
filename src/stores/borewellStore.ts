import { create } from 'zustand';
import type { Borewell, StrataLayer, PipeSegment, SearchFilters, Material } from '@shared/types';

interface BorewellState {
  // Data
  borewells: Borewell[];
  activeBorewellId: string | null;
  trash: Borewell[];
  materials: Material[];
  backups: any[];

  // Search
  searchResults: Borewell[];
  searchFilters: SearchFilters;

  // Strata & Pipe Cache
  strataLayers: Record<string, StrataLayer[]>;
  pipeSegments: Record<string, PipeSegment[]>;

  // Actions
  fetchAll: () => Promise<void>;
  addBorewell: (borewell: Borewell) => Promise<void>;
  updateBorewell: (id: string, updates: Partial<Borewell>) => Promise<void>;
  deleteBorewell: (id: string) => Promise<void>;
  setActiveBorewell: (id: string | null) => void;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  searchBorewells: (query: string) => Promise<void>;

  // Recycle Bin / Trash Actions
  fetchTrash: () => Promise<void>;
  restoreBorewell: (id: string) => Promise<void>;
  deleteBorewellPermanent: (id: string) => Promise<void>;

  // Materials Dictionary Actions
  fetchMaterials: () => Promise<void>;
  addMaterial: (material: Material) => Promise<void>;
  updateMaterial: (id: string, updates: Partial<Material>) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;

  // Backups Actions
  fetchBackupsList: () => Promise<void>;
  restoreBackup: (filename: string) => Promise<{ success: boolean; error?: string }>;
  restoreBackupExternal: (filePath: string) => Promise<{ success: boolean; error?: string }>;

  // Strata & Pipe Actions
  fetchStrata: (borewellId: string) => Promise<void>;
  setStrataLayers: (borewellId: string, layers: StrataLayer[]) => Promise<void>;
  fetchPipes: (borewellId: string) => Promise<void>;
  setPipeSegments: (borewellId: string, segments: PipeSegment[]) => Promise<void>;
}

export const useBorewellStore = create<BorewellState>((set, get) => ({
  // Data
  borewells: [],
  activeBorewellId: null,
  trash: [],
  materials: [],
  backups: [],

  // Search
  searchResults: [],
  searchFilters: { query: '', field: 'all' },

  // Strata & Pipe Cache
  strataLayers: {},
  pipeSegments: {},

  // Actions
  fetchAll: async () => {
    try {
      const records = await window.api.db.getAllBorewells();
      set({ borewells: records, searchResults: records });
      // Fetch materials automatically as well
      await get().fetchMaterials();
    } catch (err) {
      console.error('Store: Failed to fetch all borewells:', err);
    }
  },

  addBorewell: async (borewell) => {
    try {
      await window.api.db.createBorewell(borewell);
      await get().fetchAll();
    } catch (err) {
      console.error('Store: Failed to create borewell:', err);
      throw err;
    }
  },

  updateBorewell: async (id, updates) => {
    try {
      await window.api.db.updateBorewell(id, updates);
      await get().fetchAll();
    } catch (err) {
      console.error(`Store: Failed to update borewell ${id}:`, err);
      throw err;
    }
  },

  deleteBorewell: async (id) => {
    try {
      await window.api.db.deleteBorewell(id);
      await get().fetchAll();
      if (get().activeBorewellId === id) {
        set({ activeBorewellId: null });
      }
    } catch (err) {
      console.error(`Store: Failed to soft-delete borewell ${id}:`, err);
      throw err;
    }
  },

  setActiveBorewell: (id) => set({ activeBorewellId: id }),

  setSearchFilters: (filters) =>
    set((s) => ({
      searchFilters: { ...s.searchFilters, ...filters },
    })),

  searchBorewells: async (query) => {
    const filters = { ...get().searchFilters, query };
    set({ searchFilters: filters });
    try {
      const results = await window.api.db.searchBorewells(filters);
      set({ searchResults: results });
    } catch (err) {
      console.error('Store: Failed to search borewells:', err);
    }
  },

  // Recycle Bin / Trash Actions
  fetchTrash: async () => {
    try {
      const records = await window.api.db.getTrash();
      set({ trash: records });
    } catch (err) {
      console.error('Store: Failed to fetch trash list:', err);
    }
  },

  restoreBorewell: async (id) => {
    try {
      await window.api.db.restoreBorewell(id);
      await get().fetchAll();
      await get().fetchTrash();
    } catch (err) {
      console.error(`Store: Failed to restore borewell ${id}:`, err);
      throw err;
    }
  },

  deleteBorewellPermanent: async (id) => {
    try {
      await window.api.db.deleteBorewellPermanent(id);
      await get().fetchTrash();
    } catch (err) {
      console.error(`Store: Failed to permanently delete borewell ${id}:`, err);
      throw err;
    }
  },

  // Materials Dictionary Actions
  fetchMaterials: async () => {
    try {
      const materials = await window.api.db.getAllMaterials();
      set({ materials });
    } catch (err) {
      console.error('Store: Failed to fetch materials list:', err);
    }
  },

  addMaterial: async (material) => {
    try {
      await window.api.db.createMaterial(material);
      await get().fetchMaterials();
    } catch (err) {
      console.error('Store: Failed to create material:', err);
      throw err;
    }
  },

  updateMaterial: async (id, updates) => {
    try {
      await window.api.db.updateMaterial(id, updates);
      await get().fetchMaterials();
    } catch (err) {
      console.error(`Store: Failed to update material ${id}:`, err);
      throw err;
    }
  },

  deleteMaterial: async (id) => {
    try {
      await window.api.db.deleteMaterial(id);
      await get().fetchMaterials();
    } catch (err) {
      console.error(`Store: Failed to delete material ${id}:`, err);
      throw err;
    }
  },

  // Backups Actions
  fetchBackupsList: async () => {
    try {
      const list = await window.api.settings.getBackupsList();
      set({ backups: list });
    } catch (err) {
      console.error('Store: Failed to fetch backups list:', err);
    }
  },

  restoreBackup: async (filename) => {
    try {
      const result = await window.api.settings.restoreBackup(filename);
      if (result.success) {
        await get().fetchAll();
      }
      return result;
    } catch (err: any) {
      console.error(`Store: Failed to restore backup ${filename}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  },

  restoreBackupExternal: async (filePath) => {
    try {
      const result = await window.api.settings.restoreBackupExternal(filePath);
      if (result.success) {
        await get().fetchAll();
      }
      return result;
    } catch (err: any) {
      console.error(`Store: Failed to restore external backup ${filePath}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  },

  // Strata & Pipe Actions
  fetchStrata: async (borewellId) => {
    try {
      const layers = await window.api.db.getStrata(borewellId);
      set((s) => ({
        strataLayers: { ...s.strataLayers, [borewellId]: layers }
      }));
    } catch (err) {
      console.error(`Store: Failed to fetch strata for borewell ${borewellId}:`, err);
    }
  },

  setStrataLayers: async (borewellId, layers) => {
    try {
      await window.api.db.saveStrata(borewellId, layers);
      set((s) => ({
        strataLayers: { ...s.strataLayers, [borewellId]: layers }
      }));
    } catch (err) {
      console.error(`Store: Failed to save strata for borewell ${borewellId}:`, err);
      throw err;
    }
  },

  fetchPipes: async (borewellId) => {
    try {
      const segments = await window.api.db.getPipes(borewellId);
      set((s) => ({
        pipeSegments: { ...s.pipeSegments, [borewellId]: segments }
      }));
    } catch (err) {
      console.error(`Store: Failed to fetch pipes for borewell ${borewellId}:`, err);
    }
  },

  setPipeSegments: async (borewellId, segments) => {
    try {
      await window.api.db.savePipes(borewellId, segments);
      set((s) => ({
        pipeSegments: { ...s.pipeSegments, [borewellId]: segments }
      }));
    } catch (err) {
      console.error(`Store: Failed to save pipes for borewell ${borewellId}:`, err);
      throw err;
    }
  }
}));
