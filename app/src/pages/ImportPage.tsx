import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Borewell, BorewellInput, ExcelParseResult, LocationSource, Material, ParseAnomaly, StrataLayer } from "@strata/core";
import { parseCoordinatePair, parseNumber, splitPump } from "@strata/core";
import type { ColumnMapping } from "@strata/core/parser";
import { toast } from "sonner";
import { CircleCheck, FileSpreadsheet, MapPin, TriangleAlert, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Field } from "@/components/app/Field";
import { Chip } from "@/components/app/Chip";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { MapPicker } from "@/components/map/MapPicker";
import { api, files, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { text } from "@/text";
import { cn } from "cn";

interface Details { borewellId: string; ownerName: string; zone: string; area: string; city: string; date: string; totalDepth: string; waterLevel: string; boreDia: string; pipeDia: string; pumpMake: string; pumpModel: string; pumpHp: string; pumpLowering: string;
  /** Coordinates as typed or picked, "26.8930, 80.9420"; empty when the location is added later. */
  location: string; locationSource: LocationSource }

/** The Excel reader, loaded when the first file is chosen (it is large, and only this screen uses it). */
let parser: typeof import("@strata/core/parser") | null = null;

interface ImportFile {
  path: string;
  /** Which log on the sheet this is: 0 for the first, 1 for one written below it, and so on. */
  log: number;
  name: string;
  /** The start of the sheet, shown when the user has to say where the layers are. */
  rows: unknown[][];
  /** Set when the sheet is not in the standard layout: the columns in use (a guess until the user changes it). */
  mapping: ColumnMapping | null;
  result: ExcelParseResult | null;
  readError: string | null;
  include: boolean;
  details: Details;
  /** For each soil name the parser did not recognise: the soil type chosen, or "" to keep it for later. */
  resolutions: Record<string, string>;
}

const KEEP = "__keep__";
const NONE = "none";
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const stem = (p: string) => baseName(p).replace(/\.[^.]+$/, "");
const n = (v: number | null | undefined) => (v == null ? "" : String(v));

/** The parser's notes, as plain sentences. */
function describe(a: ParseAnomaly): string {
  const row = a.row != null ? ` (row ${a.row})` : "";
  switch (a.code) {
    case "MULTI_BOREWELL_SHEET": return "This sheet holds more than one log. Each is listed as its own row.";
    case "SAME_AS_FIRST_LOG": return "This log has the same layers as the first one on the sheet, so it looks like the same borewell drawn again. Tick it only if it is a different borewell.";
    case "UNIT_AMBIGUOUS": return "The file does not say feet or metres, so StrataField worked it out from the depths. Check the depths look right.";
    case "UNIT_MIXED": return "The file mentions one unit, but the depths look like the other. Check the depths look right.";
    case "MATERIAL_UNKNOWN": return `A soil name was not recognised${row}. Choose what it means below.`;
    case "DEPTH_NON_MONOTONIC": return `A row went back up in depth and was skipped${row}.`;
    case "DEPTH_GAP": return `There is a gap between layers${row}. It stays empty unless you fill it in later.`;
    case "DEPTH_OVERLAP": return `Two layers overlap${row}. Check them after importing.`;
    case "WATER_LEVEL_MISSING": return "No water level was found. Enter it below if you know it.";
    case "DATE_MISSING": return "No tubewell lowering date was found. Enter it below if you know it.";
    case "SITE_NAME_MISSING": return "No site or owner name was found. Enter it below.";
    case "NO_STRATA_FOUND": return "No soil layers were found in this file.";
    case "NON_STANDARD_FORMAT": return "This file is not laid out like a drilling log StrataField knows. Choose where the depths and soil names are.";
    case "PIPE_TYPE_UNKNOWN": return `A pipe type was not recognised and was set to plain pipe${row}.`;
    default: return a.message;
  }
}

function initialDetails(path: string, r: ExcelParseResult | null): Details {
  const m = r?.metadata;
  const pump = splitPump(m?.pumpModel ?? "");
  return {
    // The file's name, not the site's: the site name becomes the owner, and one owner can have several borewells.
    borewellId: stem(path),
    ownerName: m?.ownerName ?? "",
    zone: "",
    area: m?.address ?? "",
    city: m?.city ?? text.app.city,
    date: m?.date ?? "",
    totalDepth: n(m?.totalDepth),
    waterLevel: n(m?.waterLevel),
    boreDia: n(m?.boreDia),
    pipeDia: n(m?.pipeDia),
    pumpMake: pump.make,
    pumpModel: pump.model,
    pumpHp: n(m?.pumpHp),
    pumpLowering: n(m?.pumpLowering),
    location: "", locationSource: "typed",
  };
}

/** What the screen says about a file, as sentences; saved with the borewell so it can be read later. */
function fileNotes(f: ImportFile): string[] {
  return [
    ...(f.mapping ? ["The file was not in the usual layout, so its columns were chosen on the Import screen."] : []),
    ...(f.result?.metadata.detectedUnit === "m" ? ["The depths were in metres and were converted to feet."] : []),
    // Without the "enter it below" endings, which only make sense on the Import screen.
    ...(f.result?.anomalies ?? []).filter((a) => a.code !== "MATERIAL_UNKNOWN").map((a) => describe(a).replace(/ (Enter it below|Check them after importing)[^.]*\.$/, "")),
  ];
}

const unknownNames = (r: ExcelParseResult | null) =>
  [...new Set((r?.strata ?? []).filter((l) => !l.materialId).map((l) => l.material.trim()).filter(Boolean))];

function readable(f: ImportFile) {
  return !!f.result?.success && f.result.strata.length > 0;
}

export function ImportPage() {
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const materials = useLoad("materials", () => api.materials.list());
  const existing = useLoad("all-borewells", () => api.borewells.search({}));
  const zones = useLoad("projects", () => api.projects.list());
  const [list, setList] = useState<ImportFile[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; id: string; code: string; located: boolean }[] | null>(null);
  const mats = useMemo(() => materials.data ?? [], [materials.data]);

  const choose = async () => {
    try {
      const paths = await files.choose({ title: "Choose Excel drilling logs", multiple: true, filters: files.excelFilters });
      if (!paths.length) return;
      setBusy(true);
      const { readSheetRows, parseStrataRows, parseStrataLogs, guessMapping } = (parser ??= await import("@strata/core/parser"));
      const read = (await Promise.all(paths.filter((p) => !list.some((f) => f.path === p)).map(async (path): Promise<ImportFile[]> => {
        const one = (patch: Partial<ImportFile>): ImportFile => ({ path, log: 0, name: baseName(path), rows: [], mapping: null, result: null, readError: null, include: false, details: initialDetails(path, null), resolutions: {}, ...patch });
        try {
          const rows = readSheetRows(new Uint8Array(await api.readSpreadsheet(path)));
          const logs = parseStrataLogs(rows);
          if (!logs[0].success) {
            // A sheet laid out differently: start from a guess at the columns, which the user then checks.
            const mapping = guessMapping(rows), result = mapping ? parseStrataRows(rows, mapping) : logs[0];
            return [one({ rows, mapping, result, details: initialDetails(path, result) })];
          }
          // A second log with the first one's layers is the same borewell drawn again: listed, not ticked.
          return logs.map((result, n) => one({
            log: n, name: n ? `${baseName(path)} (log ${n + 1})` : baseName(path), rows, result,
            include: result.strata.length > 0 && !result.anomalies.some((a) => a.code === "SAME_AS_FIRST_LOG"),
            details: { ...initialDetails(path, result), borewellId: n ? `${stem(path)} ${n + 1}` : stem(path) },
          }));
        } catch (e) {
          return [one({ readError: String(e) })];
        }
      }))).flat();
      setList([...list, ...read]);
      setDone(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<ImportFile>) => setList(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const detail = (i: number, patch: Partial<Details>) => update(i, { details: { ...list[i].details, ...patch } });
  const [zoneForAll, setZoneForAll] = useState("");
  /** The row whose location is being picked on the map. */
  const [picking, setPicking] = useState<number | null>(null);
  const zoneNames = (zones.data ?? []).map((z) => z.name);
  const others = (existing.data ?? []).map((i) => i.borewell);
  const included = list.filter((f) => f.include && readable(f));
  const takenIds = new Set((existing.data ?? []).map((i) => i.borewell.borewellId.toLowerCase()));

  const runImport = async () => {
    setBusy(true);
    const created: NonNullable<typeof done> = [];
    try {
      for (const f of included) {
        const d = f.details;
        const num = (s: string) => parseNumber(s) ?? null;
        const at = parseCoordinatePair(d.location);
        const borewell: BorewellInput = {
          borewellId: d.borewellId.trim(), ownerName: d.ownerName.trim(), project: d.zone.trim(), area: d.area, city: d.city, date: d.date,
          totalDepth: num(d.totalDepth), waterLevel: num(d.waterLevel), boreDia: num(d.boreDia), pipeDia: num(d.pipeDia),
          pumpMake: d.pumpMake.trim(), pumpModel: d.pumpModel.trim(), pumpHp: num(d.pumpHp), pumpLowering: num(d.pumpLowering),
          latitude: at?.latitude ?? null, longitude: at?.longitude ?? null, locationSource: at ? d.locationSource : "unknown", importSource: f.name,
        };
        const strata = (f.result?.strata ?? []).map((l) => resolveLayer(l, f.resolutions, mats));
        const pipes = (f.result?.pipes ?? []).map((p) => ({ startDepth: p.startDepth, endDepth: p.endDepth, pipeType: p.pipeType, pipeSubtype: p.pipeSubtype }));
        const names = unknownNames(f.result);
        const res = await api.importExcel({
          fileName: f.name, sourcePath: f.path, unrecognisedNames: names,
          resolutions: Object.fromEntries(names.map((nm) => [nm, f.resolutions[nm] && f.resolutions[nm] !== KEEP ? f.resolutions[nm] : ""])),
          borewells: [{ borewell, strata, pipes, notes: fileNotes(f) }],
        });
        created.push({ name: f.name, id: res.borewellIds[0], code: borewell.borewellId!, located: !!at });
      }
      bump();
      setDone(created);
      setList(list.filter((f) => !included.includes(f)));
      toast.success(created.length === 1 ? "1 borewell imported" : `${created.length} borewells imported`);
    } catch (e) {
      toast.error(`${String(e)}${created.length ? ` (${created.length} imported before this one)` : ""}`);
      if (created.length) bump();
    } finally {
      setBusy(false);
    }
  };

  const f = list[current];

  return (
    <Page className="max-w-[1400px]">
      <PageHeader
        title={text.pages.import.title}
        sub="Add borewells from Excel drilling logs. Check each one before importing. The original file is kept with the borewell."
        actions={<Button variant="outline" onClick={choose} disabled={busy || isPreview}><Upload />{list.length ? "Add more files" : "Choose Excel files"}</Button>}
      />

      {done && done.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-ok/30 bg-ok-soft px-4 py-3 text-sm">
          <CircleCheck className="size-4 text-ok" />
          <span>Imported:</span>
          {done.map((d) => <Button key={d.id} variant="outline" size="sm" onClick={() => navigate(`/borewell/${d.id}`)}>{d.code}</Button>)}
          <span className="ml-auto flex gap-1">
            {done.some((d) => !d.located) && <Button variant="ghost" size="sm" render={<Link to="/locate" />}>Add their locations</Button>}
            <Button variant="ghost" size="sm" render={<Link to="/borewells" />}>See all borewells</Button>
          </span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-md border border-dashed border-input px-6 py-16 text-center">
          <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Choose one or more Excel drilling logs</p>
          <p className="max-w-lg text-sm text-muted-foreground">StrataField reads the layers, pipes, depths and water level from each file. Nothing is saved until you press Import.</p>
          <Button onClick={choose} disabled={busy || isPreview}><Upload />{busy ? "Reading…" : "Choose Excel files"}</Button>
          {isPreview && <p className="text-xs text-muted-foreground">Choosing files works in the StrataField app, not in the browser preview.</p>}
        </div>
      ) : (
        <div className="grid gap-7">
          <Panel
            title={`Files (${list.length})`} framed
            actions={<>
              <Input className="h-8 w-52" list="i-zone-all-list" placeholder="A zone for every file" value={zoneForAll} onChange={(e) => setZoneForAll(e.target.value)} aria-label="A zone for every file" />
              <datalist id="i-zone-all-list">{zoneNames.map((z) => <option key={z} value={z} />)}</datalist>
              <Button variant="outline" size="sm" disabled={!zoneForAll.trim()} onClick={() => setList(list.map((file) => ({ ...file, details: { ...file.details, zone: zoneForAll.trim() } })))}>Use for all</Button>
            </>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-9" /><th className="py-2 pr-2 font-medium">File</th><th className="px-1 py-2 font-medium">Borewell ID</th><th className="px-1 py-2 font-medium">Owner</th>
                    <th className="px-1 py-2 font-medium">Zone</th><th className="px-1 py-2 font-medium">Location (coordinates)</th><th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((file, i) => {
                    const ok = readable(file), d = file.details;
                    const notes = file.result?.anomalies.length ?? 0;
                    const same = file.result?.anomalies.some((a) => a.code === "SAME_AS_FIRST_LOG");
                    const badPlace = d.location.trim() !== "" && !parseCoordinatePair(d.location);
                    return (
                      <tr key={`${file.path}#${file.log}`} className={cn("border-t border-border", i === current && "bg-accent")}>
                        <td className="pl-3"><Checkbox checked={file.include} disabled={!ok} onCheckedChange={(v) => update(i, { include: !!v })} aria-label={`Import ${file.name}`} /></td>
                        <td className="w-[24%] max-w-0 py-2 pr-2">
                          <button type="button" className="block w-full min-w-0 text-left" onClick={() => setCurrent(i)} title="Show this file's details and drawing below">
                            <span className="block truncate text-[13px] font-medium">{file.name}</span>
                            <span className="block text-xs">
                              {!ok ? <span className="text-destructive">{file.rows.length ? "Choose the columns" : "Cannot be read"}</span>
                                : same ? <span className="text-warn">Same as the first log</span>
                                : file.mapping ? (file.include ? <span className="text-ok">Columns checked</span> : <span className="text-warn">Check the columns</span>)
                                : notes > 0 || unknownNames(file.result).length ? <span className="text-warn">Needs a look</span>
                                : <span className="text-ok">Ready</span>}
                            </span>
                          </button>
                        </td>
                        {ok ? (<>
                          <td className="px-1"><Input className="num h-8" value={d.borewellId} onChange={(e) => detail(i, { borewellId: e.target.value })} onFocus={() => setCurrent(i)} aria-label={`Borewell ID for ${file.name}`} aria-invalid={takenIds.has(d.borewellId.trim().toLowerCase()) || undefined} /></td>
                          <td className="px-1"><Input className="h-8" value={d.ownerName} onChange={(e) => detail(i, { ownerName: e.target.value })} onFocus={() => setCurrent(i)} aria-label={`Owner for ${file.name}`} /></td>
                          <td className="px-1"><Input className="h-8" list="i-zone-all-list" value={d.zone} onChange={(e) => detail(i, { zone: e.target.value })} onFocus={() => setCurrent(i)} aria-label={`Zone for ${file.name}`} /></td>
                          <td className="px-1">
                            <div className="flex gap-1">
                              <Input className="num h-8" placeholder="Paste, or pick" value={d.location} onChange={(e) => detail(i, { location: e.target.value, locationSource: "typed" })} onFocus={() => setCurrent(i)} aria-label={`Location for ${file.name}`} aria-invalid={badPlace || undefined} />
                              <Button variant="outline" size="icon-sm" className="size-8 shrink-0" aria-label={`Pick the location of ${file.name} on the map`} onClick={() => { setCurrent(i); setPicking(i); }}><MapPin /></Button>
                            </div>
                          </td>
                        </>) : <td colSpan={4} className="px-1 text-xs text-muted-foreground">{file.rows.length ? "Choose its columns below to import it." : "Not an Excel drilling log StrataField can read."}</td>}
                        <td className="pr-2 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.name} from the list`} onClick={() => { setList(list.filter((_, j) => j !== i)); setCurrent(0); }}><X /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border p-3">
              {list.some(readable) ? (<>
                <Button disabled={busy || included.length === 0} onClick={runImport}>
                  {busy ? "Importing…" : included.length === 1 ? "Import 1 borewell" : `Import ${included.length} borewells`}
                </Button>
                <p className="text-xs text-muted-foreground">Each row is imported as one borewell; only ticked rows are imported. Click a file's name to check its depths, pump and drawing below.</p>
              </>) : <p className="text-xs text-muted-foreground">None of these files can be imported. Remove them with ✕, or add them by hand with New borewell.</p>}
            </div>
          </Panel>

          {f && <FileReview key={`${f.path}#${f.log}`} file={f} materials={mats} takenIds={takenIds} zones={zoneNames} others={others} onChange={(patch) => update(current, patch)} />}
          {picking != null && list[picking] && (
            <MapPicker
              open
              initial={parseCoordinatePair(list[picking].details.location)}
              search={parseCoordinatePair(list[picking].details.location) ? "" : [list[picking].details.area || list[picking].details.ownerName, list[picking].details.city].filter(Boolean).join(", ")}
              others={others}
              onClose={() => setPicking(null)}
              onPick={(at) => { detail(picking, { location: `${at.latitude.toFixed(6)}, ${at.longitude.toFixed(6)}`, locationSource: at.found ? "address" : "map" }); setPicking(null); }}
            />
          )}
        </div>
      )}
    </Page>
  );
}

function resolveLayer(l: ExcelParseResult["strata"][number], resolutions: Record<string, string>, mats: Material[]) {
  const chosen = !l.materialId ? mats.find((m) => m.id === resolutions[l.material.trim()]) : undefined;
  return chosen
    ? { startDepth: l.startDepth, endDepth: l.endDepth, material: chosen.name, materialId: chosen.id, color: chosen.color, pattern: chosen.pattern, remarks: l.remarks ?? "" }
    : { startDepth: l.startDepth, endDepth: l.endDepth, material: l.material, materialId: l.materialId, color: l.color, pattern: l.pattern, remarks: l.remarks ?? "" };
}

function FileReview({ file: f, materials, takenIds, zones, others, onChange }: {
  file: ImportFile; materials: Material[]; takenIds: Set<string>; zones: string[]; others: Borewell[]; onChange: (patch: Partial<ImportFile>) => void;
}) {
  const [picking, setPicking] = useState(false);
  // Shown whenever the sheet is not in the standard layout, so the columns can always be changed.
  const picker = (f.mapping || (!readable(f) && f.rows.length > 0)) && <ColumnPicker file={f} onChange={onChange} />;
  if (!readable(f) && picker) {
    return (
      <div className="grid gap-7">
        {picker}
        <Note strong>No soil layers were found with these choices. Change them above, or add this borewell by hand with New borewell and attach the file to it.</Note>
      </div>
    );
  }
  if (!readable(f)) {
    return (
      <Panel title={f.name}>
        <div className="flex items-start gap-3 text-sm">
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="grid gap-1">
            <b>This file cannot be imported automatically.</b>
            <p>{f.readError ?? (f.result?.anomalies.find((a) => a.severity === "critical") ? describe(f.result.anomalies.find((a) => a.severity === "critical")!) : f.result?.failureReason ?? "No soil layers were found.")}</p>
            <p className="text-muted-foreground">You can still add this borewell by hand with New borewell, and attach the file to it.</p>
          </div>
        </div>
      </Panel>
    );
  }
  const d = f.details;
  const set = (patch: Partial<Details>) => onChange({ details: { ...d, ...patch } });
  const names = unknownNames(f.result);
  const soilItems = [{ value: KEEP, label: "Keep the name, choose later" }, ...materials.filter((m) => m.lithologyFamily !== "NONE").map((m) => ({ value: m.id, label: m.name }))];
  const notes = (f.result?.anomalies ?? []).filter((a) => a.code !== "MATERIAL_UNKNOWN");
  const idTaken = takenIds.has(d.borewellId.trim().toLowerCase());
  const at = parseCoordinatePair(d.location);
  const strata: StrataLayer[] = (f.result?.strata ?? []).map((l, i) => ({ id: `${i}`, borewellId: "import", waterBearing: false, ...resolveLayer(l, f.resolutions, materials) }));
  const pipes = (f.result?.pipes ?? []).map((p, i) => ({ id: `p${i}`, borewellId: "import", startDepth: p.startDepth, endDepth: p.endDepth, pipeType: p.pipeType, pipeSubtype: p.pipeSubtype, diameter: null }));
  const preview = {
    id: "import", borewellId: d.borewellId, totalDepth: parseNumber(d.totalDepth) ?? null, waterLevel: parseNumber(d.waterLevel) ?? null,
    boreDia: parseNumber(d.boreDia) ?? null, pipeDia: parseNumber(d.pipeDia) ?? null,
  } as Borewell;

  return (
    <div className="grid items-start gap-x-8 gap-y-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-7">
        {picker}
        {(notes.length > 0 || f.result?.metadata.detectedUnit === "m") && (
          <Panel title="Notes from reading the file" bodyClassName="grid gap-1.5">
            {f.result?.metadata.detectedUnit === "m" && <Note>The depths in this file were in metres and have been converted to feet.</Note>}
            {notes.map((a, i) => <Note key={i} strong={a.severity === "critical"}>{describe(a)}</Note>)}
          </Panel>
        )}

        {names.length > 0 && (
          <Panel title="Soil names that were not recognised" bodyClassName="grid gap-3">
            <p className="text-sm text-muted-foreground">Choose which soil type each name means. The choice is remembered with this import.</p>
            {names.map((nm) => (
              <div key={nm} className="grid grid-cols-[minmax(0,1fr)_240px] items-center gap-3">
                <span className="text-sm">“{nm}”</span>
                <Select value={f.resolutions[nm] ?? KEEP} onValueChange={(v) => onChange({ resolutions: { ...f.resolutions, [nm]: v ?? KEEP } })} items={soilItems}>
                  <SelectTrigger className="w-full" aria-label={`Soil type for ${nm}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{soilItems.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </Panel>
        )}

        <Panel title="Borewell details" actions={idTaken ? <Chip tone="warn">ID already used</Chip> : <Chip tone="ok">From the file</Chip>}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="i-id" label="Borewell ID" warning={idTaken ? "Another borewell already uses this ID. You can change it here." : undefined}>
              <Input id="i-id" className="num" value={d.borewellId} onChange={(e) => set({ borewellId: e.target.value })} />
            </Field>
            <Field id="i-owner" label="Owner's name"><Input id="i-owner" value={d.ownerName} onChange={(e) => set({ ownerName: e.target.value })} /></Field>
            <Field id="i-date" label="Tubewell lowering date"><Input id="i-date" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
            <Field id="i-zone" label="Zone" hint="Pick one you used before, or type a new one.">
              <Input id="i-zone" list="i-zone-list" value={d.zone} onChange={(e) => set({ zone: e.target.value })} />
              <datalist id="i-zone-list">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            </Field>
            <Field id="i-area" label="Area or address"><Input id="i-area" value={d.area} onChange={(e) => set({ area: e.target.value })} /></Field>
            <Field id="i-city" label="City"><Input id="i-city" value={d.city} onChange={(e) => set({ city: e.target.value })} /></Field>
            <Field id="i-depth" label="Total depth (ft)"><Input id="i-depth" className="num" inputMode="decimal" value={d.totalDepth} onChange={(e) => set({ totalDepth: e.target.value })} /></Field>
            <Field id="i-water" label="Water level (ft)"><Input id="i-water" className="num" inputMode="decimal" value={d.waterLevel} onChange={(e) => set({ waterLevel: e.target.value })} /></Field>
            <Field id="i-sizes" label="Hole / pipe size (inch)">
              <div className="flex gap-2">
                <Input className="num" inputMode="decimal" value={d.boreDia} onChange={(e) => set({ boreDia: e.target.value })} aria-label="Hole size (inch)" />
                <Input className="num" inputMode="decimal" value={d.pipeDia} onChange={(e) => set({ pipeDia: e.target.value })} aria-label="Pipe size (inch)" />
              </div>
            </Field>
            <Field id="i-pump-make" label="Pump company"><Input id="i-pump-make" value={d.pumpMake} onChange={(e) => set({ pumpMake: e.target.value })} /></Field>
            <Field id="i-pump" label="Pump model"><Input id="i-pump" value={d.pumpModel} onChange={(e) => set({ pumpModel: e.target.value })} /></Field>
            <Field id="i-pump-hp" label="Pump power (HP)"><Input id="i-pump-hp" className="num" inputMode="decimal" value={d.pumpHp} onChange={(e) => set({ pumpHp: e.target.value })} /></Field>
            <Field id="i-pump-lowering" label="Pump lowered to (ft)"><Input id="i-pump-lowering" className="num" inputMode="decimal" value={d.pumpLowering} onChange={(e) => set({ pumpLowering: e.target.value })} /></Field>
            <Field id="i-location" label="Location" className="sm:col-span-2" hint='Optional. Paste coordinates, for example "26.8930, 80.9420", or pick the spot on the map.'
              warning={d.location.trim() && !at ? "These are not coordinates StrataField can read, so the borewell would be imported without a location." : undefined}>
              <div className="flex gap-2">
                <Input id="i-location" className="num" value={d.location} onChange={(e) => set({ location: e.target.value, locationSource: "typed" })} />
                <Button variant="outline" onClick={() => setPicking(true)}><MapPin />Pick on the map</Button>
              </div>
            </Field>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Found {strata.length} soil layer{strata.length === 1 ? "" : "s"} and {pipes.length} pipe piece{pipes.length === 1 ? "" : "s"}.{at ? "" : " You can also add the location after importing."}
          </p>
          <MapPicker
            key={picking ? "open" : "closed"}
            open={picking}
            initial={at}
            search={at ? "" : [d.area, d.city].filter(Boolean).join(", ")}
            others={others}
            onClose={() => setPicking(false)}
            onPick={(p) => { set({ location: `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`, locationSource: p.found ? "address" : "map" }); setPicking(false); }}
          />
        </Panel>
      </div>

      <Panel title="What will be imported">
        <BorewellProfile borewell={preview} strata={strata} pipes={pipes} height={440} />
      </Panel>
    </div>
  );
}

/** For a sheet that is not in the standard layout: which columns hold the depths, soil names and pipes. */
function ColumnPicker({ file: f, onChange }: { file: ImportFile; onChange: (patch: Partial<ImportFile>) => void }) {
  const m: ColumnMapping = f.mapping ?? { depthCol: 0, materialCol: 1, firstRow: 0, fromCol: null, pipeCol: null, unit: "ft" };
  const shown = f.rows.slice(0, 40);
  const width = Math.max(2, ...shown.map((r) => r?.length ?? 0));
  const letter = (c: number) => (c < 26 ? String.fromCharCode(65 + c) : String(c + 1));
  // "Column B · To (ft)": the heading written above the first layer, when there is one.
  const heading = (c: number) => { const h = String(f.rows[m.firstRow - 1]?.[c] ?? "").trim(); return h && !Number.isFinite(Number(h)) ? ` · ${h.slice(0, 24)}` : ""; };
  const columns = Array.from({ length: width }, (_, c) => ({ value: String(c), label: `Column ${letter(c)}${heading(c)}` }));
  const optional = [{ value: NONE, label: "Not in this file" }, ...columns];
  const rowItems = shown.map((_, i) => ({ value: String(i), label: `Row ${i + 1}` }));
  const col = (v: string | null) => (v == null || v === NONE ? null : Number(v));
  const used = new Set([m.depthCol, m.materialCol, m.fromCol, m.pipeCol]);

  const set = (patch: Partial<ColumnMapping>) => {
    const mapping = { ...m, ...patch };
    const result = parser!.parseStrataRows(f.rows, mapping);
    // What was typed on this screen is kept; what was read from the file is read again.
    const { borewellId, zone, location, locationSource } = f.details;
    onChange({ mapping, result, include: false, details: { ...initialDetails(f.path, result), borewellId, zone, location, locationSource }, resolutions: {} });
  };

  return (
    <Panel title="Where the layers are in this file" bodyClassName="grid gap-4">
      <p className="text-sm text-muted-foreground">
        This file is not laid out like the drilling logs StrataField knows, so it made a guess. Check each choice against the start of the file, shown below.
        The columns in use are shaded.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Pick id="c-to" label="Depth where each layer ends" value={String(m.depthCol)} items={columns} onPick={(v) => set({ depthCol: Number(v) })} />
        <Pick id="c-soil" label="Soil name" value={String(m.materialCol)} items={columns} onPick={(v) => set({ materialCol: Number(v) })} />
        <Pick id="c-row" label="Row of the first layer" value={String(m.firstRow)} items={rowItems} onPick={(v) => set({ firstRow: Number(v) })} />
        <Pick id="c-from" label="Depth where each layer starts" value={m.fromCol == null ? NONE : String(m.fromCol)} items={optional} onPick={(v) => set({ fromCol: col(v) })} />
        <Pick id="c-pipe" label="Pipe type" value={m.pipeCol == null ? NONE : String(m.pipeCol)} items={optional} onPick={(v) => set({ pipeCol: col(v) })} />
        <Pick id="c-unit" label="Depths are in" value={m.unit} items={[{ value: "ft", label: "Feet" }, { value: "m", label: "Metres" }]} onPick={(v) => set({ unit: v === "m" ? "m" : "ft" })} />
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-right font-medium">Row</th>
              {columns.map((c, i) => <th key={c.value} className={cn("px-2 py-1.5 text-left font-medium", used.has(i) && "text-foreground")}>{letter(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={cn("border-t border-border", i < m.firstRow && "text-muted-foreground")}>
                <td className="px-2 py-1 text-right text-muted-foreground">{i + 1}</td>
                {columns.map((c, j) => <td key={c.value} className={cn("max-w-40 truncate px-2 py-1", used.has(j) && i >= m.firstRow && "bg-accent")}>{String(r?.[j] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    {readable(f) && (f.include
        ? <p className="text-sm text-ok">This file will be imported with these columns.</p>
        : <div><Button variant="outline" onClick={() => onChange({ include: true })}><CircleCheck />These columns are right, import this file</Button></div>)}
    </Panel>
  );
}

function Pick({ id, label, value, items, onPick }: { id: string; label: string; value: string; items: { value: string; label: string }[]; onPick: (v: string) => void }) {
  return (
    <Field id={id} label={label}>
      <Select value={value} onValueChange={(v) => v != null && onPick(v)} items={items}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
}

function Note({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", strong ? "bg-danger-soft text-destructive" : "bg-warn-soft text-warn")}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{children}
    </p>
  );
}
