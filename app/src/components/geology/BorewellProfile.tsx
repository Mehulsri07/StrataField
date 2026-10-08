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
  /**
   * For saved pictures and PDFs, which are read without a mouse: each layer's name is written on the
   * layer, and the hover and selection outlines are left
   * out (stylesheets do not apply there).
   */
  forPrint?: boolean;
}) {
  const depth = borewell.totalDepth || Math.max(1, ...strata.map((l) => l.endDepth));
  const W = 380, top = 30, H = height, bottom = top + H;
  const y = (d: number) => top + (d / depth) * H;
  // In print the layer column is wider, since the names are written inside it.
  const colX = 44, colW = forPrint ? 150 : 96, boreX = colX + colW + 24, boreW = 44, pipeW = 26, labX = boreX + boreW + 20;
  const px = boreX + (boreW - pipeW) / 2;
  // A mark wherever one layer ends and the next begins, so each layer's thickness can be read off.
  const ticks = [...new Set([0, ...strata.flatMap((l) => [l.startDepth, l.endDepth]), depth])].filter((d) => d >= 0 && d <= depth).sort((a, b) => a - b);
  // Marks closer than a line of text keep their tick but only one of them is numbered.
  const numbered = ticks.filter((d, i) => i === 0 || y(d) - y(ticks[i - 1]) >= 9 || i === ticks.length - 1)
    .filter((d, i, kept) => i === kept.length - 1 || y(kept[i + 1]) - y(d) >= 9);
  const wl = borewell.waterLevel;
  const lastPipe = [...pipes].sort((a, b) => b.endDepth - a.endDepth)[0];
  // The pump hangs inside the pipe at the depth it was lowered to; its label keeps clear of the water's.
  const pumpAt = borewell.pumpLowering != null && borewell.pumpLowering > 0 && borewell.pumpLowering <= depth ? borewell.pumpLowering : null;
  const pumpLabelY = pumpAt == null ? null : wl != null && Math.abs(y(pumpAt) - 4 - (y(wl) - 2)) < 13 ? y(wl) + 12 : y(pumpAt) - 4;

  // Layer names share a column with the "Water … ft" and "Pump … ft" labels. Move a name above or
  // below those labels when they would overlap, or leave it out if the layer is too thin (the popup still has it).
  const waterLabelY = wl != null ? y(wl) - 2 : null;
  const fixedLabels = [waterLabelY, pumpLabelY].filter((v) => v != null).sort((a, b) => a - b);
  const labelY = (y1: number, h: number): number | null => {
    if (h < 13) return null;
    const clear = (at: number) => fixedLabels.every((f) => Math.abs(at - f) >= 13);
    const centre = y1 + h / 2 + 4;
    if (clear(centre)) return centre;
    return fixedLabels.flatMap((f) => [f + 14, f - 14]).find((at) => at >= y1 + 11 && at <= y1 + h - 2 && clear(at)) ?? null;
  };

  // In print, every name is written on its own layer, clear of the water line. A thin layer gets
  // smaller letters, down to a size that still prints clearly, so the name never moves off the layer.
  const printLabel = strata.map((l) => {
    const y1 = y(l.startDepth), h = Math.max(0, y(l.endDepth) - y1);
    const size = Math.min(11.5, Math.max(5.5, h - 2));
    let at = y1 + h / 2 + size * 0.35;
    if (h >= 11 && wl != null && Math.abs(at - 4 - y(wl)) < 9) at = y(wl) + 15 <= y1 + h - 3 ? y(wl) + 15 : y(wl) - 6 >= y1 + 11 ? y(wl) - 6 : at;
    return { at, size };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${bottom + 34}`}
      className="block h-auto w-full max-w-[380px]"
      role="group"
      aria-label={`${borewell.borewellId}: ${strata.length} soil layers to ${depth} ft`}
    >
      <text x={colX + colW / 2} y="16" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{forPrint ? "STRATA" : "LAYERS"}</text>
      <text x={boreX + boreW / 2} y="16" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">PIPE</text>
      {ticks.map((d) => (
        <g key={d}>
          <path d={`M${colX - 6} ${y(d)}H${colX}`} stroke="var(--input)" />
          {numbered.includes(d) && <text x={colX - 9} y={y(d) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-foreground)" className="num">{d}</text>}
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
            {!forPrint && labelY(y1, h) != null && (
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
      {/* In print each name is written on its layer, with a light edge so it reads over any pattern.
          Drawn after the water line, so the line passes behind a name and not through it. */}
      {forPrint && strata.map((l, i) => (
        <text key={l.id} x={colX + colW / 2} y={printLabel[i].at} textAnchor="middle" fontSize={printLabel[i].size} fontWeight="600" fill="#16202a" stroke="#ffffff" strokeWidth={printLabel[i].size >= 9 ? 3 : 1.6} strokeOpacity="0.85" strokeLinejoin="round" paintOrder="stroke">{l.material}</text>
      ))}
      {pumpAt != null && (
        <g pointerEvents="none">
          <title>Pump lowered to {pumpAt} ft</title>
          <rect x={px + 4} y={y(pumpAt) - 16} width={pipeW - 8} height="16" rx="2" fill="#b45309" stroke="#ffffff" strokeWidth="1" />
          <path d={`M${px + pipeW / 2} ${top}V${y(pumpAt) - 16}`} stroke="#b45309" strokeWidth="1.2" />
          <text x={boreX + boreW + 22} y={pumpLabelY!} fontSize="11" fontWeight="600" fill="#b45309">Pump {pumpAt} ft</text>
        </g>
      )}
      <text x={colX} y={bottom + 20} fontSize="11" fill="var(--muted-foreground)" className="num">
        Total depth {depth} ft{borewell.boreDia ? ` · hole ${borewell.boreDia}"` : ""}{borewell.pipeDia ? ` · pipe ${borewell.pipeDia}"` : ""}
      </text>
    </svg>
  );
}
