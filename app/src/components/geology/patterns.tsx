/**
 * Material patterns and swatches. Every material is drawn with its colour AND its pattern,
 * so layers stay readable in print and for people who find some colours hard to tell apart.
 * Mount <PatternDefs /> once (the app shell does); anything can then use fill="url(#p-<name>)".
 */
import type { StrataLayer } from "@strata/core";
import { cn } from "@/lib/utils";

export const PATTERNS = ["lines", "dots", "diagonal", "circles", "crosses", "unrecorded", "solid"] as const;

export function patternFill(pattern: string) {
  return (PATTERNS as readonly string[]).includes(pattern) && pattern !== "solid" ? `url(#p-${pattern})` : "none";
}

export function PatternDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="p-lines" width="8" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 2.5H8" stroke="var(--pattern-ink)" strokeWidth="1" />
        </pattern>
        <pattern id="p-dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.9" fill="var(--pattern-ink)" />
          <circle cx="4.5" cy="4.5" r="0.9" fill="var(--pattern-ink)" />
        </pattern>
        <pattern id="p-diagonal" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="var(--pattern-ink)" strokeWidth="1" />
        </pattern>
        <pattern id="p-circles" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.6" fill="none" stroke="var(--pattern-ink)" strokeWidth="1" />
        </pattern>
        <pattern id="p-crosses" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M2 2L6 6M6 2L2 6" stroke="var(--pattern-ink)" strokeWidth="1" />
        </pattern>
        {/* "Not recorded": a known gap, drawn as a cross-hatch so it never looks like real soil. */}
        <pattern id="p-unrecorded" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 7L7 0M0 0L7 7" stroke="var(--pattern-ink)" strokeWidth="0.8" />
        </pattern>
        <pattern id="p-slots" width="6" height="5" patternUnits="userSpaceOnUse">
          <path d="M1 2.5H5" stroke="var(--pipe-slot)" strokeWidth="1.4" />
        </pattern>
      </defs>
    </svg>
  );
}

export function MaterialSwatch({ color, pattern, size = 14, className }: { color: string; pattern: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={cn("shrink-0 rounded-[3px]", className)} aria-hidden="true">
      <rect width={size} height={size} fill={color} />
      <rect width={size} height={size} fill={patternFill(pattern)} />
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} fill="none" stroke="var(--pattern-ink)" />
    </svg>
  );
}

/**
 * Small horizontal strip of a borewell's layers, with the water level marked in blue.
 * With `onLayerClick`, each layer can be clicked (or reached with Tab and opened with Enter).
 */
export function StrataStrip({
  strata, totalDepth, waterLevel, width = 132, height = 12, className, onLayerClick,
}: {
  strata: StrataLayer[]; totalDepth: number | null; waterLevel: number | null; width?: number; height?: number; className?: string;
  onLayerClick?: (layer: StrataLayer) => void;
}) {
  const depth = totalDepth || Math.max(0, ...strata.map((l) => l.endDepth)) || 1;
  const x = (d: number) => Math.min(width, (d / depth) * width);
  const label = `${strata.length} layers${waterLevel != null ? `, water at ${waterLevel} ft` : ""}`;
  return (
    <svg width={width} height={height + 6} viewBox={`0 0 ${width} ${height + 6}`} role="img" aria-label={label} className={className}>
      <rect x="0" y="3" width={width} height={height} fill="var(--muted)" />
      {strata.map((l) => {
        const w = Math.max(0, x(l.endDepth) - x(l.startDepth));
        const open = onLayerClick && ((e: { stopPropagation: () => void }) => { e.stopPropagation(); onLayerClick(l); });
        return (
          <g
            key={l.id}
            className={open ? "group cursor-pointer outline-none" : undefined}
            role={open ? "button" : undefined}
            tabIndex={open ? 0 : undefined}
            aria-label={open ? `${l.material}, ${l.startDepth} to ${l.endDepth} ft. Show details` : undefined}
            onClick={open}
            onKeyDown={open ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } } : undefined}
          >
            <title>{`${l.material}, ${l.startDepth} to ${l.endDepth} ft`}</title>
            <rect x={x(l.startDepth)} y="3" width={w} height={height} fill={l.color} />
            <rect x={x(l.startDepth)} y="3" width={w} height={height} fill={patternFill(l.pattern)} />
            {open && <rect x={x(l.startDepth) + 0.75} y="3.75" width={Math.max(0, w - 1.5)} height={height - 1.5} fill="none" stroke="var(--primary)" strokeWidth="1.5" className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
          </g>
        );
      })}
      {waterLevel != null && <path d={`M${x(waterLevel)} 0V${height + 6}`} stroke="var(--water)" strokeWidth="2" pointerEvents="none" />}
    </svg>
  );
}

/** Pipe legend swatches: plain pipe light grey, screen pipe blue with slots. */
export function PipeSwatch({ kind, size = 14 }: { kind: "plain" | "slotted"; size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width={size} height={size} fill={kind === "plain" ? "var(--pipe-plain)" : "var(--pipe-screen)"} stroke="var(--pattern-ink)" />
      {kind === "slotted" && <rect x={size * 0.2} width={size * 0.6} height={size} fill="url(#p-slots)" />}
    </svg>
  );
}
