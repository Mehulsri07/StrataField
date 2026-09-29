import type { KeyboardEvent } from "react";
import type { Borewell, PipeSegment, StrataLayer } from "@strata/core";
import { patternFill } from "./patterns";
import { text } from "@/text";

/** Keyboard support for clickable SVG shapes: Enter or Space acts like a click. */
export function activateOnKey(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

/**
 * The borewell drawing: depth ruler, soil layers, pipe (plain grey, screen blue with slots) and the
 * water level. Every layer can be clicked (or reached with Tab and opened with Enter) to see its details.
 */
export function BorewellProfile({
  borewell, strata, pipes, height = 520, selectedId, onLayerClick, forPrint = false,
}: {
  borewell: Borewell;
  strata: StrataLayer[];
  pipes: PipeSegment[];
  height?: number;
  selectedId?: string | null;
  onLayerClick?: (layer: StrataLayer) => void;
  /** For saved pictures and PDFs: leaves out the hover and selection outlines (stylesheets do not apply there). */
  forPrint?: boolean;
}) {
  const depth = borewell.totalDepth || Math.max(1, ...strata.map((l) => l.endDepth));
  const W = 380, top = 30, H = height, bottom = top + H;
  const y = (d: number) => top + (d / depth) * H;
  const colX = 44, colW = 96, boreX = 164, boreW = 44, pipeW = 26, labX = 228;
  const px = boreX + (boreW - pipeW) / 2;
  const step = depth > 300 ? 50 : 20;
  const ticks = Array.from({ length: Math.floor(depth / step) + 1 }, (_, i) => i * step);
  const wl = borewell.waterLevel;
  const lastPipe = [...pipes].sort((a, b) => b.endDepth - a.endDepth)[0];

  // Layer names share a column with the "Water … ft" label. Move a name above or below that label
  // when they would overlap, or leave it out if the layer is too thin (the popup still has it).
  const waterLabelY = wl != null ? y(wl) - 2 : null;
  const labelY = (y1: number, h: number): number | null => {
    if (h < 13) return null;
    const centre = y1 + h / 2 + 4;
    if (waterLabelY == null || Math.abs(centre - waterLabelY) >= 13) return centre;
    const below = waterLabelY + 14;
    if (below <= y1 + h - 2) return below;
    const above = waterLabelY - 14;
    if (above >= y1 + 11) return above;
    return null;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${bottom + 34}`}
      className="block h-auto w-full max-w-[380px]"
      role="group"
      aria-label={`${borewell.borewellId}: ${strata.length} soil layers to ${depth} ft`}
    >
      <text x={colX + colW / 2} y="16" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">LAYERS</text>
      <text x={boreX + boreW / 2} y="16" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">PIPE</text>
      {ticks.map((d) => (
        <g key={d}>
          <path d={`M${colX - 6} ${y(d)}H${colX}`} stroke="var(--input)" />
          <text x={colX - 9} y={y(d) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-foreground)" className="num">{d}</text>
        </g>
      ))}
      <text x="10" y={top - 12} fontSize="10" fill="var(--muted-foreground)">ft</text>

      {strata.map((l) => {
        const y1 = y(l.startDepth), h = Math.max(0, y(l.endDepth) - y1);
        const selected = l.id === selectedId;
        const label = `${l.material}, ${l.startDepth} to ${l.endDepth} ft`;
        return (
          <g
            key={l.id}
            className={onLayerClick ? "group cursor-pointer outline-none" : undefined}
            role={onLayerClick ? "button" : undefined}
            tabIndex={onLayerClick ? 0 : undefined}
            aria-label={onLayerClick ? `${label}. Show details` : undefined}
            onClick={onLayerClick ? () => onLayerClick(l) : undefined}
            onKeyDown={onLayerClick ? activateOnKey(() => onLayerClick(l)) : undefined}
          >
            <title>{label}</title>
            <rect x={colX} y={y1} width={colW} height={h} fill={l.color} />
            <rect x={colX} y={y1} width={colW} height={h} fill={patternFill(l.pattern)} />
            <path d={`M${colX} ${y1}H${colX + colW}`} stroke="var(--pattern-ink)" />
            {/* Hover and keyboard focus outline; stays on for the selected layer. */}
            {!forPrint && <rect
              x={colX + 1} y={y1 + 1} width={colW - 2} height={Math.max(0, h - 2)} fill="none" stroke="var(--primary)" strokeWidth="2.5"
              className={selected ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}
            />}
            {labelY(y1, h) != null && (
              <text x={labX} y={labelY(y1, h)!} fontSize="11.5" fill="var(--foreground)">
                {l.material} <tspan fill="var(--muted-foreground)" fontSize="10" className="num">{l.startDepth}–{l.endDepth}</tspan>
              </text>
            )}
          </g>
        );
      })}
      <rect x={colX} y={top} width={colW} height={H} fill="none" stroke="var(--input)" pointerEvents="none" />

      <rect x={boreX} y={top} width={boreW} height={H} fill="var(--muted)" stroke="var(--input)" />
      {pipes.map((p) => {
        const y1 = y(p.startDepth), h = y(p.endDepth) - y1;
        return p.pipeType === "plain" ? (
          <rect key={p.id} x={px} y={y1} width={pipeW} height={h} fill="var(--pipe-plain)" stroke="var(--pattern-ink)" strokeWidth="0.5">
            <title>{text.geology.plainPipe}, {p.startDepth} to {p.endDepth} ft</title>
          </rect>
        ) : (
          <g key={p.id}>
            <title>{text.geology.screenPipe}, {p.startDepth} to {p.endDepth} ft</title>
            <rect x={px} y={y1} width={pipeW} height={h} fill="var(--pipe-screen)" />
            <rect x={px + 3} y={y1} width={pipeW - 6} height={h} fill="url(#p-slots)" />
          </g>
        );
      })}
      {lastPipe && <path d={`M${px - 2} ${y(lastPipe.endDepth)}H${px + pipeW + 2}`} stroke="var(--foreground)" strokeWidth="2.5" />}

      {wl != null && (
        <g pointerEvents="none">
          <path d={`M${colX - 4} ${y(wl)}H${boreX + boreW + 8}`} stroke="var(--water)" strokeWidth="1.6" strokeDasharray="5 3" />
          <path d={`M${boreX + boreW + 8} ${y(wl) - 9}l5 8 5-8z`} fill="var(--water)" />
          <text x={boreX + boreW + 22} y={y(wl) - 2} fontSize="11" fontWeight="600" fill="var(--water)">Water {wl} ft</text>
        </g>
      )}
      <text x={colX} y={bottom + 20} fontSize="11" fill="var(--muted-foreground)" className="num">
        Total depth {depth} ft{borewell.boreDia ? ` · hole ${borewell.boreDia}"` : ""}{borewell.pipeDia ? ` · pipe ${borewell.pipeDia}"` : ""}
      </text>
    </svg>
  );
}
