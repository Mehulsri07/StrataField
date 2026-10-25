/**
 * Help with giving borewells a location: what to search for, which search results to trust, and
 * which borewells already placed nearby to show. Nothing here ever gives a borewell a position by
 * itself; a person always clicks the spot.
 */
import type { Borewell, Place } from './types';
import { parseCoordinatePair } from './numbers';
import { kmBetween } from './waterMap';

/** Words that say nothing about where a place is: sharing one of these is not sharing a place. */
const COMMON = new Set([
  'road', 'marg', 'nagar', 'colony', 'sector', 'sect', 'khand', 'block', 'phase', 'plot', 'house', 'near', 'the', 'and', 'opp',
  'east', 'west', 'north', 'south', 'new', 'old', 'gate', 'city', 'lucknow', 'tower', 'hall', 'apartment', 'apartments', 'apt',
  'residence', 'ground', 'campus', 'residential', 'industrial', 'estate', 'area', 'school', 'college', 'hospital', 'office',
  'station', 'stadium', 'tube', 'well', 'tubewell', 'chart', 'streta', 'strata', 'sterta', 'foot', 'ball', 'banquet', 'yojna',
  'enclave', 'boys', 'girls', 'hostel', 'guest', 'over', 'head', 'tank', 'capacity', 'rwh', 'site', 'mr', 'mrs', 'dr', 'shri',
]);

/** The words of a name or address that say where it is, lower case, each once. */
export function tellingWords(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !COMMON.has(w)))];
}

/**
 * Other spellings of the same places, as the map knows them. These are not corrections: the
 * address is always searched as written first, and what is stored is never changed.
 */
const OTHER_SPELLINGS: [RegExp, string][] = [
  [/\bhai?d[ae]?rabad\b/gi, 'Hyderabad'],
  [/\bchinhut\b/gi, 'Chinhat'],
  [/\bdewa\b/gi, 'Deva'],
  [/\bextention\b/gi, 'Extension'],
  [/\bsiultanpur\b/gi, 'Sultanpur'],
  [/\bsect\b/gi, 'Sector'],
];
const otherSpelling = (text: string) => OTHER_SPELLINGS.reduce((t, [from, to]) => t.replace(from, to), text);

/**
 * What to search for to find an address, best first: all of it as written (plot number and all),
 * then with other spellings, then ever shorter parts ("Sect C, Mahanagar", then "Mahanagar"). A
 * part with nothing telling in it is not searched.
 */
export function searchTries(address: string, city: string): string[] {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const town = city.trim();
  const withTown = (text: string) => (town && !parts[parts.length - 1].toLowerCase().includes(town.toLowerCase()) ? `${text}, ${town}` : text);
  const tries: string[] = [];
  parts.forEach((_, i) => {
    const tail = i === 0 ? address.trim() : parts.slice(i).join(', ');
    if (tellingWords(tail).length === 0) return;
    for (const t of [tail, otherSpelling(tail)]) if (!tries.includes(withTown(t))) tries.push(withTown(t));
  });
  return tries;
}

/** Search results from further than this from the middle of Lucknow are some other place. */
const REACH_KM = 40;
const CENTRE = { latitude: 26.85, longitude: 80.95 };

/**
 * Whether a search result really is what was searched for: it must have every telling word of the
 * search in its name or surroundings, and be within reach of Lucknow. Searches fall back on loose
 * matches ("Prag Narain Road" finds Jagat Narain Road), which are worse than nothing.
 */
export function placeFits(searched: string, place: Place): boolean {
  const wanted = tellingWords(searched);
  const found = `${place.name} ${place.detail}`.toLowerCase();
  return wanted.length > 0 && wanted.every((w) => found.includes(w))
    && kmBetween(place.latitude, place.longitude, CENTRE.latitude, CENTRE.longitude) <= REACH_KM;
}

export interface PlaceHint {
  /** The telling word the borewells share, e.g. "ekana". */
  word: string;
  /** The borewells already placed that mention it. */
  borewells: Borewell[];
  /** South-west and north-east corners around them, for framing the map. */
  bounds: [[number, number], [number, number]];
}

const placed = (b: Borewell) => b.latitude != null && b.longitude != null;
const describe = (b: Borewell) => [b.borewellId, b.ownerName, b.houseNo, b.address, b.area].filter(Boolean).join(' ');

/**
 * Borewells already placed at the same site or colony as `target`, judged by the most particular
 * telling word they share (the one fewest others have). This only says where to look: each
 * borewell on a big site is somewhere different, so the spot is always clicked.
 */
export function rememberedPlace(target: Borewell, borewells: Borewell[]): PlaceHint | null {
  const others = borewells.filter((b) => b.id !== target.id && placed(b)).map((b) => ({ b, words: tellingWords(describe(b)) }));
  let best: { word: string; borewells: Borewell[] } | null = null;
  for (const word of tellingWords(describe(target))) {
    const sharing = others.filter((o) => o.words.includes(word)).map((o) => o.b);
    if (sharing.length > 0 && (!best || sharing.length < best.borewells.length)) best = { word, borewells: sharing };
  }
  if (!best) return null;
  const lats = best.borewells.map((b) => b.latitude!), lons = best.borewells.map((b) => b.longitude!);
  return { ...best, bounds: [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]] };
}

/**
 * A position written as numbers ("26.8512, 80.9467") or inside a Google Maps link
 * (".../@26.8512,80.9467,17z" or "?q=26.8512,80.9467"); null when there is none.
 */
export function coordinatesIn(text: string): { latitude: number; longitude: number } | null {
  const pair = parseCoordinatePair(text);
  if (pair) return pair;
  const inLink = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(text);
  if (!inLink) return null;
  const [latitude, longitude] = [Number(inLink[1]), Number(inLink[2])];
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

/** True when two words differ by at most one letter added, removed or changed ("nagr", "nagar"). */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [ra, rb] = [a.slice(i + 1), b.slice(i + 1)];
  return ra === rb || a.slice(i) === rb || ra === b.slice(i);
}

/**
 * The existing zones a typed zone name probably means ("gomti" or "Zone 4 Gomti Nagr" for
 * "Zone 4 · Gomti Nagar"), best first and at most three, so the person is told before a second zone
 * for the same place is made. Empty when the name is already a zone, or shares no place word with one.
 */
export function similarZones(typed: string, zones: string[]): string[] {
  const name = typed.trim().toLowerCase();
  if (!name || zones.some((z) => z.toLowerCase() === name)) return [];
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const same = zones.find((z) => squash(z) === squash(name));
  if (same) return [same];
  // "Zone" is in every zone's name, so it says nothing about which one.
  const words = (s: string) => tellingWords(s).filter((w) => w !== 'zone');
  const typedWords = words(name);
  const close = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && oneEditApart(a, b));
  const scored = zones.map((z) => ({ z, shared: words(z).filter((w) => typedWords.some((t) => close(t, w))).length }));
  const best = Math.max(0, ...scored.map((s) => s.shared));
  return best ? scored.filter((s) => s.shared === best).map((s) => s.z).slice(0, 3) : [];
}
