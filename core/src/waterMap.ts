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

/** Borewells usable for the water map: located, with a water level. */
export function waterPoints<T extends { latitude: number | null; longitude: number | null; waterLevel: number | null }>(items: T[]): WaterPoint[] {
  return items
    .filter(b => b.latitude != null && b.longitude != null && b.waterLevel != null)
    .map(b => ({ latitude: b.latitude!, longitude: b.longitude!, waterLevel: b.waterLevel! }));
}
