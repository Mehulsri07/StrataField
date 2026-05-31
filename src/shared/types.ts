/**
 * StrataField — Shared type definitions.
 * Used by both the Electron main process and the React renderer.
 */

// ─── Core Domain Models ──────────────────────────────────────────────────────

export interface Borewell {
  id: string;
  borewellId: string;       // user-assigned identifier (e.g. "BW-2024-001")
  project: string;          // project grouping (e.g. "Default Project")
  ownerName: string;
  houseNo: string;
  area: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  boreDia: number | null;   // inches
  pipeDia: number | null;   // inches
  totalDepth: number | null; // feet
  waterLevel: number | null; // feet
  remarks: string;
  date: string;             // ISO date string
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
  importSource: string | null; // file name or null
  importMethod: 'excel' | 'manual';
  deletedAt: string | null;  // ISO datetime if soft-deleted, else null
}

export interface StrataLayer {
  id: string;
  borewellId: string;       // FK → Borewell.id
  startDepth: number;       // feet
  endDepth: number;         // feet
  material: string;
  color: string;            // hex
  pattern: string;          // pattern name (e.g. "dots", "lines", "solid")
  remarks: string;
}

export type PipeType = 'plain' | 'slotted';

export interface PipeSegment {
  id: string;
  borewellId: string;       // FK → Borewell.id
  startDepth: number;       // feet
  endDepth: number;         // feet
  pipeType: PipeType;
}

export interface Photo {
  id: string;
  borewellId: string;       // FK → Borewell.id
  filePath: string;         // absolute path on disk
  captureDate: string | null; // ISO date from EXIF or user input
}

export interface BorewellFile {
  id: string;
  borewellId: string;       // FK → Borewell.id
  excelPath: string | null;
  pdfPath: string | null;
}

// ─── Material System ─────────────────────────────────────────────────────────

export interface Material {
  id: string;
  name: string;
  color: string;            // hex color
  pattern: string;          // pattern type
  isCustom: boolean;
}

// ─── Search & Filters ────────────────────────────────────────────────────────

export interface SearchFilters {
  query: string;
  field: SearchField;
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  project?: string;
  material?: string;
  showDeleted?: boolean;     // for Recycle Bin queries
}

export type SearchField =
  | 'all'
  | 'borewellId'
  | 'ownerName'
  | 'area'
  | 'city'
  | 'date'
  | 'project'
  | 'material';

// ─── Export ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'excel';
export type ExportMode = 'single' | 'bundle';

export interface ExportOptions {
  format: ExportFormat;
  mode: ExportMode;
  borewellIds: string[];
  filters?: {
    location?: string;
    dateFrom?: string;
    dateTo?: string;
    owner?: string;
    project?: string;
  };
}

// ─── Geocoding ───────────────────────────────────────────────────────────────

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  databasePath: string;
  backupPath: string;
  customMaterials: Material[];
}

// ─── IPC Channel Definitions ─────────────────────────────────────────────────

export const IPC_CHANNELS = {
  // Borewell CRUD
  BOREWELL_GET_ALL: 'borewell:getAll',
  BOREWELL_GET_BY_ID: 'borewell:getById',
  BOREWELL_CREATE: 'borewell:create',
  BOREWELL_UPDATE: 'borewell:update',
  BOREWELL_DELETE: 'borewell:delete', // soft delete
  BOREWELL_SEARCH: 'borewell:search',
  
  // Recycle Bin (Trash)
  BOREWELL_GET_TRASH: 'borewell:getTrash',
  BOREWELL_RESTORE: 'borewell:restore',
  BOREWELL_DELETE_PERMANENT: 'borewell:deletePermanent',

  // Strata layers
  STRATA_GET: 'strata:get',
  STRATA_SAVE: 'strata:save',

  // Pipe assembly
  PIPE_GET: 'pipe:get',
  PIPE_SAVE: 'pipe:save',

  // Materials Dictionary CRUD
  MATERIAL_GET_ALL: 'material:getAll',
  MATERIAL_CREATE: 'material:create',
  MATERIAL_UPDATE: 'material:update',
  MATERIAL_DELETE: 'material:delete',

  // Photos
  PHOTO_GET: 'photo:get',
  PHOTO_ADD: 'photo:add',
  PHOTO_DELETE: 'photo:delete',
  PHOTO_EXTRACT_EXIF: 'photo:extractExif',

  // Files
  FILE_GET: 'file:get',
  FILE_SAVE: 'file:save',

  // Geocoding
  GEOCODE_ADDRESS: 'geocode:address',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // File dialogs
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  DIALOG_SAVE_FILE: 'dialog:saveFile',

  // Database
  DB_GET_STATS: 'db:getStats',
  DB_BACKUP: 'db:backup',
  DB_BACKUP_LIST: 'db:backupList',
  DB_BACKUP_RESTORE: 'db:backupRestore',
  DB_BACKUP_RESTORE_EXTERNAL: 'db:backupRestoreExternal',

  // Excel import
  EXCEL_PARSE: 'excel:parse',

  // Export
  EXPORT_PDF: 'export:pdf',
  EXPORT_EXCEL: 'export:excel',
  EXPORT_PNG: 'export:png',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
