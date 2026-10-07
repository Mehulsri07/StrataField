import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Map as LeafletMap } from "leaflet";
import type { Borewell } from "@strata/core";
import { isRecentWater, recentCutoff, waterColour, waterPoints } from "@strata/core";
import { Droplets, Layers, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { BaseMap } from "@/components/map/BaseMap";
import { BorewellPins, FitBorewells } from "@/components/map/BorewellPins";
import { WaterLayer, WaterLegend, WaterPeriod } from "@/components/map/WaterLayer";
import { StrataStrip } from "@/components/geology/patterns";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/data";
import { useWaterYears } from "@/lib/hooks";
import { text } from "@/text";
import { cn } from "cn";

export function MapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const items = useLoad("map-borewells", () => api.borewells.search({}));
  const [showWater, setShowWater] = useState(true);
  // Opened from a borewell ("Show on map"): select it and zoom to it once, until "Show all".
  const [focusId] = useState(() => params.get("select"));
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [fit, setFit] = useState(0);
  const { showLayer, popup } = useLayerPopup();

  const all = useMemo(() => items.data ?? [], [items.data]);
  const borewells = useMemo(() => all.map((i) => i.borewell), [all]);
  const located = useMemo(() => borewells.filter((b) => b.latitude != null && b.longitude != null), [borewells]);
  // The side list in ID order: sorted when the borewells change, not on every click.
  const listed = useMemo(() => [...located].sort((a, b) => a.borewellId.localeCompare(b.borewellId, undefined, { numeric: true })), [located]);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const missing = borewells.length - located.length;
  const [years] = useWaterYears();
  const points = useMemo(() => waterPoints(borewells, years), [borewells, years]);
  const cutoff = useMemo(() => recentCutoff(borewells, years), [borewells, years]);
  const selected = all.find((i) => i.borewell.id === selectedId);
  const focus = useMemo(() => borewells.find((b) => b.id === focusId), [borewells, focusId]);
  // The same list from one draw to the next, so the map only moves at the start and on "Show all".
  const toFit = useMemo(() => (fit === 0 && focus ? [focus] : borewells), [fit, focus, borewells]);

  return (
    <Page className="max-w-none">
      <PageHeader
        title={`${text.pages.map.title} · ${text.app.city}`}
        sub={`${located.length} borewell${located.length === 1 ? " has" : "s have"} a location. ${showWater ? `Colours show how deep the water is${borewells.some((b) => b.waterLevel != null && !isRecentWater(b, cutoff)) ? `, going by readings since ${cutoff.slice(0, 4)}` : ""}. Darker means deeper.` : "Water colours are turned off."}`}
        actions={
          <>
            <WaterPeriod />
            {missing > 0 && (
              <Button variant="outline" render={<Link to="/borewells?noLocation=1" />}>
                <Chip tone="warn">{missing}</Chip> without a location
              </Button>
            )}
            <Button render={<Link to="/section" />}><Layers />See layers between borewells</Button>
          </>
        }
      />

      <div className="grid h-[calc(100dvh-210px)] min-h-[520px] grid-cols-[minmax(0,1fr)_320px] gap-4">
        <section className="relative min-h-0 overflow-hidden rounded-md border border-border">
          <BaseMap onReady={setMap}>
            {showWater && <WaterLayer points={points} />}
            <BorewellPins borewells={borewells} selectedId={selectedId} onSelect={(b) => setSelectedId(b.id)} />
            <FitBorewells borewells={toFit} trigger={fit} />
          </BaseMap>

          <div className="pointer-events-none absolute top-3 left-14 z-[500] flex flex-wrap gap-2">
            <Button className="pointer-events-auto shadow-panel" variant={showWater ? "default" : "outline"} aria-pressed={showWater} onClick={() => setShowWater((v) => !v)}>
              <Droplets />Water depth colours
            </Button>
            <Button className="pointer-events-auto bg-card shadow-panel" variant="outline" onClick={() => setFit((n) => n + 1)}><Maximize />Show all</Button>
          </div>

          {showWater && points.length > 0 && <div className="absolute bottom-6 left-3 z-[500]"><WaterLegend /></div>}

          {selected && <SelectedCard item={selected} onClose={() => setSelectedId(null)} onOpen={() => navigate(`/borewell/${selected.borewell.id}`)} onLayer={(l) => showLayer(l)} />}

          {!items.loading && located.length === 0 && (
            <div className="absolute inset-0 z-[500] grid place-items-center bg-card/70 p-6 text-center">
              <div className="grid max-w-sm gap-2">
                <p className="font-medium">No borewells have a location yet</p>
                <p className="text-sm text-muted-foreground">Add a location to a borewell (from a photo's GPS, typed coordinates or the address) and it will appear here.</p>
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col rounded-md border border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">Borewells on the map</h2>
            <Chip className="ml-auto">{located.length}</Chip>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {listed.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  // Chosen from the list, the borewell may be off the map or inside a group, so the map goes to it.
                  onClick={() => { setSelectedId(b.id); map?.flyTo([b.latitude!, b.longitude!], Math.max(map.getZoom(), 16)); }}
                  className={cn("grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border px-4 py-2.5 text-left hover:bg-muted", b.id === selectedId && "bg-accent")}
                >
                  <WaterDot b={b} cutoff={cutoff} />
                  <span className="min-w-0">
                    <span className="num block truncate text-[13px] font-medium">{b.borewellId}</span>
                    <span className="block truncate text-xs text-muted-foreground">{b.area || b.city}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground">{b.waterLevel != null ? `${b.waterLevel} ft` : "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            Street maps need internet the first time. Pins and water colours work offline.
          </p>
        </section>
      </div>
      {popup}
    </Page>
  );
}

function WaterDot({ b, cutoff }: { b: Borewell; cutoff: string }) {
  const c = isRecentWater(b, cutoff) ? waterColour(b.waterLevel!) : [150, 160, 170];
  return <span className="size-3 rounded-full border border-card" style={{ background: `rgb(${c.join(",")})` }} aria-hidden="true" />;
}

function SelectedCard({ item, onClose, onOpen, onLayer }: {
  item: { borewell: Borewell; strata: import("@strata/core").StrataLayer[] };
  onClose: () => void; onOpen: () => void; onLayer: (l: import("@strata/core").StrataLayer) => void;
}) {
  const b = item.borewell;
  return (
    <div className="absolute top-14 right-3 z-[500] grid w-72 grid-cols-1 gap-2.5 rounded-md border border-input bg-card p-3.5 text-sm shadow-panel" role="dialog" aria-label={`${b.borewellId} details`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="num font-medium text-primary">{b.borewellId}</div>
          <div className="truncate">{b.ownerName || "Owner not entered"} · {b.area || b.city}</div>
        </div>
        <Button variant="ghost" size="icon-sm" className="ml-auto -mt-1 -mr-1" onClick={onClose} aria-label={text.actions.close}><X /></Button>
      </div>
      {item.strata.length > 0 && <StrataStrip strata={item.strata} totalDepth={b.totalDepth} waterLevel={b.waterLevel} width={256} onLayerClick={onLayer} />}
      <dl className="grid grid-cols-2 gap-1">
        <dt className="text-muted-foreground">Total depth</dt><dd className="num text-right">{b.totalDepth != null ? `${b.totalDepth} ft` : "—"}</dd>
        <dt className="text-muted-foreground">Water level</dt><dd className="num text-right">{b.waterLevel != null ? `${b.waterLevel} ft` : "—"}</dd>
      </dl>
      {b.locationSource === "address" && <p className="text-xs text-muted-foreground">Location is approximate (from the address).</p>}
      <Button onClick={onOpen}>{text.actions.openBorewell}</Button>
    </div>
  );
}
