import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

/** A labelled form field with an optional hint and message. Messages are plain sentences. */
export function Field({ id, label, hint, error, warning, className, children }: {
  id: string; label: ReactNode; hint?: ReactNode; error?: string; warning?: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-msg`} className="text-xs text-destructive">{error}</p>
        : warning ? <p id={`${id}-msg`} className="text-xs text-warn">{warning}</p>
        : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
