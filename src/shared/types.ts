/**
 * StrataField — Shared type definitions.
 * Used by both the Electron main process and the React renderer.
 */

// ─── Lithology Taxonomy ─────────────────────────────────────────────────────

export type LithologyFamily = 'CLAY' | 'SAND' | 'OTHER';

export type LithologyClass =
  // CLAY family
  | 'CLAY'
  | 'SILTY_CLAY'
  | 'SANDY_CLAY'
  | 'SILT'
  | 'KANKAR'         // "Kanker clay" / "Kankar" — calcium carbonate nodules
  // SAND family
  | 'FINE_SAND'      // "Sand (Fine)"
  | 'MEDIUM_SAND'    // "Sand" (default)
  | 'COARSE_SAND'
  | 'YELLOW_SAND'    // "Sand (Y)" — oxidized, paleochannel indicator
  | 'GRAVEL'
  | 'SANDY_GRAVEL'
  // OTHER
  | 'FILL'
  | 'ROCK'
  | 'OTHER';

export type DrillingMethod = 'ROTARY' | 'DTH' | 'MANUAL' | 'UNKNOWN';

export type DepthUnit = 'ft' | 'm';

export type PipeSubtype = 'PLAIN' | 'RIBBED_SCREEN' | 'SLOTTED' | 'MS_SLOTTED';

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
  totalDepth: number | null; // feet (or metres if depthUnit='m')
  waterLevel: number | null; // feet (or metres if depthUnit='m')
  remarks: string;
  date: string;             // ISO date string
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
  importSource: string | null; // file name or null
  importMethod: 'excel' | 'manual';
  deletedAt: string | null;  // ISO datetime if soft-deleted, else null
  drillingMethod: DrillingMethod | null;
  depthUnit: DepthUnit;
}

export interface StrataLayer {
  id: string;
  borewellId: string;       // FK → Borewell.id
  startDepth: number;       // feet
  endDepth: number;         // feet
  material: string;
  materialId: string | null; // FK → Material.id (canonical reference)
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
  pipeSubtype: PipeSubtype | null;
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
  lithologyClass: LithologyClass | null;
  lithologyFamily: LithologyFamily | null;
}

// ─── Smart Parser Types ─────────────────────────────────────────────────────

export type AnomalyCode =
  | 'MULTI_BOREWELL_SHEET'   // warning — only first parsed
  | 'UNIT_AMBIGUOUS'         // warning — inferred from intervals
  | 'UNIT_MIXED'             // warning — metadata vs intervals disagree
  | 'MATERIAL_UNKNOWN'       // warning — kept as-is, needs mapping
  | 'DEPTH_NON_MONOTONIC'    // warning — row skipped
  | 'DEPTH_GAP'              // warning — gap > expected step
  | 'DEPTH_OVERLAP'          // warning — layer end > next start
  | 'WATER_LEVEL_MISSING'    // warning — enter manually
  | 'DATE_MISSING'           // warning — enter manually
  | 'SITE_NAME_MISSING'      // warning — enter manually
  | 'NO_STRATA_FOUND'        // critical — triggers manual review
  | 'NON_STANDARD_FORMAT'    // critical — triggers manual review
  | 'PIPE_TYPE_UNKNOWN';     // warning — defaulted to plain

export type AnomalySeverity = 'warning' | 'critical';

export interface ParseAnomaly {
  code: AnomalyCode;
  severity: AnomalySeverity;
  message: string;
  row?: number;
}

export interface ParsedBoreholeMetadata {
  siteName: string | null;
  ownerName: string | null;
  address: string | null;
  city: string | null;
  date: string | null;
  boreDia: number | null;
  pipeDia: number | null;
  totalDepth: number | null;  // always in feet
  waterLevel: number | null;  // always in feet
  detectedUnit: DepthUnit;
}

export interface ParsedStrataLayer {
  startDepth: number;   // always in feet
  endDepth: number;     // always in feet
  material: string;     // normalised name
  materialId: string | null;
  color: string;
  pattern: string;
}

export interface ParsedPipeSegment {
  startDepth: number;
  endDepth: number;
  pipeType: PipeType;
  pipeSubtype: PipeSubtype | null;
  originalLabel: string;
}

export interface ExcelParseResult {
  success: boolean;
  metadata: ParsedBoreholeMetadata;
  strata: ParsedStrataLayer[];
  pipes: ParsedPipeSegment[];
  anomalies: ParseAnomaly[];
  requiresManualReview: boolean;  // true if any CRITICAL anomaly
}

// ─── Unmapped Material (for data cleanup) ───────────────────────────────────

export interface UnmappedMaterial {
  material: string;       // free-text value in strata_layers
  layerCount: number;     // how many layers use this value
  suggestedMatch: string | null;  // best fuzzy match from materials dictionary
  suggestedMatchId: string | null;
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
  minDepth?: number;         // minimum total_depth filter (feet)
  maxDepth?: number;         // maximum total_depth filter (feet)
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

export interface ExportLogEntry {
  filename: string;
  recordCount: number;
  format: string;
  date: string;
}

export interface AppSettings {
  theme: ThemeMode;
  databasePath: string;
  backupPath: string;
  customMaterials: Material[];
  recentExports: ExportLogEntry[];
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
  STRATA_GET_UNMAPPED: 'strata:getUnmapped',
  STRATA_REMAP_MATERIAL: 'strata:remapMaterial',

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
  EXCEL_SMART_PARSE: 'excel:smartParse',

  // Export
  EXPORT_PDF: 'export:pdf',
  EXPORT_EXCEL: 'export:excel',
  EXPORT_PNG: 'export:png',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
