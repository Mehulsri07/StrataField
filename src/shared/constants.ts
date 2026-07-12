/**
 * StrataField — Shared constants.
 * Material definitions, lithology taxonomy, normalisation maps, and application defaults.
 */

import type { Material, LithologyClass, LithologyFamily, PipeSubtype } from './types';

// ─── Lithology Family Mapping ────────────────────────────────────────────────

export const LITHOLOGY_FAMILY: Record<LithologyClass, LithologyFamily> = {
  CLAY: 'CLAY', SILTY_CLAY: 'CLAY', SANDY_CLAY: 'CLAY',
  SILT: 'CLAY', KANKAR: 'CLAY',
  FINE_SAND: 'SAND', MEDIUM_SAND: 'SAND', COARSE_SAND: 'SAND',
  YELLOW_SAND: 'SAND', GRAVEL: 'SAND', SANDY_GRAVEL: 'SAND',
  FILL: 'OTHER', ROCK: 'OTHER', OTHER: 'OTHER',
};

// ─── Default Materials (10-material taxonomy from field analysis) ────────────

export const DEFAULT_MATERIALS: Material[] = [
  // CLAY family — brown/earth spectrum
  { id: 'clay',         name: 'Clay',        color: '#8B6914', pattern: 'lines',        isCustom: false, lithologyClass: 'CLAY',        lithologyFamily: 'CLAY' },
  { id: 'silty_clay',   name: 'Silty Clay',  color: '#A0785A', pattern: 'lines',        isCustom: false, lithologyClass: 'SILTY_CLAY',  lithologyFamily: 'CLAY' },
  { id: 'sandy_clay',   name: 'Sandy Clay',  color: '#B8956A', pattern: 'dots',         isCustom: false, lithologyClass: 'SANDY_CLAY',  lithologyFamily: 'CLAY' },
  { id: 'silt',         name: 'Silt',        color: '#C4A882', pattern: 'diagonal',     isCustom: false, lithologyClass: 'SILT',        lithologyFamily: 'CLAY' },
  { id: 'kankar',       name: 'Kankar',      color: '#D4C5A0', pattern: 'circles',      isCustom: false, lithologyClass: 'KANKAR',      lithologyFamily: 'CLAY' },
  // SAND family — yellow/amber spectrum
  { id: 'fine_sand',    name: 'Fine Sand',   color: '#E8D5A3', pattern: 'dots',         isCustom: false, lithologyClass: 'FINE_SAND',   lithologyFamily: 'SAND' },
  { id: 'medium_sand',  name: 'Sand',        color: '#D4B862', pattern: 'dots',         isCustom: false, lithologyClass: 'MEDIUM_SAND', lithologyFamily: 'SAND' },
  { id: 'coarse_sand',  name: 'Coarse Sand', color: '#C49A3C', pattern: 'crosses',      isCustom: false, lithologyClass: 'COARSE_SAND', lithologyFamily: 'SAND' },
  { id: 'yellow_sand',  name: 'Yellow Sand', color: '#E8C84A', pattern: 'dots',         isCustom: false, lithologyClass: 'YELLOW_SAND', lithologyFamily: 'SAND' },
  { id: 'gravel',       name: 'Gravel',      color: '#A67C2E', pattern: 'circles',      isCustom: false, lithologyClass: 'GRAVEL',       lithologyFamily: 'SAND' },
  { id: 'sandy_gravel', name: 'Sandy Gravel', color: '#C49A3C', pattern: 'circles',     isCustom: false, lithologyClass: 'SANDY_GRAVEL', lithologyFamily: 'SAND' },
];

// ─── Material Normalisation Map (complete vocabulary from 6 field Excel files) ─

export const MATERIAL_NORMALISATION_MAP: Record<string, string> = {
  'clay':          'Clay',
  'sand':          'Sand',
  'sand (fine)':   'Fine Sand',
  'sand ( fine)':  'Fine Sand',
  'sand(fine)':    'Fine Sand',
  'fine sand':     'Fine Sand',
  'sand (y)':      'Yellow Sand',   // Y = Yellow, NOT Yielding
  'sand ( y )':    'Yellow Sand',
  'sand(y)':       'Yellow Sand',
  'yellow sand':   'Yellow Sand',
  'kanker clay':   'Kankar',
  'kankar clay':   'Kankar',
  'kanker':        'Kankar',
  'kankar':        'Kankar',
  'kanker soil':   'Kankar',
  'kankar soil':   'Kankar',
  'silty clay':    'Silty Clay',
  'sandy clay':    'Sandy Clay',
  'silt':          'Silt',
  'coarse sand':   'Coarse Sand',
  'gravel':        'Gravel',
  'sandy gravel':  'Sandy Gravel',
  'medium sand':   'Sand',
};

// ─── Pipe Subtype Vocabulary Map ────────────────────────────────────────────

export const PIPE_SUBTYPE_MAP: Record<string, { pipeType: 'plain' | 'slotted'; subtype: PipeSubtype }> = {
  'plain pipe':     { pipeType: 'plain',   subtype: 'PLAIN' },
  'plain':          { pipeType: 'plain',   subtype: 'PLAIN' },
  'casing':         { pipeType: 'plain',   subtype: 'PLAIN' },
  'ribbed screen':  { pipeType: 'slotted', subtype: 'RIBBED_SCREEN' },
  'slotted pipe':   { pipeType: 'slotted', subtype: 'SLOTTED' },
  'slotted':        { pipeType: 'slotted', subtype: 'SLOTTED' },
  'screen':         { pipeType: 'slotted', subtype: 'RIBBED_SCREEN' },
  'filter':         { pipeType: 'slotted', subtype: 'SLOTTED' },
  'ms slotted':     { pipeType: 'slotted', subtype: 'MS_SLOTTED' },
};

// ─── Depth Unit Options ─────────────────────────────────────────────────────

export const DEPTH_UNIT_OPTIONS = [
  { value: 'ft' as const, label: 'Feet (ft)', shortLabel: 'ft' },
  { value: 'm' as const, label: 'Metres (m)', shortLabel: 'm' },
];

// ─── Drilling Method Options ────────────────────────────────────────────────

export const DRILLING_METHOD_OPTIONS = [
  { value: 'ROTARY' as const, label: 'Rotary' },
  { value: 'DTH' as const, label: 'DTH (Down-the-Hole)' },
  { value: 'MANUAL' as const, label: 'Manual' },
  { value: 'UNKNOWN' as const, label: 'Unknown' },
];

// Conversion factor: 1 metre = 3.28084 feet
export const METRES_TO_FEET = 3.28084;
export const FEET_TO_METRES = 1 / METRES_TO_FEET;

// ─── Excel Scan Keywords ─────────────────────────────────────────────────────

export const SCAN_KEYWORDS = {
  borewellId: ['borewell id', 'borewell', 'hole id', 'hole no', 'hole', 'well id', 'well', 'id'],
  ownerName: ['owner', 'client', 'customer', 'owner name', 'client name'],
  project: ['project', 'project name', 'site', 'site name', 'job'],
  city: ['city', 'town', 'district', 'location', 'region'],
  address: ['address', 'site address', 'location address'],
  latitude: ['latitude', 'lat', 'y coordinate', 'y coord', 'northing'],
  longitude: ['longitude', 'lng', 'long', 'x coordinate', 'x coord', 'easting'],
  totalDepth: ['depth', 'total depth', 'final depth', 'well depth', 'bore depth'],
  waterLevel: ['water level', 'static water level', 'swl', 'water depth'],
  remarks: ['remarks', 'remark', 'description', 'notes', 'comment'],
  date: ['date', 'logged date', 'drill date', 'drilled date']
};

export const DEFAULT_PROJECT = 'Default Project';

// ─── Excel Column Helpers ─────────────────────────────────────────────────────
// Shared by NewBorewellPage and ImportPage — do not duplicate.

/** Convert Excel column letter(s) to zero-based index. e.g. "A" → 0, "B" → 1, "AA" → 26 */
export function colLetterToNum(val: string): number {
  let num = 0;
  for (let i = 0; i < val.length; i++) {
    num = num * 26 + (val.charCodeAt(i) - 64);
  }
  return num - 1;
}

/** Convert zero-based column index to Excel letter(s). e.g. 0 → "A", 26 → "AA" */
export function numToColLetter(num: number): string {
  let temp = '';
  let idx = num;
  while (idx >= 0) {
    temp = String.fromCharCode((idx % 26) + 65) + temp;
    idx = Math.floor(idx / 26) - 1;
  }
  return temp;
}

// ─── Pipe Type Definitions ───────────────────────────────────────────────────

export const PIPE_TYPES = {
  plain:   { label: 'Plain Pipe',   color: '#FFFFFF' },
  slotted: { label: 'Slotted Pipe', color: '#42A5F5' },
} as const;

// ─── Application Defaults ────────────────────────────────────────────────────

export const APP_DEFAULTS = {
  STRATA_BLOCK_MIN_HEIGHT: 64,   // px
  STRATA_BLOCK_MIN_WIDTH: 24,    // px
  DEFAULT_BORE_DIA: 8,           // inches
  DEFAULT_PIPE_DIA: 6,           // inches
  GEOCODE_RATE_LIMIT_MS: 1000,   // Nominatim requires 1s between requests
  SEARCH_DEBOUNCE_MS: 300,
  AUTOSAVE_DEBOUNCE_MS: 2000,
  MAX_SEARCH_RESULTS: 100,
  DB_FILENAME: 'stratafield.db',
} as const;

// ─── Nominatim Geocoding ─────────────────────────────────────────────────────

export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
export const NOMINATIM_USER_AGENT = 'StrataField/1.0';

// ─── Patterns Available ─────────────────────────────────────────────────────

export const AVAILABLE_PATTERNS = [
  'solid',
  'dots',
  'lines',
  'diagonal',
  'crosses',
  'bricks',
  'circles',
] as const;

export type PatternType = typeof AVAILABLE_PATTERNS[number];
