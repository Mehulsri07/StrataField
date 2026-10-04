import { DEFAULT_PROJECT, type BorewellInput } from "@strata/core";
/** Friendly dates for people, e.g. "today, 09:12", "yesterday, 18:40", "22 Sep 2026". */

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function parse(value: string): Date | null {
  // Backups report local time as "YYYY-MM-DD HH:MM:SS"; records use ISO strings.
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string): string {
  const d = parse(value);
  return d ? dateFmt.format(d) : value;
}

export function formatWhen(value: string, now = new Date()): string {
  const d = parse(value);
  if (!d) return value;
  const time = d.toTimeString().slice(0, 5);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  if (diffDays === 0) return `today, ${time}`;
  if (diffDays === 1) return `yesterday, ${time}`;
  return dateFmt.format(d);
}

/** A zone's name as people should see it: the database's default zone reads "No zone". */
export function zoneName(project: string | null | undefined): string {
  return !project || project === DEFAULT_PROJECT ? "No zone" : project;
}

/** "KSB 12C/17 · 5 HP · Borewell submersible", from whatever is filled in. */
export function pumpText(b: Pick<BorewellInput, "pumpType" | "pumpModel" | "pumpHp">): string {
  return [b.pumpModel, b.pumpHp != null ? `${b.pumpHp} HP` : "", b.pumpType].filter(Boolean).join(" · ");
}
