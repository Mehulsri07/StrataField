import { useEffect, useMemo, useState } from "react";
import { CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import type { Borewell } from "@strata/core";
import { isRecentWater, recentCutoff, waterColour } from "@strata/core";

/** Up to this zoom, clicking a group zooms in to separate it; a group that needs more is at one spot. */
const SEPARATES_BY = 17;

type Props = { borewells: Borewell[]; selectedId?: string | null; onSelect?: (b: Borewell) => void; faint?: boolean };

/**
 * One pin per borewell, coloured by its water level (grey when the level is years old). Pins close
 * together are grouped into a count bubble; clicking a bubble zooms in to separate them, or lists
 * the borewells when they are at the same spot and no zoom would.
 */
export function BorewellPins({ borewells, selectedId, onSelect, faint }: Props) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({ moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }) });

  const located = useMemo(() => borewells.filter((b) => b.latitude != null && b.longitude != null), [borewells]);
  const index = useMemo(() => {
    const s = new Supercluster<{ id: string }>({ radius: 44, maxZoom: 20 });
    s.load(located.map((b) => ({ type: "Feature", properties: { id: b.id }, geometry: { type: "Point", coordinates: [b.longitude!, b.latitude!] } })));
    return s;
  }, [located]);
  const byId = useMemo(() => new Map(located.map((b) => [b.id, b])), [located]);
  const cutoff = useMemo(() => recentCutoff(located), [located]);
  /** Borewells at one spot, listed in a popup. */
  const [stack, setStack] = useState<{ at: [number, number]; ids: string[] } | null>(null);

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
              eventHandlers={{
                click: () => {
                  const zoom = index.getClusterExpansionZoom(c.id as number);
                  if (zoom <= SEPARATES_BY) map.flyTo([lat, lon], zoom);
                  else setStack({ at: [lat, lon], ids: index.getLeaves(c.id as number, Infinity).map((p) => p.properties.id) });
                },
              }}
              keyboard
              title={`${count} borewells here. Click to see them.`}
            />
          );
        }
        const bw = byId.get((c.properties as { id: string }).id)!;
        const selected = bw.id === selectedId;
        const recent = isRecentWater(bw, cutoff);
        const [r, g, bl] = recent ? waterColour(bw.waterLevel!) : [150, 160, 170];
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
              {bw.waterLevel != null && <> · water {bw.waterLevel} ft{!recent && bw.waterLevelOn && ` in ${bw.waterLevelOn.slice(0, 4)}`}</>}
            </Tooltip>
          </CircleMarker>
        );
      })}
      {stack && (
        <Popup position={stack.at} eventHandlers={{ remove: () => setStack(null) }}>
          <b className="font-semibold">{stack.ids.length} borewells here</b>
          <ul className="mt-1.5 grid max-h-56 gap-px overflow-y-auto">
            {stack.ids.map((id) => byId.get(id)!).sort((a, b) => b.date.localeCompare(a.date)).map((bw) => (
              <li key={bw.id}>
                <button type="button" className="flex w-full items-baseline gap-3 rounded-sm px-1.5 py-1 text-left hover:bg-accent" onClick={() => { setStack(null); onSelect?.(bw); }}>
                  <span className="font-medium text-primary">{bw.borewellId}</span>
                  <span className="num ml-auto text-xs text-muted-foreground">{bw.date.slice(0, 4)}{bw.waterLevel != null && ` · ${bw.waterLevel} ft`}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popup>
      )}
    </>
  );
}

/** Zooms the map to show all given borewells (or stays on the city if there are none). */
export function FitBorewells({ borewells, trigger }: { borewells: Borewell[]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const pts = borewells.filter((b) => b.latitude != null && b.longitude != null).map((b) => [b.latitude!, b.longitude!] as [number, number]);
    // One borewell: show it with its surroundings, not right up close.
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }, [map, borewells, trigger]);
  return null;
}
