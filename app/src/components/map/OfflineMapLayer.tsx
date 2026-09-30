import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { Layer } from "leaflet";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { leafletLayer } from "protomaps-leaflet";
import { api } from "@/lib/api";

/** Reads the downloaded map file through the app (small pieces at a time). */
class DownloadedMapFile implements Source {
  constructor(private readonly key: string) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await api.offlineMap.read(offset, length) };
  }
}

// One reader per downloaded copy, so a new download is never mixed with the old one's index.
const archives = new Map<string, PMTiles>();
function archive(stamp: string) {
  let a = archives.get(stamp);
  if (!a) {
    a = new PMTiles(new DownloadedMapFile(`strata-lucknow-${stamp}`));
    archives.set(stamp, a);
  }
  return a;
}

/**
 * Draws the downloaded Lucknow map (streets, places, water, parks) instead of the online tiles.
 * Works without internet. `stamp` identifies the downloaded copy.
 */
export function OfflineMapLayer({ stamp }: { stamp: string }) {
  const map = useMap();
  useEffect(() => {
    const layer = leafletLayer({
      url: archive(stamp),
      flavor: "light",
      lang: "en",
      maxDataZoom: 15,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://protomaps.com">Protomaps</a>',
    }) as unknown as Layer;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, stamp]);
  return null;
}
