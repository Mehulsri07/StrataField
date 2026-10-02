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

/** The middle value (to one decimal when it falls between two); null when there are none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}
