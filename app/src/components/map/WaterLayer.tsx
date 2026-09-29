import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { WaterPoint } from "@strata/core";
import { estimateWater, waterColour, WATER_RAMP } from "@strata/core";

const MARGIN_DEG = 0.035; // about 3.5 km around the borewells
const CELLS = 180; // grid resolution across the longer side

/**
 * Water-depth colours drawn as one image over the area around the borewells. Colours fade where
 * the nearest borewell is far away, so the map never suggests a value where there is no data.
 */
export function WaterLayer({ points, opacity = 0.75 }: { points: WaterPoint[]; opacity?: number }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map((p) => p.latitude), lons = points.map((p) => p.longitude);
    const south = Math.min(...lats) - MARGIN_DEG, north = Math.max(...lats) + MARGIN_DEG;
    const west = Math.min(...lons) - MARGIN_DEG, east = Math.max(...lons) + MARGIN_DEG;
    const wide = east - west >= north - south;
    const cols = wide ? CELLS : Math.round((CELLS * (east - west)) / (north - south));
    const rows = wide ? Math.round((CELLS * (north - south)) / (east - west)) : CELLS;

    const grid = document.createElement("canvas");
    grid.width = cols;
    grid.height = rows;
    const g = grid.getContext("2d")!;
    const img = g.createImageData(cols, rows);
    for (let y = 0; y < rows; y++) {
      const lat = north - ((y + 0.5) / rows) * (north - south);
      for (let x = 0; x < cols; x++) {
        const lon = west + ((x + 0.5) / cols) * (east - west);
        const e = estimateWater(lat, lon, points);
        if (!e || e.strength <= 0) continue;
        const [r, gr, b] = waterColour(e.value);
        const i = (y * cols + x) * 4;
        img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = Math.round(255 * e.strength);
      }
    }
    g.putImageData(img, 0, 0);

    // Scale up with a soft blur so the colours read as a smooth surface, not squares.
    const out = document.createElement("canvas");
    out.width = cols * 4;
    out.height = rows * 4;
    const o = out.getContext("2d")!;
    o.filter = "blur(6px)";
    o.imageSmoothingEnabled = true;
    o.drawImage(grid, 0, 0, out.width, out.height);

    const layer = L.imageOverlay(out.toDataURL(), [[south, west], [north, east]], { opacity, interactive: false, className: "strata-water" });
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map, points, opacity]);

  return null;
}

/** Gradient legend for the water-depth colours, in feet below ground. */
export function WaterLegend({ title = "How deep is the water? (feet)" }: { title?: string }) {
  const min = WATER_RAMP[0][0], max = WATER_RAMP[WATER_RAMP.length - 1][0];
  const stops = WATER_RAMP.map(([v, c]) => `rgb(${c.join(",")}) ${(((v - min) / (max - min)) * 100).toFixed(0)}%`).join(", ");
  return (
    <div className="grid gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-panel">
      <b className="font-medium">{title}</b>
      <div className="h-2.5 w-44 rounded-sm" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <div className="num flex w-44 justify-between text-[10px] text-muted-foreground">
        {[40, 60, 80, 100, 120].map((v) => <span key={v}>{v}</span>)}
      </div>
      <span className="text-[11px] text-muted-foreground">Darker means deeper. Colours are estimates between borewells.</span>
    </div>
  );
}
