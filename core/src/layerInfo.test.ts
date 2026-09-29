import { describe, it, expect } from 'vitest';
import { describeLayer } from './layerInfo';
import type { PipeSegment, StrataLayer } from './types';

const layer = (id: string, start: number, end: number, materialId: string): StrataLayer => ({
  id, borewellId: 'b', startDepth: start, endDepth: end, material: materialId, materialId,
  color: '#000000', pattern: 'solid', remarks: '', waterBearing: false,
});
const pipe = (start: number, end: number, pipeType: 'plain' | 'slotted'): PipeSegment => ({
  id: `${start}`, borewellId: 'b', startDepth: start, endDepth: end, pipeType, pipeSubtype: null, diameter: null,
});

const strata = [layer('c', 40, 72, 'fine_sand'), layer('a', 0, 15, 'clay'), layer('b', 15, 40, 'kankar'), layer('d', 72, 95, 'not_recorded')];

describe('describeLayer', () => {
  it('gives position among layers sorted by depth, thickness and metres', () => {
    const f = describeLayer(strata[0], { strata });
    expect(f.position).toBe(3);
    expect(f.count).toBe(4);
    expect(f.thickness).toBe(32);
    expect([f.startM, f.endM, f.thicknessM]).toEqual([12.2, 21.9, 9.8]);
    expect(f.family).toBe('SAND');
  });

  it('places the water level relative to the layer', () => {
    const at = (wl: number | null) => describeLayer(strata[0], { strata, waterLevel: wl }).water;
    expect(at(30)).toBe('below');     // water above the layer: the layer is below the water level
    expect(at(40)).toBe('below');
    expect(at(55)).toBe('contains');
    expect(at(72)).toBe('above');
    expect(at(100)).toBe('above');
    expect(at(null)).toBe('unknown');
  });

  it('lists the pipe that runs through the layer, merging neighbouring pieces of the same kind', () => {
    const pipes = [pipe(0, 50, 'plain'), pipe(50, 60, 'slotted'), pipe(60, 65, 'slotted'), pipe(65, 200, 'plain')];
    expect(describeLayer(strata[0], { strata, pipes }).pipes).toEqual([
      { kind: 'plain', from: 40, to: 50 },
      { kind: 'slotted', from: 50, to: 65 },
      { kind: 'plain', from: 65, to: 72 },
    ]);
    expect(describeLayer(strata[1], { strata, pipes: [pipe(20, 30, 'plain')] }).pipes).toEqual([]);
  });

  it('recognises a "Not recorded" depth', () => {
    const f = describeLayer(strata[3], { strata });
    expect(f.notRecorded).toBe(true);
    expect(f.family).toBe('NONE');
  });
});
