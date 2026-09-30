import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { text } from "@/text";

/** Page frame: consistent padding and width so every screen lines up the same way. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto grid max-w-[1400px] gap-4 px-6 pt-5 pb-8", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0">
        <h2 className="text-[22px] leading-tight font-semibold">{title}</h2>
        {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A bordered panel with an optional heading row. Use for grouped content, not for every block. */
export function Panel({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-md border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          {title && <h3 className="font-heading text-base font-semibold">{title}</h3>}
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Shown for an address that does not exist, with a way back. */
export function NotFound() {
  return (
    <Page>
      <PageHeader title={text.pages.notFound.title} sub={text.pages.notFound.sub} />
      <div className="grid place-items-center gap-3 rounded-md border border-dashed border-input bg-card px-6 py-16 text-center">
        <Compass className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{text.pages.notFound.body}</p>
        <Button render={<Link to="/" />}>{text.pages.notFound.home}</Button>
      </div>
    </Page>
  );
}
