import { useMemo, useState } from "react";
import type { BorewellRecord } from "@strata/core";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { api, files, isPreview } from "@/lib/api";
import { useLoad } from "@/lib/data";
import { buildReport, fileName, saveFile } from "@/lib/exporting";
import { zoneName } from "@/lib/format";
import { text } from "@/text";
import { cn } from "@/lib/utils";

type Which = "all" | "zone" | "pick";
type Format = "pdf" | "excel";

export function ExportPage() {
  const items = useLoad("export-borewells", () => api.borewells.search({}));
  const [which, setWhich] = useState<Which>("all");
  const [zone, setZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<Format>("pdf");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const all = useMemo(() => (items.data ?? []).map((i) => i.borewell), [items.data]);
  const zones = [...new Set(all.map((b) => b.project))].sort();
  const chosen = which === "all" ? all : which === "zone" ? all.filter((b) => b.project === zone) : all.filter((b) => picked.has(b.id));
  const shown = all.filter((b) => !query.trim() || `${b.borewellId} ${b.ownerName} ${b.area}`.toLowerCase().includes(query.trim().toLowerCase()));

  const run = async () => {
    setBusy("Collecting the borewells…");
    setSaved(null);
    try {
      const records: BorewellRecord[] = [];
      for (const b of chosen) records.push(await api.borewells.get(b.id));
      const stamp = new Date().toISOString().slice(0, 10);
      const base = chosen.length === 1 ? fileName(chosen[0].borewellId) : which === "zone" && zone ? fileName(`${zone} borewells ${stamp}`) : `StrataField borewells ${stamp}`;
      let bytes: Uint8Array;
      if (format === "pdf") {
        setBusy(`Making the report (${records.length} page${records.length === 1 ? "" : "s"} or more)…`);
        bytes = await buildReport(records);
      } else {
        setBusy("Making the Excel workbook…");
        const { buildWorkbook } = await import("@strata/core/export");
        bytes = buildWorkbook(records);
      }
      const path = await saveFile(`${base}.${format === "pdf" ? "pdf" : "xlsx"}`, format, bytes);
      if (path) {
        setSaved(path);
        toast.success("Saved");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  const zoneItems = zones.map((z) => ({ value: z, label: zoneName(z) }));

  return (
    <Page className="max-w-[1000px]">
      <PageHeader title={text.pages.export.title} sub="Make a PDF report to print or share, or an Excel workbook with every detail." />

      <Panel title="1. Which borewells?">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Which borewells">
            <Choice selected={which === "all"} onClick={() => setWhich("all")} title="All borewells" body={`${all.length} borewells`} />
            <Choice selected={which === "zone"} onClick={() => setWhich("zone")} title="One zone" body="Everything in a zone" />
            <Choice selected={which === "pick"} onClick={() => setWhich("pick")} title="Choose borewells" body="Tick the ones you want" />
          </div>
          {which === "zone" && (
            <Select value={zone} onValueChange={setZone} items={zoneItems}>
              <SelectTrigger className="w-full sm:w-80" aria-label="Zone"><SelectValue placeholder="Choose a zone…" /></SelectTrigger>
              <SelectContent>{zoneItems.map((z) => <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {which === "pick" && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-72">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, owner or area" aria-label="Search borewells" />
                </div>
                <Button variant="ghost" onClick={() => setPicked(new Set([...picked, ...shown.map((b) => b.id)]))}>Tick all shown</Button>
                <Button variant="ghost" onClick={() => setPicked(new Set())}>Untick all</Button>
                <span className="ml-auto text-sm text-muted-foreground">{picked.size} chosen</span>
              </div>
              <ul className="max-h-72 overflow-auto rounded-md border border-border">
                {shown.map((b) => (
                  <li key={b.id}>
                    <label className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm hover:bg-muted">
                      <Checkbox checked={picked.has(b.id)} onCheckedChange={(v) => { const next = new Set(picked); if (v) next.add(b.id); else next.delete(b.id); setPicked(next); }} />
                      <span className="num w-32 font-medium">{b.borewellId}</span>
                      <span className="min-w-0 flex-1 truncate">{b.ownerName}</span>
                      <span className="truncate text-muted-foreground">{b.area}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="2. What kind of file?">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Kind of file">
          <Choice selected={format === "pdf"} onClick={() => setFormat("pdf")} icon={<FileText />} title="PDF report" body="One page per borewell with the drawing, layers, pipes and water readings. Good for printing and sharing." />
          <Choice selected={format === "excel"} onClick={() => setFormat("excel")} icon={<FileSpreadsheet />} title="Excel workbook" body="All details in sheets: borewells, soil layers, pipes and water readings." />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!!busy || chosen.length === 0 || isPreview} onClick={run}>
          <Download />{busy ? "Working…" : `Save ${format === "pdf" ? "PDF report" : "Excel workbook"} (${chosen.length} borewell${chosen.length === 1 ? "" : "s"})`}
        </Button>
        {busy && <span className="text-sm text-muted-foreground" role="status">{busy}</span>}
        {chosen.length === 0 && !busy && <span className="text-sm text-muted-foreground">Choose at least one borewell.</span>}
        {isPreview && <span className="text-sm text-muted-foreground">Saving files works in the StrataField app, not in the browser preview.</span>}
      </div>

      {saved && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-ok/30 bg-ok-soft px-4 py-3 text-sm">
          <span>Saved to <span className="num">{saved}</span></span>
          <Button variant="outline" className="ml-auto" onClick={() => files.open(saved).catch((e) => toast.error(String(e)))}><FolderOpen />Open it</Button>
        </div>
      )}
    </Page>
  );
}

function Choice({ selected, onClick, title, body, icon }: { selected: boolean; onClick: () => void; title: string; body: string; icon?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={cn("grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-md border px-3.5 py-3 text-left [&_svg]:size-5 [&_svg]:text-primary",
        selected ? "border-primary bg-accent" : "border-border bg-card hover:border-input")}>
      {icon ? <span className="row-span-2 pt-0.5">{icon}</span> : <span className={cn("row-span-2 mt-1 size-4 rounded-full border-2", selected ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--card)]" : "border-input")} />}
      <b className="text-sm">{title}</b>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  );
}
