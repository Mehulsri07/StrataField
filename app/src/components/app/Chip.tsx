import type { ReactNode } from "react";
import { cn } from "cn";

const tones = {
  neutral: "text-muted-foreground",
  accent: "text-primary",
  ok: "text-ok before:bg-ok",
  warn: "text-warn before:bg-warn",
  danger: "text-destructive before:bg-destructive",
} as const;

/** Small status label: a coloured dot and a word, never a filled pill. Status colours are separate from the accent. */
export function Chip({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", (tone === "ok" || tone === "warn" || tone === "danger") && "before:size-1.5 before:shrink-0 before:rounded-full", tones[tone], className)}>
      {children}
    </span>
  );
}
