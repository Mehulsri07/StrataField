import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Borewell, BorewellInput, ExcelParseResult, Material, ParseAnomaly, StrataLayer } from "@strata/core";
import { parseNumber } from "@strata/core";
import { toast } from "sonner";
import { CircleCheck, FileSpreadsheet, TriangleAlert, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Field } from "@/components/app/Field";
import { Chip } from "@/components/app/Chip";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { api, files, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { text } from "@/text";
import { cn } from "cn";

interface Details { borewellId: string; ownerName: string; area: string; city: string; date: string; totalDepth: string; waterLevel: string; boreDia: string; pipeDia: string }

interface ImportFile {
  path: string;
  name: string;
  result: ExcelParseResult | null;
  readError: string | null;
  include: boolean;
  details: Details;
  /** For each soil name the parser did not recognise: the soil type chosen, or "" to keep it for later. */
  resolutions: Record<string, string>;
}

const KEEP = "__keep__";
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const stem = (p: string) => baseName(p).replace(/\.[^.]+$/, "");
const n = (v: number | null | undefined) => (v == null ? "" : String(v));

/** The parser's notes, as plain sentences. */
function describe(a: ParseAnomaly): string {
  const row = a.row != null ? ` (row ${a.row})` : "";
  switch (a.code) {
    case "MULTI_BOREWELL_SHEET": return "This sheet seems to hold more than one borewell. Only the first one was read.";
    case "UNIT_AMBIGUOUS": return "The file does not say feet or metres, so StrataField worked it out from the depths. Check the depths look right.";
    case "UNIT_MIXED": return "The file mentions one unit, but the depths look like the other. Check the depths look right.";
    case "MATERIAL_UNKNOWN": return `A soil name was not recognised${row}. Choose what it means below.`;
    case "DEPTH_NON_MONOTONIC": return `A row went back up in depth and was skipped${row}.`;
    case "DEPTH_GAP": return `There is a gap between layers${row}. It stays empty unless you fill it in later.`;
    case "DEPTH_OVERLAP": return `Two layers overlap${row}. Check them after importing.`;
    case "WATER_LEVEL_MISSING": return "No water level was found. Enter it below if you know it.";
    case "DATE_MISSING": return "No drilling date was found. Enter it below if you know it.";
    case "SITE_NAME_MISSING": return "No site or owner name was found. Enter it below.";
    case "NO_STRATA_FOUND": return "No soil layers were found in this file.";
    case "NON_STANDARD_FORMAT": return "This file is not laid out like a drilling log StrataField knows, so it cannot be read automatically.";
    case "PIPE_TYPE_UNKNOWN": return `A pipe type was not recognised and was set to plain pipe${row}.`;
    default: return a.message;
  }
}

function initialDetails(path: string, r: ExcelParseResult | null): Details {
  const m = r?.metadata;
  return {
    borewellId: m?.siteName?.trim() || stem(path),
    ownerName: m?.ownerName ?? "",
    area: m?.address ?? "",
    city: m?.city ?? text.app.city,
    date: m?.date ?? "",
    totalDepth: n(m?.totalDepth),
    waterLevel: n(m?.waterLevel),
    boreDia: n(m?.boreDia),
    pipeDia: n(m?.pipeDia),
  };
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
  const [list, setList] = useState<ImportFile[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; id: string; code: string }[] | null>(null);
  const mats = useMemo(() => materials.data ?? [], [materials.data]);

  const choose = async () => {
    try {
      const paths = await files.choose({ title: "Choose Excel drilling logs", multiple: true, filters: files.excelFilters });
      if (!paths.length) return;
      setBusy(true);
      const { parseStrataWorkbook } = await import("@strata/core/parser");
      const read = await Promise.all(paths.filter((p) => !list.some((f) => f.path === p)).map(async (path): Promise<ImportFile> => {
        try {
          const bytes = await api.readSpreadsheet(path);
          const result = parseStrataWorkbook(new Uint8Array(bytes));
          return { path, name: baseName(path), result, readError: null, include: result.success && result.strata.length > 0, details: initialDetails(path, result), resolutions: {} };
        } catch (e) {
          return { path, name: baseName(path), result: null, readError: String(e), include: false, details: initialDetails(path, null), resolutions: {} };
        }
      }));
      setList([...list, ...read]);
      setDone(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<ImportFile>) => setList(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const included = list.filter((f) => f.include && readable(f));
  const takenIds = new Set((existing.data ?? []).map((i) => i.borewell.borewellId.toLowerCase()));

  const runImport = async () => {
    setBusy(true);
    const created: { name: string; id: string; code: string }[] = [];
    try {
      for (const f of included) {
        const d = f.details;
        const num = (s: string) => parseNumber(s) ?? null;
        const borewell: BorewellInput = {
          borewellId: d.borewellId.trim(), ownerName: d.ownerName.trim(), area: d.area, city: d.city, date: d.date,
          totalDepth: num(d.totalDepth), waterLevel: num(d.waterLevel), boreDia: num(d.boreDia), pipeDia: num(d.pipeDia),
          locationSource: "unknown", importSource: f.name,
        };
        const strata = (f.result?.strata ?? []).map((l) => resolveLayer(l, f.resolutions, mats));
        const pipes = (f.result?.pipes ?? []).map((p) => ({ startDepth: p.startDepth, endDepth: p.endDepth, pipeType: p.pipeType, pipeSubtype: p.pipeSubtype }));
        const names = unknownNames(f.result);
        const res = await api.importExcel({
          fileName: f.name, sourcePath: f.path, unrecognisedNames: names,
          resolutions: Object.fromEntries(names.map((nm) => [nm, f.resolutions[nm] && f.resolutions[nm] !== KEEP ? f.resolutions[nm] : ""])),
          borewells: [{ borewell, strata, pipes }],
        });
        created.push({ name: f.name, id: res.borewellIds[0], code: borewell.borewellId! });
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
          <Button variant="ghost" size="sm" className="ml-auto" render={<Link to="/borewells" />}>See all borewells</Button>
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
        <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel title={`Files (${list.length})`} framed>
            <ul className="divide-y divide-border">
              {list.map((file, i) => {
                const ok = readable(file);
                const notes = file.result?.anomalies.length ?? 0;
                return (
                  <li key={file.path} className={cn("flex items-center gap-2 px-3 py-2.5", i === current && "bg-accent")}>
                    <Checkbox checked={file.include} disabled={!ok} onCheckedChange={(v) => update(i, { include: !!v })} aria-label={`Import ${file.name}`} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCurrent(i)}>
                      <span className="block truncate text-[13px] font-medium">{file.name}</span>
                      <span className="block text-xs">
                        {!ok ? <span className="text-destructive">Cannot be read</span>
                          : notes > 0 || unknownNames(file.result).length ? <span className="text-warn">Needs a look</span>
                          : <span className="text-ok">Ready</span>}
                      </span>
                    </button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.name} from the list`} onClick={() => { setList(list.filter((_, j) => j !== i)); setCurrent(0); }}><X /></Button>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2 border-t border-border p-3">
              <Button disabled={busy || included.length === 0} onClick={runImport}>
                {busy ? "Importing…" : included.length === 1 ? "Import 1 borewell" : `Import ${included.length} borewells`}
              </Button>
              <p className="text-xs text-muted-foreground">Each file is imported as one borewell. Untick a file to leave it out.</p>
            </div>
          </Panel>

          {f && <FileReview key={f.path} file={f} materials={mats} takenIds={takenIds} onChange={(patch) => update(current, patch)} />}
        </div>
      )}
    </Page>
  );
}

function resolveLayer(l: ExcelParseResult["strata"][number], resolutions: Record<string, string>, mats: Material[]) {
  const chosen = !l.materialId ? mats.find((m) => m.id === resolutions[l.material.trim()]) : undefined;
  return chosen
    ? { startDepth: l.startDepth, endDepth: l.endDepth, material: chosen.name, materialId: chosen.id, color: chosen.color, pattern: chosen.pattern }
    : { startDepth: l.startDepth, endDepth: l.endDepth, material: l.material, materialId: l.materialId, color: l.color, pattern: l.pattern };
}

function FileReview({ file: f, materials, takenIds, onChange }: {
  file: ImportFile; materials: Material[]; takenIds: Set<string>; onChange: (patch: Partial<ImportFile>) => void;
}) {
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
  const strata: StrataLayer[] = (f.result?.strata ?? []).map((l, i) => ({ id: `${i}`, borewellId: "import", remarks: "", waterBearing: false, ...resolveLayer(l, f.resolutions, materials) }));
  const pipes = (f.result?.pipes ?? []).map((p, i) => ({ id: `p${i}`, borewellId: "import", startDepth: p.startDepth, endDepth: p.endDepth, pipeType: p.pipeType, pipeSubtype: p.pipeSubtype, diameter: null }));
  const preview = {
    id: "import", borewellId: d.borewellId, totalDepth: parseNumber(d.totalDepth) ?? null, waterLevel: parseNumber(d.waterLevel) ?? null,
    boreDia: parseNumber(d.boreDia) ?? null, pipeDia: parseNumber(d.pipeDia) ?? null,
  } as Borewell;

  return (
    <div className="grid items-start gap-x-10 gap-y-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-x-10 gap-y-7">
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
            <Field id="i-date" label="Date drilled"><Input id="i-date" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
            <Field id="i-area" label="Area or address" className="sm:col-span-2"><Input id="i-area" value={d.area} onChange={(e) => set({ area: e.target.value })} /></Field>
            <Field id="i-city" label="City"><Input id="i-city" value={d.city} onChange={(e) => set({ city: e.target.value })} /></Field>
            <Field id="i-depth" label="Total depth (ft)"><Input id="i-depth" className="num" inputMode="decimal" value={d.totalDepth} onChange={(e) => set({ totalDepth: e.target.value })} /></Field>
            <Field id="i-water" label="Water level (ft)"><Input id="i-water" className="num" inputMode="decimal" value={d.waterLevel} onChange={(e) => set({ waterLevel: e.target.value })} /></Field>
            <Field id="i-sizes" label="Hole / pipe size (inch)">
              <div className="flex gap-2">
                <Input className="num" inputMode="decimal" value={d.boreDia} onChange={(e) => set({ boreDia: e.target.value })} aria-label="Hole size (inch)" />
                <Input className="num" inputMode="decimal" value={d.pipeDia} onChange={(e) => set({ pipeDia: e.target.value })} aria-label="Pipe size (inch)" />
              </div>
            </Field>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Found {strata.length} soil layer{strata.length === 1 ? "" : "s"} and {pipes.length} pipe piece{pipes.length === 1 ? "" : "s"}. You can add a location after importing.
          </p>
        </Panel>
      </div>

      <Panel title="What will be imported">
        <BorewellProfile borewell={preview} strata={strata} pipes={pipes} height={440} />
      </Panel>
    </div>
  );
}

function Note({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", strong ? "bg-danger-soft text-destructive" : "bg-warn-soft text-warn")}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{children}
    </p>
  );
}
