/**
 * Cross-section geometry and layer matching (StrataField's basic cross-section; StrataVision extends it).
 *
 * Borewells are placed by their position along a line drawn on the map, never by ID or database
 * order. Each keeps its distance from the line. Between neighbouring borewells, clay/sand/rock runs
 * are matched in order; how far apart the borewells are decides how sure the estimate is.
 */
import type { LithologyFamily, StrataLayer } from './types';
import { familyOf } from './layerInfo';

export type LatLon = [number, number];

const KY = 110.57;
const kx = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

export interface Placed<T> {
  item: T;
  /** Distance from the start of the line, km. */
  alongKm: number;
  /** Distance from the line, km; positive is to the right when walking from start to end. */
  offsetKm: number;
  /** Nearest point on the line. */
  foot: LatLon;
}

/**
 * Borewells within `halfWidthKm` of the straight line a→b, ordered along it.
 * Items without a location are ignored.
 */
export function placeAlongLine<T extends { latitude: number | null; longitude: number | null }>(
  a: LatLon, b: LatLon, halfWidthKm: number, items: T[],
): { lengthKm: number; placed: Placed<T>[] } {
  const lat0 = (a[0] + b[0]) / 2, k = kx(lat0);
  const toXY = ([la, lo]: LatLon): [number, number] => [(lo - a[1]) * k, (la - a[0]) * KY];
  const [bx, by] = toXY(b);
  const lengthKm = Math.hypot(bx, by);
  if (lengthKm < 1e-6) return { lengthKm: 0, placed: [] };
  const ux = bx / lengthKm, uy = by / lengthKm;
  const placed = items
    .filter(i => i.latitude != null && i.longitude != null)
    .map(item => {
      const [x, y] = toXY([item.latitude!, item.longitude!]);
      const alongKm = x * ux + y * uy;
      const offsetKm = x * uy - y * ux;
      const foot: LatLon = [a[0] + (uy * alongKm) / KY, a[1] + (ux * alongKm) / k];
      return { item, alongKm, offsetKm, foot };
    })
    .filter(p => p.alongKm >= -0.05 && p.alongKm <= lengthKm + 0.05 && Math.abs(p.offsetKm) <= halfWidthKm)
    .sort((p, q) => p.alongKm - q.alongKm);
  return { lengthKm, placed };
}

/** Points either side of the line at the corridor's edge, for drawing it on the map. */
export function corridorPolygon(a: LatLon, b: LatLon, halfWidthKm: number): LatLon[] {
  const lat0 = (a[0] + b[0]) / 2, k = kx(lat0);
  const dx = (b[1] - a[1]) * k, dy = (b[0] - a[0]) * KY, len = Math.hypot(dx, dy) || 1;
  const nx = dy / len, ny = -dx / len; // right-hand normal
  const shift = ([la, lo]: LatLon, s: number): LatLon => [la + (ny * halfWidthKm * s) / KY, lo + (nx * halfWidthKm * s) / k];
  return [shift(a, 1), shift(b, 1), shift(b, -1), shift(a, -1)];
}

export interface Run {
  family: LithologyFamily;
  top: number;
  bottom: number;
}

/** Neighbouring layers of the same family merged into runs (e.g. Clay + Kankar = one clay run). */
export function familyRuns(strata: StrataLayer[]): Run[] {
  const runs: Run[] = [];
  for (const l of [...strata].sort((x, y) => x.startDepth - y.startDepth)) {
    const family = familyOf(l) ?? 'OTHER';
    const last = runs[runs.length - 1];
    if (last && last.family === family && last.bottom === l.startDepth) last.bottom = l.endDepth;
    else runs.push({ family, top: l.startDepth, bottom: l.endDepth });
  }
  return runs;
}

/**
 * Pairs of runs that correspond between two neighbouring borewells, in order from the top
 * (longest common sequence of families). "Not recorded" runs are never matched.
 */
export function matchRuns(a: Run[], b: Run[]): [number, number][] {
  const n = a.length, m = b.length;
  const same = (i: number, j: number) => a[i].family === b[j].family && a[i].family !== 'NONE';
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = same(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (same(i, j)) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export type Coverage = 'estimate' | 'rough' | 'none';

/** Settings, not constants: city data (km apart) and site surveys (metres apart) need different values. */
export const COVERAGE_KM = { estimate: 2.5, rough: 5 };

export function coverageFor(gapKm: number, limits = COVERAGE_KM): Coverage {
  return gapKm <= limits.estimate ? 'estimate' : gapKm <= limits.rough ? 'rough' : 'none';
}

/** Two example lines through the borewells: north to south and west to east through their middle. */
export function exampleLines(points: { latitude: number | null; longitude: number | null }[]): { northSouth: [LatLon, LatLon]; westEast: [LatLon, LatLon] } | null {
  const pts = points.filter(p => p.latitude != null && p.longitude != null) as { latitude: number; longitude: number }[];
  if (pts.length < 2) return null;
  const lats = pts.map(p => p.latitude), lons = pts.map(p => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2, midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const pad = 0.005;
  return {
    northSouth: [[Math.max(...lats) + pad, midLon], [Math.min(...lats) - pad, midLon]],
    westEast: [[midLat, Math.min(...lons) - pad], [midLat, Math.max(...lons) + pad]],
  };
}
