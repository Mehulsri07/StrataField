import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Borewell } from "@strata/core";
import { waterColour, waterPoints } from "@strata/core";
import { ChevronRight, FolderOpen, List, Map as MapIcon, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { BaseMap } from "@/components/map/BaseMap";
import { BorewellPins, FitBorewells } from "@/components/map/BorewellPins";
import { WaterLayer, WaterLegend } from "@/components/map/WaterLayer";
import { StrataStrip } from "@/components/geology/patterns";
import { useLayerPopup } from "@/components/geology/useLayerPopup";
import { api, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatDate, formatWhen } from "@/lib/format";
import { text } from "@/text";
import { cn } from "@/lib/utils";

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The locality part of an address like "Aliganj, Lucknow" → "Aliganj". */
const shortArea = (b: Borewell) => b.area.split(",")[0].trim() || b.borewellId;
const BACKUP_OLD_DAYS = 7;
const SECOND_COPY_OLD_DAYS = 14;

export function Home() {
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const { showLayer, popup } = useLayerPopup();
  const items = useLoad("home-borewells", () => api.borewells.search({}));
  const backups = useLoad("home-backups", () => api.backups.list());
  const unlinked = useLoad("home-unlinked", () => api.soilNames.unlinked());
  const secondCopy = useLoad("second-copy", () => api.backups.secondCopy.get());
  const [backingUp, setBackingUp] = useState(false);
  const [now] = useState(() => Date.now());

  const all = useMemo(() => items.data ?? [], [items.data]);
  const borewells = useMemo(() => all.map((i) => i.borewell), [all]);
  const located = borewells.filter((b) => b.latitude != null && b.longitude != null);
  const points = useMemo(() => waterPoints(borewells), [borewells]);
  const recent = useMemo(() => [...all].sort((a, b) => b.borewell.createdAt.localeCompare(a.borewell.createdAt)).slice(0, 5), [all]);
  const byWater = useMemo(() => located.filter((b) => b.waterLevel != null).sort((a, b) => b.waterLevel! - a.waterLevel!), [located]);
  const depths = borewells.map((b) => b.totalDepth).filter((v): v is number => v != null);
  const waters = borewells.map((b) => b.waterLevel).filter((v): v is number => v != null);
  const noLayers = all.filter((i) => i.strata.length === 0).length;
  const lastBackup = backups.data?.[0] ?? null;
  const backupAgeDays = lastBackup ? (now - new Date(lastBackup.createdAt.replace(" ", "T")).getTime()) / 86_400_000 : Infinity;
  const lastCopy = secondCopy.data?.lastCopiedAt;
  const copyAgeDays = lastCopy ? (now - new Date(lastCopy.replace(" ", "T")).getTime()) / 86_400_000 : Infinity;
  const loaded = !items.loading && items.data != null;

  const backUpNow = async () => {
    setBackingUp(true);
    try {
      const b = await api.backups.create();
      toast.success(`Backup made${b.borewellCount != null ? ` with ${plural(b.borewellCount, "borewell")}` : ""}.`);
      bump();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBackingUp(false);
    }
  };
  const openFolder = () => api.backups.openFolder("backups").catch((e) => toast.error(String(e)));

  const newest = recent[0]?.borewell;

  return (
    <Page>
      <PageHeader
        title={text.pages.home.title}
        sub={newest ? `${text.app.city} · last borewell added ${formatWhen(newest.createdAt)}` : text.pages.home.sub(text.app.city)}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        <QuickAction to="/new" icon={<Plus />} title={text.nav.newBorewell} desc="Enter a new borewell's details" primary />
        <QuickAction to="/import" icon={<Upload />} title={text.nav.import} desc="Add borewells from an Excel file" />
        <QuickAction to="/borewells?focus=search" icon={<List />} title="Find a borewell" desc="Search by ID, owner or area" />
        <QuickAction to="/map" icon={<MapIcon />} title="Open map" desc={`${plural(located.length, "borewell")} with a location`} />
      </div>

      {loaded && all.length === 0 ? (
        <Panel>
          <div className="grid justify-items-center gap-3 py-10 text-center">
            <p className="font-medium">No borewells yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Add your first borewell, or bring in existing drilling logs from an Excel file. The map and numbers here fill in as you add borewells.</p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
            <Stat label="Borewells" value={all.length} note={`${all.filter((i) => i.borewell.importMethod === "excel").length} from Excel · ${all.filter((i) => i.borewell.importMethod !== "excel").length} typed in or older app`} />
            <Stat label="With a location" value={located.length} of={all.length} note={all.length ? `${Math.round((located.length / all.length) * 100)}% show on the map` : ""} />
            <Stat label="Typical total depth" value={median(depths)} unit="ft" note={depths.length ? `from ${Math.min(...depths)} to ${Math.max(...depths)} ft` : "No depths entered yet"} />
            <Stat label="Typical water level" value={median(waters)} unit="ft" note={waters.length ? `${Math.min(...waters)} to ${Math.max(...waters)} ft below ground` : "No water levels entered yet"} />
          </div>

          <Panel
            title={`How deep is the water across ${text.app.city}?`}
            actions={<Button variant="ghost" size="sm" render={<Link to="/map" />}>Open full map<ChevronRight /></Button>}
            bodyClassName="grid gap-4 p-0 lg:grid-cols-[minmax(0,1fr)_300px]"
          >
            <div className="relative h-[380px] min-w-0 overflow-hidden">
              <BaseMap>
                <WaterLayer points={points} />
                <BorewellPins borewells={borewells} onSelect={(b) => navigate(`/borewell/${b.id}`)} />
                <FitBorewells borewells={borewells} trigger={0} />
              </BaseMap>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[230px]"><WaterLegend /></div>
            </div>
            <div className="grid content-start gap-4 p-4 lg:pl-0">
              {byWater.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add water levels to borewells that have a location to see where water is deep or shallow.</p>
              ) : (
                <>
                  <WaterBars title="Deepest water" list={byWater.slice(0, 5)} max={byWater[0].waterLevel!} />
                  <WaterBars title="Shallowest water" list={byWater.slice(-5).reverse()} max={byWater[0].waterLevel!} />
                  <p className="text-xs text-muted-foreground">Feet below ground. Colours between borewells are estimates, and they fade out far from any borewell.</p>
                </>
              )}
            </div>
          </Panel>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Panel
              title="Recently added"
              actions={<Button variant="ghost" size="sm" render={<Link to="/borewells" />}>View all {all.length}<ChevronRight /></Button>}
              bodyClassName="p-0 overflow-x-auto"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borewell ID</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Date drilled</TableHead>
                    <TableHead className="text-right">Water (ft)</TableHead>
                    <TableHead>Layers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map(({ borewell: b, strata }) => (
                    <TableRow key={b.id} tabIndex={0} className="cursor-pointer" onClick={() => navigate(`/borewell/${b.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) navigate(`/borewell/${b.id}`); }}>
                      <TableCell className="num font-medium text-primary">{b.borewellId}</TableCell>
                      <TableCell>{b.ownerName || <span className="text-muted-foreground">Not entered</span>}</TableCell>
                      <TableCell>{shortArea(b)}</TableCell>
                      <TableCell className="num whitespace-nowrap">{b.date ? formatDate(b.date) : "—"}</TableCell>
                      <TableCell className="num text-right">{b.waterLevel ?? "—"}</TableCell>
                      <TableCell>
                        {strata.length > 0
                          ? <StrataStrip strata={strata} totalDepth={b.totalDepth} waterLevel={b.waterLevel} width={110} onLayerClick={(l) => showLayer(l)} />
                          : <span className="text-xs text-muted-foreground">None yet</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <div className="grid gap-4">
              <Panel title="Needs attention" bodyClassName="grid gap-1 p-2">
                {located.length < all.length && (
                  <Attention tone="warn" to="/borewells?noLocation=1"
                    title={`${plural(all.length - located.length, "borewell")} without a location`}
                    sub="Add a location so it shows on the map" />
                )}
                {noLayers > 0 && (
                  <Attention tone="warn" to="/borewells"
                    title={`${plural(noLayers, "borewell")} without soil layers`}
                    sub="Open the borewell and choose Edit layers & pipes" />
                )}
                {(unlinked.data?.length ?? 0) > 0 && (
                  <Attention tone="warn" to="/settings#soil-names"
                    title={`${plural(unlinked.data!.length, "soil name")} not recognised`}
                    sub={`${unlinked.data!.slice(0, 2).map(([n]) => `“${n}”`).join(" and ")}${unlinked.data!.length > 2 ? " and more" : ""}: choose what ${unlinked.data!.length === 1 ? "it means" : "they mean"}`} />
                )}
                {secondCopy.data && all.length > 0 && (!secondCopy.data.folder || secondCopy.data.lastError || copyAgeDays > SECOND_COPY_OLD_DAYS) && (
                  <Attention tone="warn" to="/settings#second-copy"
                    title={!secondCopy.data.folder ? "Backups are only on this computer" : secondCopy.data.lastError ? "The last backup copy failed" : `No backup copy for ${Math.floor(copyAgeDays)} days`}
                    sub={!secondCopy.data.folder ? "Choose a USB drive or cloud folder for a second copy" : secondCopy.data.lastError ? "Is the USB drive plugged in? Try Copy now in Settings" : "Plug in the USB drive, or choose Copy now in Settings"} />
                )}
                {backupAgeDays > BACKUP_OLD_DAYS && (
                  <Attention tone="warn" to="/settings#backups"
                    title={lastBackup ? `No backup for ${Math.floor(backupAgeDays)} days` : "No backup yet"}
                    sub="Make a backup now, below" />
                )}
                {loaded && located.length === all.length && noLayers === 0 && !unlinked.data?.length && backupAgeDays <= BACKUP_OLD_DAYS && !!secondCopy.data?.folder && !secondCopy.data.lastError && copyAgeDays <= SECOND_COPY_OLD_DAYS && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Nothing needs attention. Every borewell has a location and layers.</p>
                )}
              </Panel>

              <Panel
                title="Backup"
                actions={lastBackup && (backupAgeDays <= BACKUP_OLD_DAYS ? <Chip tone="ok">Up to date</Chip> : <Chip tone="warn">Out of date</Chip>)}
                bodyClassName="grid gap-3"
              >
                <dl className="grid gap-1.5 text-[13px]">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last backup</dt><dd>{lastBackup ? formatWhen(lastBackup.createdAt) : "None yet"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Copies on this computer</dt><dd className="num">{backups.data?.length ?? "…"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Second copy</dt><dd className="text-right">{!secondCopy.data?.folder ? "Not set up" : secondCopy.data.lastError ? <span className="text-destructive">Last copy failed</span> : lastCopy ? formatWhen(lastCopy) : "Not yet"}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">StrataField makes a backup every day by itself{secondCopy.data?.folder ? " and copies it to your second folder." : ". Set up a second copy on a USB drive or cloud folder in Settings, in case this computer fails."}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={backUpNow} disabled={backingUp || isPreview}>{backingUp ? "Backing up…" : "Back up now"}</Button>
                  <Button variant="ghost" onClick={openFolder} disabled={isPreview}><FolderOpen />Open backup folder</Button>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
      {popup}
    </Page>
  );
}

function QuickAction({ to, icon, title, desc, primary }: { to: string; icon: ReactNode; title: string; desc: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "group grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 rounded-md border px-4 py-3 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className={cn("row-span-2 grid size-9 place-items-center rounded-md [&_svg]:size-[18px]", primary ? "bg-primary-foreground/15" : "bg-accent text-accent-foreground")} aria-hidden="true">{icon}</span>
      <b className="font-semibold">{title}</b>
      <span className={cn("text-xs", primary ? "text-primary-foreground/85" : "text-muted-foreground")}>{desc}</span>
    </Link>
  );
}

function Stat({ label, value, unit, of, note }: { label: string; value: number | null; unit?: string; of?: number; note: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-card px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="num text-[26px] leading-none font-semibold">
        {value ?? "—"}
        {value != null && unit && <small className="ml-1 text-sm font-normal text-muted-foreground">{unit}</small>}
        {of != null && <small className="ml-1.5 text-sm font-normal text-muted-foreground">of {of}</small>}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

function WaterBars({ title, list, max }: { title: string; list: Borewell[]; max: number }) {
  return (
    <div className="grid gap-1.5">
      <h4 className="text-[13px] font-semibold">{title}</h4>
      {list.map((b) => (
        <Link key={b.id} to={`/borewell/${b.id}`} className="grid grid-cols-[96px_1fr_36px] items-center gap-2 rounded-sm text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="truncate" title={b.area}>{shortArea(b)}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-muted">
            <span className="block h-full" style={{ width: `${(b.waterLevel! / max) * 100}%`, background: `rgb(${waterColour(b.waterLevel!).join(",")})` }} />
          </span>
          <span className="num text-right">{b.waterLevel}</span>
        </Link>
      ))}
    </div>
  );
}

function Attention({ tone, to, title, sub }: { tone: "warn" | "neutral"; to: string; title: string; sub: string }) {
  return (
    <Link to={to} className="grid grid-cols-[4px_1fr_auto] items-center gap-3 rounded-md px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className={cn("h-full min-h-8 rounded-full", tone === "warn" ? "bg-warn" : "bg-input")} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

