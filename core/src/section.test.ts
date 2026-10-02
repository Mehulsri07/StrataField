import { describe, it, expect } from 'vitest';
import { corridorPolygon, corridorPolygons, coverageFor, exampleLines, familyRuns, matchRuns, midpoints, placeAlongPath, thinAlongLine } from './section';
import type { StrataLayer } from './types';

const L = (start: number, end: number, materialId: string): StrataLayer => ({
  id: `${start}`, borewellId: 'b', startDepth: start, endDepth: end, material: materialId, materialId, color: '', pattern: '', remarks: '', waterBearing: false,
});

describe('placeAlongPath, straight line', () => {
  // A west-to-east line through Lucknow, about 20 km long.
  const a: [number, number] = [26.87, 80.85], b: [number, number] = [26.87, 81.05];
  const wells = [
    { id: 'east', latitude: 26.872, longitude: 81.0 },
    { id: 'west', latitude: 26.868, longitude: 80.9 },
    { id: 'far-off', latitude: 26.95, longitude: 80.95 },   // ~9 km north of the line
    { id: 'no-location', latitude: null, longitude: null },
    { id: 'beyond-end', latitude: 26.87, longitude: 81.2 },
  ];

  it('orders borewells by position along the line, not by the order given', () => {
    const { lengthKm, placed } = placeAlongPath([a, b], 2, wells);
    expect(lengthKm).toBeGreaterThan(19.5);
    expect(lengthKm).toBeLessThan(20.5);
    expect(placed.map(p => p.item.id)).toEqual(['west', 'east']);
  });

  it('keeps each borewell\'s distance from the line, with a side', () => {
    const { placed } = placeAlongPath([a, b], 2, wells);
    const west = placed[0], east = placed[1];
    expect(Math.abs(west.offsetKm)).toBeCloseTo(0.22, 1);
    expect(Math.sign(west.offsetKm)).toBe(-Math.sign(east.offsetKm)); // one north, one south of the line
    expect(west.foot[0]).toBeCloseTo(26.87, 4);
  });

  it('widening the corridor brings in farther borewells', () => {
    expect(placeAlongPath([a, b], 10, wells).placed.map(p => p.item.id)).toContain('far-off');
  });

  it('draws a corridor as four corners either side of the line', () => {
    const poly = corridorPolygon(a, b, 1);
    expect(poly).toHaveLength(4);
    expect(Math.abs(poly[0][0] - 26.87)).toBeCloseTo(1 / 110.57, 3);
  });
});

describe('placeAlongPath (a line with bends)', () => {
  // An L-shaped line: 10 km east along 26.85 N, then 10 km north.
  const a: [number, number] = [26.85, 80.90];
  const corner: [number, number] = [26.85, 80.90 + 10 / (111.32 * Math.cos((26.85 * Math.PI) / 180))];
  const end: [number, number] = [26.85 + 10 / 110.57, corner[1]];
  const wells = [
    { id: 'on-second-leg', latitude: 26.85 + 5 / 110.57, longitude: corner[1] + 0.003 },
    { id: 'on-first-leg', latitude: 26.852, longitude: 80.95 },
    { id: 'near-corner-outside', latitude: 26.84, longitude: corner[1] + 0.01 },
    { id: 'far-away', latitude: 26.95, longitude: 80.90 },
  ];

  it('measures the whole length, bend included', () => {
    const { lengthKm } = placeAlongPath([a, corner, end], 1, wells);
    expect(lengthKm).toBeCloseTo(20, 0);
  });

  it('orders borewells along the bent line and ignores those far from every part', () => {
    const { placed } = placeAlongPath([a, corner, end], 2, wells);
    expect(placed.map(p => p.item.id)).toEqual(['on-first-leg', 'near-corner-outside', 'on-second-leg']);
    const second = placed.find(p => p.item.id === 'on-second-leg')!;
    expect(second.alongKm).toBeCloseTo(15, 0);          // 10 km of the first part + 5 km up the second
    expect(Math.abs(second.offsetKm)).toBeLessThan(0.4);
  });

  it('draws one corridor band per part and offers the middle of each part for a new bend', () => {
    expect(corridorPolygons([a, corner, end], 1)).toHaveLength(2);
    const mids = midpoints([a, corner, end]);
    expect(mids).toHaveLength(2);
    expect(mids[0][0]).toBeCloseTo(26.85, 6);
  });
});

describe('runs and matching', () => {
  it('merges neighbouring layers of the same family', () => {
    expect(familyRuns([L(0, 15, 'clay'), L(15, 40, 'kankar'), L(40, 70, 'fine_sand'), L(70, 90, 'not_recorded'), L(90, 120, 'coarse_sand')])).toEqual([
      { family: 'CLAY', top: 0, bottom: 40 },
      { family: 'SAND', top: 40, bottom: 70 },
      { family: 'NONE', top: 70, bottom: 90 },
      { family: 'SAND', top: 90, bottom: 120 },
    ]);
  });

  it('matches runs in order and skips a run only one borewell has', () => {
    const a = familyRuns([L(0, 40, 'clay'), L(40, 80, 'medium_sand'), L(80, 100, 'clay'), L(100, 150, 'coarse_sand')]);
    const b = familyRuns([L(0, 35, 'clay'), L(35, 90, 'fine_sand'), L(90, 160, 'gravel')]);
    // CLAY-SAND-CLAY-SAND vs CLAY-SAND(fine+gravel merged): clay↔clay, sand↔sand
    expect(matchRuns(a, b)).toEqual([[0, 0], [1, 1]]);
  });

  it('never matches "Not recorded" depths', () => {
    const a = familyRuns([L(0, 10, 'not_recorded')]), b = familyRuns([L(0, 12, 'not_recorded')]);
    expect(matchRuns(a, b)).toEqual([]);
  });
});

describe('coverage and example lines', () => {
  it('rates how sure the estimate is by the gap between borewells', () => {
    expect([0.3, 2.5, 3, 5, 6.9].map(g => coverageFor(g))).toEqual(['estimate', 'estimate', 'rough', 'rough', 'none']);
    expect(coverageFor(0.08, { estimate: 0.05, rough: 0.1 })).toBe('rough'); // site-survey scale
  });

  it('suggests lines through the middle of the borewells', () => {
    const lines = exampleLines([{ latitude: 26.8, longitude: 80.9 }, { latitude: 26.9, longitude: 81.0 }, { latitude: null, longitude: null }])!;
    expect(lines.northSouth[0][1]).toBeCloseTo(80.95);
    expect(lines.westEast[0][0]).toBeCloseTo(26.85);
    expect(exampleLines([{ latitude: 26.8, longitude: 80.9 }])).toBeNull();
  });
});

describe('thinAlongLine', () => {
  const placed = Array.from({ length: 1000 }, (_, i) => ({ item: i, alongKm: (i / 1000) * 20, offsetKm: ((i * 37) % 100) / 50 - 1, foot: [0, 0] as [number, number] }));

  it('keeps everything when there are few borewells', () => {
    expect(thinAlongLine(placed.slice(0, 50), 20)).toHaveLength(50);
  });

  it('keeps at most the limit, spread along the line, closest to the line, in order', () => {
    const kept = thinAlongLine(placed, 20, 80);
    expect(kept).toHaveLength(80);
    expect(kept.every((p, i) => i === 0 || p.alongKm > kept[i - 1].alongKm)).toBe(true);
    expect(kept[0].alongKm).toBeLessThan(0.25);
    expect(kept[kept.length - 1].alongKm).toBeGreaterThan(19.7);
    // In each stretch, nothing kept is farther from the line than a borewell that was dropped there.
    const inBin = (p: { alongKm: number }) => Math.floor((p.alongKm / 20) * 80);
    for (const k of kept) {
      const same = placed.filter(p => inBin(p) === inBin(k));
      expect(Math.abs(k.offsetKm)).toBe(Math.min(...same.map(p => Math.abs(p.offsetKm))));
    }
  });
});
