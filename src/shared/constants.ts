/**
 * StrataField — Shared constants.
 * Material definitions, pipe types, and application defaults.
 */

import type { Material } from './types';

// ─── Default Materials ───────────────────────────────────────────────────────

export const DEFAULT_MATERIALS: Material[] = [
  { id: 'sand',         name: 'Sand',         color: '#E0C097', pattern: 'dots',     isCustom: false },
  { id: 'medium_sand',  name: 'medium sand',  color: '#C8A279', pattern: 'dots',     isCustom: false },
  { id: 'fine_sand',    name: 'fine sand',    color: '#EAD1B3', pattern: 'dots',     isCustom: false },
  { id: 'yellow_sand',  name: 'yellow sand',  color: '#EBC066', pattern: 'dots',     isCustom: false },
  { id: 'clay',         name: 'clay',         color: '#8D6E63', pattern: 'lines',    isCustom: false },
  { id: 'kankar',       name: 'kankar',       color: '#BCAAA4', pattern: 'crosses',  isCustom: false },
  { id: 'clay_kankar',  name: 'clay kankar',  color: '#6D4C41', pattern: 'bricks',   isCustom: false },
];

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
  'triangles',
  'diagonal_desc',
  'dashes',
] as const;

export type PatternType = typeof AVAILABLE_PATTERNS[number];
