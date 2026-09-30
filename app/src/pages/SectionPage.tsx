import { useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useNavigate } from "react-router-dom";
import { Marker, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Section } from "@strata/core";
import { COVERAGE_KM, corridorPolygons, exampleLines, midpoints, placeAlongPath, type LatLon } from "@strata/core";
import { toast } from "sonner";
import { Check, Eraser, FolderOpen, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { useConfirm } from "@/components/app/Confirm";
import { BaseMap } from "@/components/map/BaseMap";
import { BorewellPins } from "@/components/map/BorewellPins";
import { SectionDrawing, type SectionWell } from "@/components/geology/SectionDrawing";
import { FAMILY_COLOURS } from "@/components/geology/LayerDialog";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatWhen } from "@/lib/format";
import { text } from "@/text";
import { cn } from "@/lib/utils";

const handleIcon = (label: string) =>
  L.divIcon({ className: "", html: `<div class="strata-handle">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
/** A bend in the line: drag to move, double-click to remove. */
const bendIcon = L.divIcon({ className: "", html: `<div class="strata-bend" title="Drag to move this bend. Double-click to remove it."></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
/** The middle of a part of the line: drag it to add a bend there. */
const midIcon = L.divIcon({ className: "", html: `<div class="strata-mid" title="Drag to bend the line here"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });

/** Zooms the map to the whole line when a line is chosen (not while dragging its points). */
function FitLine({ path, trigger }: { path: LatLon[]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (path.length >= 2 && trigger) map.fitBounds(path, { padding: [40, 40] });
  }, [map, trigger]); // eslint-disable-line react-hooks/exhaustive-deps -- only when a new line is chosen
  return null;
}

function TapToPlace({ onTap }: { onTap: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onTap([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export function SectionPage() {
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const items = useLoad("section-borewells", () => api.borewells.search({}));
  const saved = useLoad("sections", () => api.sections.list());
  // The line: A, any bends, then A′.
  const [path, setPath] = useState<LatLon[]>([]);
  const a = path[0] ?? null, b = path.length >= 2 ? path[path.length - 1] : null;
  const [half, setHalf] = useState(2);
  const [showEstimates, setShowEstimates] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [fitLine, setFitLine] = useState(0);
  const { showLayer, showSelection, popup } = useLayerPopup();
  const { ask, dialog } = useConfirm();

  const wells: (SectionWell & { latitude: number | null; longitude: number | null })[] = useMemo(
    () => (items.data ?? []).map((i) => ({ borewell: i.borewell, strata: i.strata, latitude: i.borewell.latitude, longitude: i.borewell.longitude })),
    [items.data],
  );
  const examples = useMemo(() => exampleLines(wells), [wells]);
  const result = useMemo(() => (path.length >= 2 ? placeAlongPath(path, half, wells) : null), [path, half, wells]);
  const step = b ? 3 : a ? 2 : 1;

  const setLine = (points: LatLon[], id: string | null = null) => { setPath(points); setSelectedKey(null); setOpenSectionId(id); setFitLine((n) => n + 1); };
  const tap = (p: LatLon) => { if (path.length < 2) { setPath([...path, p]); setSelectedKey(null); } };
  const clear = () => { setPath([]); setSelectedKey(null); setOpenSectionId(null); };
  /** Changes the line (moving a point, adding or removing a bend); the saved section no longer matches it. */
  const edit = (next: LatLon[]) => { setPath(next); setSelectedKey(null); setOpenSectionId(null); };
  const moved = (e: L.LeafletEvent): LatLon => { const ll = (e.target as L.Marker).getLatLng(); return [ll.lat, ll.lng]; };
  const bends = path.length - 2;

  const depthMax = result ? Math.max(100, ...result.placed.map((p) => p.item.borewell.totalDepth ?? 0)) : 100;
  const stretch = result && result.lengthKm > 0 ? Math.round(((result.lengthKm * 1000) / 1012) / ((depthMax * 0.3048) / 330)) : 0;

  const savePicture = async () => {
    if (!result) return;
    try {
      const { printableSvg, svgToPng, saveFile, fileName } = await import("@/lib/exporting");
      const markup = renderToStaticMarkup(<SectionDrawing placed={result.placed} lengthKm={result.lengthKm} showEstimates={showEstimates} showWater={showWater} forPrint />);
      const png = await svgToPng(printableSvg(markup), 2);
      const name = saved.data?.find((s) => s.id === openSectionId)?.name ?? "Cross-section";
      const path = await saveFile(`${fileName(name)}.png`, "png", png.bytes);
      if (path) toast.success("Picture saved");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const savePdf = async () => {
    if (!result) return;
    try {
      const { buildSectionPdf, saveFile, fileName } = await import("@/lib/exporting");
      const name = saved.data?.find((s) => s.id === openSectionId)?.name ?? "Cross-section";
      const bytes = await buildSectionPdf({
        name, line: path, lengthKm: result.lengthKm, corridorKm: half, nearby: result.placed.length,
        drawingMarkup: renderToStaticMarkup(<SectionDrawing placed={result.placed} lengthKm={result.lengthKm} showEstimates={showEstimates} showWater={showWater} forPrint />),
        borewells: result.placed.map((p) => ({ borewell: p.item.borewell, alongKm: p.alongKm, offsetKm: p.offsetKm, layers: p.item.strata.length })),
      });
      const out = await saveFile(`${fileName(name)}.pdf`, "pdf", bytes);
      if (out) toast.success("PDF saved");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const saveSection = async (name: string) => {
    if (path.length < 2) return;
    try {
      const existing = saved.data?.find((s) => s.id === openSectionId);
      const s: Section = {
        id: existing && existing.name === name ? existing.id : "",
        name, line: path, corridorHalfKm: half, settings: { showEstimates, showWater }, createdAt: "", updatedAt: "",
      };
      const out = await api.sections.save(s);
      setOpenSectionId(out.id);
      setNaming(null);
      bump();
      toast.success("Cross-section saved");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const openSaved = (s: Section) => {
    setHalf(s.corridorHalfKm);
    setShowEstimates(s.settings.showEstimates !== false);
    setShowWater(s.settings.showWater !== false);
    setLine(s.line, s.id);
  };

  return (
    <Page className="max-w-[1500px]">
      <PageHeader
        title={text.pages.section.title}
        sub={`See the soil layers underground along a line you draw across ${text.app.city}.`}
        actions={a && <Button variant="outline" onClick={clear}><Eraser />Draw a new line</Button>}
      />

      <ol className="grid gap-3 rounded-md border border-border bg-card px-4 py-3.5 md:grid-cols-3" aria-label="Steps">
        {[
          ["Tap where the line starts", step === 1 ? "Click anywhere on the map below" : "Point A is set"],
          ["Tap where the line ends", step <= 2 ? "Click a second point on the map" : "Drag A or A′ to move them, or drag a dot on the line to bend it"],
          ["Read the layers", step === 3 ? `${result?.placed.length ?? 0} borewells near the line are used` : "The picture appears once the line is drawn"],
        ].map(([title, body], i) => {
          const n = i + 1, done = step > n || (n === 3 && step === 3), now = step === n;
          return (
            <li key={title} className="flex items-start gap-2.5 text-sm" aria-current={now ? "step" : undefined}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 font-semibold",
                done ? "border-ok text-ok" : now ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
                {done ? <Check className="size-4" /> : n}
              </span>
              <span><b className={cn(now && "text-primary")}>{title}</b><br /><span className="text-muted-foreground">{body}</span></span>
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <section className="relative h-[460px] overflow-hidden rounded-md border border-border">
          <BaseMap className={step < 3 ? "cursor-crosshair" : undefined}>
            <BorewellPins borewells={wells.map((w) => w.borewell)} faint />
            {step < 3 && <TapToPlace onTap={tap} />}
            <FitLine path={path} trigger={fitLine} />
            {b && corridorPolygons(path, half).map((band, i) => (
              <Polygon key={`c${i}`} positions={band} pathOptions={{ color: "#0d6883", weight: 1, dashArray: "4 3", fillOpacity: 0.1 }} />
            ))}
            {result?.placed.map((p) => (
              <Polyline key={p.item.borewell.id} positions={[[p.item.borewell.latitude!, p.item.borewell.longitude!], p.foot]} pathOptions={{ color: "#0d6883", weight: 1.2 }} />
            ))}
            {result?.placed.map((p) => (
              <CircleMarker key={`u${p.item.borewell.id}`} center={[p.item.borewell.latitude!, p.item.borewell.longitude!]} radius={6} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#0d6883", fillOpacity: 1 }} />
            ))}
            {b && <Polyline positions={path} pathOptions={{ color: "#16202a", weight: 2.5, className: "strata-section-line" }} />}
            {b && midpoints(path).map((m, i) => (
              <Marker key={`m${i}-${path.length}`} position={m} icon={midIcon} draggable
                eventHandlers={{ dragend: (e) => edit([...path.slice(0, i + 1), moved(e), ...path.slice(i + 1)]) }} />
            ))}
            {path.slice(1, -1).map((p, j) => (
              <Marker key={`b${j}-${path.length}`} position={p} icon={bendIcon} draggable
                eventHandlers={{
                  dragend: (e) => edit(path.map((q, k) => (k === j + 1 ? moved(e) : q))),
                  dblclick: () => edit(path.filter((_, k) => k !== j + 1)),
                }} />
            ))}
            {a && <Marker position={a} icon={handleIcon("A")} draggable eventHandlers={{ dragend: (e) => edit([moved(e), ...path.slice(1)]) }} />}
            {b && <Marker position={b} icon={handleIcon("A′")} draggable eventHandlers={{ dragend: (e) => edit([...path.slice(0, -1), moved(e)]) }} />}
          </BaseMap>
          {step < 3 && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-panel">
              {step === 1 ? "Tap where the line should start" : "Now tap where the line should end"}
            </div>
          )}
        </section>

        <div className="grid min-w-0 gap-4">
          <Panel title="Borewells used" actions={<span className="text-xs text-muted-foreground">In order from A to A′</span>} bodyClassName="grid gap-3">
            <label className="grid gap-2 text-sm" htmlFor="s-half">
              <span>Include borewells within <b className="num">{half} km</b> of the line</span>
              <Slider id="s-half" value={[half]} min={0.5} max={5} step={0.25} onValueChange={(v) => setHalf(Array.isArray(v) ? v[0] : v)} />
            </label>
            {!result ? <p className="text-sm text-muted-foreground">Borewells near your line will be listed here.</p>
              : result.placed.length === 0 ? <p className="text-sm text-muted-foreground">No borewells within {half} km of this line. Move the slider to include borewells farther away, or draw the line closer to some borewells.</p>
              : (
                <ul className="grid max-h-44 overflow-auto rounded-md border border-border">
                  {result.placed.map((p) => (
                    <li key={p.item.borewell.id}>
                      <button type="button" onClick={() => navigate(`/borewell/${p.item.borewell.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="min-w-0 truncate">{p.item.borewell.area || p.item.borewell.borewellId}<span className="num block text-xs text-muted-foreground">{p.item.borewell.borewellId}</span></span>
                        <span className="num text-xs">{p.alongKm.toFixed(1)} km from A</span>
                        <span className="num w-24 text-right text-xs text-muted-foreground">{Math.abs(p.offsetKm).toFixed(1)} km off {Math.abs(p.offsetKm) > half * 0.66 && <Chip>far</Chip>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>

          <Panel title="Or try an example line" bodyClassName="flex flex-wrap gap-2">
            {examples ? (
              <>
                <Button variant="outline" onClick={() => setLine(examples.northSouth)}>North to south</Button>
                <Button variant="outline" onClick={() => setLine(examples.westEast)}>West to east</Button>
              </>
            ) : <p className="text-sm text-muted-foreground">Examples appear once two borewells have a location.</p>}
            {(saved.data?.length ?? 0) > 0 && <span className="w-full pt-2 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Saved cross-sections</span>}
            {saved.data?.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1">
                <Button variant={s.id === openSectionId ? "secondary" : "outline"} onClick={() => openSaved(s)} title={`Saved ${formatWhen(s.updatedAt)}`}><FolderOpen />{s.name}</Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`}
                  onClick={async () => { if (await ask({ title: `Delete the cross-section “${s.name}”?`, body: "Only the saved line is deleted. Borewells are not touched.", confirmLabel: "Delete cross-section", danger: true })) { await api.sections.remove(s.id); if (s.id === openSectionId) setOpenSectionId(null); bump(); } }}>
                  <Trash2 />
                </Button>
              </span>
            ))}
          </Panel>
        </div>
      </div>

      <Panel
        title="Layers along the line"
        bodyClassName="p-0"
        actions={result && result.placed.length > 0 && (
          <>
            <Button variant="outline" disabled={isPreview} onClick={() => setNaming(saved.data?.find((s) => s.id === openSectionId)?.name ?? `A–A′ ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)}><Save />Save</Button>
            <Button variant="outline" disabled={isPreview} onClick={savePdf}>Save as PDF</Button>
            <Button variant="outline" disabled={isPreview} onClick={savePicture}>Save as picture</Button>
          </>
        )}
      >
        {!result ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Draw a line on the map to see the layers underneath it.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>Line length <b className="num text-foreground">{result.lengthKm.toFixed(1)} km</b></span>
              <span>Borewells used <b className="num text-foreground">{result.placed.length}</b></span>
              {bends > 0 && <span>Bends <b className="num text-foreground">{bends}</b> <span className="text-muted-foreground">(distances are measured along the line)</span></span>}
              {stretch > 1 && <span title="The picture is much wider than it is deep, so depth is stretched to make layers readable">Depth stretched <b className="num text-foreground">{stretch}×</b> so thin layers are visible</span>}
            </div>
            <div className="overflow-x-auto px-3 pt-2">
              <SectionDrawing
                placed={result.placed} lengthKm={result.lengthKm} showEstimates={showEstimates} showWater={showWater} selectedKey={selectedKey}
                onLayer={(layer) => { setSelectedKey(`l${layer.id}`); showLayer(layer); }}
                onEstimate={(sel, key) => { setSelectedKey(key); showSelection(sel); }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <Legend swatch={<rect x="7" y="0" width="12" height="14" fill="#D4B862" stroke="var(--foreground)" strokeWidth="1.4" />}>Measured at the borewell</Legend>
              <Legend swatch={<><rect width="26" height="14" fill={FAMILY_COLOURS.CLAY} fillOpacity="0.5" /><path d="M0 13H26" stroke="var(--foreground)" strokeDasharray="6 4" /></>}>Estimate (borewells within {COVERAGE_KM.estimate} km)</Legend>
              <Legend swatch={<><rect width="26" height="14" fill={FAMILY_COLOURS.CLAY} fillOpacity="0.22" /><path d="M0 13H26" stroke="var(--foreground)" strokeDasharray="1.5 4" /></>}>Rough estimate ({COVERAGE_KM.estimate}–{COVERAGE_KM.rough} km apart)</Legend>
              <Legend swatch={<rect width="26" height="14" fill="url(#p-diagonal)" stroke="var(--input)" />}>Not enough borewells</Legend>
              <Legend swatch={<path d="M0 7H26" stroke="var(--water)" strokeWidth="2.5" />}>Water level</Legend>
            </div>
            <details className="border-t border-border">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-muted-foreground">More options</summary>
              <div className="flex flex-wrap gap-5 px-4 pb-3 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={showEstimates} onCheckedChange={(v) => setShowEstimates(!!v)} />Show estimated layers between borewells</label>
                <label className="flex items-center gap-2"><Checkbox checked={showWater} onCheckedChange={(v) => setShowWater(!!v)} />Show water level</label>
              </div>
            </details>
            <p className="border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
              Only the coloured columns are measured. Everything between them is an estimate, and it fades where borewells are far apart. Click any layer to see where it comes from.
            </p>
          </>
        )}
      </Panel>

      <Dialog open={naming !== null} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save this cross-section</DialogTitle></DialogHeader>
          <label className="grid gap-1.5 text-sm" htmlFor="s-name">Name
            <Input id="s-name" value={naming ?? ""} onChange={(e) => setNaming(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && naming?.trim()) saveSection(naming.trim()); }} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNaming(null)}>{text.actions.cancel}</Button>
            <Button disabled={!naming?.trim()} onClick={() => naming && saveSection(naming.trim())}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {popup}
      {dialog}
    </Page>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><svg width="26" height="14" aria-hidden="true">{swatch}</svg>{children}</span>;
}
