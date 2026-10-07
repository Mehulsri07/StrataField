import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BorewellRecord, LithologyFamily, Material, StrataLayer } from "@strata/core";
import { hasProblems } from "@strata/core";
import { toast } from "sonner";
import { Check, CircleAlert, LoaderCircle, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { LayersEditor, newKey, rowIssues, rowsFrom, toLayers, toPipes, type LayerRow, type PipeRow } from "@/components/geology/LayersEditor";
import { MaterialSwatch } from "@/components/geology/patterns";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api } from "@/lib/api";
import { useDataVersion } from "@/lib/data";
import { text } from "@/text";

interface Rows { layers: LayerRow[]; pipes: PipeRow[] }
type SaveState = "saved" | "unsaved" | "saving" | "blocked" | "failed";

/** How long to wait after the last change before saving automatically. */
const AUTOSAVE_MS = 1200;
const FAMILIES: LithologyFamily[] = ["CLAY", "SAND", "ROCK", "OTHER", "NONE"];

export function EditLayers() {
  const { id = "" } = useParams();
  const { bump } = useDataVersion();
  const [record, setRecord] = useState<BorewellRecord | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [past, setPast] = useState<Rows[]>([]);
  const [future, setFuture] = useState<Rows[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [savedJson, setSavedJson] = useState("");
  const { showSelection, popup } = useLayerPopup({ canEdit: false });

  useEffect(() => {
    Promise.all([api.borewells.get(id), api.materials.list()])
      .then(([r, m]) => {
        const initial = rowsFrom(r.strata, r.pipes, m);
        setRecord(r);
        setMaterials(m);
        setRows(initial);
        setSavedJson(JSON.stringify(initial));
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  const totalDepth = record?.borewell.totalDepth;
  const issues = useMemo(() => (rows ? rowIssues(rows.layers, rows.pipes, materials, totalDepth) : null), [rows, materials, totalDepth]);
  const blocked = !!issues && hasProblems([...issues.layerIssues, ...issues.pipeIssues]);

  // Save automatically a moment after the last change, as long as nothing is wrong.
  useEffect(() => {
    if (!rows || !record) return;
    const json = JSON.stringify(rows);
    if (json === savedJson) return;
    if (blocked) return;
    const timer = window.setTimeout(async () => {
      setState("saving");
      try {
        const layers = toLayers(rows.layers, materials).map(({ id: _i, borewellId: _b, ...l }) => l);
        const pipes = toPipes(rows.pipes).map(({ id: _i, borewellId: _b, ...p }) => p);
        await api.strata.save(record.borewell.id, layers);
        await api.pipes.save(record.borewell.id, pipes);
        setSavedJson(json);
        setState("saved");
        bump();
      } catch (e) {
        setState("failed");
        toast.error(String(e));
        bump(); // the layers may have been saved before the pipes failed
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [rows, record, materials, blocked, bump, savedJson]);

  if (error) return <Page><PageHeader title="Borewell not found" sub={error} actions={<Button variant="outline" render={<Link to="/borewells" />}>Back to Borewells</Button>} /></Page>;
  if (!record || !rows) return <Page><p className="text-muted-foreground">Loading…</p></Page>;
  const b = record.borewell;

  const change = (next: Rows) => {
    setPast((p) => [...p.slice(-49), rows]);
    setFuture([]);
    setRows(next);
    setState(JSON.stringify(next) === savedJson ? "saved" : "unsaved");
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([rows, ...future]);
    setRows(prev);
    setState("unsaved");
  };
  const redo = () => {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast([...past, rows]);
    setRows(next);
    setState("unsaved");
  };

  // Clicking a soil in the palette sets the selected layer's soil, or adds a new layer at the bottom.
  const applySoil = (m: Material) => {
    const target = rows.layers.find((l) => l.key === selected);
    if (target) {
      change({ ...rows, layers: rows.layers.map((l) => (l.key === target.key ? { ...l, materialId: m.id } : l)) });
    } else {
      const last = rows.layers[rows.layers.length - 1];
      const row = { key: newKey(), start: last ? last.end : "0", end: "", materialId: m.id, remarks: "", waterBearing: false };
      change({ ...rows, layers: [...rows.layers, row] });
      setSelected(row.key);
    }
  };

  const layers = toLayers(rows.layers, materials).filter((l) => Number.isFinite(l.startDepth) && Number.isFinite(l.endDepth) && l.endDepth > l.startDepth);
  const pipes = toPipes(rows.pipes).filter((p) => Number.isFinite(p.startDepth) && Number.isFinite(p.endDepth) && p.endDepth > p.startDepth);
  const openLayer = (l: StrataLayer) => {
    setSelected(l.id);
    showSelection({ kind: "measured", layer: l, borewell: b, strata: layers, pipes });
  };

  const status = {
    saved: <><Check className="size-4 text-ok" />All changes saved</>,
    unsaved: <><LoaderCircle className="size-4 animate-spin text-muted-foreground" />Saving shortly…</>,
    saving: <><LoaderCircle className="size-4 animate-spin text-muted-foreground" />Saving…</>,
    failed: <><CircleAlert className="size-4 text-destructive" />Not saved. Try again.</>,
    blocked: null,
  }[blocked && state !== "saved" ? "blocked" : state];

  return (
    <Page className="max-w-[1500px]">
      <PageHeader
        title={<>{text.pages.editLayers.title} · <span className="num">{b.borewellId}</span></>}
        sub={<>Type where each layer starts and ends, in feet. To change a soil type, click a row, then click a soil on the left.{b.totalDepth != null && <> Total depth {b.totalDepth} ft.</>}</>}
        actions={
          <>
            <span className="flex items-center gap-1.5 self-center text-sm text-muted-foreground" role="status">
              {blocked && JSON.stringify(rows) !== savedJson
                ? <><CircleAlert className="size-4 text-destructive" />Not saved: fix the problems below</>
                : status}
            </span>
            <Button variant="ghost" onClick={undo} disabled={!past.length}><Undo2 />Undo</Button>
            <Button variant="ghost" onClick={redo} disabled={!future.length}><Redo2 />Redo</Button>
            <Button render={<Link to={`/borewell/${b.id}`} />}>Done</Button>
          </>
        }
      />

      <div className="grid items-start gap-x-7 gap-y-7 xl:grid-cols-[180px_minmax(0,1fr)_320px] lg:grid-cols-[180px_minmax(0,1fr)]">
        <Panel title="Soil types" bodyClassName="grid gap-3">
          {FAMILIES.map((f) => {
            const list = materials.filter((m) => (m.lithologyFamily ?? "OTHER") === f);
            if (!list.length) return null;
            return (
              <div key={f} className="grid gap-0.5">
                <div className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">{text.geology.families[f]}</div>
                {list.map((m) => (
                  <button key={m.id} type="button" onClick={() => applySoil(m)}
                    className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left text-[13px] hover:border-border hover:bg-muted"
                    title={selected ? `Use ${m.name} for the selected layer` : `Add a ${m.name} layer at the bottom`}>
                    <MaterialSwatch color={m.color} pattern={m.pattern} size={18} />{m.name}
                  </button>
                ))}
              </div>
            );
          })}
        </Panel>

        <LayersEditor
          layers={rows.layers} pipes={rows.pipes} materials={materials} totalDepth={totalDepth}
          onChange={change} selectedKey={selected} onSelect={setSelected}
        />

        <Panel title="Preview" className="lg:col-span-2 xl:col-span-1" bodyClassName="grid gap-2">
          {layers.length || pipes.length ? (
            <>
              <BorewellProfile borewell={b} strata={layers} pipes={pipes} selectedId={selected} onLayerClick={openLayer} height={520} />
              <p className="text-xs text-muted-foreground">Click a layer to see its details.</p>
            </>
          ) : <p className="text-sm text-muted-foreground">The drawing appears as you add layers and pipes.</p>}
        </Panel>
      </div>
      {popup}
    </Page>
  );
}
