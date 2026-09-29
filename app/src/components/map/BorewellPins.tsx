import { useEffect, useMemo, useState } from "react";
import { CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import type { Borewell } from "@strata/core";
import { waterColour } from "@strata/core";

type Props = { borewells: Borewell[]; selectedId?: string | null; onSelect?: (b: Borewell) => void; faint?: boolean };

/**
 * One pin per borewell, coloured by its water level. Pins close together are grouped into a count
 * bubble when zoomed out; clicking a bubble zooms in to separate them.
 */
export function BorewellPins({ borewells, selectedId, onSelect, faint }: Props) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({ moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }) });

  const located = useMemo(() => borewells.filter((b) => b.latitude != null && b.longitude != null), [borewells]);
  const index = useMemo(() => {
    const s = new Supercluster<{ id: string }>({ radius: 44, maxZoom: 15 });
    s.load(located.map((b) => ({ type: "Feature", properties: { id: b.id }, geometry: { type: "Point", coordinates: [b.longitude!, b.latitude!] } })));
    return s;
  }, [located]);
  const byId = useMemo(() => new Map(located.map((b) => [b.id, b])), [located]);

  const b = view.bounds;
  const clusters = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.round(view.zoom));

  return (
    <>
      {clusters.map((c) => {
        const [lon, lat] = c.geometry.coordinates;
        if ("cluster" in c.properties && c.properties.cluster) {
          const count = c.properties.point_count;
          const size = count < 10 ? 34 : count < 50 ? 40 : 48;
          return (
            <Marker
              key={`c${c.id}`}
              position={[lat, lon]}
              icon={L.divIcon({ className: "", html: `<div class="strata-cluster" style="width:${size}px;height:${size}px">${count}</div>`, iconSize: [size, size] })}
              eventHandlers={{ click: () => map.flyTo([lat, lon], Math.min(index.getClusterExpansionZoom(c.id as number), 17)) }}
              keyboard
              title={`${count} borewells here. Click to zoom in.`}
            />
          );
        }
        const bw = byId.get((c.properties as { id: string }).id)!;
        const selected = bw.id === selectedId;
        const [r, g, bl] = bw.waterLevel != null ? waterColour(bw.waterLevel) : [150, 160, 170];
        return (
          <CircleMarker
            key={selected ? `${bw.id}-selected` : bw.id} // Leaflet applies className only when a shape is created
            center={[lat, lon]}
            radius={selected ? 10 : 7}
            pathOptions={{
              color: "#ffffff",
              className: selected ? "strata-pin-selected" : undefined,
              weight: selected ? 4 : 2,
              fillColor: `rgb(${r},${g},${bl})`,
              fillOpacity: faint ? 0.55 : 1,
              opacity: faint ? 0.6 : 1,
            }}
            eventHandlers={{ click: () => onSelect?.(bw) }}
            bubblingMouseEvents={false}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <b>{bw.borewellId}</b> · {bw.area || bw.city}
              {bw.waterLevel != null && <> · water {bw.waterLevel} ft</>}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

/** Zooms the map to show all given borewells (or stays on the city if there are none). */
export function FitBorewells({ borewells, trigger }: { borewells: Borewell[]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const pts = borewells.filter((b) => b.latitude != null && b.longitude != null).map((b) => [b.latitude!, b.longitude!] as [number, number]);
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }, [map, borewells, trigger]);
  return null;
}
