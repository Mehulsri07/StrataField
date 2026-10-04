import { describe, it, expect } from 'vitest';
import { NEIGHBOURHOOD_KM, WaterIndex, estimateWater, kmBetween, recentCutoff, waterByYear, waterColour, waterPoints, WATER_RAMP } from './waterMap';

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
  });

  it('is at full strength within 300 m of a borewell and gone by 500 m', () => {
    const north = (km: number) => estimateWater(aminabad.latitude + km / 110.57, aminabad.longitude, [aminabad])!.strength;
    expect(north(0.25)).toBe(1);
    expect(north(0.4)).toBeCloseTo(0.5, 5);
    expect(north(0.51)).toBe(0);
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
    const small = new WaterIndex(few, 5);
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

describe('recent water levels', () => {
  const at = (waterLevel: number | null, waterLevelOn: string | null) => ({ latitude: 26.85, longitude: 80.95, waterLevel, waterLevelOn });
  const wells = [at(60, '2016-05-01'), at(95, '2024-03-10'), at(110, '2026-09-22'), at(null, null), at(80, null)];

  it('counts back from the newest level, not from today', () => {
    expect(recentCutoff(wells)).toBe('2023-09-22');
    expect(recentCutoff([at(null, null)])).toBe('');
  });

  it('uses the number of years asked for, or the whole record', () => {
    expect(recentCutoff(wells, 1)).toBe('2025-09-22');
    expect(waterPoints(wells, 1).map(p => p.waterLevel)).toEqual([110, 80]);
    expect(recentCutoff(wells, 0)).toBe('');
    expect(waterPoints(wells, 0).map(p => p.waterLevel)).toEqual([60, 95, 110, 80]);
  });

  it('leaves old levels out of the water map, and keeps levels that have no date', () => {
    expect(waterPoints(wells).map(p => p.waterLevel)).toEqual([95, 110, 80]);
  });
});

describe('water level by year', () => {
  const at = (waterLevel: number | null, waterLevelOn: string | null) => ({ waterLevel, waterLevelOn });

  it('groups levels by the year they were measured, oldest first', () => {
    const years = waterByYear([at(110, '2026-09-22'), at(60, '2016-05-01'), at(70, '2016-11-30'), at(90, '2026-01-02'), at(100, '2026-03-03'), at(null, null), at(80, null)]);
    expect(years).toEqual([
      { year: 2016, typical: 65, shallowest: 60, deepest: 70, count: 2 },
      { year: 2026, typical: 100, shallowest: 90, deepest: 110, count: 3 },
    ]);
  });
});
