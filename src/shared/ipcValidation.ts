/**
 * IPC Boundary Validation — Validates renderer-supplied data before it touches SQLite.
 * Catches malformed shapes: negative depths, NaN coordinates, extra fields, invalid types.
 * These are safety-net checks, not duplicate-of-form validation — they run in the main process.
 */

import type { StrataLayer, PipeSegment, Material } from './types';

/**
 * Validates a single strata layer input from the renderer.
 * Throws descriptive error on invalid data.
 */
export function validateStrataLayerInput(layer: unknown): StrataLayer {
  if (!layer || typeof layer !== 'object') {
    throw new Error('Invalid strata layer: expected an object');
  }

  const l = layer as Record<string, unknown>;

  if (typeof l.id !== 'string' || l.id.trim() === '') {
    throw new Error('Strata layer missing required field: id');
  }
  if (typeof l.borewellId !== 'string') {
    throw new Error('Strata layer missing required field: borewellId');
  }

  const startDepth = Number(l.startDepth);
  const endDepth = Number(l.endDepth);

  if (isNaN(startDepth) || startDepth < 0) {
    throw new Error(`Strata layer ${l.id}: startDepth must be a non-negative number, got ${l.startDepth}`);
  }
  if (isNaN(endDepth) || endDepth < 0) {
    throw new Error(`Strata layer ${l.id}: endDepth must be a non-negative number, got ${l.endDepth}`);
  }

  if (typeof l.material !== 'string' || l.material.trim() === '') {
    throw new Error(`Strata layer ${l.id}: material must be a non-empty string`);
  }

  return {
    id: l.id,
    borewellId: l.borewellId,
    startDepth,
    endDepth,
    material: l.material,
    color: typeof l.color === 'string' ? l.color : '#8D6E63',
    pattern: typeof l.pattern === 'string' ? l.pattern : 'solid',
    remarks: typeof l.remarks === 'string' ? l.remarks : '',
  };
}

/**
 * Validates a single pipe segment input from the renderer.
 * Throws descriptive error on invalid data.
 */
export function validatePipeSegmentInput(segment: unknown): PipeSegment {
  if (!segment || typeof segment !== 'object') {
    throw new Error('Invalid pipe segment: expected an object');
  }

  const p = segment as Record<string, unknown>;

  if (typeof p.id !== 'string' || p.id.trim() === '') {
    throw new Error('Pipe segment missing required field: id');
  }
  if (typeof p.borewellId !== 'string') {
    throw new Error('Pipe segment missing required field: borewellId');
  }

  const startDepth = Number(p.startDepth);
  const endDepth = Number(p.endDepth);

  if (isNaN(startDepth) || startDepth < 0) {
    throw new Error(`Pipe segment ${p.id}: startDepth must be a non-negative number, got ${p.startDepth}`);
  }
  if (isNaN(endDepth) || endDepth < 0) {
    throw new Error(`Pipe segment ${p.id}: endDepth must be a non-negative number, got ${p.endDepth}`);
  }

  const validPipeTypes = ['plain', 'slotted'] as const;
  if (typeof p.pipeType !== 'string' || !validPipeTypes.includes(p.pipeType as any)) {
    throw new Error(`Pipe segment ${p.id}: pipeType must be 'plain' or 'slotted', got '${p.pipeType}'`);
  }

  return {
    id: p.id,
    borewellId: p.borewellId,
    startDepth,
    endDepth,
    pipeType: p.pipeType as 'plain' | 'slotted',
  };
}

/**
 * Validates material input from the renderer.
 * Throws descriptive error on invalid data.
 */
export function validateMaterialInput(data: unknown): Material {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid material: expected an object');
  }

  const m = data as Record<string, unknown>;

  if (typeof m.id !== 'string' || m.id.trim() === '') {
    throw new Error('Material missing required field: id');
  }
  if (typeof m.name !== 'string' || m.name.trim() === '') {
    throw new Error('Material missing required field: name');
  }
  if (typeof m.color !== 'string') {
    throw new Error('Material missing required field: color');
  }

  return {
    id: m.id,
    name: m.name,
    color: m.color,
    pattern: typeof m.pattern === 'string' ? m.pattern : 'solid',
    isCustom: typeof m.isCustom === 'boolean' ? m.isCustom : true,
  };
}
