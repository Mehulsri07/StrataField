/**
 * StrataField — Shared constants.
 * Material definitions, lithology taxonomy, normalisation maps, and application defaults.
 */

import type { Material, PipeSubtype } from './types';
import materialsJson from '../materials.json';

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

// Conversion factor: 1 metre = 3.28084 feet
export const METRES_TO_FEET = 3.28084;
export const FEET_TO_METRES = 1 / METRES_TO_FEET;

export const DEFAULT_PROJECT = 'Default Project';
