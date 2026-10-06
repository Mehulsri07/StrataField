import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Borewell, BorewellInput, DrillingMethod, LocationSource, Material, PipeSegment, StrataLayer } from "@strata/core";
import { checkBorewell, hasProblems, type Issue } from "@strata/core";
import { toast } from "sonner";
import { Check, ImagePlus, MapPin, Paperclip, Search, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Field } from "@/components/app/Field";
import { Chip } from "@/components/app/Chip";
import { locationSourceText } from "@/components/app/BorewellStatus";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { MapPicker } from "@/components/map/MapPicker";
import { LayersEditor, rowIssues, toLayers, toPipes, type LayerRow, type PipeRow } from "@/components/geology/LayersEditor";
import { api, files, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatDate, pumpText, zoneName } from "@/lib/format";
import { PickOrAdd } from "@/components/app/PickOrAdd";
import { numberText, parseCoordinatePair, parseNumber, PUMP_MAKES, splitPump } from "@strata/core";
import { text } from "@/text";
import { cn } from "cn";

// ── Form state ───────────────────────────────────────────────────────────
// Numbers are kept as the text the user typed, so half-typed values ("12.") are not lost.

interface FormState {
  borewellId: string;
  ownerName: string;
  project: string;
  date: string;
  houseNo: string;
  address: string;
  area: string;
  city: string;
  latitude: string;
  longitude: string;
  locationSource: LocationSource;
  totalDepth: string;
  waterLevel: string;
  dynamicWaterLevel: string;
  boreDia: string;
  pipeDia: string;
  drillingMethod: DrillingMethod | "";
  remarks: string;
  pumpType: string;
  pumpMake: string;
  pumpModel: string;
  pumpHp: string;
  pumpLowering: string;
}

// Kinds, makes and motor ratings as the makers' selection charts list them.
const PUMP_TYPES = [
  "Borewell submersible, 3 inch (80 mm)", "Borewell submersible, 4 inch (100 mm)", "Borewell submersible, 6 inch (150 mm)",
  "Openwell submersible", "Monobloc", "Self-priming monobloc", "Jet pump", "Hand pump",
];
const PUMP_HP = ["0.5", "0.75", "1", "1.5", "2", "3", "4", "5", "6", "7.5", "10", "12.5", "15", "17.5", "20", "25"];

interface StagedPhoto { path: string; captureDate: string | null; latitude: number | null; longitude: number | null }

interface Draft { form: FormState; layers: LayerRow[]; pipes: PipeRow[]; photos: StagedPhoto[]; files: string[] }

const DRAFT_KEY = "strata-new-borewell-draft";
const LAST_ZONE_KEY = "strata-last-zone";
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  borewellId: "", ownerName: "", project: safeGet(LAST_ZONE_KEY) ?? "", date: today(),
  houseNo: "", address: "", area: "", city: text.app.city,
  latitude: "", longitude: "", locationSource: "unknown",
  totalDepth: "", waterLevel: "", dynamicWaterLevel: "", boreDia: "", pipeDia: "", drillingMethod: "", remarks: "",
  pumpType: "", pumpMake: "", pumpModel: "", pumpHp: "", pumpLowering: "",
});

function readDraft(): { draft: Draft; restored: boolean } {
  const saved = safeGet(DRAFT_KEY);
  if (saved) {
    try {
      // A draft kept by an older version has none of the boxes added since: they start empty.
      const kept = JSON.parse(saved) as Partial<Draft>;
      return { draft: { form: { ...emptyForm(), ...kept.form }, layers: kept.layers ?? [], pipes: kept.pipes ?? [], photos: kept.photos ?? [], files: kept.files ?? [] }, restored: true };
    } catch { /* ignore a damaged draft */ }
  }
  return { draft: { form: emptyForm(), layers: [], pipes: [], photos: [], files: [] }, restored: false };
}

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not critical */ }
}

const METHODS = [
  { value: "ROTARY", label: "Rotary" },
  { value: "DTH", label: "DTH (down-the-hole)" },
  { value: "MANUAL", label: "Manual" },
  { value: "UNKNOWN", label: "Not known" },
];

type StepId = "basics" | "location" | "drilling" | "layers" | "photos" | "check";
const STEPS: { id: StepId; label: string; newOnly?: boolean }[] = [
  { id: "basics", label: "Basics" },
  { id: "location", label: "Location" },
  { id: "drilling", label: "Drilling & water" },
  { id: "layers", label: "Layers & pipes", newOnly: true },
  { id: "photos", label: "Photos & files", newOnly: true },
  { id: "check", label: "Check & save" },
];

function toInput(f: FormState): BorewellInput {
  const n = (s: string) => parseNumber(s) ?? null;
  const lat = n(f.latitude), lon = n(f.longitude);
  return {
    borewellId: f.borewellId.trim(), ownerName: f.ownerName.trim(), project: f.project.trim(), date: f.date,
    houseNo: f.houseNo, address: f.address, area: f.area, city: f.city,
    latitude: lat, longitude: lon,
    locationSource: lat != null && lon != null ? (f.locationSource === "unknown" ? "typed" : f.locationSource) : "unknown",
    totalDepth: n(f.totalDepth), waterLevel: n(f.waterLevel), dynamicWaterLevel: n(f.dynamicWaterLevel),
    boreDia: n(f.boreDia), pipeDia: n(f.pipeDia), drillingMethod: f.drillingMethod || null, remarks: f.remarks,
    pumpType: f.pumpType.trim(), pumpMake: f.pumpMake.trim(), pumpModel: f.pumpModel.trim(), pumpHp: n(f.pumpHp), pumpLowering: n(f.pumpLowering),
  };
}

function fromBorewell(b: Borewell): FormState {
  // A record from before the company had its own box has it written inside the model.
  const pump = b.pumpMake ? { make: b.pumpMake, model: b.pumpModel } : splitPump(b.pumpModel);
  return {
    borewellId: b.borewellId, ownerName: b.ownerName, project: b.project, date: b.date,
    houseNo: b.houseNo, address: b.address, area: b.area, city: b.city,
    latitude: numberText(b.latitude), longitude: numberText(b.longitude), locationSource: b.locationSource,
    totalDepth: numberText(b.totalDepth), waterLevel: numberText(b.waterLevel), dynamicWaterLevel: numberText(b.dynamicWaterLevel),
    boreDia: numberText(b.boreDia), pipeDia: numberText(b.pipeDia), drillingMethod: b.drillingMethod ?? "", remarks: b.remarks,
    pumpType: b.pumpType, pumpMake: pump.make, pumpModel: pump.model, pumpHp: numberText(b.pumpHp), pumpLowering: numberText(b.pumpLowering),
  };
}

const NUMBER_FIELDS = {
  totalDepth: "Total depth", waterLevel: "Water level", dynamicWaterLevel: "Water level while pumping", boreDia: "Hole size", pipeDia: "Pipe size",
  latitude: "Latitude", longitude: "Longitude", pumpHp: "Pump power", pumpLowering: "Pump lowering",
};

/** The step where an issue is put right: details by their field, layers and pipes otherwise. */
const stepOf = (i: Issue): StepId =>
  !i.field ? "layers" : ["borewellId", "ownerName"].includes(i.field) ? "basics" : ["latitude", "longitude"].includes(i.field) ? "location" : "drilling";

/** Next free ID in the BW-<year>-NNN pattern. */
function suggestId(existing: string[]): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`^BW-${year}-(\\d+)$`, "i");
  const max = existing.reduce((m, id) => Math.max(m, Number(re.exec(id)?.[1] ?? 0)), 0);
  return `BW-${year}-${String(max + 1).padStart(3, "0")}`;
}

// ── Screen ───────────────────────────────────────────────────────────────

export function BorewellForm({ mode }: { mode: "new" | "edit" }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const editing = mode === "edit";
  const steps = STEPS.filter((s) => !(editing && s.newOnly));

  const all = useLoad("all-borewells", () => api.borewells.search({ showDeleted: false }));
  const zones = useLoad("projects", () => api.projects.list());
  const materials = useLoad("materials", () => api.materials.list());

  // A new borewell starts from the saved draft (if the app was closed mid-way) or a blank form;
  // an edit starts empty and fills in once the record loads.
  const [initial] = useState(() => (editing ? null : readDraft()));
  const [draft, setDraft] = useState<Draft | null>(initial?.draft ?? null);
  const [restored, setRestored] = useState(initial?.restored ?? false);
  const [step, setStep] = useState<StepId>((params.get("step") as StepId) || "basics");
  const [visited, setVisited] = useState<Set<StepId>>(new Set(editing ? steps.map((s) => s.id) : []));
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Borewell | null>(null);

  useEffect(() => {
    if (!editing) return;
    api.borewells.get(id).then((r) => {
      setOriginal(r.borewell);
      setDraft({ form: fromBorewell(r.borewell), layers: [], pipes: [], photos: [], files: [] });
    }).catch((e) => toast.error(String(e)));
  }, [editing, id]);

  // Keep a new borewell's progress if the app is closed before saving.
  useEffect(() => {
    if (!editing && draft) safeSet(DRAFT_KEY, JSON.stringify(draft));
  }, [editing, draft]);

  const mats = useMemo(() => materials.data ?? [], [materials.data]);
  if (!draft) return <Page><p className="text-muted-foreground">Loading…</p></Page>;

  // Until the user types their own, the ID field shows the next free BW-<year>-NNN.
  const suggestedId = editing ? "" : suggestId((all.data ?? []).map((i) => i.borewell.borewellId));
  const f = { ...draft.form, borewellId: draft.form.borewellId || suggestedId };
  const set = (patch: Partial<FormState>) => setDraft({ ...draft, form: { ...draft.form, ...patch } });
  const input = toInput(f);
  const layers = toLayers(draft.layers, mats);
  const pipes = toPipes(draft.pipes);

  /** What other borewells have in a box, for the dropdowns: each value once, in A to Z order. */
  const used = (pick: (b: Borewell) => string) => [...new Set((all.data ?? []).map((i) => pick(i.borewell)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const duplicate = (all.data ?? []).some((i) => i.borewell.borewellId.toLowerCase() === f.borewellId.trim().toLowerCase() && i.borewell.id !== id);
  const numberIssues: Issue[] = (["totalDepth", "waterLevel", "dynamicWaterLevel", "boreDia", "pipeDia", "latitude", "longitude", "pumpHp", "pumpLowering"] as const)
    .filter((k) => parseNumber(f[k]) === undefined)
    .map((k) => ({ severity: "problem", field: k, message: `${NUMBER_FIELDS[k]}: type a number here.` }));
  const borewellIssues: Issue[] = [
    ...numberIssues,
    ...checkBorewell(input).filter((i) => !numberIssues.some((n) => n.field === i.field)),
    ...(duplicate ? [{ severity: "warning" as const, field: "borewellId", message: "Another borewell already uses this ID." }] : []),
  ];
  const { layerIssues, pipeIssues } = editing ? { layerIssues: [], pipeIssues: [] } : rowIssues(draft.layers, draft.pipes, mats, input.totalDepth);
  const allIssues = [...borewellIssues, ...layerIssues, ...pipeIssues];
  const fieldMsg = (field: string) => (visited.has(step) ? borewellIssues.find((i) => i.field === field) : undefined);
  const err = (field: string) => { const i = fieldMsg(field); return i?.severity === "problem" ? i.message : undefined; };
  const warn = (field: string) => { const i = fieldMsg(field); return i?.severity === "warning" ? i.message : undefined; };

  const go = (s: StepId) => {
    setVisited(new Set([...visited, step, s]));
    setStep(s);
    document.querySelector("main")?.scrollTo({ top: 0 });
  };
  const index = steps.findIndex((s) => s.id === step);

  const startOver = () => {
    safeSet(DRAFT_KEY, null);
    setDraft({ form: emptyForm(), layers: [], pipes: [], photos: [], files: [] });
    setRestored(false);
    setStep("basics");
    setVisited(new Set(["basics"]));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.borewells.update(id, input);
        bump();
        toast.success("Changes saved");
        navigate(`/borewell/${id}`);
        return;
      }
      const b = await api.borewells.create(input);
      if (layers.length) await api.strata.save(b.id, layers.map(({ id: _id, borewellId: _b, ...l }) => l));
      if (pipes.length) await api.pipes.save(b.id, pipes.map(({ id: _id, borewellId: _b, ...p }) => p));
      for (const p of draft.photos) {
        await api.attachments.addPhoto(b.id, p.path, { captureDate: p.captureDate ?? undefined, latitude: p.latitude ?? undefined, longitude: p.longitude ?? undefined });
      }
      for (const path of draft.files) await api.attachments.addFile(b.id, path);
      safeSet(DRAFT_KEY, null);
      if (input.project) safeSet(LAST_ZONE_KEY, input.project);
      bump();
      toast.success(`${b.borewellId} saved`);
      navigate(`/borewell/${b.id}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        title={editing ? <>Edit details · <span className="num">{original?.borewellId}</span></> : text.pages.newBorewell.title}
        sub={editing ? "Change the borewell's details. Layers and pipes have their own screen." : text.pages.newBorewell.sub}
        actions={editing
          ? <Button variant="outline" render={<Link to={`/borewell/${id}`} />}>{text.actions.cancel}</Button>
          : restored && <Button variant="ghost" onClick={startOver}><X />Start over</Button>}
      />
      {restored && !editing && (
        <p className="text-sm text-muted-foreground">Picking up where you left off. Nothing has been saved yet.</p>
      )}

      <ol className="flex flex-wrap gap-x-6 border-b border-border" aria-label="Steps">
        {steps.map((s, i) => {
          const current = s.id === step;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => go(s.id)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-[13px]",
                  current ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground",
                  !current && "hover:text-foreground",
                )}
              >
                <span className="num">{i + 1}.</span>{s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === "basics" && (
        <Panel title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="f-id" label="Borewell ID" hint="Suggested automatically. You can change it." error={err("borewellId")} warning={warn("borewellId")}>
              <Input id="f-id" className="num" value={f.borewellId} onChange={(e) => set({ borewellId: e.target.value })} aria-invalid={!!err("borewellId") || undefined} />
            </Field>
            <Field id="f-owner" label="Owner's name" warning={warn("ownerName")}>
              <Input id="f-owner" value={f.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </Field>
            <Field id="f-zone" label="Zone" hint={!editing && f.project && f.project === safeGet(LAST_ZONE_KEY) ? "Same as the last borewell you added. Change it if this one is elsewhere." : "A name for a group of borewells, such as a part of the city. Pick one you used before, or type a new one."}>
              <Input id="f-zone" list="f-zone-list" value={f.project} onChange={(e) => set({ project: e.target.value })} placeholder="e.g. Zone 3 · Trans-Gomti" />
              <datalist id="f-zone-list">{(zones.data ?? []).map((z) => <option key={z.id} value={z.name} />)}</datalist>
            </Field>
            <Field id="f-date" label="Tubewell lowering date">
              <Input id="f-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
          </div>
        </Panel>
      )}

      {step === "location" && (
        <LocationStep
          form={f} set={set} err={err} others={(all.data ?? []).map((i) => i.borewell).filter((b) => b.id !== id)}
          onPhotoUsed={(p) => setDraft({ ...draft, form: { ...draft.form, latitude: String(p.latitude), longitude: String(p.longitude), locationSource: "photo", date: f.date || p.captureDate || today() }, photos: editing || draft.photos.some((x) => x.path === p.path) ? draft.photos : [...draft.photos, p] })}
          addsPhoto={!editing}
        />
      )}

      {step === "drilling" && (<div className="grid gap-7">
        <Panel title="Drilling & water">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField id="f-depth" label="Total depth (ft)" value={f.totalDepth} onChange={(v) => set({ totalDepth: v })} error={err("totalDepth")} />
            <NumberField id="f-water" label="Water level (ft)" hint="Depth to water, measured from the ground." value={f.waterLevel} onChange={(v) => set({ waterLevel: v })} error={err("waterLevel")} />
            <NumberField id="f-pumping" label="Water level while pumping (ft)" hint="Optional" value={f.dynamicWaterLevel} onChange={(v) => set({ dynamicWaterLevel: v })} error={err("dynamicWaterLevel")} />
            <NumberField id="f-hole" label="Hole size (inch)" value={f.boreDia} onChange={(v) => set({ boreDia: v })} error={err("boreDia")} />
            <NumberField id="f-pipe" label="Pipe size (inch)" value={f.pipeDia} onChange={(v) => set({ pipeDia: v })} error={err("pipeDia")} warning={warn("pipeDia")} />
            <Field id="f-method" label="Drilling method">
              <Select value={f.drillingMethod || null} onValueChange={(v) => set({ drillingMethod: (v ?? "") as DrillingMethod | "" })} items={METHODS}>
                <SelectTrigger id="f-method" className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="f-notes" label="Notes" className="sm:col-span-3">
              <Textarea id="f-notes" value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Anything the driller noticed" />
            </Field>
          </div>
        </Panel>
        <Panel title="Pump">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="f-pump-type" label="Pump type">
              <PickOrAdd id="f-pump-type" value={f.pumpType} options={[...PUMP_TYPES, ...used((b) => b.pumpType)]} addLabel="Add a new type…" onChange={(v) => set({ pumpType: v })} />
            </Field>
            <Field id="f-pump-make" label="Pump company">
              <PickOrAdd id="f-pump-make" value={f.pumpMake} options={[...PUMP_MAKES, ...used((b) => b.pumpMake)]} addLabel="Add a new company…" onChange={(v) => set({ pumpMake: v, pumpModel: "" })} />
            </Field>
            <Field id="f-pump-model" label="Pump model" hint={f.pumpMake ? `Models you have used from ${f.pumpMake}, or add a new one.` : "Choose the company first to see its models."}>
              <PickOrAdd key={f.pumpMake} id="f-pump-model" value={f.pumpModel} options={used((b) => (b.pumpMake === f.pumpMake ? b.pumpModel : ""))} addLabel="Add a new model…" onChange={(v) => set({ pumpModel: v })} />
            </Field>
            <Field id="f-pump-hp" label="Power (HP)" error={err("pumpHp")}>
              <Input id="f-pump-hp" className="num" inputMode="decimal" list="f-pump-hps" value={f.pumpHp} onChange={(e) => set({ pumpHp: e.target.value })} aria-invalid={!!err("pumpHp") || undefined} />
              <datalist id="f-pump-hps">{PUMP_HP.map((h) => <option key={h} value={h} />)}</datalist>
            </Field>
            <NumberField id="f-pump-lowering" label="Pump lowered to (ft)" hint="How deep the pump hangs, from the ground." value={f.pumpLowering} onChange={(v) => set({ pumpLowering: v })} error={err("pumpLowering")} warning={warn("pumpLowering")} />
          </div>
        </Panel>
      </div>
      )}

      {step === "layers" && !editing && (
        <LayersStep
          draft={draft} setDraft={setDraft} materials={mats} totalDepth={input.totalDepth}
          preview={{ ...input, id: "draft", projectId: null, project: input.project ?? "", createdAt: "", updatedAt: "", deletedAt: null, importBatchId: null, importSource: null, importMethod: "manual", locationAccuracyM: null, groundElevationM: null, elevationSource: null, depthUnit: "ft", recordQuality: "unknown" } as Borewell}
          layers={layers} pipes={pipes}
        />
      )}

      {step === "photos" && !editing && <PhotosStep draft={draft} setDraft={setDraft} />}

      {step === "check" && (
        <CheckStep form={f} input={input} layers={layers} pipes={pipes} draft={draft} editing={editing} issues={allIssues} onEdit={go} />
      )}

      <div className="flex items-center gap-2">
        {index > 0 && <Button variant="outline" onClick={() => go(steps[index - 1].id)}>{text.actions.back}</Button>}
        <div className="ml-auto flex gap-2">
          {editing && step !== "check" && (
            <Button variant="outline" disabled={saving || hasProblems(borewellIssues)} onClick={save}>Save changes</Button>
          )}
          {step !== "check" ? (
            <Button onClick={() => go(steps[index + 1].id)}>Next: {steps[index + 1].label}</Button>
          ) : (
            <Button disabled={saving || hasProblems(allIssues)} onClick={save}>
              <Check />{saving ? "Saving…" : editing ? "Save changes" : "Save borewell"}
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}

function NumberField({ id, label, hint, value, onChange, error, warning }: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void; error?: string; warning?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error} warning={warning}>
      <Input id={id} className="num" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={error || warning ? `${id}-msg` : undefined} />
    </Field>
  );
}

// ── Location ─────────────────────────────────────────────────────────────

function LocationStep({ form: f, set, err, onPhotoUsed, addsPhoto, others }: {
  others: Borewell[];
  form: FormState;
  set: (p: Partial<FormState>) => void;
  err: (field: string) => string | undefined;
  onPhotoUsed: (p: StagedPhoto) => void;
  addsPhoto: boolean;
}) {
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<"photo" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The map picker is open when this is a string: what to search for straight away ("" for nothing). */
  const [picking, setPicking] = useState<string | null>(null);
  const hasLocation = parseNumber(f.latitude) != null && parseNumber(f.longitude) != null;

  const fromPhoto = async () => {
    setBusy("photo"); setNote(null);
    try {
      const [path] = await files.choose({ title: "Choose a photo taken at the borewell", filters: files.photoFilters });
      if (!path) return;
      const m = await api.photoMetadata(path);
      if (m.latitude == null || m.longitude == null) {
        setNote("That photo has no GPS position saved in it. Try another photo, or type the coordinates.");
        return;
      }
      onPhotoUsed({ path, captureDate: m.captureDate, latitude: m.latitude, longitude: m.longitude });
      setNote(addsPhoto ? "Location taken from the photo. The photo will also be saved with the borewell." : "Location taken from the photo.");
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(null);
    }
  };

  const applyPaste = (value: string) => {
    setPaste(value);
    const pair = parseCoordinatePair(value);
    if (pair) set({ latitude: String(pair.latitude), longitude: String(pair.longitude), locationSource: "typed" });
  };

  return (
    <div className="grid gap-7">
      <Panel title="Address">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="f-house" label="House or plot no."><Input id="f-house" value={f.houseNo} onChange={(e) => set({ houseNo: e.target.value })} /></Field>
          <Field id="f-address" label="Street or colony" className="sm:col-span-3"><Input id="f-address" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field id="f-area" label="Area" className="sm:col-span-2"><Input id="f-area" value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder="e.g. Sector H, Aliganj" /></Field>
          <Field id="f-city" label="City" className="sm:col-span-2"><Input id="f-city" value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        </div>
      </Panel>

      <Panel title="Where is the borewell?" actions={hasLocation && <Chip tone="ok"><MapPin className="size-3" />{locationSourceText(f.locationSource === "unknown" ? "typed" : f.locationSource)}</Chip>}>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Choose the most accurate way you have. A photo taken at the borewell with GPS on is best.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <WayButton icon={<ImagePlus />} title="Use a photo's GPS" body="Most accurate" onClick={fromPhoto} busy={busy === "photo"} disabled={isPreview} />
            <WayButton icon={<Search />} title="Search for the address" body="Approximate · needs internet" onClick={() => setPicking([f.address, f.area, f.city].filter(Boolean).join(", "))} disabled={!(f.area || f.address)} />
            <WayButton icon={<MapPin />} title="Pick on the map" body="Search for a place, then click the spot" onClick={() => setPicking("")} />
          </div>
          {note && <p className="rounded-md bg-muted px-3 py-2 text-sm">{note}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="f-paste" label="Or paste coordinates" hint='From a phone or GPS unit, for example "26.8930, 80.9420"'>
              <Input id="f-paste" className="num" value={paste} onChange={(e) => applyPaste(e.target.value)} />
            </Field>
            <Field id="f-lat" label="Latitude" error={err("latitude")}>
              <Input id="f-lat" className="num" inputMode="decimal" value={f.latitude} onChange={(e) => set({ latitude: e.target.value, locationSource: "typed" })} aria-invalid={!!err("latitude") || undefined} />
            </Field>
            <Field id="f-lon" label="Longitude" error={err("longitude")}>
              <Input id="f-lon" className="num" inputMode="decimal" value={f.longitude} onChange={(e) => set({ longitude: e.target.value, locationSource: "typed" })} aria-invalid={!!err("longitude") || undefined} />
            </Field>
          </div>
          {hasLocation && (
            <div><Button variant="ghost" onClick={() => { set({ latitude: "", longitude: "", locationSource: "unknown" }); setPaste(""); setNote(null); }}><X />Clear location</Button></div>
          )}
          {!hasLocation && <p className="text-sm text-muted-foreground">You can save without a location and add it later. The borewell will not appear on the map until it has one.</p>}
        </div>
      </Panel>
      <MapPicker
        key={picking ?? "closed"}
        open={picking != null}
        search={picking ?? ""}
        initial={hasLocation ? { latitude: parseNumber(f.latitude)!, longitude: parseNumber(f.longitude)! } : null}
        others={others}
        onClose={() => setPicking(null)}
        onPick={(p) => {
          set({ latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6), locationSource: p.found ? "address" : "map" });
          setNote(p.found ? `Found: ${p.found}. This is approximate, so a photo's GPS or typed coordinates are better when you have them.` : "Location picked on the map.");
          setPicking(null);
        }}
      />
    </div>
  );
}

function WayButton({ icon, title, body, onClick, busy, disabled }: { icon: React.ReactNode; title: string; body: string; onClick?: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-md border border-border px-3.5 py-3 text-left hover:border-primary disabled:opacity-50 disabled:hover:border-border [&_svg]:size-5 [&_svg]:text-primary">
      <span className="row-span-2">{icon}</span>
      <b className="text-sm">{busy ? "Working…" : title}</b>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  );
}

// ── Layers & pipes ───────────────────────────────────────────────────────

function LayersStep({ draft, setDraft, materials, totalDepth, preview, layers, pipes }: {
  draft: Draft; setDraft: (d: Draft) => void; materials: Material[]; totalDepth: number | null | undefined;
  preview: Borewell; layers: StrataLayer[]; pipes: PipeSegment[];
}) {
  return (
    <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <LayersEditor
        layers={draft.layers} pipes={draft.pipes} materials={materials} totalDepth={totalDepth}
        onChange={(next) => setDraft({ ...draft, ...next })}
      />
      <Panel title="Preview">
        {layers.some((l) => Number.isFinite(l.endDepth)) || pipes.length ? (
          <BorewellProfile borewell={preview} strata={layers.filter((l) => Number.isFinite(l.startDepth) && Number.isFinite(l.endDepth))} pipes={pipes.filter((p) => Number.isFinite(p.startDepth) && Number.isFinite(p.endDepth))} height={420} />
        ) : <p className="text-sm text-muted-foreground">The drawing appears as you add layers and pipes.</p>}
      </Panel>
    </div>
  );
}

// ── Photos & files ───────────────────────────────────────────────────────

function PhotosStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const addPhotos = async () => {
    try {
      const paths = await files.choose({ title: "Choose photos", multiple: true, filters: files.photoFilters });
      const fresh = paths.filter((p) => !draft.photos.some((x) => x.path === p));
      const withMeta = await Promise.all(fresh.map(async (path) => ({ path, ...(await api.photoMetadata(path).catch(() => ({ captureDate: null, latitude: null, longitude: null }))) })));
      setDraft({ ...draft, photos: [...draft.photos, ...withMeta] });
    } catch (e) { toast.error(String(e)); }
  };
  const addFiles = async () => {
    try {
      const paths = await files.choose({ title: "Choose files", multiple: true, filters: files.documentFilters });
      setDraft({ ...draft, files: [...draft.files, ...paths.filter((p) => !draft.files.includes(p))] });
    } catch (e) { toast.error(String(e)); }
  };
  const name = (p: string) => p.split(/[\\/]/).pop();
  return (
    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
      <Panel title="Photos" actions={<Button variant="outline" onClick={addPhotos} disabled={isPreview}><ImagePlus />Add photos</Button>} framed>
        {draft.photos.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Rig, cuttings or site photos. Optional.</p> : (
          <ul className="divide-y divide-border">
            {draft.photos.map((p) => (
              <li key={p.path} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{name(p.path)}</span>
                <span className="text-xs text-muted-foreground">{p.captureDate ? formatDate(p.captureDate) : "No date"}{p.latitude != null && " · has GPS"}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setDraft({ ...draft, photos: draft.photos.filter((x) => x.path !== p.path) })} aria-label={`Remove ${name(p.path)}`}><X /></Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Files" actions={<Button variant="outline" onClick={addFiles} disabled={isPreview}><Paperclip />Add files</Button>} framed>
        {draft.files.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Drilling log, reports or permits. Optional.</p> : (
          <ul className="divide-y divide-border">
            {draft.files.map((p) => (
              <li key={p} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{name(p)}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setDraft({ ...draft, files: draft.files.filter((x) => x !== p) })} aria-label={`Remove ${name(p)}`}><X /></Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-sm text-muted-foreground md:col-span-2">Copies are stored with the borewell when you save. Your original files are not moved or changed.</p>
    </div>
  );
}

// ── Check & save ─────────────────────────────────────────────────────────

const count = (n: number, noun: string, none: string) => (n === 0 ? none : `${n} ${noun}${n === 1 ? "" : "s"}`);

function CheckStep({ form: f, input, layers, pipes, draft, editing, issues, onEdit }: {
  form: FormState; input: BorewellInput; layers: StrataLayer[]; pipes: PipeSegment[]; draft: Draft; editing: boolean; issues: Issue[]; onEdit: (s: StepId) => void;
}) {
  const problems = issues.filter((i) => i.severity === "problem");
  const warnings = issues.filter((i) => i.severity === "warning");
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[170px_1fr] gap-3 py-1.5 text-sm"><dt className="text-muted-foreground">{label}</dt><dd>{value || <span className="text-muted-foreground">—</span>}</dd></div>
  );
  const section = (title: string, step: StepId, children: React.ReactNode) => (
    <Panel title={title} actions={<Button variant="ghost" onClick={() => onEdit(step)}>Change</Button>}><dl className="divide-y divide-border">{children}</dl></Panel>
  );
  const ft = (v: number | null | undefined) => (v == null ? null : <span className="num">{v} ft</span>);

  return (
    <div className="grid gap-7">
      {problems.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-danger-soft px-4 py-3 text-sm text-destructive">
          <b>Fix these before saving:</b>
          <ul className="mt-1 list-disc pl-5">{problems.map((i) => <li key={i.message}><button type="button" className="text-left underline underline-offset-2" onClick={() => onEdit(stepOf(i))}>{i.message}</button></li>)}</ul>
        </div>
      ) : (
        <div className="rounded-md border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok"><b>Ready to save.</b>{warnings.length > 0 && " Have a look at the notes below first."}</div>
      )}
      {warnings.length > 0 && (
        <ul className="grid gap-1.5">{warnings.map((i) => <li key={i.message} className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn"><TriangleAlert className="size-4" /><button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onEdit(stepOf(i))}>{i.message}</button></li>)}</ul>
      )}
      <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
        {section("Basics", "basics", <>
          {row("Borewell ID", <span className="num">{f.borewellId}</span>)}
          {row("Owner", f.ownerName)}
          {row("Zone", zoneName(f.project))}
          {row("Tubewell lowering date", f.date && formatDate(f.date))}
        </>)}
        {section("Location", "location", <>
          {row("Address", [f.houseNo, f.address, f.area, f.city].filter(Boolean).join(", "))}
          {row("GPS location", input.latitude != null && input.longitude != null
            ? <><span className="num">{input.latitude}, {input.longitude}</span><span className="block text-xs text-muted-foreground">{locationSourceText(input.locationSource ?? "typed")}</span></>
            : "Not added yet")}
        </>)}
        {section("Drilling & water", "drilling", <>
          {row("Total depth", ft(input.totalDepth))}
          {row("Water level", ft(input.waterLevel))}
          {row("Hole / pipe size", (input.boreDia != null || input.pipeDia != null) && <span className="num">{input.boreDia ?? "—"}" / {input.pipeDia ?? "—"}"</span>)}
          {row("Drilling method", METHODS.find((m) => m.value === f.drillingMethod)?.label)}
          {row("Pump", pumpText(input))}
          {row("Pump lowered to", ft(input.pumpLowering))}
          {row("Notes", f.remarks)}
        </>)}
        {!editing && section("Layers, pipes, photos & files", "layers", <>
          {row("Soil layers", count(layers.length, "layer", "None yet"))}
          {row("Pipes", count(pipes.length, "piece", "None yet"))}
          {row("Photos", count(draft.photos.length, "photo", "None"))}
          {row("Files", count(draft.files.length, "file", "None"))}
        </>)}
      </div>
    </div>
  );
}
