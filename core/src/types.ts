/**
 * StrataField — Shared type definitions.
 * Shared by the Rust-backed app and every screen. Kept in sync with the database schema.
 */

// ─── Lithology Taxonomy ─────────────────────────────────────────────────────

// NONE is for "Not recorded" depths: a known gap, never matched or interpolated.
export type LithologyFamily = 'CLAY' | 'SAND' | 'ROCK' | 'OTHER' | 'NONE';

export type LithologyClass =
  // CLAY family
  | 'CLAY'
  | 'SILTY_CLAY'
  | 'SANDY_CLAY'
  | 'SILT'
  | 'KANKAR'         // "Kankar" — calcium carbonate nodules
  | 'CLAY_KANKAR'    // "Kanker clay" — clay with kankar nodules
  | 'SANDY_KANKAR'
  // SAND family
  | 'FINE_SAND'      // "Sand (Fine)"
  | 'MEDIUM_SAND'    // "Sand" (default)
  | 'COARSE_SAND'
  | 'YELLOW_SAND'    // "Sand (Y)" — oxidized, paleochannel indicator
  | 'GRAVEL'
  | 'SANDY_GRAVEL'
  // ROCK family
  | 'ROCK'
  | 'BOULDER'
  // OTHER / NONE
  | 'FILL'
  | 'OTHER'
  | 'NOT_RECORDED';

export type DrillingMethod = 'ROTARY' | 'DTH' | 'MANUAL' | 'UNKNOWN';

export type DepthUnit = 'ft' | 'm';

export type PipeSubtype = 'PLAIN' | 'RIBBED_SCREEN' | 'SLOTTED' | 'MS_SLOTTED';

// ─── Core Domain Models ──────────────────────────────────────────────────────

export type LocationSource = 'gps' | 'photo' | 'map' | 'typed' | 'address' | 'imported' | 'unknown';
export type ElevationSource = 'survey' | 'gps' | 'dem' | 'typed' | 'unknown';
export type RecordQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface Borewell {
  id: string;
  projectId: string | null;
  project: string;          // project name, e.g. "Zone 1 · Old City"
  borewellId: string;       // user-assigned identifier (e.g. "BW-2024-001")
  ownerName: string;
  houseNo: string;
  area: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource;   // address lookups are approximate
  locationAccuracyM: number | null;
  groundElevationM: number | null;  // metres
  elevationSource: ElevationSource | null;
  boreDia: number | null;   // inches
  pipeDia: number | null;   // inches
  totalDepth: number | null; // feet (or metres if depthUnit='m')
  waterLevel: number | null; // current static level; follows the newest water reading
  dynamicWaterLevel: number | null;
  depthUnit: DepthUnit;
  drillingMethod: DrillingMethod | null;
  recordQuality: RecordQuality;
  remarks: string;
  date: string;             // ISO date string
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
  importBatchId: string | null;
  importSource: string | null; // file name or null
  importMethod: 'excel' | 'manual' | 'legacy';
  deletedAt: string | null;  // ISO datetime if in the Recycle bin, else null
  waterLevelOn: string | null; // date the water level was measured (newest reading, else the drilling date)
  pumpType: string;          // e.g. "Borewell submersible, 4 inch (100 mm)"; '' when not recorded
  pumpMake: string;          // the company, e.g. "KSB"
  pumpModel: string;         // e.g. "12C/17"; older records may have the company here too
  pumpHp: number | null;
  pumpLowering: number | null; // how deep the pump hangs, feet below ground
  pumpPhase: string;         // "Single phase" or "Three phase"; '' when not recorded
  columnPipeDia: number | null; // the pipe the pump hangs on, inches
  columnPipeMaterial: string;   // "PVC" or "MS" (mild steel); '' when not recorded
}

/** What screens send to create or update a borewell. A new project name creates the project. */
export type BorewellInput = Partial<Omit<Borewell,
  'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'importMethod'>> & {
  borewellId: string;
  importMethod?: 'excel' | 'manual';
};

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
  waterBearing: boolean;
}

export type PipeType = 'plain' | 'slotted';

export interface PipeSegment {
  id: string;
  borewellId: string;       // FK → Borewell.id
  startDepth: number;       // feet
  endDepth: number;         // feet
  pipeType: PipeType;
  pipeSubtype: PipeSubtype | null;
  diameter: number | null;  // inches
}

export interface WaterReading {
  id: string;
  borewellId: string;
  measuredOn: string;       // ISO date
  staticLevel: number | null;
  dynamicLevel: number | null;
  source: string;
  remarks: string;
}

export interface Photo {
  id: string;
  borewellId: string;       // FK → Borewell.id
  filePath: string;         // absolute path on disk
  captureDate: string | null; // ISO date from EXIF or user input
  latitude: number | null;
  longitude: number | null;
  caption: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  borewellId: string;
  kind: 'excel' | 'pdf' | 'other';
  filePath: string;         // absolute path on disk
  originalName: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  borewellCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: number;
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'import' | 'purge';
  changedAt: string;
  summary: string;           // plain-language description, e.g. "Saved 9 soil layers for BW-2026-024"
}

/** Everything the detail screen shows for one borewell. */
export interface BorewellRecord {
  borewell: Borewell;
  strata: StrataLayer[];
  pipes: PipeSegment[];
  waterReadings: WaterReading[];
  photos: Photo[];
  files: Attachment[];
  history: HistoryEntry[];
}

/** One row of the Borewells list, with its layers for the layer strip. */
export interface BorewellListItem {
  borewell: Borewell;
  strata: StrataLayer[];
}

/** A saved cross-section, reproducible from its line and settings. */
export interface Section {
  id: string;
  name: string;
  line: [number, number][];  // [latitude, longitude] points
  corridorHalfKm: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  | 'MULTI_BOREWELL_SHEET'   // warning — the sheet holds further logs below this one
  | 'SAME_AS_FIRST_LOG'      // warning — a further log with the first one's layers: the same borewell drawn again
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
  pumpLowering: number | null; // always in feet
  pumpHp: number | null;
  pumpModel: string | null;
  detectedUnit: DepthUnit;
}

export interface ParsedStrataLayer {
  startDepth: number;   // always in feet
  endDepth: number;     // always in feet
  material: string;     // normalised name
  materialId: string | null;
  color: string;
  pattern: string;
  /** What the log says about the layer beside its name, e.g. "Good". */
  remarks?: string;
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
  failureReason?: string;         // set when success is false; shown to the user
}

// ─── Search & Filters ────────────────────────────────────────────────────────

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  project?: string;
  materialId?: string;
  minDepth?: number;
  maxDepth?: number;
  minWaterLevel?: number;
  maxWaterLevel?: number;
  noLocation?: boolean;      // only borewells without coordinates
  showDeleted?: boolean;     // list the Recycle bin instead
}

// ─── Place search ────────────────────────────────────────────────────────────

/** A place found by name. Approximate: the middle of a colony or road, not a plot. */
export interface Place {
  latitude: number;
  longitude: number;
  name: string;
  /** Where it is, e.g. "Gomti Nagar, Lucknow, Uttar Pradesh". */
  detail: string;
}

// ─── Backups, start-up and import ────────────────────────────────────────────

export interface BackupInfo {
  fileName: string;
  path: string;
  createdAt: string;
  kind: 'auto' | 'manual' | 'before-update' | 'before-restore' | 'before-legacy-import';
  label: string;             // plain-language, e.g. "Made by you"
  sizeBytes: number;
  borewellCount: number | null;
  readable: boolean;
}

export interface LegacyImportReport {
  source: string;
  borewells: number;
  inRecycleBin: number;
  strataLayers: number;
  pipeSegments: number;
  photos: number;
  files: number;
  waterReadings: number;
  customMaterialsAdded: number;
  alreadyPresent: number;
  unmatchedMaterialNames: string[];
  orphanedLayers: number;
  orphanedPipes: number;
  orphanedAttachments: number;
  safetyBackup: string | null;
}

export interface StartupStatus {
  dataFolder: string;
  open: { path: string; schemaVersion: number; previousVersion: number; created: boolean; upgradeBackup: string | null } | null;
  legacyImport: LegacyImportReport | null;
  legacyImportError: string | null;
  automaticBackup: string | null;
  error: string | null;       // set when the database could not be opened
}

export interface ImportedBorewell {
  borewell: BorewellInput;
  strata: Partial<StrataLayer>[];
  pipes: Partial<PipeSegment>[];
  /** What the Import screen said about the file; kept in the borewell's history. */
  notes?: string[];
}

export interface ImportRequest {
  fileName: string;
  sourcePath?: string;
  unrecognisedNames: string[];
  resolutions: Record<string, string>;
  borewells: ImportedBorewell[];
}

export interface ImportResult {
  batchId: string;
  borewellIds: string[];
}
