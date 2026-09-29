/**
 * StrataField — Shared constants.
 * Material definitions, lithology taxonomy, normalisation maps, and application defaults.
 */

import type { Material, LithologyClass, LithologyFamily, PipeSubtype } from './types';
import materialsJson from '../materials.json';

// ─── Lithology Family Mapping ────────────────────────────────────────────────

export const LITHOLOGY_FAMILY: Record<LithologyClass, LithologyFamily> = {
  CLAY: 'CLAY', SILTY_CLAY: 'CLAY', SANDY_CLAY: 'CLAY',
  SILT: 'CLAY', KANKAR: 'CLAY', CLAY_KANKAR: 'CLAY', SANDY_KANKAR: 'CLAY',
  FINE_SAND: 'SAND', MEDIUM_SAND: 'SAND', COARSE_SAND: 'SAND',
  YELLOW_SAND: 'SAND', GRAVEL: 'SAND', SANDY_GRAVEL: 'SAND',
  ROCK: 'ROCK', BOULDER: 'ROCK',
  FILL: 'OTHER', OTHER: 'OTHER', NOT_RECORDED: 'NONE',
};

// ─── Default Materials ───────────────────────────────────────────────────────
// Single source of truth shared with the Rust database seed (core/materials.json).

export const DEFAULT_MATERIALS: Material[] = (materialsJson as Omit<Material, 'isCustom'>[])
  .map(m => ({ ...m, isCustom: false }));

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
  'kanker clay':   'Clay Kankar',
  'kankar clay':   'Clay Kankar',
  'clay kankar':   'Clay Kankar',
  'clay kanker':   'Clay Kankar',
  'sandy kankar':  'Sandy Kankar',
  'sandy kanker':  'Sandy Kankar',
  'kankar sand':   'Sandy Kankar',
  'kanker sand':   'Sandy Kankar',
  'rock':          'Rock',
  'hard rock':     'Rock',
  'boulder':       'Boulder',
  'boulders':      'Boulder',
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
