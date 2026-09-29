import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression, Map as LeafletMap } from "leaflet";
import { cn } from "@/lib/utils";

/** Centre of Lucknow, the pilot city. */
export const CITY_CENTRE: LatLngExpression = [26.85, 80.95];

/**
 * OpenStreetMap base map. Tiles need internet the first time; afterwards the browser cache keeps
 * recently seen areas. Without tiles the map shows a plain background and everything drawn on top
 * (pins, water colours, lines) still works.
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
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}
