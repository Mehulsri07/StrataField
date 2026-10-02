import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { text } from "@/text";

/** Page frame: consistent padding and width so every screen lines up the same way. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto grid max-w-[1320px] gap-7 px-8 pt-7 pb-12", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A section of a screen: a heading with a hairline under it, then the content. Sections are not boxes;
 * space and the hairline separate them, so only real objects (a table, a list, a map) carry a frame.
 */
export function Panel({ title, actions, children, className, bodyClassName, framed }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
  /** For a table or list: the content sits in a hairline frame, edge to edge. */
  framed?: boolean;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || actions) && (
        <div className={cn("flex min-h-9 items-center gap-2.5 pb-2", !framed && "border-b border-border")}>
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(framed ? "overflow-hidden rounded-md border border-border" : (title || actions) && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Shown for an address that does not exist, with a way back. */
export function NotFound() {
  return (
    <Page>
      <PageHeader title={text.pages.notFound.title} sub={text.pages.notFound.sub} />
      <div className="grid place-items-center gap-3 px-6 py-16 text-center">
        <Compass className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{text.pages.notFound.body}</p>
        <Button render={<Link to="/" />}>{text.pages.notFound.home}</Button>
      </div>
    </Page>
  );
}
