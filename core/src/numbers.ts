/** Reads a number the user typed. Empty means "not given" (null); anything unreadable is `undefined`. */
export function parseNumber(text: string): number | null | undefined {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export const numberText = (n: number | null | undefined) => (n == null ? "" : String(n));

/**
 * Reads coordinates pasted as one line, e.g. "26.8930, 80.9420" or "26.893 N 80.942 E",
 * as phones and map apps copy them. Returns null if it is not a coordinate pair.
 */
export function parseCoordinatePair(text: string): { latitude: number; longitude: number } | null {
  const nums = text.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 2) return null;
  let [latitude, longitude] = nums.map(Number);
  if (/\bS\b/i.test(text)) latitude = -Math.abs(latitude);
  if (/\bW\b/i.test(text)) longitude = -Math.abs(longitude);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
