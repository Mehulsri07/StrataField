import { describe, it, expect } from 'vitest';
import { estimateWater, kmBetween, waterColour, waterPoints, WATER_RAMP } from './waterMap';

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
