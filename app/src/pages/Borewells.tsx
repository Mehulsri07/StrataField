import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { BorewellListItem, SearchFilters } from "@strata/core";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader } from "@/components/app/Page";
import { BorewellStatus } from "@/components/app/BorewellStatus";
import { StrataStrip } from "@/components/geology/patterns";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/data";
import { formatDate, zoneName } from "@/lib/format";
import { parseNumber } from "@strata/core";
import { text } from "@/text";
import { cn } from "cn";

type SortKey = "borewellId" | "date" | "totalDepth" | "waterLevel";
const ALL = "all";
/** Rows shown at first, and added by "Show more": thousands of rows at once make the screen slow. */
const PAGE = 200;

export function Borewells() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const { showLayer, popup } = useLayerPopup();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [zone, setZone] = useState(ALL);
  const [soil, setSoil] = useState(ALL);
  const [noLocation, setNoLocation] = useState(() => params.get("noLocation") === "1");
  const [more, setMore] = useState(false);
  const [range, setRange] = useState({ minDepth: "", maxDepth: "", minWater: "", maxWater: "", from: "", to: "" });
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  // Ctrl+K and the top-bar search land here with ?focus=search.
  useEffect(() => {
    if (params.get("focus") === "search") searchRef.current?.focus();
  }, [params]);

  const filters: SearchFilters = {
    query: debounced,
    project: zone === ALL ? undefined : zone,
    materialId: soil === ALL ? undefined : soil,
    noLocation: noLocation || undefined,
    minDepth: parseNumber(range.minDepth) ?? undefined,
    maxDepth: parseNumber(range.maxDepth) ?? undefined,
    minWaterLevel: parseNumber(range.minWater) ?? undefined,
    maxWaterLevel: parseNumber(range.maxWater) ?? undefined,
    dateFrom: range.from || undefined,
    dateTo: range.to || undefined,
  };
  const filtered = Object.entries(filters).some(([k, v]) => v !== undefined && !(k === "query" && v === ""));

  const rows = useLoad(JSON.stringify(filters), () => api.borewells.search(filters));
  const total = useLoad("all", () => api.borewells.search({}));
  const zones = useLoad("projects", () => api.projects.list());
  const materials = useLoad("materials", () => api.materials.list());

  const sorted = useMemo(() => sortRows(rows.data ?? [], sort.key, sort.desc), [rows.data, sort]);
  // How many rows to show; starts again at one page whenever the filters or sorting change.
  const listKey = JSON.stringify([filters, sort]);
  const [page, setPage] = useState({ key: listKey, rows: PAGE });
  const shownCount = page.key === listKey ? page.rows : PAGE;
  const shown = sorted.length > shownCount ? sorted.slice(0, shownCount) : sorted;
  const clear = () => {
    setQuery(""); setZone(ALL); setSoil(ALL); setNoLocation(false);
    setRange({ minDepth: "", maxDepth: "", minWater: "", maxWater: "", from: "", to: "" });
  };
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "borewellId" }));

  const zoneItems = [{ value: ALL, label: "All zones" }, ...(zones.data ?? []).map((z) => ({ value: z.name, label: zoneName(z.name) }))];
  const soilItems = [{ value: ALL, label: "Any soil type" }, ...(materials.data ?? []).filter((m) => m.lithologyFamily !== "NONE").map((m) => ({ value: m.id, label: m.name }))];
  const nothingYet = total.data?.length === 0;

  return (
    <Page>
      <PageHeader
        title={text.pages.borewells.title}
        sub={text.pages.borewells.sub}
        actions={
          <>
            <Button variant="outline" render={<Link to="/import" />}><Upload />{text.nav.import}</Button>
            <Button render={<Link to="/new" />}><Plus />{text.nav.newBorewell}</Button>
          </>
        }
      />

      <section className="min-w-0 rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative min-w-[240px] flex-[1_1_260px] max-w-[380px]">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ID, owner, area or zone"
              aria-label="Search borewells"
              className="pl-8"
            />
          </div>
          <Select value={zone} onValueChange={(v) => setZone(v ?? ALL)} items={zoneItems}>
            <SelectTrigger aria-label="Zone" className="min-w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{zoneItems.map((z) => <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={soil} onValueChange={(v) => setSoil(v ?? ALL)} items={soilItems}>
            <SelectTrigger aria-label="Soil type" className="min-w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{soilItems.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant={noLocation ? "secondary" : "outline"} aria-pressed={noLocation} onClick={() => setNoLocation((v) => !v)}
            className={cn(noLocation && "border-primary bg-accent text-accent-foreground")}>
            No location
          </Button>
          <Button variant="ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            More filters <ChevronDown className={cn("transition-transform", more && "rotate-180")} />
          </Button>
          {filtered && <Button variant="ghost" onClick={clear}><X />Clear filters</Button>}
        </div>

        {more && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 border-b border-border bg-muted/50 px-4 py-3">
            <RangeInput id="f-min-depth" label="Deeper than (ft)" value={range.minDepth} onChange={(v) => setRange({ ...range, minDepth: v })} />
            <RangeInput id="f-max-depth" label="Shallower than (ft)" value={range.maxDepth} onChange={(v) => setRange({ ...range, maxDepth: v })} />
            <RangeInput id="f-min-water" label="Water deeper than (ft)" value={range.minWater} onChange={(v) => setRange({ ...range, minWater: v })} />
            <RangeInput id="f-max-water" label="Water shallower than (ft)" value={range.maxWater} onChange={(v) => setRange({ ...range, maxWater: v })} />
            <div className="grid gap-1.5"><Label htmlFor="f-from">Drilled from</Label><Input id="f-from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="f-to">Drilled until</Label><Input id="f-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
          </div>
        )}

        {rows.error && <p className="px-4 py-3 text-sm text-destructive">{rows.error}</p>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Borewell ID" k="borewellId" sort={sort} onSort={toggleSort} />
                <TableHead>Owner</TableHead>
                <TableHead>Area</TableHead>
                <SortHead label="Date drilled" k="date" sort={sort} onSort={toggleSort} />
                <SortHead label="Total depth (ft)" k="totalDepth" sort={sort} onSort={toggleSort} right />
                <SortHead label="Water level (ft)" k="waterLevel" sort={sort} onSort={toggleSort} right />
                <TableHead>Layers <span className="font-normal text-muted-foreground">(blue = water)</span></TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ borewell: b, strata }) => (
                <TableRow
                  key={b.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => navigate(`/borewell/${b.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) navigate(`/borewell/${b.id}`); }}
                >
                  <TableCell className="num font-medium text-primary">{b.borewellId}</TableCell>
                  <TableCell>{b.ownerName || <span className="text-muted-foreground">Not entered</span>}</TableCell>
                  <TableCell>{b.area}<div className="text-xs text-muted-foreground">{zoneName(b.project)}</div></TableCell>
                  <TableCell className="num whitespace-nowrap">{b.date ? formatDate(b.date) : "—"}</TableCell>
                  <TableCell className="num text-right">{b.totalDepth ?? "—"}</TableCell>
                  <TableCell className="num text-right">{b.waterLevel ?? "—"}</TableCell>
                  <TableCell>
                    {strata.length > 0 ? (
                      <StrataStrip strata={strata} totalDepth={b.totalDepth} waterLevel={b.waterLevel} onLayerClick={(l) => showLayer(l)} />
                    ) : <span className="text-xs text-muted-foreground">None yet</span>}
                  </TableCell>
                  <TableCell><BorewellStatus borewell={b} strata={strata} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.loading && sorted.length === 0 && (
            nothingYet ? (
              <div className="grid justify-items-center gap-3 px-4 py-14 text-center">
                <p className="font-medium">No borewells yet</p>
                <p className="max-w-md text-sm text-muted-foreground">Add your first borewell, or bring in existing drilling logs from an Excel file.</p>
                <div className="flex gap-2">
                  <Button render={<Link to="/new" />}><Plus />{text.nav.newBorewell}</Button>
                  <Button variant="outline" render={<Link to="/import" />}><Upload />{text.nav.import}</Button>
                </div>
              </div>
            ) : (
              <div className="grid justify-items-center gap-3 px-4 py-12 text-center text-muted-foreground">
                <p>No borewells match these filters.</p>
                <Button variant="outline" onClick={clear}>Clear filters</Button>
              </div>
            )
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-3">
            Showing {shown.length} of {sorted.length === total.data?.length ? sorted.length : `${sorted.length} found (${total.data?.length ?? "…"} in all)`}
            {shown.length < sorted.length && (
              <Button variant="outline" size="sm" onClick={() => setPage({ key: listKey, rows: shownCount + PAGE })}>
                Show {Math.min(PAGE, sorted.length - shown.length)} more
              </Button>
            )}
          </span>
          <span>All depths in feet</span>
        </div>
      </section>
      {popup}
    </Page>
  );
}

function RangeInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const invalid = parseNumber(value) === undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" className="num" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} />
      {invalid && <span className="text-xs text-destructive">Type a number</span>}
    </div>
  );
}

function SortHead({ label, k, sort, onSort, right }: {
  label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void; right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <TableHead className={right ? "text-right" : undefined} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse", active && "text-foreground")}>
        {label}
        {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </TableHead>
  );
}

function sortRows(items: BorewellListItem[], key: SortKey, desc: boolean) {
  const val = (i: BorewellListItem) => {
    const b = i.borewell;
    return key === "borewellId" ? b.borewellId : key === "date" ? b.date || b.createdAt : b[key];
  };
  return [...items].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // blanks always last
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return desc ? -c : c;
  });
}
