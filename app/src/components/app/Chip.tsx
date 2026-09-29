import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border border-border bg-muted text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-destructive",
} as const;

/** Small status label. Status colours are separate from the accent colour. */
export function Chip({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
