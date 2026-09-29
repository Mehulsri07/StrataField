import { describe, it, expect } from 'vitest';
import { checkBorewell, checkLayers, checkPipes, hasProblems } from './validation';

const L = (startDepth: number, endDepth: number, material = 'Clay') => ({ startDepth, endDepth, material, materialId: 'clay' });

describe('checkBorewell', () => {
  it('needs only a borewell ID; a missing owner is a warning', () => {
    const issues = checkBorewell({ borewellId: '' });
    expect(issues.find(i => i.field === 'borewellId')?.severity).toBe('problem');
    expect(checkBorewell({ borewellId: 'BW-1' })).toEqual([
      { severity: 'warning', field: 'ownerName', message: "The owner's name is empty." },
    ]);
  });

  it('checks coordinates come in pairs and in range', () => {
    expect(checkBorewell({ borewellId: 'BW-1', ownerName: 'A', latitude: 26.8 }).map(i => i.field)).toEqual(['longitude']);
    expect(checkBorewell({ borewellId: 'BW-1', ownerName: 'A', latitude: 126, longitude: 80 }).map(i => i.field)).toEqual(['latitude']);
    expect(hasProblems(checkBorewell({ borewellId: 'BW-1', ownerName: 'A', latitude: 26.8, longitude: 80.9 }))).toBe(false);
  });

  it('refuses a water level deeper than the borewell and warns when the pipe is wider than the hole', () => {
    const issues = checkBorewell({ borewellId: 'BW-1', ownerName: 'A', totalDepth: 100, waterLevel: 120, boreDia: 6, pipeDia: 8 });
    expect(issues.map(i => [i.field, i.severity])).toEqual([['waterLevel', 'problem'], ['pipeDia', 'warning']]);
  });
});

describe('checkLayers', () => {
  it('reports gaps as warnings with the missing range', () => {
    const issues = checkLayers([L(10, 40), L(50, 90)], 100);
    expect(issues).toEqual([
      { severity: 'warning', message: 'Nothing is filled in from 0 to 10 ft.', gap: [0, 10] },
      { severity: 'warning', message: 'Nothing is filled in from 40 to 50 ft.', gap: [40, 50] },
      { severity: 'warning', message: 'Layers stop at 90 ft, but the borewell is 100 ft deep.', gap: [90, 100] },
    ]);
    expect(hasProblems(issues)).toBe(false);
  });

  it('treats overlaps and upside-down layers as problems', () => {
    expect(checkLayers([L(0, 40, 'Clay'), L(30, 60, 'Sand')], 60).map(i => i.message)).toEqual([
      'Clay and Sand both cover 30 to 40 ft. Change one of the depths.',
    ]);
    expect(hasProblems(checkLayers([L(40, 20)], null))).toBe(true);
  });

  it('is happy with continuous layers that reach the total depth', () => {
    expect(checkLayers([L(0, 15), L(15, 40), L(40, 100)], 100)).toEqual([]);
  });
});

describe('checkPipes', () => {
  it('allows gaps between pipe pieces but not overlaps', () => {
    const p = (s: number, e: number, t: 'plain' | 'slotted' = 'plain') => ({ startDepth: s, endDepth: e, pipeType: t });
    expect(checkPipes([p(0, 100), p(120, 140, 'slotted')], 200)).toEqual([]);
    expect(hasProblems(checkPipes([p(0, 100), p(90, 140, 'slotted')], 200))).toBe(true);
  });
});
