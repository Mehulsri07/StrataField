import { safeHandle } from './safeHandle';
import { IPC_CHANNELS } from '../../shared/types';
import { NOMINATIM_BASE_URL, NOMINATIM_USER_AGENT, APP_DEFAULTS } from '../../shared/constants';
import { geocodingCacheRepository } from '../database/geocodingCacheRepository';

// ponytail: simple module-level timestamp enforces Nominatim's 1 req/s policy.
// Upgrade path: replace with a proper queue if batch geocoding is ever added.
let lastGeocodeTime = 0;

export function registerGeocodeHandlers(): void {
  safeHandle(IPC_CHANNELS.GEOCODE_ADDRESS, async (_event, addressQuery: string) => {
    try {
      const trimmedQuery = addressQuery.trim();
      
      // 1. Check database cache
      const cached = geocodingCacheRepository.get(trimmedQuery);
      if (cached) {
        console.log(`Geocode cache HIT for: "${trimmedQuery}"`);
        return cached;
      }

      console.log(`Geocode cache MISS for: "${trimmedQuery}". Querying Nominatim...`);

      // 2. Enforce Nominatim rate limit (1 req/s)
      const now = Date.now();
      const elapsed = now - lastGeocodeTime;
      if (elapsed < APP_DEFAULTS.GEOCODE_RATE_LIMIT_MS) {
        await new Promise(r => setTimeout(r, APP_DEFAULTS.GEOCODE_RATE_LIMIT_MS - elapsed));
      }
      lastGeocodeTime = Date.now();

      // 3. Fetch from Nominatim with a 5s timeout to prevent indefinite hangs
      const url = `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(trimmedQuery)}&format=json&limit=1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': NOMINATIM_USER_AGENT },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (!response.ok) {
        throw new Error(`Nominatim request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
        geocodingCacheRepository.set(trimmedQuery, result);
        return result;
      }
      
      return null;
    } catch (err) {
      console.error('Nominatim geocoding error:', err);
      throw err;
    }
  });
}
