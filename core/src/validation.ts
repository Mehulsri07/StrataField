/**
 * Checks for borewell details, soil layers and pipes, written in plain language for the screens.
 *
 * - A "problem" must be fixed before saving (the database would refuse it anyway).
 * - A "warning" is worth a look but may be correct. Gaps between layers are warnings, never
 *   errors: a depth nobody logged is marked "Not recorded" rather than guessed.
 */
import type { BorewellInput, PipeSegment, StrataLayer } from './types';

export type Severity = 'problem' | 'warning';

export interface Issue {
  severity: Severity;
  message: string;
  /** Form field the issue belongs to, when there is one. */
  field?: string;
  /** For gaps between layers: the missing depth range, so the screen can offer "Mark as not recorded". */
  gap?: [number, number];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function checkBorewell(b: BorewellInput): Issue[] {
  const issues: Issue[] = [];
  const problem = (field: string, message: string) => issues.push({ severity: 'problem', field, message });
  const warning = (field: string, message: string) => issues.push({ severity: 'warning', field, message });

  if (!b.borewellId?.trim()) problem('borewellId', 'Enter a borewell ID, for example BW-2026-025.');
  if (!b.ownerName?.trim()) warning('ownerName', "The owner's name is empty.");

  const hasLat = b.latitude != null, hasLon = b.longitude != null;
  if (hasLat !== hasLon) {
    problem(hasLat ? 'longitude' : 'latitude', 'Enter both latitude and longitude, or neither.');
  } else if (hasLat && hasLon) {
    if (!isNum(b.latitude) || b.latitude! < -90 || b.latitude! > 90) problem('latitude', 'Latitude must be between -90 and 90.');
    if (!isNum(b.longitude) || b.longitude! < -180 || b.longitude! > 180) problem('longitude', 'Longitude must be between -180 and 180.');
  }

  const nonNegative: [keyof BorewellInput, string][] = [
    ['totalDepth', 'Total depth'], ['waterLevel', 'Water level'], ['dynamicWaterLevel', 'Pumping water level'],
    ['boreDia', 'Hole size'], ['pipeDia', 'Pipe size'], ['pumpHp', 'Pump power'], ['pumpLowering', 'Pump lowering'],
    ['columnPipeDia', 'Column pipe size'],
  ];
  for (const [field, label] of nonNegative) {
    const v = b[field];
    if (v != null && (!isNum(v) || v < 0)) problem(field, `${label} must be a number of zero or more.`);
  }
  if (isNum(b.totalDepth) && isNum(b.waterLevel) && b.waterLevel > b.totalDepth) {
    problem('waterLevel', `The water level (${b.waterLevel} ft) is deeper than the borewell (${b.totalDepth} ft).`);
  }
  if (isNum(b.pumpLowering) && isNum(b.totalDepth) && b.pumpLowering > b.totalDepth) {
    problem('pumpLowering', `The pump (${b.pumpLowering} ft) is lowered deeper than the borewell (${b.totalDepth} ft).`);
  } else if (isNum(b.pumpLowering) && b.pumpLowering > 0 && isNum(b.waterLevel) && b.pumpLowering <= b.waterLevel) {
    warning('pumpLowering', `The pump (${b.pumpLowering} ft) is above the water level (${b.waterLevel} ft), so it would run dry. Check both.`);
  }
  if (isNum(b.boreDia) && isNum(b.pipeDia) && b.pipeDia > b.boreDia) {
    warning('pipeDia', `The pipe (${b.pipeDia}") is wider than the hole (${b.boreDia}"). Check both sizes.`);
  }
  return issues;
}

type LayerLike = Pick<StrataLayer, 'startDepth' | 'endDepth' | 'material'> & { materialId?: string | null };

export function checkLayers(layers: LayerLike[], totalDepth: number | null | undefined): Issue[] {
  const issues: Issue[] = [];
  if (layers.length === 0) return issues;
  const sorted = [...layers].sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);
  const name = (l: LayerLike) => l.material || 'A layer';

  sorted.forEach((l, i) => {
    if (!isNum(l.startDepth) || !isNum(l.endDepth) || l.startDepth < 0) {
      issues.push({ severity: 'problem', message: `${name(l)} has a depth that is not a valid number.` });
      return;
    }
    if (l.endDepth <= l.startDepth) {
      issues.push({ severity: 'problem', message: `${name(l)} ends at ${l.endDepth} ft, which is not deeper than where it starts (${l.startDepth} ft).` });
    }
    if (!l.material?.trim() && !l.materialId) {
      issues.push({ severity: 'problem', message: `The layer from ${l.startDepth} to ${l.endDepth} ft needs a soil type.` });
    }
    const prev = sorted[i - 1];
    if (i === 0 && l.startDepth > 0) {
      issues.push({ severity: 'warning', message: `Nothing is filled in from 0 to ${l.startDepth} ft.`, gap: [0, l.startDepth] });
    }
    if (prev && l.startDepth > prev.endDepth) {
      issues.push({ severity: 'warning', message: `Nothing is filled in from ${prev.endDepth} to ${l.startDepth} ft.`, gap: [prev.endDepth, l.startDepth] });
    }
    if (prev && l.startDepth < prev.endDepth) {
      issues.push({ severity: 'problem', message: `${name(prev)} and ${name(l)} both cover ${l.startDepth} to ${Math.min(prev.endDepth, l.endDepth)} ft. Change one of the depths.` });
    }
  });

  const last = sorted[sorted.length - 1];
  if (isNum(totalDepth) && totalDepth > 0) {
    const deepest = Math.max(...sorted.map(l => l.endDepth));
    if (deepest < totalDepth) {
      issues.push({ severity: 'warning', message: `Layers stop at ${deepest} ft, but the borewell is ${totalDepth} ft deep.`, gap: [deepest, totalDepth] });
    } else if (deepest > totalDepth) {
      issues.push({ severity: 'warning', message: `${name(last)} goes down to ${deepest} ft, deeper than the borewell's ${totalDepth} ft. Check the total depth.` });
    }
  }
  return issues;
}

type PipeLike = Pick<PipeSegment, 'startDepth' | 'endDepth' | 'pipeType'>;

export function checkPipes(pipes: PipeLike[], totalDepth: number | null | undefined): Issue[] {
  const issues: Issue[] = [];
  const sorted = [...pipes].sort((a, b) => a.startDepth - b.startDepth);
  const kind = (p: PipeLike) => (p.pipeType === 'slotted' ? 'Screen pipe' : 'Plain pipe');
  sorted.forEach((p, i) => {
    if (!isNum(p.startDepth) || !isNum(p.endDepth) || p.startDepth < 0) {
      issues.push({ severity: 'problem', message: `${kind(p)} has a depth that is not a valid number.` });
      return;
    }
    if (p.endDepth <= p.startDepth) {
      issues.push({ severity: 'problem', message: `${kind(p)} ends at ${p.endDepth} ft, which is not deeper than where it starts (${p.startDepth} ft).` });
    }
    const prev = sorted[i - 1];
    if (prev && p.startDepth < prev.endDepth) {
      issues.push({ severity: 'problem', message: `Two pipe pieces both cover ${p.startDepth} to ${Math.min(prev.endDepth, p.endDepth)} ft. Change one of the depths.` });
    }
    if (isNum(totalDepth) && totalDepth > 0 && p.endDepth > totalDepth) {
      issues.push({ severity: 'warning', message: `${kind(p)} goes down to ${p.endDepth} ft, deeper than the borewell's ${totalDepth} ft.` });
    }
  });
  return issues;
}

export const hasProblems = (issues: Issue[]) => issues.some(i => i.severity === 'problem');

/**
 * Details a finished record should have but this one lacks, in plain words ("owner", "water
 * level"). Imported logs often arrive without them; they are worth filling in, not errors.
 */
export function missingDetails(b: Pick<BorewellInput, 'ownerName' | 'waterLevel' | 'date'>): string[] {
  return [
    !b.ownerName?.trim() && 'owner',
    b.waterLevel == null && 'water level',
    !b.date && 'lowering date',
  ].filter((v): v is string => !!v);
}
