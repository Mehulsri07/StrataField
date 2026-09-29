import { describe, it, expect } from 'vitest';
import { parseCoordinatePair, parseNumber } from './numbers';

describe('parseNumber', () => {
  it('treats empty as not given and junk as invalid', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('12.')).toBe(12);
    expect(parseNumber('1,250')).toBe(1250);
  });
});

describe('parseCoordinatePair', () => {
  it('reads pairs the way phones and map apps copy them', () => {
    expect(parseCoordinatePair('26.8930, 80.9420')).toEqual({ latitude: 26.893, longitude: 80.942 });
    expect(parseCoordinatePair('26.893 N 80.942 E')).toEqual({ latitude: 26.893, longitude: 80.942 });
    expect(parseCoordinatePair('33.9 S, 18.4 W')).toEqual({ latitude: -33.9, longitude: -18.4 });
  });

  it('rejects things that are not a single coordinate pair', () => {
    expect(parseCoordinatePair('26.89')).toBeNull();
    expect(parseCoordinatePair('1, 2, 3')).toBeNull();
    expect(parseCoordinatePair('126.8, 80.9')).toBeNull();
  });
});
