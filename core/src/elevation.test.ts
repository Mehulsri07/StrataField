import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { groundProfile, heightAt, parseElevationGrid, type ElevationGrid } from './elevation';

/** A tiny grid: 3 x 3 points over 0..2 degrees, height (x + y) * 10 m, one missing corner. */
function tiny(): ElevationGrid {
  const data = new Int16Array(9);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) data[y * 3 + x] = (x + (2 - y)) * 100; // decimetres; north row is y = 0
  data[8] = -32768; // south-east corner has no data
  return { cols: 3, rows: 3, west: 0, south: 0, east: 2, north: 2, data };
}

describe('heightAt', () => {
  it('reads grid points and blends between them', () => {
    const g = tiny();
    expect(heightAt(g, 2, 0)).toBe(20);          // north-west corner: x 0, y 2 -> (0 + 2) * 10
    expect(heightAt(g, 1.5, 0.5)).toBeCloseTo(20); // between four points
  });

  it('says nothing outside the grid or next to missing data', () => {
    const g = tiny();
    expect(heightAt(g, 3, 1)).toBeNull();
    expect(heightAt(g, 0.2, 1.8)).toBeNull();
  });
});

describe('groundProfile', () => {
  it('samples evenly along a line with a bend', () => {
    const p = groundProfile(tiny(), [[2, 0], [2, 1], [1.5, 1]], 5);
    expect(p).toHaveLength(5);
    expect(p[0].km).toBe(0);
    expect(p[4].km).toBeGreaterThan(p[3].km);
    expect(p[0].metres).toBe(20);
  });
});

describe('the Lucknow grid shipped with the app', () => {
  const file = path.join(__dirname, '..', '..', 'app', 'src', 'assets', 'lucknow-elevation.bin');
  const bytes = fs.readFileSync(file);
  const g = parseElevationGrid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  it('covers Lucknow with heights that make sense', () => {
    expect([g.cols, g.rows]).toEqual([401, 401]);
    // Lucknow lies at roughly 110-130 m above sea level.
    for (const [name, lat, lon] of [['Hazratganj', 26.8467, 80.9462], ['Charbagh', 26.8318, 80.9214], ['Aliganj', 26.8930, 80.9420]] as const) {
      const h = heightAt(g, lat, lon);
      expect(h, name).not.toBeNull();
      expect(h!, name).toBeGreaterThan(100);
      expect(h!, name).toBeLessThan(135);
    }
  });
});
