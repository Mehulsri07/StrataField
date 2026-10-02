/**
 * Estimated water depth between borewells, for the water-depth colours on Home and the Map.
 *
 * Inverse-distance weighting: nearer borewells count more. The estimate fades out with distance
 * from the nearest borewell, so the map never shows a value where there is no data.
 */

export interface WaterPoint {
  latitude: number;
  longitude: number;
  /** Depth to water in feet. */
  waterLevel: number;
}

export interface WaterEstimate {
  /** Estimated depth to water in feet. */
  value: number;
  /** Distance to the nearest borewell in km. */
  nearestKm: number;
  /** 1 near a borewell, falling to 0 where there is too little data to say anything. */
  strength: number;
}

/** Full strength within `fullKm` of a borewell, nothing beyond `goneKm`. */
export const FADE = { fullKm: 1.6, goneKm: 3.4 };

/** Distance in km (flat-earth approximation, accurate to well under 1% across a city). */
export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111.32 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot((lat1 - lat2) * 110.57, (lon1 - lon2) * kx);
}

export function estimateWater(latitude: number, longitude: number, points: WaterPoint[], power = 2): WaterEstimate | null {
  if (points.length === 0) return null;
  let num = 0, den = 0, nearestKm = Infinity;
  for (const p of points) {
    const d = kmBetween(latitude, longitude, p.latitude, p.longitude);
    nearestKm = Math.min(nearestKm, d);
    if (d < 0.02) return { value: p.waterLevel, nearestKm: d, strength: 1 };
    const w = 1 / d ** power;
    num += w * p.waterLevel;
    den += w;
  }
  const strength = Math.max(0, Math.min(1, 1 - (nearestKm - FADE.fullKm) / (FADE.goneKm - FADE.fullKm)));
  return { value: num / den, nearestKm, strength };
}

/**
 * Only borewells within this distance count towards an estimate. Nearby borewells say most about the
 * water at a place, and colours are only shown within `FADE.goneKm` of a borewell anyway.
 */
export const NEIGHBOURHOOD_KM = 5;

/**
 * Water points grouped by area, so the whole map can be estimated quickly even with thousands of
 * borewells: each estimate looks only at borewells within `NEIGHBOURHOOD_KM`.
 */
export class WaterIndex {
  private readonly cells = new Map<string, WaterPoint[]>();
  private readonly cellDegLat: number;
  private readonly cellDegLon: number;
  /** Cells are half the neighbourhood wide, so two cells either way cover it. */
  private static readonly REACH = 2;
  constructor(points: WaterPoint[], private readonly radiusKm = NEIGHBOURHOOD_KM) {
    const lat0 = points.length ? points.reduce((s, p) => s + p.latitude, 0) / points.length : 0;
    this.cellDegLat = radiusKm / WaterIndex.REACH / 110.57;
    this.cellDegLon = radiusKm / WaterIndex.REACH / (111.32 * Math.cos((lat0 * Math.PI) / 180));
    for (const p of points) {
      const key = this.key(Math.floor(p.latitude / this.cellDegLat), Math.floor(p.longitude / this.cellDegLon));
      const list = this.cells.get(key);
      if (list) list.push(p); else this.cells.set(key, [p]);
    }
  }
  private key(i: number, j: number) { return `${i}:${j}`; }

  /** Borewells within `radiusKm` of the place. */
  nearby(latitude: number, longitude: number): WaterPoint[] {
    const i = Math.floor(latitude / this.cellDegLat), j = Math.floor(longitude / this.cellDegLon), r = WaterIndex.REACH;
    const out: WaterPoint[] = [];
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const c = this.cells.get(this.key(i + di, j + dj));
      if (c) for (const p of c) if (kmBetween(latitude, longitude, p.latitude, p.longitude) <= this.radiusKm) out.push(p);
    }
    return out;
  }

  /** The estimate from nearby borewells; null where none is within `radiusKm`. */
  estimate(latitude: number, longitude: number): WaterEstimate | null {
    return estimateWater(latitude, longitude, this.nearby(latitude, longitude));
  }
}

/** Colour stops for depth to water: pale aqua (shallow) to deep indigo (deep). */
export const WATER_RAMP: [number, [number, number, number]][] = [
  [40, [207, 238, 240]],
  [60, [143, 208, 222]],
  [80, [74, 163, 207]],
  [100, [46, 102, 179]],
  [125, [61, 44, 141]],
];

export function waterColour(feet: number): [number, number, number] {
  const r = WATER_RAMP;
  if (feet <= r[0][0]) return r[0][1];
  for (let i = 1; i < r.length; i++) {
    const [v1, c1] = r[i], [v0, c0] = r[i - 1];
    if (feet <= v1) {
      const t = (feet - v0) / (v1 - v0);
      return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number];
    }
  }
  return r[r.length - 1][1];
}

/**
 * Water levels measured years apart cannot be compared: the water moves. Only levels from the last
 * few years before the newest one count as "the water level now".
 */
export const RECENT_YEARS = 3;

type Measured = { waterLevel: number | null; waterLevelOn?: string | null };

/** The earliest date (ISO) a water level may have to count as recent; '' when no level has a date. */
export function recentCutoff(items: Measured[]): string {
  const newest = items.reduce((m, b) => (b.waterLevel != null && b.waterLevelOn && b.waterLevelOn > m ? b.waterLevelOn : m), '');
  return newest && `${Number(newest.slice(0, 4)) - RECENT_YEARS}${newest.slice(4, 10)}`;
}

/** True when this water level is recent enough to stand for today's (levels without a date count). */
export const isRecentWater = (b: Measured, cutoff: string) => b.waterLevel != null && (!b.waterLevelOn || b.waterLevelOn >= cutoff);

/** Borewells usable for the water map: located, with a recent water level. */
export function waterPoints<T extends Measured & { latitude: number | null; longitude: number | null }>(items: T[]): WaterPoint[] {
  const cutoff = recentCutoff(items);
  return items
    .filter(b => b.latitude != null && b.longitude != null && isRecentWater(b, cutoff))
    .map(b => ({ latitude: b.latitude!, longitude: b.longitude!, waterLevel: b.waterLevel! }));
}
