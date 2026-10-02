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
 * Borewells within `halfWidthKm` of a line with bends (`path`, at least two points), ordered by how
 * far along the line they are. Each borewell belongs to the nearest part of the line.
 */
export function placeAlongPath<T extends { latitude: number | null; longitude: number | null }>(
  path: LatLon[], halfWidthKm: number, items: T[],
): { lengthKm: number; placed: Placed<T>[] } {
  if (path.length < 2) return { lengthKm: 0, placed: [] };
  const lat0 = path.reduce((s, p) => s + p[0], 0) / path.length, k = kx(lat0);
  const o = path[0];
  const toXY = ([la, lo]: LatLon): [number, number] => [(lo - o[1]) * k, (la - o[0]) * KY];
  const toLL = ([x, y]: [number, number]): LatLon => [o[0] + y / KY, o[1] + x / k];
  const pts = path.map(toXY);
  const segs = pts.slice(1).map((q, i) => {
    const p = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    return { p, len, ux: len ? dx / len : 0, uy: len ? dy / len : 0 };
  });
  const starts: number[] = [];
  segs.reduce((acc, s) => { starts.push(acc); return acc + s.len; }, 0);
  const lengthKm = segs.reduce((acc, s) => acc + s.len, 0);
  if (lengthKm < 1e-6) return { lengthKm: 0, placed: [] };

  const placed = items
    .filter(i => i.latitude != null && i.longitude != null)
    .map(item => {
      const [x, y] = toXY([item.latitude!, item.longitude!]);
      let best: Placed<T> | null = null, bestDist = Infinity;
      segs.forEach((s, i) => {
        if (s.len === 0) return;
        const rx = x - s.p[0], ry = y - s.p[1];
        const t = rx * s.ux + ry * s.uy;                       // along this part
        const first = i === 0, last = i === segs.length - 1;
        // Beyond the ends of the whole line, a little leeway only (as for a straight line).
        const tc = Math.min(Math.max(t, first ? -0.05 : 0), last ? s.len + 0.05 : s.len);
        const fx = s.p[0] + s.ux * tc, fy = s.p[1] + s.uy * tc;
        const dist = Math.hypot(x - fx, y - fy);
        const outside = t < (first ? -0.05 : -1e9) || t > (last ? s.len + 0.05 : 1e9);
        if (!outside && dist < bestDist) {
          bestDist = dist;
          const offsetKm = rx * s.uy - ry * s.ux;              // right of the line is positive
          best = { item, alongKm: starts[i] + tc, offsetKm: Math.sign(offsetKm || 1) * dist, foot: toLL([fx, fy]) };
        }
      });
      return best as Placed<T> | null;
    })
    .filter((p): p is Placed<T> => p != null && Math.abs(p.offsetKm) <= halfWidthKm)
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

/** The corridor around a line with bends: one band per part of the line. */
export function corridorPolygons(path: LatLon[], halfWidthKm: number): LatLon[][] {
  return path.slice(1).map((q, i) => corridorPolygon(path[i], q, halfWidthKm));
}

/** The middle of each part of a line, where a new bend can be dragged out. */
export function midpoints(path: LatLon[]): LatLon[] {
  return path.slice(1).map((q, i) => [(path[i][0] + q[0]) / 2, (path[i][1] + q[1]) / 2] as LatLon);
}

/** Most borewells a cross-section draws; more than this cannot be read in one picture. */
export const MAX_SECTION_BOREWELLS = 80;

/**
 * With more than `max` borewells near the line, keeps the one closest to the line in each of `max`
 * equal stretches, so the picture stays readable and evenly covers the line. Order is kept.
 */
export function thinAlongLine<T>(placed: Placed<T>[], lengthKm: number, max = MAX_SECTION_BOREWELLS): Placed<T>[] {
  if (placed.length <= max || lengthKm <= 0) return placed;
  const best = new Map<number, Placed<T>>();
  for (const p of placed) {
    const bin = Math.min(max - 1, Math.max(0, Math.floor((p.alongKm / lengthKm) * max)));
    const cur = best.get(bin);
    if (!cur || Math.abs(p.offsetKm) < Math.abs(cur.offsetKm)) best.set(bin, p);
  }
  return [...best.values()].sort((a, b) => a.alongKm - b.alongKm);
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
