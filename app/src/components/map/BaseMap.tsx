import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression, Map as LeafletMap } from "leaflet";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/data";
import { cn } from "cn";
import { OfflineMapLayer } from "./OfflineMapLayer";

/** Centre of Lucknow, the pilot city. */
export const CITY_CENTRE: LatLngExpression = [26.85, 80.95];

/**
 * The base map. When the Lucknow map has been downloaded (Settings), it is drawn from that file and
 * works without internet. Otherwise OpenStreetMap's online tiles are used; without internet those
 * show a plain background, and everything drawn on top (pins, water colours, lines) still works.
 */
export function BaseMap({ children, className, bounds, center = CITY_CENTRE, zoom = 12, onReady, interactive = true }: {
  children?: ReactNode;
  className?: string;
  bounds?: LatLngBoundsExpression;
  center?: LatLngExpression;
  zoom?: number;
  onReady?: (map: LeafletMap) => void;
  interactive?: boolean;
}) {
  const offline = useLoad("offline-map-status", () => api.offlineMap.status());
  const downloaded = offline.data?.installed ? offline.data.downloadedAt ?? "installed" : null;
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      bounds={bounds}
      boundsOptions={{ padding: [40, 40], maxZoom: 14 }}
      ref={(m) => { if (m && onReady) onReady(m); }}
      className={cn("strata-map z-0 h-full w-full bg-map-land", className)}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      zoomControl={interactive}
      attributionControl
    >
      {downloaded ? <OfflineMapLayer stamp={downloaded} /> : offline.data && (
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
      )}
      {children}
    </MapContainer>
  );
}
