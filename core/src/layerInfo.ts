/**
 * Facts about one soil layer, for the layer popup. Pure functions, shared by every screen
 * that draws layers (borewell drawing, layer list, layer strip, cross-section).
 */
import type { LithologyFamily, PipeSegment, StrataLayer } from './types';
import { DEFAULT_MATERIALS, FEET_TO_METRES } from './constants';

export type WaterPosition =
  | 'above'      // the layer is entirely above the water level (dry at the time of measuring)
  | 'contains'   // the water level falls inside this layer
  | 'below'      // the layer is entirely below the water level
  | 'unknown';   // no water level recorded

export interface PipeThrough {
  kind: 'plain' | 'slotted';
  /** Where this pipe piece overlaps the layer. */
  from: number;
  to: number;
}

export interface LayerFacts {
  /** 1-based position from the top, among layers sorted by depth. */
  position: number;
  count: number;
  thickness: number;
  /** Depths in metres, for people who think in metres. */
  startM: number;
  endM: number;
  thicknessM: number;
  family: LithologyFamily | null;
  notRecorded: boolean;
  water: WaterPosition;
  /** Pipe pieces that run through this layer, merged when neighbouring pieces are the same kind. */
  pipes: PipeThrough[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function familyOf(layer: Pick<StrataLayer, 'materialId'>): LithologyFamily | null {
  return DEFAULT_MATERIALS.find(m => m.id === layer.materialId)?.lithologyFamily ?? null;
}

export function describeLayer(
  layer: StrataLayer,
  context: { strata: StrataLayer[]; pipes?: PipeSegment[]; waterLevel?: number | null },
): LayerFacts {
  const sorted = [...context.strata].sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);
  const index = sorted.findIndex(l => l.id === layer.id);
  const thickness = layer.endDepth - layer.startDepth;
  const family = familyOf(layer);

  const wl = context.waterLevel;
  const water: WaterPosition =
    wl == null ? 'unknown' : wl <= layer.startDepth ? 'below' : wl >= layer.endDepth ? 'above' : 'contains';

  const pipes: PipeThrough[] = [];
  for (const p of [...(context.pipes ?? [])].sort((a, b) => a.startDepth - b.startDepth)) {
    const from = Math.max(p.startDepth, layer.startDepth);
    const to = Math.min(p.endDepth, layer.endDepth);
    if (to <= from) continue;
    const last = pipes[pipes.length - 1];
    if (last && last.kind === p.pipeType && last.to === from) last.to = to;
    else pipes.push({ kind: p.pipeType, from, to });
  }

  return {
    position: index + 1,
    count: sorted.length,
    thickness: round1(thickness),
    startM: round1(layer.startDepth * FEET_TO_METRES),
    endM: round1(layer.endDepth * FEET_TO_METRES),
    thicknessM: round1(thickness * FEET_TO_METRES),
    family,
    notRecorded: family === 'NONE' || layer.materialId === 'not_recorded',
    water,
    pipes,
  };
}
