/**
 * Ground height above sea level from a grid (see scripts/build-elevation.mjs for the file format and
 * where the data comes from). Heights are approximate: a few metres, and in towns they partly
 * include buildings and trees. A borewell's own recorded ground height is always preferred.
 */
import type { LatLon } from './section';

export interface ElevationGrid {
  cols: number;
  rows: number;
  west: number;
  south: number;
  east: number;
  north: number;
  /** Heights in decimetres, row by row from north to south; -32768 = no data. */
  data: Int16Array;
}

const NO_DATA = -32768;

export function parseElevationGrid(buffer: ArrayBuffer): ElevationGrid {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'SEL1') throw new Error('Not a StrataField elevation file');
  const cols = view.getUint32(4, true), rows = view.getUint32(8, true);
  const [west, south, east, north] = [0, 1, 2, 3].map(k => view.getFloat64(12 + k * 8, true));
  const data = new Int16Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = view.getInt16(44 + i * 2, true);
  return { cols, rows, west, south, east, north, data };
}

/** Ground height in metres at a place (between the four nearest grid points), or null outside the grid. */
export function heightAt(g: ElevationGrid, latitude: number, longitude: number): number | null {
  if (latitude < g.south || latitude > g.north || longitude < g.west || longitude > g.east) return null;
  const fx = ((longitude - g.west) / (g.east - g.west)) * (g.cols - 1);
  const fy = ((g.north - latitude) / (g.north - g.south)) * (g.rows - 1);
  const x0 = Math.min(g.cols - 2, Math.floor(fx)), y0 = Math.min(g.rows - 2, Math.floor(fy));
  const dx = fx - x0, dy = fy - y0;
  const v = (x: number, y: number) => g.data[y * g.cols + x];
  const corners = [v(x0, y0), v(x0 + 1, y0), v(x0, y0 + 1), v(x0 + 1, y0 + 1)];
  if (corners.some(c => c === NO_DATA)) return null;
  const dm = corners[0] * (1 - dx) * (1 - dy) + corners[1] * dx * (1 - dy) + corners[2] * (1 - dx) * dy + corners[3] * dx * dy;
  return dm / 10;
}

/** Ground heights (metres) at `count` evenly spaced places along a line with bends. */
export function groundProfile(g: ElevationGrid, path: LatLon[], count = 200): { km: number; metres: number | null }[] {
  if (path.length < 2) return [];
  const kmOf = (a: LatLon, b: LatLon) => Math.hypot((a[0] - b[0]) * 110.57, (a[1] - b[1]) * 111.32 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180));
  const parts = path.slice(1).map((q, i) => ({ a: path[i], b: q, km: kmOf(path[i], q) }));
  const total = parts.reduce((s, p) => s + p.km, 0);
  const out: { km: number; metres: number | null }[] = [];
  for (let n = 0; n < count; n++) {
    let along = (n / (count - 1)) * total, i = 0;
    while (i < parts.length - 1 && along > parts[i].km) { along -= parts[i].km; i++; }
    const t = parts[i].km ? Math.min(1, along / parts[i].km) : 0, { a, b } = parts[i];
    out.push({ km: (n / (count - 1)) * total, metres: heightAt(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) });
  }
  return out;
}
