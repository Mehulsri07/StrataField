import { describe, it, expect } from 'vitest';
import { NEIGHBOURHOOD_KM, WaterIndex, estimateWater, kmBetween, waterColour, waterPoints, WATER_RAMP } from './waterMap';

// Aminabad and Hazratganj, Lucknow (about 1.9 km apart)
const aminabad = { latitude: 26.846, longitude: 80.927, waterLevel: 124 };
const hazratganj = { latitude: 26.851, longitude: 80.946, waterLevel: 112 };

describe('kmBetween', () => {
  it('matches known distances in Lucknow to within a few percent', () => {
    const d = kmBetween(aminabad.latitude, aminabad.longitude, hazratganj.latitude, hazratganj.longitude);
    expect(d).toBeGreaterThan(1.8);
    expect(d).toBeLessThan(2.1);
  });
});

describe('estimateWater', () => {
  it('returns the measured value at a borewell', () => {
    expect(estimateWater(aminabad.latitude, aminabad.longitude, [aminabad, hazratganj])).toMatchObject({ value: 124, strength: 1 });
  });

  it('lies between neighbours and leans towards the nearer one', () => {
    const e = estimateWater(26.847, 80.931, [aminabad, hazratganj])!;
    expect(e.value).toBeGreaterThan(112);
    expect(e.value).toBeLessThan(124);
    expect(e.value).toBeGreaterThan(118); // closer to Aminabad
    expect(e.strength).toBe(1);
  });

  it('fades out far from any borewell', () => {
    const far = estimateWater(26.95, 81.05, [aminabad, hazratganj])!;
    expect(far.nearestKm).toBeGreaterThan(10);
    expect(far.strength).toBe(0);
    expect(estimateWater(26.85, 80.95, [])).toBeNull();
  });
});

describe('waterColour and waterPoints', () => {
  it('clamps to the ramp ends and blends between stops', () => {
    expect(waterColour(10)).toEqual(WATER_RAMP[0][1]);
    expect(waterColour(500)).toEqual(WATER_RAMP[WATER_RAMP.length - 1][1]);
    expect(waterColour(70)).toEqual([109, 186, 215]);
  });

  it('keeps only borewells with a location and a water level', () => {
    expect(waterPoints([
      { latitude: 1, longitude: 2, waterLevel: 3 },
      { latitude: null, longitude: 2, waterLevel: 3 },
      { latitude: 1, longitude: 2, waterLevel: null },
    ])).toEqual([{ latitude: 1, longitude: 2, waterLevel: 3 }]);
  });
});

describe('WaterIndex (many borewells)', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const points = Array.from({ length: 3000 }, () => ({ latitude: 26.7 + rnd() * 0.3, longitude: 80.8 + rnd() * 0.3, waterLevel: 30 + rnd() * 100 }));
  const index = new WaterIndex(points);

  it('uses exactly the borewells within the neighbourhood', () => {
    for (let k = 0; k < 200; k++) {
      const lat = 26.72 + rnd() * 0.26, lon = 80.82 + rnd() * 0.26;
      const near = points.filter(p => kmBetween(lat, lon, p.latitude, p.longitude) <= NEIGHBOURHOOD_KM);
      const got = index.estimate(lat, lon), want = estimateWater(lat, lon, near);
      if (want == null) { expect(got).toBeNull(); continue; }
      // Same borewells, added up in a different order: equal apart from rounding.
      expect(got!.value).toBeCloseTo(want.value, 9);
      expect(got!.nearestKm).toBeCloseTo(want.nearestKm, 9);
      expect(got!.strength).toBeCloseTo(want.strength, 9);
    }
  });

  it('matches looking at every borewell when all are close together', () => {
    const few = [aminabad, hazratganj, { latitude: 26.86, longitude: 80.94, waterLevel: 90 }];
    const small = new WaterIndex(few);
    expect(small.estimate(26.85, 80.935)).toEqual(estimateWater(26.85, 80.935, few));
  });

  it('says nothing far from every borewell', () => {
    expect(index.estimate(27.5, 81.5)).toBeNull();
  });

  it('is quick: a whole map grid with 3,000 borewells in well under two seconds', () => {
    const t0 = performance.now();
    for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++) index.estimate(26.7 + (y / 180) * 0.3, 80.8 + (x / 180) * 0.3);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
