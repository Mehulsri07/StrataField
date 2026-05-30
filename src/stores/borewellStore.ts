/**
 * Borewell Store — Manages borewell records, search, and CRUD operations.
 * Communicates with the SQLite database in the Electron main process via safe IPC channels.
 */

import { create } from 'zustand';
import type { Borewell, StrataLayer, PipeSegment, SearchFilters } from '@shared/types';

interface BorewellState {
  // Data
  borewells: Borewell[];
  activeBorewellId: string | null;

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
      console.error(`Store: Failed to delete borewell ${id}:`, err);
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
