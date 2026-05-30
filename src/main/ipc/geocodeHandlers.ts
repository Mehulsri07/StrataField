/**
 * IPC handlers for coordinates geocoding.
 * Executes on the main process to bypass renderer CORS restrictions.
 */

import { safeHandle } from './safeHandle';
import { IPC_CHANNELS } from '../../shared/types';
import { NOMINATIM_BASE_URL, NOMINATIM_USER_AGENT } from '../../shared/constants';

export function registerGeocodeHandlers(): void {
  safeHandle(IPC_CHANNELS.GEOCODE_ADDRESS, async (_event, addressQuery: string) => {
    try {
      const url = `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(addressQuery)}&format=json&limit=1`;
      
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
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }
      
      return null;
    } catch (err) {
      console.error('Nominatim geocoding error:', err);
      throw err;
    }
  });
}
