import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Page, PageHeader } from "@/components/app/Page";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/data";
import { formatWhen } from "@/lib/format";
import { text } from "@/text";

/** How many changes are loaded; older ones stay in each borewell's own History. */
const LIMIT = 500;

/** Every change across all borewells, newest first: what to look at after a batch of imports or edits. */
export function Activity() {
  const history = useLoad("activity", () => api.recentHistory(LIMIT));
  const [query, setQuery] = useState("");
  const all = history.data ?? [];
  const q = query.trim().toLowerCase();
  const rows = q ? all.filter((h) => h.summary.toLowerCase().includes(q)) : all;

  return (
    <Page className="max-w-[1100px]">
      <PageHeader title={text.pages.activity.title} sub={text.pages.activity.sub} />
      <section className="min-w-0 rounded-md border border-border">
        <div className="relative border-b border-border px-4 py-3">
          <Search className="pointer-events-none absolute top-1/2 left-6.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" className="max-w-[380px] pl-8" placeholder="Search by borewell, file name or words" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the activity" />
        </div>
        {history.error && <p className="px-4 py-3 text-sm text-destructive">{history.error}</p>}
        {rows.length > 0 ? (
          <ol className="divide-y divide-border">
            {rows.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-36 shrink-0 text-muted-foreground">{formatWhen(h.changedAt)}</span>
                <span className="min-w-0 flex-1">{h.summary}</span>
                {h.entity === "borewell" && h.action !== "purge" && <Link to={`/borewell/${h.entityId}`} className="shrink-0 font-medium text-primary hover:underline">{text.actions.openBorewell}</Link>}
              </li>
            ))}
          </ol>
        ) : !history.loading && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? "Nothing has been added or changed yet." : "Nothing in the activity matches that search."}</p>
        )}
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {all.length === LIMIT ? `Showing the newest ${LIMIT} changes.` : `${all.length} change${all.length === 1 ? "" : "s"}.`} Each borewell's own History tab has all of its changes.
        </p>
      </section>
    </Page>
  );
}
