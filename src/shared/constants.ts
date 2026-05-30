/**
 * StrataField — Shared constants.
 * Material definitions, pipe types, and application defaults.
 */

import type { Material } from './types';

// ─── Default Materials ───────────────────────────────────────────────────────

export const DEFAULT_MATERIALS: Material[] = [
  { name: 'Clay',         color: '#8D6E63', pattern: 'bricks',   isCustom: false },
  { name: 'Sand',         color: '#E0C097', pattern: 'dots',     isCustom: false },
  { name: 'Kankar',       color: '#A1887F', pattern: 'crosses',  isCustom: false },
  { name: 'Clay Kankar',  color: '#6D4C41', pattern: 'bricks',   isCustom: false },
  { name: 'Sandy Kankar', color: '#BCAAA4', pattern: 'dots',     isCustom: false },
  { name: 'Gravel',       color: '#9E9E9E', pattern: 'circles',  isCustom: false },
  { name: 'Boulder',      color: '#757575', pattern: 'triangles', isCustom: false },
  { name: 'Rock',         color: '#616161', pattern: 'diagonal', isCustom: false },
];

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
  'dashes',
] as const;

export type PatternType = typeof AVAILABLE_PATTERNS[number];
