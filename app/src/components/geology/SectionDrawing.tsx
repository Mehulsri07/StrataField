import type { Borewell, LithologyFamily, StrataLayer } from "@strata/core";
import { coverageFor, familyRuns, matchRuns, type Placed } from "@strata/core";
import { activateOnKey } from "./BorewellProfile";
import { FAMILY_COLOURS, type LayerSelection } from "./LayerDialog";
import { patternFill } from "./patterns";

export interface SectionWell {
  borewell: Borewell;
  strata: StrataLayer[];
}

const W = 1100, LEFT = 58, RIGHT = 30, TOP = 64, H = 330, COL = 16;

/**
 * The cross-section: measured layers at each borewell, estimates between neighbours, and "not enough
 * borewells" where they are too far apart. Every layer and estimate can be clicked for its details.
 */
export function SectionDrawing({
  placed, lengthKm, showEstimates = true, showWater = true, selectedKey, onLayer, onEstimate, forPrint,
}: {
  placed: Placed<SectionWell>[];
  lengthKm: number;
  showEstimates?: boolean;
  showWater?: boolean;
  selectedKey?: string | null;
  onLayer?: (layer: StrataLayer, well: SectionWell) => void;
  onEstimate?: (selection: Extract<LayerSelection, { kind: "estimated" }>, key: string) => void;
  forPrint?: boolean;
}) {
  const maxDepth = Math.max(100, Math.ceil(Math.max(0, ...placed.map((p) => p.item.borewell.totalDepth ?? Math.max(0, ...p.item.strata.map((l) => l.endDepth)))) / 50) * 50);
  const X = (km: number) => LEFT + (km / Math.max(lengthKm, 0.01)) * (W - LEFT - RIGHT);
  // Borewells at (almost) the same distance along the line would draw on top of each other, so
  // their columns are nudged apart just enough to see both. Distances in the table stay exact.
  const colX: number[] = [];
  placed.forEach((p, i) => colX.push(i === 0 ? X(p.alongKm) : Math.max(X(p.alongKm), colX[i - 1] + COL + 6)));
  const at = (p: Placed<SectionWell>) => colX[placed.indexOf(p)];
  const Y = (d: number) => TOP + (d / maxDepth) * H;
  const step = lengthKm > 12 ? 2 : lengthKm > 4 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(lengthKm / step) + 1 }, (_, i) => i * step);
  const clickable = !forPrint;
  const button = (label: string, action?: () => void) =>
    clickable && action ? { role: "button", tabIndex: 0, "aria-label": `${label}. Show details`, onClick: action, onKeyDown: activateOnKey(action), className: "cursor-pointer outline-none [&:hover>.hl]:opacity-100 [&:focus-visible>.hl]:opacity-100" } : {};

  const noData = (x1: number, x2: number, label: string, key: string) => (x2 - x1 < 2 ? null : (
    <g key={key}>
      <rect x={x1} y={TOP} width={x2 - x1} height={H} fill="url(#p-nodata)" opacity="0.8" />
      {x2 - x1 > 120 && (
        <text x={(x1 + x2) / 2} y={TOP + H / 2} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)" paintOrder="stroke" stroke="var(--card)" strokeWidth="4">{label}</text>
      )}
    </g>
  ));

  const between = [];
  for (let i = 0; i < placed.length - 1; i++) {
    const A = placed[i], B = placed[i + 1], gap = B.alongKm - A.alongKm, cover = coverageFor(gap);
    const xa = at(A) + COL / 2, xb = at(B) - COL / 2, xm = (xa + xb) / 2;
    if (xb - xa < 1) continue;
    if (cover === "none") {
      between.push(noData(xa, xb, `Not enough borewells (${gap.toFixed(1)} km apart)`, `gap${i}`));
      continue;
    }
    const RA = familyRuns(A.item.strata), RB = familyRuns(B.item.strata), pairs = matchRuns(RA, RB);
    const opacity = cover === "estimate" ? 0.5 : 0.22, dash = cover === "estimate" ? "6 4" : "1.5 4";
    const confidence = cover === "estimate" ? "estimate" : "rough";
    const usedA = new Set(pairs.map((p) => p[0])), usedB = new Set(pairs.map((p) => p[1]));
    if (showEstimates) {
      pairs.forEach(([ia, ib]) => {
        const ra = RA[ia], rb = RB[ib], key = `u${i}-${ia}-${ib}`;
        const open = onEstimate && (() => onEstimate({ kind: "estimated", family: ra.family, confidence, distanceKm: gap, sides: [{ borewell: A.item.borewell, top: ra.top, bottom: ra.bottom }, { borewell: B.item.borewell, top: rb.top, bottom: rb.bottom }] }, key));
        between.push(
          <g key={key} {...button(`Estimated ${ra.family.toLowerCase()} layer between ${A.item.borewell.borewellId} and ${B.item.borewell.borewellId}`, open)}>
            <path d={`M${xa} ${Y(ra.top)}L${xb} ${Y(rb.top)}L${xb} ${Y(rb.bottom)}L${xa} ${Y(ra.bottom)}Z`} fill={FAMILY_COLOURS[ra.family]} fillOpacity={selectedKey === key ? Math.min(0.85, opacity + 0.3) : opacity} />
            <path d={`M${xa} ${Y(ra.bottom)}L${xb} ${Y(rb.bottom)}`} stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray={dash} fill="none" />
            {!forPrint && <path className="hl opacity-0" d={`M${xa} ${Y(ra.top)}L${xb} ${Y(rb.top)}L${xb} ${Y(rb.bottom)}L${xa} ${Y(ra.bottom)}Z`} fill="none" stroke="var(--primary)" strokeWidth="2" />}
          </g>,
        );
      });
      // A run found in only one borewell thins out halfway to the next one.
      const pinch = (runs: typeof RA, used: Set<number>, xs: number, self: typeof A, other: typeof A, first: boolean) =>
        runs.forEach((r, k) => {
          if (used.has(k) || r.family === "NONE") return;
          const key = `p${i}-${first ? "a" : "b"}${k}`;
          const sides: [{ borewell: Borewell; top: number | null; bottom: number | null }, { borewell: Borewell; top: number | null; bottom: number | null }] = first
            ? [{ borewell: self.item.borewell, top: r.top, bottom: r.bottom }, { borewell: other.item.borewell, top: null, bottom: null }]
            : [{ borewell: other.item.borewell, top: null, bottom: null }, { borewell: self.item.borewell, top: r.top, bottom: r.bottom }];
          const open = onEstimate && (() => onEstimate({ kind: "estimated", family: r.family as LithologyFamily, confidence, distanceKm: gap, sides }, key));
          between.push(
            <g key={key} {...button(`${r.family.toLowerCase()} layer only at ${self.item.borewell.borewellId}`, open)}>
              <path d={`M${xs} ${Y(r.top)}L${xm} ${Y((r.top + r.bottom) / 2)}L${xs} ${Y(r.bottom)}Z`} fill={FAMILY_COLOURS[r.family]} fillOpacity={selectedKey === key ? Math.min(0.85, opacity + 0.3) : opacity} stroke="var(--foreground)" strokeOpacity="0.45" strokeDasharray={dash} />
            </g>,
          );
        });
      pinch(RA, usedA, xa, A, B, true);
      pinch(RB, usedB, xb, B, A, false);
    }
    const wa = A.item.borewell.waterLevel, wb = B.item.borewell.waterLevel;
    if (showWater && wa != null && wb != null) {
      between.push(<path key={`w${i}`} d={`M${xa} ${Y(wa)}L${xb} ${Y(wb)}`} stroke="var(--water)" strokeWidth="1.8" strokeDasharray={dash} fill="none" pointerEvents="none" />);
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${TOP + H + 46}`} className="block h-auto w-full min-w-[760px]" role="group" aria-label={`Cross-section with ${placed.length} borewells`}>
      <defs>
        <pattern id="p-nodata" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V8" stroke="var(--input)" strokeWidth="1.2" />
        </pattern>
      </defs>
      {Array.from({ length: maxDepth / 50 + 1 }, (_, i) => i * 50).map((d) => (
        <g key={d}>
          <path d={`M${LEFT} ${Y(d)}H${W - RIGHT}`} stroke="var(--border)" strokeDasharray={d ? "2 4" : undefined} />
          <text x={LEFT - 8} y={Y(d) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)">{d}</text>
        </g>
      ))}
      <text x={LEFT - 8} y={TOP - 10} textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)">depth, ft</text>
      {ticks.map((k) => <text key={k} x={X(k)} y={TOP + H + 18} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)">{k}</text>)}
      <text x={W - RIGHT} y={TOP + H + 36} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">km from A</text>
      <text x={LEFT} y="18" fontSize="15" fontWeight="600" fill="var(--foreground)">A</text>
      <text x={W - RIGHT} y="18" textAnchor="end" fontSize="15" fontWeight="600" fill="var(--foreground)">A′</text>

      {placed.length === 0 ? noData(LEFT, W - RIGHT, "No borewells near this line", "empty") : (
        <>
          {noData(LEFT, at(placed[0]) - COL / 2, "No borewells here", "start")}
          {noData(at(placed[placed.length - 1]) + COL / 2, W - RIGHT, "No borewells here", "end")}
        </>
      )}
      {between}

      {placed.map((p, i) => {
        const x = at(p) - COL / 2, b = p.item.borewell;
        const depth = b.totalDepth ?? Math.max(0, ...p.item.strata.map((l) => l.endDepth));
        const labelY = i % 2 ? 46 : 32;
        return (
          <g key={b.id}>
            {p.item.strata.map((l) => {
              const key = `l${l.id}`;
              return (
                <g key={l.id} {...button(`${l.material}, ${l.startDepth} to ${l.endDepth} ft, at ${b.borewellId}`, onLayer && (() => onLayer(l, p.item)))}>
                  <title>{`${b.borewellId}: ${l.material}, ${l.startDepth} to ${l.endDepth} ft`}</title>
                  <rect x={x} y={Y(l.startDepth)} width={COL} height={Math.max(0, Y(l.endDepth) - Y(l.startDepth))} fill={l.color} />
                  <rect x={x} y={Y(l.startDepth)} width={COL} height={Math.max(0, Y(l.endDepth) - Y(l.startDepth))} fill={patternFill(l.pattern)} />
                  {!forPrint && <rect className={selectedKey === key ? "hl" : "hl opacity-0"} x={x - 1.5} y={Y(l.startDepth) - 1} width={COL + 3} height={Math.max(0, Y(l.endDepth) - Y(l.startDepth)) + 2} fill="none" stroke="var(--primary)" strokeWidth="2" />}
                </g>
              );
            })}
            <rect x={x} y={TOP} width={COL} height={Math.max(0, Y(depth) - TOP)} fill="none" stroke="var(--foreground)" strokeWidth="1.4" pointerEvents="none" />
            {showWater && b.waterLevel != null && <path d={`M${x - 5} ${Y(b.waterLevel)}H${x + COL + 5}`} stroke="var(--water)" strokeWidth="2.5" pointerEvents="none" />}
            <text x={x + COL / 2} y={labelY} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)" paintOrder="stroke" stroke="var(--card)" strokeWidth="3">
              {(b.area.includes(",") ? b.area.split(",").pop()!.trim() : b.area) || b.borewellId}
            </text>
            <path d={`M${x + COL / 2} ${labelY + 4}V${TOP - 2}`} stroke="var(--input)" />
          </g>
        );
      })}
    </svg>
  );
}
