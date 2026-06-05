/**
 * StrataField — Shared data validation engine.
 * Runs on both the frontend (Zustand & forms) and the main process (before SQLite transactions).
 */

import type { Borewell, StrataLayer, PipeSegment } from './types';

/**
 * Validates coordinate ranges (Latitude: -90 to 90, Longitude: -180 to 180)
 */
export function validateCoordinates(lat: number | null, lng: number | null): string[] {
  const errors: string[] = [];

  if (lat !== null) {
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('Latitude must be a valid number between -90 and 90 degrees.');
    }
  }

  if (lng !== null) {
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('Longitude must be a valid number between -180 and 180 degrees.');
    }
  }

  return errors;
}

/**
 * Validates borewell header metadata properties.
 * Latitude and longitude are optional — GPS may not always be captured at logging time.
 */
export function validateBorewell(b: Partial<Borewell>): string[] {
  const errors: string[] = [];

  if (!b.borewellId || b.borewellId.trim() === '') {
    errors.push('Borewell Name/ID is a mandatory field.');
  }

  if (!b.ownerName || b.ownerName.trim() === '') {
    errors.push('Owner / Client Name is a mandatory field.');
  }

  if (!b.city || b.city.trim() === '') {
    errors.push('City / District is a mandatory field.');
  }

  // Latitude and longitude are optional — only validate range when provided
  if (b.latitude !== undefined && b.latitude !== null && String(b.latitude).trim() !== '') {
    const lat = Number(b.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push('Latitude must be a valid number between -90 and 90 degrees.');
    }
  }

  if (b.longitude !== undefined && b.longitude !== null && String(b.longitude).trim() !== '') {
    const lng = Number(b.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push('Longitude must be a valid number between -180 and 180 degrees.');
    }
  }

  if (b.totalDepth !== undefined && b.totalDepth !== null) {
    if (isNaN(b.totalDepth) || b.totalDepth < 0) {
      errors.push('Total depth cannot be a negative value.');
    }
  }

  if (b.waterLevel !== undefined && b.waterLevel !== null) {
    if (isNaN(b.waterLevel) || b.waterLevel < 0) {
      errors.push('Water level depth cannot be a negative value.');
    }
    if (b.totalDepth !== undefined && b.totalDepth !== null && b.waterLevel > b.totalDepth) {
      errors.push('Water level depth cannot exceed the total borewell depth.');
    }
  }

  return errors;
}

/**
 * Per-field validation for borewell forms.
 * Single source of truth used by both NewBorewellPage and BorewellDetailPage.
 * Returns error message string (empty = valid).
 */
export function validateBorewellField(
  name: string,
  value: any,
  formData?: { totalDepth?: string | number; waterLevel?: string | number }
): string {
  switch (name) {
    case 'borewellId':
      return !value || String(value).trim() === '' ? 'Borewell Name/ID is a mandatory field.' : '';
    case 'project':
      return !value || String(value).trim() === '' ? 'Project Name is a mandatory field.' : '';
    case 'ownerName':
      return !value || String(value).trim() === '' ? 'Owner / Client Name is a mandatory field.' : '';
    case 'city':
      return !value || String(value).trim() === '' ? 'City / District is a mandatory field.' : '';
    case 'latitude': {
      // Optional — only validate range when provided
      if (value === '' || value === null || value === undefined) return '';
      const lat = Number(value);
      if (isNaN(lat) || lat < -90 || lat > 90) return 'Latitude must be a valid number between -90 and 90 degrees.';
      return '';
    }
    case 'longitude': {
      // Optional — only validate range when provided
      if (value === '' || value === null || value === undefined) return '';
      const lng = Number(value);
      if (isNaN(lng) || lng < -180 || lng > 180) return 'Longitude must be a valid number between -180 and 180 degrees.';
      return '';
    }
    case 'totalDepth':
      if (value !== '' && value !== null && value !== undefined) {
        const depth = Number(value);
        if (isNaN(depth) || depth < 0) return 'Total depth cannot be a negative value.';
      }
      return '';
    case 'waterLevel':
      if (value !== '' && value !== null && value !== undefined) {
        const wl = Number(value);
        if (isNaN(wl) || wl < 0) return 'Water level depth cannot be a negative value.';
        const td = formData?.totalDepth;
        if (td !== '' && td !== null && td !== undefined && wl > Number(td)) {
          return 'Water level depth cannot exceed the total borewell depth.';
        }
      }
      return '';
    default:
      return '';
  }
}

/**
 * Enforces strict strata layers continuity validation.
 * Rules:
 * 1. Non-negative depths.
 * 2. startDepth < endDepth for each layer.
 * 3. First layer must start at 0.
 * 4. Layer N+1 start depth must exactly equal Layer N end depth.
 * 5. Strata depths cannot exceed the borewell's total depth.
 */
export function validateStrata(layers: StrataLayer[], totalDepth: number | null): string[] {
  const errors: string[] = [];

  if (!layers || layers.length === 0) return errors;

  // Sort by start depth to check sequence integrity
  const sorted = [...layers].sort((a, b) => a.startDepth - b.startDepth);

  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i];

    if (isNaN(l.startDepth) || l.startDepth < 0) {
      errors.push(`Layer ${i + 1} (${l.material}): Start depth cannot be negative.`);
    }

    if (isNaN(l.endDepth) || l.endDepth < 0) {
      errors.push(`Layer ${i + 1} (${l.material}): End depth cannot be negative.`);
    }

    if (l.startDepth >= l.endDepth) {
      errors.push(`Layer ${i + 1} (${l.material}): End depth (${l.endDepth} ft) must be greater than start depth (${l.startDepth} ft).`);
    }

    if (i === 0 && l.startDepth !== 0) {
      errors.push(`First strata layer must start at 0 ft (currently starts at ${l.startDepth} ft).`);
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (l.startDepth !== prev.endDepth) {
        errors.push(`Gaps or overlaps detected: Layer ${i + 1} (${l.material}) starts at ${l.startDepth} ft, but previous layer (${prev.material}) ends at ${prev.endDepth} ft.`);
      }
    }

    if (totalDepth !== null && l.endDepth > totalDepth) {
      errors.push(`Layer ${i + 1} (${l.material}) end depth (${l.endDepth} ft) exceeds total borewell depth (${totalDepth} ft).`);
    }
  }

  return errors;
}

/**
 * Validates pipe assembly segments.
 * Rules:
 * 1. Non-negative depths.
 * 2. startDepth < endDepth.
 * 3. Segments must not overlap (but gaps are allowed, since pipes don't have to cover the whole well).
 * 4. Segments cannot exceed the total borewell depth.
 */
export function validatePipeSegments(segments: PipeSegment[], totalDepth: number | null): string[] {
  const errors: string[] = [];

  if (!segments || segments.length === 0) return errors;

  const sorted = [...segments].sort((a, b) => a.startDepth - b.startDepth);

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];

    if (isNaN(p.startDepth) || p.startDepth < 0) {
      errors.push(`Segment ${i + 1} (${p.pipeType}): Start depth cannot be negative.`);
    }

    if (isNaN(p.endDepth) || p.endDepth < 0) {
      errors.push(`Segment ${i + 1} (${p.pipeType}): End depth cannot be negative.`);
    }

    if (p.startDepth >= p.endDepth) {
      errors.push(`Segment ${i + 1} (${p.pipeType}): End depth (${p.endDepth} ft) must be greater than start depth (${p.startDepth} ft).`);
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (p.startDepth < prev.endDepth) {
        errors.push(`Overlapping pipe segments: Segment ${i + 1} starts at ${p.startDepth} ft, which overlaps with segment ${i} ending at ${prev.endDepth} ft.`);
      }
    }

    if (totalDepth !== null && p.endDepth > totalDepth) {
      errors.push(`Pipe segment ${i + 1} (${p.pipeType}) end depth (${p.endDepth} ft) exceeds total borewell depth (${totalDepth} ft).`);
    }
  }

  return errors;
}
