import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BorewellRecord, StrataLayer, WaterReading } from "@strata/core";
import { describeLayer } from "@strata/core";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, File as FileIcon, ImagePlus, Layers, Map as MapIcon, Paperclip, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { BorewellStatus, locationSourceText } from "@/components/app/BorewellStatus";
import { useConfirm } from "@/components/app/Confirm";
import { LIST_SEARCH_KEY } from "@/components/app/nav";
import { BorewellProfile, activateOnKey } from "@/components/geology/BorewellProfile";
import { MaterialSwatch, PipeSwatch } from "@/components/geology/patterns";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api, files, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatDate, formatWhen, pumpText, zoneName } from "@/lib/format";
import { parseNumber } from "@strata/core";
import { text } from "@/text";

const METHOD: Record<string, string> = { ROTARY: "Rotary", DTH: "DTH (down-the-hole)", MANUAL: "Manual", UNKNOWN: "Not known" };

export function BorewellDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const record = useLoad(`borewell:${id}`, () => api.borewells.get(id));
  const { showLayer, selection, popup } = useLayerPopup();
  const { ask, dialog } = useConfirm();

  if (record.error && !record.data) {
    return (
      <Page>
        <PageHeader title="Borewell not found" sub={record.error} actions={<Button variant="outline" render={<Link to="/borewells" />}>Back to Borewells</Button>} />
      </Page>
    );
  }
  const r = record.data;
  if (!r) return <Page><p className="text-muted-foreground">Loading…</p></Page>;
  const b = r.borewell;

  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      bump();
      toast.success(done);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const moveToBin = async () => {
    if (await ask({ title: `Move ${b.borewellId} to the Recycle bin?`, body: "You can restore it from the Recycle bin later.", confirmLabel: "Move to Recycle bin", danger: true })) {
      await run(() => api.borewells.remove(b.id), `${b.borewellId} moved to the Recycle bin`);
    }
  };

  const open = (layer: StrataLayer) => showLayer(layer, r);

  /** Back to the list with the search and filters it had. */
  const backToList = () => {
    let kept = "";
    try { kept = sessionStorage.getItem(LIST_SEARCH_KEY) ?? ""; } catch { /* a plain list is fine */ }
    navigate(kept ? `/borewells?${kept}` : "/borewells");
  };

  const makeReport = async () => {
    try {
      const { buildReport, fileName, saveFile } = await import("@/lib/exporting");
      const path = await saveFile(`${fileName(b.borewellId)}.pdf`, "pdf", await buildReport([r]));
      if (path) toast.success("Report saved", { action: { label: "Open", onClick: () => files.open(path).catch((e) => toast.error(String(e))) } });
    } catch (e) {
      toast.error(String(e));
    }
  };
  const savePicture = async () => {
    try {
      const { drawingPng, fileName, saveFile } = await import("@/lib/exporting");
      const path = await saveFile(`${fileName(b.borewellId)} drawing.png`, "png", (await drawingPng(r, 3)).bytes);
      if (path) toast.success("Picture saved");
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Page>
      <PageHeader
        title={<><span className="num">{b.borewellId}</span>{b.ownerName && <> · {b.ownerName}</>}</>}
        sub={<>{zoneName(b.project)} · {[b.area, b.city].filter(Boolean).join(", ")}{b.date && <> · tubewell lowered {formatDate(b.date)}</>}</>}
        actions={
          b.deletedAt ? null : (
            <>
              <Button variant="outline" render={<Link to={`/borewell/${b.id}/edit`} />}><Pencil />Edit details</Button>
              <Button variant="outline" render={<Link to={`/borewell/${b.id}/layers`} />}><Layers />Edit layers &amp; pipes</Button>
              <Button disabled={isPreview} onClick={makeReport}><FileText />Make PDF report</Button>
              <Button variant="ghost" className="text-destructive" onClick={moveToBin} aria-label="Move to Recycle bin"><Trash2 /></Button>
            </>
          )
        }
      />

      {b.deletedAt && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          <Trash2 className="size-4 text-warn" aria-hidden="true" />
          <span>This borewell is in the Recycle bin (moved {formatWhen(b.deletedAt)}).</span>
          <Button className="ml-auto" variant="outline" onClick={() => run(() => api.borewells.restore(b.id), `${b.borewellId} restored`)}><RotateCcw />Restore</Button>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="layers">Layers &amp; pipes ({r.strata.length})</TabsTrigger>
          <TabsTrigger value="water">Water ({r.waterReadings.length})</TabsTrigger>
          <TabsTrigger value="photos">Photos ({r.photos.length})</TabsTrigger>
          <TabsTrigger value="files">Files ({r.files.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="grid min-w-0 gap-x-10 gap-y-7">
              <Panel title="Borewell details" actions={<BorewellStatus borewell={b} strata={r.strata} />}>
                <dl className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-4">
                  <Fact label="Total depth" value={b.totalDepth} unit="ft" />
                  <Fact label="Water level" value={b.waterLevel} unit="ft" />
                  {b.dynamicWaterLevel != null && <Fact label="Water level while pumping" value={b.dynamicWaterLevel} unit="ft" />}
                  <Fact label="Hole size" value={b.boreDia} unit="inch" />
                  <Fact label="Pipe size" value={b.pipeDia} unit="inch" />
                  <FactText label="Drilling method">{b.drillingMethod ? METHOD[b.drillingMethod] : "—"}</FactText>
                  {pumpText({ ...b, pumpType: "" }) && <FactText label="Pump">{pumpText({ ...b, pumpType: "" })}</FactText>}
                  {b.pumpType && <FactText label="Pump type">{b.pumpType}</FactText>}
                  {b.pumpLowering != null && <Fact label="Pump lowered to" value={b.pumpLowering} unit="ft" />}
                  <FactText label="Tubewell lowering date">{b.date ? formatDate(b.date) : "—"}</FactText>
                  <FactText label="Zone">{zoneName(b.project)}</FactText>
                  <FactText label="Added by">{b.importMethod === "excel" ? `Excel file${b.importSource ? ` (${b.importSource})` : ""}` : b.importMethod === "legacy" ? "The older StrataField" : "Typed in"}</FactText>
                </dl>
                {b.remarks && <p className="mt-4 border-t border-border pt-3 text-sm"><span className="text-muted-foreground">Notes: </span>{b.remarks}</p>}
              </Panel>

              <Panel
                title="Owner & location"
                actions={b.latitude == null ? <Chip tone="warn">No location yet</Chip> : (
                  <Button variant="ghost" render={<Link to={`/map?select=${b.id}`} />}><MapIcon />Show on map</Button>
                )}
              >
                <dl className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-4">
                  <FactText label="Owner">{b.ownerName || "—"}</FactText>
                  <FactText label="Address">{[b.houseNo, b.address, b.area, b.city].filter(Boolean).join(", ") || "—"}</FactText>
                  <FactText label="GPS location">
                    {b.latitude != null && b.longitude != null ? (
                      <>
                        <span className="num">{b.latitude.toFixed(5)}° N, {b.longitude.toFixed(5)}° E</span>
                        <span className="block text-xs text-muted-foreground">{locationSourceText(b.locationSource)}</span>
                      </>
                    ) : (
                      <Link to={`/borewell/${b.id}/edit?step=location`} className="text-primary underline-offset-4 hover:underline">Add a location</Link>
                    )}
                  </FactText>
                  {b.groundElevationM != null && <Fact label="Ground height above sea level" value={b.groundElevationM} unit="m" />}
                </dl>
              </Panel>

              <Panel
                title="Soil layers"
                actions={<Button variant="ghost" render={<Link to={`/borewell/${b.id}/layers`} />}><Pencil />Edit</Button>}
                framed
              >
                <LayerRows record={r} onOpen={open} compact />
              </Panel>
            </div>

            <Panel title="Borewell drawing" bodyClassName="grid gap-3" actions={(r.strata.length > 0 || r.pipes.length > 0) && !isPreview && <Button variant="ghost" onClick={savePicture}>Save as picture</Button>}>
              {r.strata.length === 0 && r.pipes.length === 0 ? (
                <EmptyNote>
                  No layers or pipes yet. <Link className="text-primary hover:underline" to={`/borewell/${b.id}/layers`}>Add them</Link> to see the drawing.
                </EmptyNote>
              ) : (
                <>
                  <BorewellProfile borewell={b} strata={r.strata} pipes={r.pipes} selectedId={selection?.kind === "measured" ? selection.layer.id : null} onLayerClick={open} />
                  <Legend strata={r.strata} />
                  <p className="text-xs text-muted-foreground">Click a layer to see its details.</p>
                </>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="layers" className="grid gap-7 pt-4">
          <Panel title="Soil layers" framed actions={<Button variant="outline" render={<Link to={`/borewell/${b.id}/layers`} />}><Pencil />Edit layers &amp; pipes</Button>}>
            <LayerRows record={r} onOpen={open} />
          </Panel>
          <Panel title="Pipes" framed>
            {r.pipes.length === 0 ? <EmptyNote>No pipes recorded yet.</EmptyNote> : (
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">From (ft)</TableHead><TableHead className="text-right">To (ft)</TableHead><TableHead className="text-right">Length (ft)</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Size (inch)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.pipes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="num text-right">{p.startDepth}</TableCell>
                      <TableCell className="num text-right">{p.endDepth}</TableCell>
                      <TableCell className="num text-right">{Math.round((p.endDepth - p.startDepth) * 10) / 10}</TableCell>
                      <TableCell><span className="flex items-center gap-2"><PipeSwatch kind={p.pipeType} />{p.pipeType === "plain" ? text.geology.plainPipe : text.geology.screenPipe}</span></TableCell>
                      <TableCell className="num text-right">{p.diameter ?? b.pipeDia ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="water" className="pt-4">
          <WaterTab record={r} run={run} ask={ask} />
        </TabsContent>

        <TabsContent value="photos" className="pt-4">
          <PhotosTab record={r} run={run} ask={ask} />
        </TabsContent>

        <TabsContent value="files" className="pt-4">
          <FilesTab record={r} run={run} ask={ask} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Panel title="Changes to this borewell" framed>
            <ol className="divide-y divide-border">
              {r.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-40 shrink-0 text-muted-foreground">{formatWhen(h.changedAt)}</span>
                  <span>{h.summary}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>
      </Tabs>

      <div>
        <Button variant="ghost" onClick={backToList}><Undo2 />Back to Borewells</Button>
      </div>
      {popup}
      {dialog}
    </Page>
  );
}

type Run = (work: () => Promise<unknown>, done: string) => Promise<void>;
type Ask = ReturnType<typeof useConfirm>["ask"];

function LayerRows({ record: r, onOpen, compact }: { record: BorewellRecord; onOpen: (l: StrataLayer) => void; compact?: boolean }) {
  if (r.strata.length === 0) return <EmptyNote>No soil layers recorded yet.</EmptyNote>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">From (ft)</TableHead>
          <TableHead className="text-right">To (ft)</TableHead>
          {!compact && <TableHead className="text-right">Thickness (ft)</TableHead>}
          <TableHead>Soil type</TableHead>
          {!compact && <TableHead>Holds water</TableHead>}
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {r.strata.map((l) => {
          const f = describeLayer(l, { strata: r.strata, waterLevel: r.borewell.waterLevel });
          return (
            <TableRow key={l.id} tabIndex={0} className="cursor-pointer" onClick={() => onOpen(l)} onKeyDown={activateOnKey(() => onOpen(l))}
              aria-label={`${l.material}, ${l.startDepth} to ${l.endDepth} ft. Show details`}>
              <TableCell className="num text-right">{l.startDepth}</TableCell>
              <TableCell className="num text-right">{l.endDepth}</TableCell>
              {!compact && <TableCell className="num text-right">{f.thickness}</TableCell>}
              <TableCell>
                <span className="flex items-center gap-2">
                  <MaterialSwatch color={l.color} pattern={l.pattern} />
                  {l.material}
                  {f.water === "contains" && <Chip tone="accent">Water level here</Chip>}
                </span>
              </TableCell>
              {!compact && <TableCell>{l.waterBearing ? "Yes" : <span className="text-muted-foreground">—</span>}</TableCell>}
              <TableCell className="max-w-[260px] truncate text-muted-foreground">{l.remarks}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function WaterTab({ record: r, run, ask }: { record: BorewellRecord; run: Run; ask: Ask }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, level: "", pumping: "", notes: "" });
  const level = parseNumber(form.level), pumping = parseNumber(form.pumping);
  const invalid = level === undefined || pumping === undefined || (level == null && pumping == null) || !form.date;

  const add = async () => {
    const reading: Partial<WaterReading> = { measuredOn: form.date, staticLevel: level ?? null, dynamicLevel: pumping ?? null, remarks: form.notes, source: "Typed in" };
    await run(() => api.water.add(r.borewell.id, reading), "Water reading added");
    setForm({ date: today, level: "", pumping: "", notes: "" });
  };

  return (
    <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Water readings" framed>
        {r.waterReadings.length === 0 ? <EmptyNote>No water readings yet.</EmptyNote> : (
          <Table>
            <TableHeader><TableRow><TableHead>Measured on</TableHead><TableHead className="text-right">Water level (ft)</TableHead><TableHead className="text-right">While pumping (ft)</TableHead><TableHead>Notes</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {r.waterReadings.map((w, i) => (
                <TableRow key={w.id}>
                  <TableCell>{formatDate(w.measuredOn)} {i === 0 && <Chip tone="accent" className="ml-1">Newest</Chip>}</TableCell>
                  <TableCell className="num text-right">{w.staticLevel ?? "—"}</TableCell>
                  <TableCell className="num text-right">{w.dynamicLevel ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{w.remarks || w.source}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove the reading from ${formatDate(w.measuredOn)}`}
                      onClick={async () => { if (await ask({ title: "Remove this water reading?", confirmLabel: "Remove reading", danger: true })) await run(() => api.water.remove(w.id), "Water reading removed"); }}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">The borewell's water level always shows the newest reading.</p>
      </Panel>
      <Panel title="Add a reading">
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="w-date">Measured on</Label><Input id="w-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="w-level">Water level (ft)</Label><Input id="w-level" className="num" inputMode="decimal" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} aria-invalid={level === undefined || undefined} /></div>
            <div className="grid gap-1.5"><Label htmlFor="w-pump">While pumping (ft)</Label><Input id="w-pump" className="num" inputMode="decimal" value={form.pumping} onChange={(e) => setForm({ ...form, pumping: e.target.value })} aria-invalid={pumping === undefined || undefined} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="w-notes">Notes</Label><Input id="w-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
          <Button disabled={invalid} onClick={add}>Add reading</Button>
        </div>
      </Panel>
    </div>
  );
}

function PhotosTab({ record: r, run, ask }: { record: BorewellRecord; run: Run; ask: Ask }) {
  const add = async () => {
    try {
      const paths = await files.choose({ title: "Choose photos", multiple: true, filters: files.photoFilters });
      for (const path of paths) {
        const meta = await api.photoMetadata(path).catch(() => ({ captureDate: null, latitude: null, longitude: null }));
        await api.attachments.addPhoto(r.borewell.id, path, { captureDate: meta.captureDate ?? undefined, latitude: meta.latitude ?? undefined, longitude: meta.longitude ?? undefined });
      }
      if (paths.length) await run(async () => {}, paths.length === 1 ? "Photo added" : `${paths.length} photos added`);
    } catch (e) {
      toast.error(String(e));
    }
  };
  return (
    <Panel title="Field photos" actions={<Button variant="outline" onClick={add}><ImagePlus />Add photos</Button>}>
      {r.photos.length === 0 ? (
        <EmptyNote>No photos yet. Add rig, cuttings or site photos to keep the field evidence with this borewell. The date and GPS position are read from each photo when the camera saved them.</EmptyNote>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {r.photos.map((p) => (
            <figure key={p.id} className="group relative grid gap-1">
              <button type="button" title="Open this photo" className="cursor-pointer rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => files.open(p.filePath).catch((e) => toast.error(String(e)))}>
                <img src={files.src(p.filePath)} alt={p.caption || "Field photo"} className="aspect-[4/3] w-full rounded-md border border-border bg-muted object-cover" loading="lazy" />
              </button>
              <figcaption className="text-xs text-muted-foreground">{p.caption || (p.captureDate ? formatDate(p.captureDate) : "Date not known")}</figcaption>
              <Button variant="secondary" size="icon-sm" className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Remove photo"
                onClick={async () => { if (await ask({ title: "Remove this photo?", body: "The copy stored in StrataField is deleted. Your original file is not touched.", confirmLabel: "Remove photo", danger: true })) await run(() => api.attachments.remove("photo", p.id), "Photo removed"); }}>
                <Trash2 />
              </Button>
            </figure>
          ))}
        </div>
      )}
    </Panel>
  );
}

function FilesTab({ record: r, run, ask }: { record: BorewellRecord; run: Run; ask: Ask }) {
  const add = async () => {
    try {
      const paths = await files.choose({ title: "Choose files", multiple: true, filters: files.documentFilters });
      for (const path of paths) await api.attachments.addFile(r.borewell.id, path);
      if (paths.length) await run(async () => {}, paths.length === 1 ? "File added" : `${paths.length} files added`);
    } catch (e) {
      toast.error(String(e));
    }
  };
  const icon = (kind: string) => (kind === "excel" ? <FileSpreadsheet className="size-4" /> : kind === "pdf" ? <FileText className="size-4" /> : <FileIcon className="size-4" />);
  return (
    <Panel title="Files" actions={<Button variant="outline" onClick={add}><Paperclip />Add file</Button>} framed>
      {r.files.length === 0 ? <EmptyNote>No files yet. Add the drilling log, reports or permits for this borewell.</EmptyNote> : (
        <ul className="divide-y divide-border">
          {r.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {icon(f.kind)}
              <span className="min-w-0 flex-1 truncate">{f.originalName || f.filePath}</span>
              <span className="text-xs text-muted-foreground">Added {formatDate(f.createdAt)}</span>
              <Button variant="ghost" onClick={() => files.open(f.filePath).catch((e) => toast.error(String(e)))}>Open</Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.originalName}`}
                onClick={async () => { if (await ask({ title: `Remove ${f.originalName}?`, body: "The copy stored in StrataField is deleted. Your original file is not touched.", confirmLabel: "Remove file", danger: true })) await run(() => api.attachments.remove("file", f.id), "File removed"); }}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Fact({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num text-[15px] font-medium">{value ?? "—"}{value != null && <small className="ml-1 text-xs font-normal text-muted-foreground">{unit}</small>}</dd>
    </div>
  );
}

function FactText({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[15px] font-medium">{children}</dd>
    </div>
  );
}

function Legend({ strata }: { strata: StrataLayer[] }) {
  const seen = [...new Map(strata.map((l) => [l.materialId ?? l.material, l])).values()];
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground">
      {seen.map((l) => <span key={l.id} className="inline-flex items-center gap-1.5"><MaterialSwatch color={l.color} pattern={l.pattern} />{l.material}</span>)}
      <span className="inline-flex items-center gap-1.5"><PipeSwatch kind="plain" />{text.geology.plainPipe}</span>
      <span className="inline-flex items-center gap-1.5"><PipeSwatch kind="slotted" />{text.geology.screenPipe}</span>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
