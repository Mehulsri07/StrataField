import type { Material, PipeSegment, StrataLayer } from "@strata/core";
import { checkLayers, checkPipes, parseNumber, type Issue } from "@strata/core";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/app/Page";
import { PipeSwatch } from "./patterns";
import { text } from "@/text";
import { cn } from "cn";

// Rows keep numbers as the text the user typed, so half-typed values ("12.") are not lost.
export interface LayerRow { key: string; start: string; end: string; materialId: string; remarks: string; waterBearing: boolean }
export interface PipeRow { key: string; start: string; end: string; kind: "plain" | "slotted" }

export const newKey = () => Math.random().toString(36).slice(2);

export function toLayers(rows: LayerRow[], materials: Material[]): StrataLayer[] {
  return rows.map((r) => {
    const m = materials.find((x) => x.id === r.materialId);
    return {
      id: r.key, borewellId: "draft", startDepth: parseNumber(r.start) ?? NaN, endDepth: parseNumber(r.end) ?? NaN,
      material: m?.name ?? "", materialId: m?.id ?? null, color: m?.color ?? "#9AA4AD", pattern: m?.pattern ?? "solid",
      remarks: r.remarks, waterBearing: r.waterBearing,
    };
  });
}

export function toPipes(rows: PipeRow[]): PipeSegment[] {
  return rows.map((r) => ({
    id: r.key, borewellId: "draft", startDepth: parseNumber(r.start) ?? NaN, endDepth: parseNumber(r.end) ?? NaN,
    pipeType: r.kind, pipeSubtype: r.kind === "plain" ? "PLAIN" : "RIBBED_SCREEN", diameter: null,
  }));
}

/** Rows for editing an existing borewell. Layers whose name matches no soil type keep an empty choice. */
export function rowsFrom(strata: StrataLayer[], pipes: PipeSegment[], materials: Material[]): { layers: LayerRow[]; pipes: PipeRow[] } {
  return {
    layers: strata.map((l) => ({
      key: l.id, start: String(l.startDepth), end: String(l.endDepth),
      materialId: l.materialId ?? materials.find((m) => m.name.toLowerCase() === l.material.toLowerCase())?.id ?? "",
      remarks: l.remarks, waterBearing: l.waterBearing,
    })),
    pipes: pipes.map((p) => ({ key: p.id, start: String(p.startDepth), end: String(p.endDepth), kind: p.pipeType })),
  };
}

/** Everything wrong with the rows, in plain language. Problems block saving; warnings do not. */
export function rowIssues(layers: LayerRow[], pipes: PipeRow[], materials: Material[], totalDepth: number | null | undefined) {
  const numberProblems = (rows: { start: string; end: string }[], what: string): Issue[] =>
    rows.flatMap((r, i) => (parseNumber(r.start) == null || parseNumber(r.end) == null
      ? [{ severity: "problem" as const, message: `${what} ${i + 1} needs both depths as numbers.` }] : []));
  const layerIssues: Issue[] = [
    ...numberProblems(layers, "Layer"),
    ...checkLayers(toLayers(layers, materials).filter((l) => Number.isFinite(l.startDepth) && Number.isFinite(l.endDepth)), totalDepth)
      .filter((i) => !i.message.startsWith("The layer from")),
    ...layers.flatMap((r, i) => (r.materialId ? [] : [{ severity: "problem" as const, message: `Choose a soil type for layer ${i + 1}.` }])),
  ];
  const pipeIssues: Issue[] = [
    ...numberProblems(pipes, "Pipe piece"),
    ...checkPipes(toPipes(pipes).filter((p) => Number.isFinite(p.startDepth) && Number.isFinite(p.endDepth)), totalDepth),
  ];
  return { layerIssues, pipeIssues };
}

/**
 * Editable soil layers and pipe pieces. Used by New borewell and by Edit layers & pipes.
 * With `onSelect`, clicking a row selects it (for the soil palette on the editor screen).
 */
export function LayersEditor({ layers, pipes, onChange, materials, totalDepth, selectedKey, onSelect }: {
  layers: LayerRow[];
  pipes: PipeRow[];
  onChange: (next: { layers: LayerRow[]; pipes: PipeRow[] }) => void;
  materials: Material[];
  totalDepth: number | null | undefined;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const soilItems = materials.map((m) => ({ value: m.id, label: m.name }));
  const { layerIssues, pipeIssues } = rowIssues(layers, pipes, materials, totalDepth);
  const setLayers = (next: LayerRow[]) => onChange({ layers: next, pipes });
  const setPipes = (next: PipeRow[]) => onChange({ layers, pipes: next });
  const setLayer = (i: number, patch: Partial<LayerRow>) => setLayers(layers.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setPipe = (i: number, patch: Partial<PipeRow>) => setPipes(pipes.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const lastEnd = (rows: { end: string }[]) => (rows.length ? rows[rows.length - 1].end : "0");
  const addLayer = () => {
    const row = { key: newKey(), start: lastEnd(layers), end: "", materialId: "", remarks: "", waterBearing: false };
    setLayers([...layers, row]);
    onSelect?.(row.key);
  };
  const addPipe = () => setPipes([...pipes, {
    key: newKey(), start: lastEnd(pipes), end: "",
    kind: pipes.length === 0 ? "plain" : pipes[pipes.length - 1].kind === "plain" ? "slotted" : "plain",
  }]);
  const fillGap = (gap: [number, number]) => setLayers(
    [...layers, { key: newKey(), start: String(gap[0]), end: String(gap[1]), materialId: "not_recorded", remarks: "", waterBearing: false }]
      .sort((a, b) => (parseNumber(a.start) ?? 0) - (parseNumber(b.start) ?? 0)),
  );
  // Missing soil types show in the row itself ("Choose…"), so they are not repeated in the list.
  const visibleLayerIssues = layerIssues.filter((i) => !i.message.startsWith("Choose a soil type"));
  // Fits the layer editor's middle column on a 1366-pixel-wide laptop screen.
  const cols = "grid-cols-[64px_64px_minmax(136px,1fr)_minmax(56px,1fr)_52px_auto]";

  return (
    <div className="grid min-w-0 gap-4">
      <Panel title="Soil layers" actions={<Button variant="outline" onClick={addLayer}><Plus />Add layer</Button>} bodyClassName="grid gap-1.5">
        {layers.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No layers yet. Add the first one, starting at 0 ft.</p>}
        {layers.length > 0 && (
          <div className={cn("grid items-center gap-2 px-1.5 text-xs font-medium text-muted-foreground", cols)}>
            <span>From (ft)</span><span>To (ft)</span><span>Soil type</span><span>Notes</span><span className="text-center leading-tight">Holds water</span><span />
          </div>
        )}
        {layers.map((r, i) => (
          <div
            key={r.key}
            onFocusCapture={() => onSelect?.(r.key)}
            onClick={() => onSelect?.(r.key)}
            className={cn("grid items-center gap-2 rounded-md p-1.5", cols, onSelect && r.key === selectedKey && "bg-accent")}
          >
            <Input className="num" inputMode="decimal" value={r.start} onChange={(e) => setLayer(i, { start: e.target.value })} aria-label={`Layer ${i + 1} from`} />
            <Input className="num" inputMode="decimal" value={r.end} onChange={(e) => setLayer(i, { end: e.target.value })} aria-label={`Layer ${i + 1} to`} autoFocus={i === layers.length - 1 && !r.end} />
            <Select value={r.materialId || null} onValueChange={(v) => setLayer(i, { materialId: v ?? "" })} items={soilItems}>
              <SelectTrigger className={cn("w-full bg-card", !r.materialId && "text-muted-foreground")} aria-label={`Layer ${i + 1} soil type`}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{soilItems.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={r.remarks} onChange={(e) => setLayer(i, { remarks: e.target.value })} placeholder="Optional" aria-label={`Layer ${i + 1} notes`} />
            <Checkbox checked={r.waterBearing} onCheckedChange={(v) => setLayer(i, { waterBearing: !!v })} aria-label={`Layer ${i + 1} holds water`} className="justify-self-center" />
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setLayers(layers.filter((_, j) => j !== i)); }} aria-label={`Remove layer ${i + 1}`}><Trash2 /></Button>
          </div>
        ))}
        <IssueList issues={visibleLayerIssues} onFillGap={fillGap} />
      </Panel>

      <Panel title="Pipes" actions={<Button variant="outline" onClick={addPipe}><Plus />Add pipe piece</Button>} bodyClassName="grid gap-2">
        {pipes.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No pipes yet.</p>}
        {pipes.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[64px_64px_minmax(180px,1fr)_auto] items-center gap-2 px-1.5">
            <Input className="num" inputMode="decimal" value={r.start} onChange={(e) => setPipe(i, { start: e.target.value })} aria-label={`Pipe ${i + 1} from (ft)`} placeholder="From" />
            <Input className="num" inputMode="decimal" value={r.end} onChange={(e) => setPipe(i, { end: e.target.value })} aria-label={`Pipe ${i + 1} to (ft)`} placeholder="To" />
            <div className="flex gap-1.5" role="radiogroup" aria-label={`Pipe ${i + 1} type`}>
              {(["plain", "slotted"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={r.kind === k} onClick={() => setPipe(i, { kind: k })}
                  className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px]", r.kind === k ? "border-primary bg-accent text-accent-foreground" : "border-border")}>
                  <PipeSwatch kind={k} />{k === "plain" ? text.geology.plainPipe : "Screen pipe"}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setPipes(pipes.filter((_, j) => j !== i))} aria-label={`Remove pipe ${i + 1}`}><Trash2 /></Button>
          </div>
        ))}
        <IssueList issues={pipeIssues} />
      </Panel>
    </div>
  );
}

export function IssueList({ issues, onFillGap }: { issues: Issue[]; onFillGap?: (gap: [number, number]) => void }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 grid gap-1.5">
      {issues.map((i) => (
        <li key={i.message} className={cn("flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm", i.severity === "problem" ? "bg-danger-soft text-destructive" : "bg-warn-soft text-warn")}>
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{i.message}</span>
          {i.gap && onFillGap && <Button variant="outline" size="sm" onClick={() => onFillGap(i.gap!)}>Mark {i.gap[0]}–{i.gap[1]} ft as not recorded</Button>}
        </li>
      ))}
    </ul>
  );
}
