import { useState } from "react";
import { Link } from "react-router-dom";
import type { Borewell } from "@strata/core";
import { toast } from "sonner";
import { CircleCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { MapPicker } from "@/components/map/MapPicker";
import { api } from "@/lib/api";
import { useBorewells, useDataVersion } from "@/lib/data";
import { zoneName } from "@/lib/format";

const where = (b: Borewell) => [b.houseNo, b.address, b.area, b.city].filter(Boolean).join(", ");

/**
 * Gives a location to every borewell that has none, one after another: the map opens with the
 * borewell's address already searched, a click sets the spot, and the next borewell comes up.
 */
export function LocatePage() {
  const { bump } = useDataVersion();
  const all = useBorewells();
  // Borewells dealt with in this visit, so the next one comes up without waiting for the list to reload.
  const [done, setDone] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [open, setOpen] = useState(true);

  const borewells = (all.data ?? []).map((i) => i.borewell);
  const located = borewells.filter((b) => b.latitude != null && b.longitude != null);
  const waiting = borewells.filter((b) => (b.latitude == null || b.longitude == null) && !done.includes(b.id));
  /** The borewell chosen from the list to do next, ahead of its turn. */
  const [first, setFirst] = useState<string | null>(null);
  const todo = waiting.filter((b) => !skipped.includes(b.id)).sort((x, y) => Number(y.id === first) - Number(x.id === first));
  const b = todo[0];

  const place = async (target: Borewell, at: { latitude: number; longitude: number; found?: string }) => {
    setDone([...done, target.id]);
    try {
      // How the borewell first came in is not something an edit changes.
      await api.borewells.update(target.id, { ...target, importMethod: undefined, latitude: Number(at.latitude.toFixed(6)), longitude: Number(at.longitude.toFixed(6)), locationSource: at.found ? "address" : "map" });
      bump();
    } catch (e) {
      setDone(done.filter((id) => id !== target.id));
      toast.error(String(e));
    }
  };

  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        title="Add locations"
        sub="Borewells without a location are missing from the map, cross-sections and report maps. Go through them one after another."
        actions={b && !open && <Button onClick={() => setOpen(true)}><MapPin />Continue with {b.borewellId}</Button>}
      />
      {!all.data ? <p className="text-sm text-muted-foreground">Loading…</p> : waiting.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-ok/30 bg-ok-soft px-4 py-3 text-sm">
          <CircleCheck className="size-4 text-ok" />
          <span>Every borewell has a location{done.length ? `. ${done.length} added just now.` : "."}</span>
          <Button variant="ghost" size="sm" className="ml-auto" render={<Link to="/map" />}>See the map</Button>
        </div>
      ) : (
        <Panel title={`${waiting.length} still without a location`} framed actions={skipped.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setSkipped([]); setOpen(true); }}>Go back to the {skipped.length} skipped</Button>}>
          <ul className="divide-y divide-border">
            {waiting.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="num font-medium">{w.borewellId}</b>{w.ownerName && w.ownerName !== w.borewellId && <span> · {w.ownerName}</span>}
                  <span className="block truncate text-xs text-muted-foreground">{where(w) || "No address"} · {zoneName(w.project)}{skipped.includes(w.id) && " · skipped"}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => { setSkipped(skipped.filter((id) => id !== w.id)); setFirst(w.id); setOpen(true); }}><MapPin />Add location</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {b && (
        <MapPicker
          key={b.id}
          open={open}
          initial={null}
          // A site's name is often a landmark the map knows (a hospital, an apartment block), so it is searched when there is no area.
          search={[b.area || b.address || b.ownerName, b.city].filter(Boolean).join(", ")}
          others={located}
          heading={`Where is ${b.borewellId}?`}
          detail={`${[b.ownerName !== b.borewellId && b.ownerName, where(b)].filter(Boolean).join(" · ") || "No address recorded"}. ${todo.length} to go.`}
          onClose={() => setOpen(false)}
          onSkip={() => setSkipped([...skipped, b.id])}
          onPick={(at) => place(b, at)}
        />
      )}
    </Page>
  );
}
