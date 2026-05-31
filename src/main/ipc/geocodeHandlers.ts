import { safeHandle } from './safeHandle';
import { IPC_CHANNELS } from '../../shared/types';
import { NOMINATIM_BASE_URL, NOMINATIM_USER_AGENT } from '../../shared/constants';
import { geocodingCacheRepository } from '../database/geocodingCacheRepository';

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

      // 2. Fetch from Nominatim API
      const url = `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(trimmedQuery)}&format=json&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT
        }
      });
      
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
        
        // Save to cache
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
