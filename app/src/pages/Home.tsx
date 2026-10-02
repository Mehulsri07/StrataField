import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Borewell, BorewellListItem } from "@strata/core";
import { isRecentWater, recentCutoff, waterColour, waterPoints } from "@strata/core";
import { ChevronRight, FolderOpen, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { BaseMap } from "@/components/map/BaseMap";
import { BorewellPins, FitBorewells } from "@/components/map/BorewellPins";
import { WaterLayer, WaterLegend } from "@/components/map/WaterLayer";
import { patternFill } from "@/components/geology/patterns";
import { api, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatDate, formatWhen } from "@/lib/format";
import { text } from "@/text";
import { cn } from "cn";

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
  // Newest by drilling date (then by when it was added), so importing old logs does not make them "new".
  const recent = useMemo(() => [...all].sort((a, b) => b.borewell.date.localeCompare(a.borewell.date) || b.borewell.createdAt.localeCompare(a.borewell.createdAt)).slice(0, 6), [all]);
  // Water levels measured years ago say little about the water now, so only recent ones are used.
  const cutoff = useMemo(() => recentCutoff(borewells), [borewells]);
  const current = borewells.filter((b) => isRecentWater(b, cutoff));
  const olderLeftOut = borewells.some((b) => b.waterLevel != null && !isRecentWater(b, cutoff));
  const byWater = useMemo(() => located.filter((b) => isRecentWater(b, cutoff)).sort((a, b) => b.waterLevel! - a.waterLevel!), [located, cutoff]);
  const depths = borewells.map((b) => b.totalDepth).filter((v): v is number => v != null);
  const waters = current.map((b) => b.waterLevel!);
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
  const actions = <>
    <Button variant="outline" render={<Link to="/import" />}><Upload />{text.nav.import}</Button>
    <Button render={<Link to="/new" />}><Plus />{text.nav.newBorewell}</Button>
  </>;

  return (
    <Page>
      {all.length === 0 ? (
        <PageHeader title={text.pages.home.title} sub={text.pages.home.sub(text.app.city)} actions={actions} />
      ) : (
        <header className="flex flex-wrap items-start gap-x-8 gap-y-4 pt-2">
          <div className="min-w-0 flex-1 basis-[420px]">
            <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.02em]">{plural(all.length, "borewell")} across {text.app.city}</h1>
            <p className="mt-2.5 max-w-[62ch] text-base text-muted-foreground">
              {waters.length > 0 && <>Water is typically <Num>{median(waters)} ft</Num> below ground{waters.length > 1 && ` (${Math.min(...waters)} to ${Math.max(...waters)} ft)`}{olderLeftOut && `, going by readings since ${cutoff.slice(0, 4)}`}. </>}
              {depths.length > 0 && <>Borewells go about <Num>{median(depths)} ft</Num> deep. </>}
              {located.length === all.length ? "All of them are on the map." : <><Num>{located.length}</Num> of {all.length} are on the map.</>}
              {newest && (newest.date ? ` Last drilled ${formatDate(newest.date)}.` : ` Last added ${formatWhen(newest.createdAt)}.`)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </header>
      )}

      {loaded && all.length === 0 ? (
        <Panel>
          <div className="grid justify-items-center gap-3 py-16 text-center">
            <p className="font-medium">No borewells yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Add your first borewell, or bring in existing drilling logs from an Excel file. The map and numbers here fill in as you add borewells.</p>
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            title={`How deep is the water across ${text.app.city}?`}
            actions={<Button variant="ghost" size="sm" render={<Link to="/map" />}>Open full map<ChevronRight /></Button>}
            bodyClassName="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
          >
            <div className="relative h-[460px] min-w-0 overflow-hidden rounded-md border border-border">
              <BaseMap>
                <WaterLayer points={points} />
                <BorewellPins borewells={borewells} onSelect={(b) => navigate(`/borewell/${b.id}`)} />
                <FitBorewells borewells={borewells} trigger={0} />
              </BaseMap>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[230px]"><WaterLegend /></div>
            </div>
            <div className="grid content-start gap-5">
              {byWater.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add water levels to borewells that have a location to see where water is deep or shallow.</p>
              ) : (
                <>
                  {byWater.length === 1 ? (
                    <WaterBars title="Water level" list={byWater} max={byWater[0].waterLevel!} />
                  ) : (
                    <>
                      {/* Split so a place never appears in both lists when there are only a few. */}
                      <WaterBars title="Deepest water" list={byWater.slice(0, Math.min(5, Math.ceil(byWater.length / 2)))} max={byWater[0].waterLevel!} />
                      <WaterBars title="Shallowest water" list={byWater.slice(Math.max(Math.ceil(byWater.length / 2), byWater.length - 5)).reverse()} max={byWater[0].waterLevel!} />
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">Feet below ground{olderLeftOut && `, from readings since ${cutoff.slice(0, 4)}`}. Colours between borewells are estimates, and they fade out far from any borewell.</p>
                </>
              )}
            </div>
          </Panel>

          <div className="grid items-start gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Panel
              title="Newest borewells"
              actions={<Button variant="ghost" size="sm" render={<Link to="/borewells" />}>View all {all.length}<ChevronRight /></Button>}
            >
              <RecentColumns items={recent} />
            </Panel>

            <div className="grid gap-7">
              <Panel title="Needs attention" bodyClassName="grid pt-1">
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
                  <p className="py-3 text-sm text-muted-foreground">Nothing needs attention. Every borewell has a location and layers.</p>
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
    </Page>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => <span className="num font-semibold text-foreground">{children}</span>;

/**
 * The newest borewells drawn side by side from one ground line, all on the same depth scale, so a
 * deep one looks deep and the water levels can be compared at a glance. One row: as many as fit.
 */
function RecentColumns({ items }: { items: BorewellListItem[] }) {
  const depthOf = ({ borewell: b, strata }: BorewellListItem) => b.totalDepth ?? Math.max(0, ...strata.map((l) => l.endDepth));
  const max = Math.max(1, ...items.map(depthOf));
  const H = 200, W = 60, y = (ft: number) => (ft / max) * H;
  return (
    <ol className="-mx-1 grid auto-rows-[0px] grid-cols-[repeat(auto-fill,minmax(118px,1fr))] grid-rows-[auto] gap-x-4 overflow-hidden border-t-2 border-foreground/80 px-1">
      {items.map((item) => {
        const { borewell: b, strata } = item, depth = depthOf(item);
        return (
          <li key={b.id}>
            <Link to={`/borewell/${b.id}`} className="group grid gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <svg width={W + 46} height={H + 16} role="img" aria-label={`${strata.length} layers to ${depth} ft${b.waterLevel != null ? `, water at ${b.waterLevel} ft` : ""}`}>
                <rect width={W} height={Math.max(y(depth), 2)} fill="var(--muted)" />
                {strata.map((l) => (
                  <g key={l.id}>
                    <rect y={y(l.startDepth)} width={W} height={Math.max(0, y(l.endDepth) - y(l.startDepth))} fill={l.color} />
                    <rect y={y(l.startDepth)} width={W} height={Math.max(0, y(l.endDepth) - y(l.startDepth))} fill={patternFill(l.pattern)} />
                  </g>
                ))}
                {b.waterLevel != null && (
                  <>
                    <path d={`M0 ${y(b.waterLevel)}H${W + 6}`} stroke="var(--water)" strokeWidth="2" />
                    <text x={W + 10} y={y(b.waterLevel) + 3.5} fontSize="10.5" fill="var(--water)" className="num">{b.waterLevel}</text>
                  </>
                )}
                {depth > 0 && <text x="0" y={y(depth) + 13} fontSize="10.5" fill="var(--muted-foreground)" className="num">{depth} ft</text>}
              </svg>
              <span className="grid text-[13px] leading-snug">
                <span className="font-medium text-primary group-hover:underline">{b.borewellId}</span>
                <span className="truncate text-muted-foreground" title={b.area}>{shortArea(b)}</span>
                {strata.length === 0 && <span className="text-xs text-warn">No layers yet</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function WaterBars({ title, list, max }: { title: string; list: Borewell[]; max: number }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      {list.map((b) => (
        <Link key={b.id} to={`/borewell/${b.id}`} className="grid grid-cols-[96px_1fr_36px] items-center gap-2 rounded-sm text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="truncate" title={b.area}>{shortArea(b)}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
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
    <Link to={to} className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-2.5 border-b border-border py-2.5 outline-none last:border-0 focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className={cn("size-1.5 -translate-y-px rounded-full", tone === "warn" ? "bg-warn" : "bg-input")} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-medium group-hover:underline">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-4 self-center text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

