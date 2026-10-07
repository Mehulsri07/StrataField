import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { WaterPoint } from "@strata/core";
import { WaterIndex, waterColour, WATER_RAMP } from "@strata/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWaterYears } from "@/lib/hooks";

const MARGIN_DEG = 0.006; // about 600 m around the borewells, just past where the colours end
const CELLS = 420; // grid resolution across the longer side: about 70 m a cell across Lucknow

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
    const index = new WaterIndex(points); // each cell looks only at nearby borewells
    for (let y = 0; y < rows; y++) {
      const lat = north - ((y + 0.5) / rows) * (north - south);
      for (let x = 0; x < cols; x++) {
        const lon = west + ((x + 0.5) / cols) * (east - west);
        const e = index.estimate(lat, lon);
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

    // Packed into a picture in the background, so a large grid does not hold up the screen.
    let layer: L.ImageOverlay | null = null, url = "", left = false;
    out.toBlob((picture) => {
      if (!picture || left) return;
      url = URL.createObjectURL(picture);
      layer = L.imageOverlay(url, [[south, west], [north, east]], { opacity, interactive: false, className: "strata-water" }).addTo(map);
    });
    return () => {
      left = true;
      layer?.remove();
      if (url) URL.revokeObjectURL(url);
    };
  }, [map, points, opacity]);

  return null;
}

const PERIODS = [
  { value: "1", label: "Readings from the last year" },
  { value: "3", label: "Readings from the last 3 years" },
  { value: "5", label: "Readings from the last 5 years" },
  { value: "0", label: "All readings" },
];

/** Chooses which water readings count, on every screen: the last 1, 3 or 5 years, or all of them. */
export function WaterPeriod({ className, size = "default" }: { className?: string; size?: "sm" | "default" }) {
  const [years, setYears] = useWaterYears();
  return (
    <Select value={String(years)} onValueChange={(v) => v != null && setYears(Number(v))} items={PERIODS}>
      <SelectTrigger size={size} className={className} aria-label="Which water readings to use"><SelectValue /></SelectTrigger>
      <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
    </Select>
  );
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
      <span className="text-[11px] text-muted-foreground">Darker means deeper. Colours are estimates within 500 m of a borewell.</span>
    </div>
  );
}
