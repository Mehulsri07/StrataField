import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { BackupInfo, LegacyImportReport, LithologyFamily, Material } from "@strata/core";
import { BookOpen, FolderOpen, Monitor, Moon, Pencil, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { Chip } from "@/components/app/Chip";
import { Field } from "@/components/app/Field";
import { useConfirm } from "@/components/app/Confirm";
import { MaterialSwatch, PATTERNS } from "@/components/geology/patterns";
import { api, files, isPreview, type SecondCopy } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { useStartup } from "@/lib/hooks";
import { formatWhen } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { checkForUpdate, type AvailableUpdate } from "@/lib/updates";
import { text } from "@/text";
import { cn } from "@/lib/utils";

const FAMILY_ITEMS: { value: LithologyFamily; label: string }[] = [
  { value: "CLAY", label: "Clay (holds water back)" },
  { value: "SAND", label: "Sand or gravel (water flows)" },
  { value: "ROCK", label: "Rock or boulder" },
  { value: "OTHER", label: "Something else" },
];
const FAMILY_NAME: Record<LithologyFamily, string> = { CLAY: "Clay", SAND: "Sand", ROCK: "Rock", OTHER: "Other", NONE: "Not recorded" };
const PATTERN_NAME: Record<(typeof PATTERNS)[number], string> = {
  lines: "Lines", dots: "Dots", diagonal: "Slanted lines", circles: "Circles", crosses: "Crosses", unrecorded: "Hatched", solid: "Plain",
};
const sizeText = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function Settings() {
  const { hash } = useLocation();
  // Links like /settings#soil-names (from Home) scroll to that section once it has drawn.
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => window.clearTimeout(id);
  }, [hash]);

  return (
    <Page className="max-w-[1100px]">
      <PageHeader title={text.pages.settings.title} sub={text.pages.settings.sub} />
      <Backups />
      <SecondCopyPanel />
      <OfflineMap />
      <OlderApp />
      <UnlinkedNames />
      <SoilTypes />
      <Appearance />
      <About />
    </Page>
  );
}

// ── Backups ─────────────────────────────────────────────────────────────

function Backups() {
  const { bump } = useDataVersion();
  const { ask, dialog } = useConfirm();
  const backups = useLoad("settings-backups", () => api.backups.list());
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try { await work(); } catch (e) { toast.error(String(e)); } finally { setBusy(null); }
  };
  const backUpNow = () => run("create", async () => {
    const b = await api.backups.create();
    toast.success(`Backup made${b.borewellCount != null ? ` with ${b.borewellCount} borewells` : ""}.`);
    bump();
  });
  const restore = (path: string, what: string) => run(path, async () => {
    const ok = await ask({
      title: "Restore this backup?",
      body: `Everything will go back to how it was ${what}. Changes made since then will be replaced. A copy of how things are now is saved first, so you can undo this by restoring that copy.`,
      confirmLabel: "Restore backup",
      danger: true,
    });
    if (!ok) return;
    const safety = await api.backups.restore(path);
    toast.success(`Backup restored. The data from before is kept as “${safety.label}”, ${formatWhen(safety.createdAt)}.`);
    bump();
  });
  const restoreFromFile = async () => {
    const [path] = await files.choose({ title: "Choose a StrataField backup", filters: [{ name: "StrataField backups", extensions: ["db"] }] }).catch((e) => { toast.error(String(e)); return []; });
    if (path) restore(path, "when that backup was made");
  };

  return (
    <Panel
      title={<span id="backups" className="scroll-mt-20">Backups</span>}
      actions={<Button onClick={backUpNow} disabled={busy != null || isPreview}>{busy === "create" ? "Backing up…" : "Back up now"}</Button>}
      bodyClassName="grid gap-3 p-0"
    >
      <p className="px-4 pt-3 text-[13px] text-muted-foreground">
        StrataField makes a backup every day by itself and keeps the last 10. Backups are on this computer only; copy one to a USB drive or cloud folder now and then.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Made</TableHead>
              <TableHead>Why</TableHead>
              <TableHead className="text-right">Borewells</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead><span className="sr-only">Restore</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(backups.data ?? []).map((b: BackupInfo) => (
              <TableRow key={b.path || b.fileName}>
                <TableCell className="pl-4 whitespace-nowrap">{formatWhen(b.createdAt)}</TableCell>
                <TableCell>{b.label}{!b.readable && <Chip tone="danger" className="ml-2">Damaged</Chip>}</TableCell>
                <TableCell className="num text-right">{b.borewellCount ?? "—"}</TableCell>
                <TableCell className="num text-right whitespace-nowrap">{sizeText(b.sizeBytes)}</TableCell>
                <TableCell className="pr-4 text-right">
                  <Button variant="outline" size="sm" disabled={!b.readable || busy != null || isPreview} onClick={() => restore(b.path, formatWhen(b.createdAt))}>
                    {busy === b.path ? "Restoring…" : "Restore"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {backups.data?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No backups yet. Choose Back up now to make the first one.</p>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" onClick={restoreFromFile} disabled={busy != null || isPreview}>Restore from a file…</Button>
        <Button variant="ghost" onClick={() => api.backups.openFolder("backups").catch((e) => toast.error(String(e)))} disabled={isPreview}><FolderOpen />Open backup folder</Button>
      </div>
      {dialog}
    </Panel>
  );
}

// ── A second copy of the backups ────────────────────────────────────────

function SecondCopyPanel() {
  const { bump } = useDataVersion();
  const status = useLoad("second-copy", () => api.backups.secondCopy.get());
  const [busy, setBusy] = useState(false);
  const s = status.data;

  const run = async (work: () => Promise<SecondCopy>, done: (s: SecondCopy) => string | null) => {
    setBusy(true);
    try {
      const result = await work();
      if (result.lastError) toast.error(result.lastError);
      else { const msg = done(result); if (msg) toast.success(msg); }
      bump();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const folder = await files.chooseFolder("Choose where to keep a second copy of your backups").catch((e) => { toast.error(String(e)); return null; });
    if (folder) run(() => api.backups.secondCopy.set(folder), (r) => `Backups will also be copied to ${r.folder}. The newest one is there now.`);
  };
  const stop = () => run(() => api.backups.secondCopy.set(null), () => "Backups are no longer copied to a second folder.");
  const copyNow = () => run(() => api.backups.secondCopy.now(), () => "The newest backup was copied.");

  return (
    <Panel title={<span id="second-copy" className="scroll-mt-20">A second copy of your backups</span>} bodyClassName="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        Backups on this computer are lost if the computer breaks or is stolen. Choose a folder on a USB drive, or a folder that OneDrive or Google Drive keeps in the cloud, and every backup is copied there as well. The newest 10 are kept.
      </p>
      {s?.folder ? (
        <div className="grid gap-1 text-sm">
          <span>Copies go to <b className="num break-all font-medium">{s.folder}</b></span>
          {s.lastError
            ? <span className="text-destructive" role="status">{s.lastError}</span>
            : <span className="text-muted-foreground">{s.lastCopiedAt ? `Last copied ${formatWhen(s.lastCopiedAt)}.` : "Nothing copied yet."}</span>}
        </div>
      ) : (
        <p className="text-sm"><Chip tone="warn" className="mr-2">Only on this computer</Chip>No second folder chosen yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={s?.folder ? "outline" : "default"} onClick={choose} disabled={busy || isPreview}>{s?.folder ? "Choose another folder…" : "Choose a folder…"}</Button>
        {s?.folder && <Button variant="outline" onClick={copyNow} disabled={busy}>{busy ? "Copying…" : "Copy now"}</Button>}
        {s?.folder && <Button variant="ghost" onClick={stop} disabled={busy}>Stop copying</Button>}
      </div>
    </Panel>
  );
}

// ── Map without internet ────────────────────────────────────────────────

function OfflineMap() {
  const { bump } = useDataVersion();
  const { ask, dialog } = useConfirm();
  const status = useLoad("offline-map-status", () => api.offlineMap.status());
  const [progress, setProgress] = useState<{ received: number; total: number | null } | null>(null);
  const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

  const download = async () => {
    setProgress({ received: 0, total: null });
    const { listen } = await import("@tauri-apps/api/event");
    const stop = await listen<{ received: number; total: number | null }>("offline-map-progress", (e) => setProgress(e.payload));
    try {
      const s = await api.offlineMap.download();
      toast.success(`The Lucknow map is ready to use without internet (${mb(s.sizeBytes)}).`);
      bump();
    } catch (e) {
      toast.error(String(e));
    } finally {
      stop();
      setProgress(null);
    }
  };
  const remove = async () => {
    if (!(await ask({ title: "Remove the downloaded map?", body: "The map will need internet again. You can download it again at any time.", confirmLabel: "Remove map" }))) return;
    try { await api.offlineMap.remove(); bump(); } catch (e) { toast.error(String(e)); }
  };

  const s = status.data;
  const pct = progress?.total ? Math.round((progress.received / progress.total) * 100) : null;
  return (
    <Panel title={<span id="offline-map" className="scroll-mt-20">Map without internet</span>} bodyClassName="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        Download the map of Lucknow once, and the Map, Home and Cross-section screens show streets and places even without internet, for example at a drilling site. The map comes from OpenStreetMap data and is shown in place of the online map.
      </p>
      {s?.installed && !progress && (
        <p className="text-sm">
          <Chip tone="ok" className="mr-2">Downloaded</Chip>
          {mb(s.sizeBytes)}{s.downloadedAt ? `, ${formatWhen(s.downloadedAt)}` : ""}
        </p>
      )}
      {progress && (
        <div className="grid gap-1.5" role="status">
          <div className="h-2 overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${pct ?? 5}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            Downloading… {mb(progress.received)}{progress.total ? ` of ${mb(progress.total)}` : ""}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={s?.installed ? "outline" : "default"} onClick={download} disabled={!!progress || isPreview}>
          {s?.installed ? "Download again (newer map)" : "Download the Lucknow map"}
        </Button>
        {s?.installed && <Button variant="ghost" onClick={remove} disabled={!!progress}>Remove</Button>}
      </div>
      {dialog}
    </Panel>
  );
}

// ── Older StrataField ───────────────────────────────────────────────────

function OlderApp() {
  const { bump } = useDataVersion();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LegacyImportReport | null>(null);

  const bringIn = async () => {
    try {
      const [path] = await files.choose({ title: "Choose the older StrataField's data file", filters: [{ name: "StrataField data", extensions: ["db"] }] });
      if (!path) return;
      setBusy(true);
      const r = await api.backups.importFromOlderVersion(path);
      setReport(r);
      bump();
      toast.success(`Brought in ${r.borewells} borewells.`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Data from the older StrataField" bodyClassName="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        The first time it opened, this StrataField brought in everything from the older version on this computer. To bring in data from another computer, copy its <span className="num">stratafield.db</span> file here and choose it below. Borewells already here are skipped, and a backup is made first.
      </p>
      <div><Button variant="outline" onClick={bringIn} disabled={busy || isPreview}>{busy ? "Bringing in…" : "Bring in an older data file…"}</Button></div>
      {report && (
        <div role="status" className="grid gap-1 rounded-md border border-ok/30 bg-ok-soft p-3 text-sm">
          <b>{text.startup.broughtOver(report.borewells, report.strataLayers, report.pipeSegments)}</b>
          {report.alreadyPresent > 0 && <span>{report.alreadyPresent} borewells were already here and were skipped.</span>}
          {(report.orphanedLayers > 0 || report.orphanedPipes > 0) && <span className="text-muted-foreground">{text.startup.leftBehind(report.orphanedLayers, report.orphanedPipes)}</span>}
          {report.unmatchedMaterialNames.length > 0 && <span className="text-muted-foreground">{text.startup.unmatched(report.unmatchedMaterialNames)}</span>}
        </div>
      )}
    </Panel>
  );
}

// ── Soil names not recognised ───────────────────────────────────────────

function UnlinkedNames() {
  const { bump } = useDataVersion();
  const names = useLoad("settings-unlinked", () => api.soilNames.unlinked());
  const materials = useLoad("materials", () => api.materials.list());
  const [choice, setChoice] = useState<Record<string, string>>({});

  if (!names.data?.length) return null;
  const items = (materials.data ?? []).map((m) => ({ value: m.id, label: m.name }));
  const link = async (name: string) => {
    try {
      const n = await api.soilNames.link(name, choice[name]);
      toast.success(`${n} layer${n === 1 ? "" : "s"} called “${name}” now use ${items.find((i) => i.value === choice[name])?.label}.`);
      bump();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Panel title={<span id="soil-names" className="scroll-mt-20">Soil names not recognised</span>} bodyClassName="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        These names came from Excel files or the older app and do not match a soil type, so they have no colour or pattern and are left out of cross-sections. Choose what each one means. If it is a new soil type, add it under Soil types first.
      </p>
      <div className="grid gap-2">
        {names.data.map(([name, count]) => (
          <div key={name} className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,240px)_auto] items-center gap-3 rounded-md border border-border px-3 py-2">
            <span><b className="font-medium">“{name}”</b> <span className="text-xs text-muted-foreground">in {count} layer{count === 1 ? "" : "s"}</span></span>
            <Select value={choice[name] ?? null} onValueChange={(v) => setChoice({ ...choice, [name]: v ?? "" })} items={items}>
              <SelectTrigger aria-label={`Soil type for ${name}`}><SelectValue placeholder="Choose a soil type" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" disabled={!choice[name] || isPreview} onClick={() => link(name)}>Use this</Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Soil types ──────────────────────────────────────────────────────────

const blank: Material = { id: "", name: "", color: "#A0785A", pattern: "dots", isCustom: true, lithologyClass: null, lithologyFamily: "CLAY" };

function SoilTypes() {
  const { bump } = useDataVersion();
  const { ask, dialog } = useConfirm();
  const materials = useLoad("materials", () => api.materials.list());
  const [editing, setEditing] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await api.materials.update(editing);
      else await api.materials.create(editing);
      toast.success(`Soil type “${editing.name.trim()}” saved.`);
      setEditing(null);
      bump();
    } catch (e) {
      setError(String(e));
    }
  };
  const remove = async (m: Material) => {
    if (!(await ask({ title: `Delete “${m.name}”?`, body: "Only soil types that no layer uses can be deleted.", confirmLabel: "Delete soil type", danger: true }))) return;
    try {
      await api.materials.remove(m.id);
      toast.success(`Soil type “${m.name}” deleted.`);
      bump();
    } catch (e) {
      toast.error(String(e));
    }
  };
  const open = (m: Material) => { setError(null); setEditing({ ...m }); };

  return (
    <Panel
      title={<span id="soil-types" className="scroll-mt-20">Soil types</span>}
      actions={<Button variant="outline" onClick={() => open(blank)} disabled={isPreview}><Plus />Add soil type</Button>}
      bodyClassName="p-0"
    >
      <p className="px-4 pt-3 pb-2 text-[13px] text-muted-foreground">The soil types you can choose for a layer. Built-in types can have their colour and pattern changed but not be deleted.</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Soil type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead />
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(materials.data ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="pl-4"><span className="inline-flex items-center gap-2.5"><MaterialSwatch color={m.color} pattern={m.pattern} size={18} />{m.name}</span></TableCell>
                <TableCell>{m.lithologyFamily ? FAMILY_NAME[m.lithologyFamily] : "—"}</TableCell>
                <TableCell>{PATTERN_NAME[m.pattern as keyof typeof PATTERN_NAME] ?? m.pattern}</TableCell>
                <TableCell>{m.isCustom ? <Chip tone="accent">Added by you</Chip> : <Chip>Built-in</Chip>}</TableCell>
                <TableCell className="pr-4 text-right whitespace-nowrap">
                  {m.lithologyFamily !== "NONE" && (
                    <Button variant="ghost" size="icon" aria-label={`Change ${m.name}`} onClick={() => open(m)} disabled={isPreview}><Pencil /></Button>
                  )}
                  {m.isCustom && <Button variant="ghost" size="icon" aria-label={`Delete ${m.name}`} onClick={() => remove(m)}><Trash2 /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Change “${editing.name}”` : "Add a soil type"}</DialogTitle>
            <DialogDescription>How this soil type looks in borewell drawings and cross-sections.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <Field id="m-name" label="Name">
                <Input id="m-name" value={editing.name} disabled={!editing.isCustom && !!editing.id} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="For example, Murrum" />
              </Field>
              <Field id="m-family" label="Which group is it in?" hint="Used to match layers between borewells in a cross-section.">
                <Select value={editing.lithologyFamily} onValueChange={(v) => setEditing({ ...editing, lithologyFamily: v as LithologyFamily })} items={FAMILY_ITEMS}>
                  <SelectTrigger id="m-family"><SelectValue /></SelectTrigger>
                  <SelectContent>{FAMILY_ITEMS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-[auto_1fr] gap-4">
                <Field id="m-colour" label="Colour">
                  <input id="m-colour" type="color" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="h-9 w-16 cursor-pointer rounded-md border border-input bg-transparent p-1" />
                </Field>
                <Field id="m-pattern" label="Pattern">
                  <div id="m-pattern" role="radiogroup" aria-label="Pattern" className="flex flex-wrap gap-1.5">
                    {PATTERNS.filter((p) => p !== "unrecorded").map((p) => (
                      <button key={p} type="button" role="radio" aria-checked={editing.pattern === p} title={PATTERN_NAME[p]}
                        onClick={() => setEditing({ ...editing, pattern: p })}
                        className={cn("grid place-items-center rounded-md border p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", editing.pattern === p ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                        <MaterialSwatch color={editing.color} pattern={p} size={26} />
                        <span className="sr-only">{PATTERN_NAME[p]}</span>
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{text.actions.cancel}</Button>
            <Button onClick={save} disabled={!editing?.name.trim()}>Save soil type</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Panel>
  );
}

// ── Appearance and about ────────────────────────────────────────────────

function Appearance() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: <Sun /> },
    { value: "dark", label: "Dark", icon: <Moon /> },
    { value: "system", label: "Same as Windows", icon: <Monitor /> },
  ] as const;
  return (
    <Panel title="Appearance" bodyClassName="grid gap-3">
      <div role="radiogroup" aria-label="Appearance" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.value} role="radio" aria-checked={theme === o.value} variant="outline" onClick={() => setTheme(o.value)}
            className={cn(theme === o.value && "border-primary bg-accent text-accent-foreground")}>
            {o.icon}{o.label}
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function About() {
  const status = useStartup();
  const info = useLoad("app-info", () => api.appInfo());
  const [update, setUpdate] = useState<{ state: "idle" | "checking" | "none" | "failed" } | { state: "found"; found: AvailableUpdate; progress?: number | null }>({ state: "idle" });
  const check = async () => {
    setUpdate({ state: "checking" });
    try {
      const found = await checkForUpdate();
      setUpdate(found ? { state: "found", found } : { state: "none" });
    } catch {
      setUpdate({ state: "failed" });
    }
  };
  const install = async (found: AvailableUpdate) => {
    setUpdate({ state: "found", found, progress: null });
    try {
      await found.install((p) => setUpdate({ state: "found", found, progress: p }));
    } catch (e) {
      setUpdate({ state: "found", found });
      toast.error(`The update could not be installed. ${String(e)}`);
    }
  };
  return (
    <Panel title="About" bodyClassName="grid gap-3">
      <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-muted-foreground">Version</dt><dd>{info.data ? `${info.data.name} ${info.data.version}` : "…"}</dd>
        <dt className="text-muted-foreground">Your data is kept in</dt><dd className="num break-all">{status?.dataFolder ?? "…"}</dd>
        <dt className="text-muted-foreground">Shared with</dt><dd>StrataVision, when it is installed, uses the same data. Anything added in one shows up in the other.</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={check} disabled={isPreview || update.state === "checking" || (update.state === "found" && update.progress !== undefined)}>
          {update.state === "checking" ? text.updates.checking : text.updates.check}
        </Button>
        {update.state === "found" && (
          <Button onClick={() => install(update.found)} disabled={update.progress !== undefined}>
            {update.progress === undefined ? `${text.updates.install} (${update.found.version})`
              : update.progress === null ? text.updates.downloading : text.updates.downloadingPct(Math.round(update.progress * 100))}
          </Button>
        )}
        <Button variant="ghost" onClick={() => api.openGuide().catch((e) => toast.error(String(e)))} disabled={isPreview}><BookOpen />{text.guide.open}</Button>
        <Button variant="ghost" onClick={() => api.backups.openFolder("data").catch((e) => toast.error(String(e)))} disabled={isPreview}><FolderOpen />Open data folder</Button>
      </div>
      {update.state === "none" && info.data && <p className="text-sm text-muted-foreground" role="status">{text.updates.upToDate(info.data.version)}</p>}
      {update.state === "failed" && <p className="text-sm text-destructive" role="status">{text.updates.offline}</p>}
      {update.state === "found" && update.progress === undefined && <p className="text-sm text-muted-foreground">{text.updates.howItWorks}</p>}
    </Panel>
  );
}
