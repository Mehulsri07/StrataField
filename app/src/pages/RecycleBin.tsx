import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Borewell } from "@strata/core";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader } from "@/components/app/Page";
import { useConfirm } from "@/components/app/Confirm";
import { api, isPreview } from "@/lib/api";
import { useDataVersion, useLoad } from "@/lib/data";
import { formatDate, formatWhen } from "@/lib/format";
import { text } from "@/text";

export function RecycleBin() {
  const { bump } = useDataVersion();
  const { ask, dialog } = useConfirm();
  const items = useLoad("recycle-bin", () => api.borewells.search({ showDeleted: true }));
  const [busy, setBusy] = useState<string | null>(null);

  const rows = [...(items.data ?? [])].sort((a, b) => (b.borewell.deletedAt ?? "").localeCompare(a.borewell.deletedAt ?? ""));
  const run = async (b: Borewell, work: () => Promise<void>) => {
    setBusy(b.id);
    try { await work(); bump(); } catch (e) { toast.error(String(e)); } finally { setBusy(null); }
  };
  const restore = (b: Borewell) => run(b, async () => {
    await api.borewells.restore(b.id);
    toast.success(`${b.borewellId} is back in the Borewells list.`);
  });
  const deleteForGood = (b: Borewell) => run(b, async () => {
    const ok = await ask({
      title: `Delete ${b.borewellId} for good?`,
      body: "Its layers, pipes, water readings, photos and files are deleted too. This cannot be undone, except by restoring an older backup.",
      confirmLabel: "Delete for good",
      danger: true,
    });
    if (!ok) return;
    await api.borewells.deletePermanently(b.id);
    toast.success(`${b.borewellId} was deleted for good.`);
  });

  return (
    <Page>
      <PageHeader title={text.pages.recycleBin.title} sub={text.pages.recycleBin.sub} />
      <section className="min-w-0 rounded-md border border-border">
        {items.error && <p className="px-4 py-3 text-sm text-destructive">{items.error}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Borewell ID</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Date drilled</TableHead>
                  <TableHead className="text-right">Layers</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ borewell: b, strata }) => (
                  <TableRow key={b.id}>
                    <TableCell className="num pl-4 font-medium">{b.borewellId}</TableCell>
                    <TableCell>{b.ownerName || <span className="text-muted-foreground">Not entered</span>}</TableCell>
                    <TableCell>{b.area}</TableCell>
                    <TableCell className="num whitespace-nowrap">{b.date ? formatDate(b.date) : "—"}</TableCell>
                    <TableCell className="num text-right">{strata.length}</TableCell>
                    <TableCell className="whitespace-nowrap">{b.deletedAt ? formatWhen(b.deletedAt) : "—"}</TableCell>
                    <TableCell className="pr-4 text-right whitespace-nowrap">
                      <Button variant="outline" size="sm" disabled={busy != null || isPreview} onClick={() => restore(b)}><RotateCcw />Restore</Button>
                      <Button variant="ghost" size="sm" className="ml-1 text-destructive hover:text-destructive" disabled={busy != null || isPreview} onClick={() => deleteForGood(b)}><Trash2 />Delete for good</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!items.loading && rows.length === 0 && (
          <div className="grid justify-items-center gap-2 px-4 py-14 text-center">
            <Trash2 className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">The Recycle bin is empty</p>
            <p className="max-w-md text-sm text-muted-foreground">When you delete a borewell it comes here first, so you can bring it back if it was a mistake.</p>
          </div>
        )}
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">Borewells stay here until you delete them for good. They are not shown on the map, in cross-sections or in exports.</p>
      </section>
      {dialog}
    </Page>
  );
}
