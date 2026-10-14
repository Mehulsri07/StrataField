import { describe, expect, it } from 'vitest';
import type { Borewell, Place } from './types';
import { coordinatesIn, placeFits, rememberedPlace, searchTries, tellingWords } from './places';

const bw = (id: string, over: Partial<Borewell> = {}) =>
  ({ id, borewellId: id, ownerName: '', houseNo: '', address: '', area: '', city: 'Lucknow', latitude: null, longitude: null, locationSource: 'unknown', ...over }) as Borewell;
const place = (name: string, detail: string, latitude = 26.85, longitude = 80.95): Place => ({ name, detail, latitude, longitude });

describe('tellingWords', () => {
  it('keeps the words that say where a place is, and drops the ones that do not', () => {
    expect(tellingWords('A- 705 , Sect - C, Mahanagar')).toEqual(['mahanagar']);
    expect(tellingWords('Ekana stadium gate no 2 & 4')).toEqual(['ekana']);
    expect(tellingWords('Bank of India Colony')).toEqual(['bank', 'india']);
  });
});

describe('searchTries', () => {
  it('searches the address as written first, plot number and all', () => {
    expect(searchTries('A- 705 , Sect - C, Mahanagar', 'Lucknow')[0]).toBe('A- 705 , Sect - C, Mahanagar, Lucknow');
  });

  it('then tries other spellings of the same place, without changing what is stored', () => {
    const tries = searchTries('Beverly Park, New Haidrabad', 'Lucknow');
    expect(tries.slice(0, 2)).toEqual(['Beverly Park, New Haidrabad, Lucknow', 'Beverly Park, New Hyderabad, Lucknow']);
    expect(searchTries('Chinhut Kamta', 'Lucknow')).toContain('Chinhat Kamta, Lucknow');
    expect(searchTries('Dewa Road', 'Lucknow')).toContain('Deva Road, Lucknow');
    expect(searchTries('Sector 4, Gomti Nagar Extention', 'Lucknow')).toContain('Sector 4, Gomti Nagar Extension, Lucknow');
  });

  it('then ever shorter parts, keeping sector and block', () => {
    expect(searchTries('A- 705 , Sect - C, Mahanagar', 'Lucknow')).toEqual([
      'A- 705 , Sect - C, Mahanagar, Lucknow',
      'A- 705 , Sector - C, Mahanagar, Lucknow',
      'Sect - C, Mahanagar, Lucknow',
      'Sector - C, Mahanagar, Lucknow',
      'Mahanagar, Lucknow',
    ]);
  });

  it('never tries a part with nothing telling in it', () => {
    expect(searchTries('21, Gate No. 4', 'Lucknow')).toEqual([]);
  });

  it('has nothing to try without an address', () => {
    expect(searchTries('', 'Lucknow')).toEqual([]);
  });
});

describe('placeFits', () => {
  it('takes a place that has every telling word of the search', () => {
    expect(placeFits('Gokhale Marg, Lucknow', place('Gokhale Marg', 'Civil Lines, Lucknow'))).toBe(true);
  });

  it('refuses a place that only shares a common word', () => {
    expect(placeFits('Prag Narain Road, Lucknow', place('Jagat Narain Road', 'Qaisarbagh, Lucknow'))).toBe(false);
    expect(placeFits('U P East, Lucknow', place('The East End Mall', 'Indira Nagar, Lucknow'))).toBe(false);
  });

  it('refuses a place of the same name far from Lucknow', () => {
    expect(placeFits('Talkatora Industrial Estate, Lucknow', place('Talkatora', 'Lucknow Estate, Karachi', 24.86, 67.0))).toBe(false);
  });
});

describe('rememberedPlace', () => {
  const ekana1 = bw('Ekana stadium gate no 2', { latitude: 26.811, longitude: 81.018, locationSource: 'map' });
  const ekana2 = bw('Ekana Guest house', { latitude: 26.814, longitude: 81.021, locationSource: 'map' });
  const other = bw('Rajendra Nagar', { area: 'Rajendra Nagar', latitude: 26.86, longitude: 80.91, locationSource: 'map' });

  it('frames the borewells already placed at the same site', () => {
    const hint = rememberedPlace(bw('Ekana Boys hostel 8'), [ekana1, ekana2, other])!;
    expect(hint.word).toBe('ekana');
    expect(hint.borewells.map((b) => b.borewellId)).toEqual(['Ekana stadium gate no 2', 'Ekana Guest house']);
    expect(hint.bounds).toEqual([[26.811, 81.018], [26.814, 81.021]]);
  });

  it('is only ever a view: it never gives the borewell a position', () => {
    expect(rememberedPlace(bw('Ekana Boys hostel 8'), [ekana1])).not.toHaveProperty('latitude');
  });

  it('looks in the address too', () => {
    expect(rememberedPlace(bw('Mr Kapoor', { area: 'Rajendra Nagar' }), [ekana1, other])?.word).toBe('rajendra');
  });

  it('prefers the most particular word when several are shared', () => {
    const gomti = [1, 2, 3].map((i) => bw(`House ${i}`, { area: 'Gomti Nagar', latitude: 26.85 + i / 100, longitude: 80.99, locationSource: 'map' }));
    const vipul = bw('School', { area: 'Vipul Khand, Gomti Nagar', latitude: 26.86, longitude: 81.0, locationSource: 'map' });
    expect(rememberedPlace(bw('New one', { area: 'Vipul Khand, Gomti Nagar' }), [...gomti, vipul])?.word).toBe('vipul');
  });

  it('finds nothing when nothing telling is shared, and never matches a borewell with itself', () => {
    expect(rememberedPlace(bw('Bank of India Colony'), [ekana1, other])).toBeNull();
    expect(rememberedPlace(ekana1, [ekana1])).toBeNull();
  });
});

describe('coordinatesIn', () => {
  it('reads a pair of numbers as phones and map apps copy them', () => {
    expect(coordinatesIn('26.851234, 80.946789')).toEqual({ latitude: 26.851234, longitude: 80.946789 });
  });

  it('reads the position out of a Google Maps link', () => {
    expect(coordinatesIn('https://www.google.com/maps/place/26.8512,80.9467/@26.8512,80.9467,17z')).toEqual({ latitude: 26.8512, longitude: 80.9467 });
    expect(coordinatesIn('https://maps.google.com/?q=26.8512,80.9467')).toEqual({ latitude: 26.8512, longitude: 80.9467 });
  });

  it('reads nothing from text that is not a position', () => {
    expect(coordinatesIn('Near the water tank')).toBeNull();
    expect(coordinatesIn('')).toBeNull();
  });
});
