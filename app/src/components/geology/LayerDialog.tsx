import type { ReactNode } from "react";
import type { Borewell, LithologyFamily, PipeSegment, StrataLayer } from "@strata/core";
import { describeLayer } from "@strata/core";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/app/Chip";
import { MaterialSwatch, PipeSwatch, patternFill } from "./patterns";
import { text } from "@/text";

const t = text.layer;

/** Colours used for estimated clay/sand/rock units between borewells in a cross-section. */
export const FAMILY_COLOURS: Record<LithologyFamily, string> = {
  CLAY: "#A0785A", SAND: "#D4B862", ROCK: "#7A7F85", OTHER: "#9AA4AD", NONE: "#C9CFD4",
};

/** What was clicked: a layer measured at a borewell, or an estimate drawn between two borewells. */
export type LayerSelection =
  | {
      kind: "measured";
      layer: StrataLayer;
      borewell: Borewell;
      strata: StrataLayer[];
      pipes: PipeSegment[];
    }
  | {
      kind: "estimated";
      family: LithologyFamily;
      /** "rough" when the borewells are far apart. */
      confidence: "estimate" | "rough";
      /** The borewells either side, and where each recorded this layer (null = not found there). */
      sides: [EstimateSide, EstimateSide];
      distanceKm: number;
    };

export interface EstimateSide {
  borewell: Borewell;
  top: number | null;
  bottom: number | null;
}

/**
 * The layer popup: opens when a layer is clicked in a borewell drawing, layer list, layer strip or
 * cross-section, and explains what that layer is, where it is, and how sure we are about it.
 */
export function LayerDialog({
  selection, onClose, onOpenBorewell, onEditLayers,
}: {
  selection: LayerSelection | null;
  onClose: () => void;
  onOpenBorewell?: (borewellId: string) => void;
  onEditLayers?: (borewellId: string) => void;
}) {
  return (
    <Dialog open={!!selection} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {selection?.kind === "measured" && <Measured s={selection} onOpenBorewell={onOpenBorewell} onEditLayers={onEditLayers} />}
        {selection?.kind === "estimated" && <Estimated s={selection} onOpenBorewell={onOpenBorewell} />}
      </DialogContent>
    </Dialog>
  );
}

function Measured({ s, onOpenBorewell, onEditLayers }: {
  s: Extract<LayerSelection, { kind: "measured" }>;
  onOpenBorewell?: (id: string) => void;
  onEditLayers?: (id: string) => void;
}) {
  const { layer, borewell: b } = s;
  const f = describeLayer(layer, { strata: s.strata, pipes: s.pipes, waterLevel: b.waterLevel });
  const wl = b.waterLevel;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <MaterialSwatch color={layer.color} pattern={layer.pattern} size={32} className="rounded-md" />
          <div className="min-w-0">
            <DialogTitle className="font-heading text-xl">{layer.material}</DialogTitle>
            <DialogDescription>
              {t.position(f.position, f.count)} · {t.fromBorewell(b.borewellId, b.area)}
            </DialogDescription>
          </div>
          <Chip tone={f.notRecorded ? "neutral" : "ok"} className="ml-auto self-start">
            {f.notRecorded ? t.notRecorded : t.measured}
          </Chip>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_56px] gap-5">
        <dl className="grid content-start gap-3 text-sm">
          <Fact label={t.depth}>
            <span className="num">{t.depthValue(layer.startDepth, layer.endDepth)}</span>
            <span className="num ml-2 text-muted-foreground">({t.metres(f.startM, f.endM)})</span>
          </Fact>
          <Fact label={t.thickness}>
            <span className="num">{t.feet(f.thickness)}</span>
            <span className="num ml-2 text-muted-foreground">({t.metresShort(f.thicknessM)})</span>
          </Fact>
          {f.notRecorded ? (
            <p className="text-muted-foreground">{t.notRecordedBody}</p>
          ) : (
            <>
              {f.family && <Fact label={t.soilGroup}>{t.groups[f.family] ?? f.family}</Fact>}
              <Fact label={t.water}>
                {f.water === "below" && wl != null && t.waterBelow(wl)}
                {f.water === "above" && wl != null && t.waterAbove(wl)}
                {f.water === "contains" && wl != null && <span className="font-medium text-water">{t.waterInside(wl)}</span>}
                {f.water === "unknown" && <span className="text-muted-foreground">{t.waterUnknown}</span>}
              </Fact>
              <Fact label={t.holdsWater}>{layer.waterBearing ? t.holdsWaterYes : <span className="text-muted-foreground">{t.holdsWaterNo}</span>}</Fact>
            </>
          )}
          <Fact label={t.pipeHere}>
            {f.pipes.length === 0 ? (
              <span className="text-muted-foreground">{t.noPipe}</span>
            ) : (
              <ul className="grid gap-1">
                {f.pipes.map((p) => (
                  <li key={p.from} className="flex items-center gap-2">
                    <PipeSwatch kind={p.kind} />
                    {p.kind === "plain" ? t.plainPipeRange(p.from, p.to) : t.screenPipeRange(p.from, p.to)}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
          {layer.remarks && <Fact label={t.notes}>{layer.remarks}</Fact>}
        </dl>
        <MiniColumn strata={s.strata} selectedId={layer.id} totalDepth={b.totalDepth} waterLevel={wl} />
      </div>

      {(onOpenBorewell || onEditLayers) && (
        <DialogFooter>
          {onEditLayers && <Button variant="outline" onClick={() => onEditLayers(b.id)}>{t.editLayers}</Button>}
          {onOpenBorewell && <Button onClick={() => onOpenBorewell(b.id)}>{t.openBorewell}</Button>}
        </DialogFooter>
      )}
    </>
  );
}

function Estimated({ s, onOpenBorewell }: { s: Extract<LayerSelection, { kind: "estimated" }>; onOpenBorewell?: (id: string) => void }) {
  const group = t.groups[s.family] ?? s.family;
  const [a, b] = s.sides;
  const found = (side: EstimateSide) => side.top != null && side.bottom != null;
  const place = (side: EstimateSide) => side.borewell.area || side.borewell.borewellId;
  const range = (side: EstimateSide) => (found(side) ? `${place(side)} (${side.top}–${side.bottom} ft)` : place(side));
  const pinch = !found(a) || !found(b);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <svg width="32" height="32" className="shrink-0 rounded-md" aria-hidden="true">
            <rect width="32" height="32" fill={FAMILY_COLOURS[s.family]} fillOpacity={s.confidence === "rough" ? 0.35 : 0.6} />
            <path d="M0 31H32" stroke="var(--foreground)" strokeDasharray={s.confidence === "rough" ? "1.5 4" : "6 4"} />
          </svg>
          <div className="min-w-0">
            <DialogTitle className="font-heading text-xl">{t.estimateTitle(group)}</DialogTitle>
            <DialogDescription>{a.borewell.borewellId} ↔ {b.borewell.borewellId}</DialogDescription>
          </div>
          <Chip tone={s.confidence === "rough" ? "warn" : "accent"} className="ml-auto self-start">
            {s.confidence === "rough" ? t.roughEstimate : t.estimate}
          </Chip>
        </div>
      </DialogHeader>

      <div className="grid gap-3 text-sm">
        <p>
          {pinch
            ? t.pinchBody(range(found(a) ? a : b), place(found(a) ? b : a))
            : t.estimateBody(range(a), range(b))}
        </p>
        {s.confidence === "rough" && <p className="text-warn">{t.roughBody}</p>}
        <dl className="grid gap-3">
          {[a, b].map((side) => (
            <Fact key={side.borewell.id} label={t.atBorewell(place(side))}>
              {found(side) ? <span className="num">{t.depthValue(side.top!, side.bottom!)}</span> : <span className="text-muted-foreground">{t.notFoundHere}</span>}
            </Fact>
          ))}
          <Fact label={t.distanceApart}><span className="num">{t.km(s.distanceKm)}</span></Fact>
        </dl>
      </div>

      {onOpenBorewell && (
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-muted-foreground">{t.basedOn}:</span>
          {[a, b].map((side) => (
            <Button key={side.borewell.id} variant="outline" onClick={() => onOpenBorewell(side.borewell.id)}>
              {side.borewell.borewellId}
            </Button>
          ))}
        </DialogFooter>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A thin column of the whole borewell with the chosen layer outlined, so its place is obvious. */
function MiniColumn({ strata, selectedId, totalDepth, waterLevel }: {
  strata: StrataLayer[]; selectedId: string; totalDepth: number | null; waterLevel: number | null;
}) {
  const H = 220, W = 22, top = 4;
  const depth = totalDepth || Math.max(1, ...strata.map((l) => l.endDepth));
  const y = (d: number) => top + (d / depth) * H;
  const sel = strata.find((l) => l.id === selectedId);
  return (
    <figure className="grid justify-items-center gap-1">
      <svg width={W + 20} height={H + top * 2} role="img" aria-label={t.whereInBorewell}>
        {strata.map((l) => (
          <g key={l.id} opacity={l.id === selectedId ? 1 : 0.45}>
            <rect x="10" y={y(l.startDepth)} width={W} height={Math.max(0, y(l.endDepth) - y(l.startDepth))} fill={l.color} />
            <rect x="10" y={y(l.startDepth)} width={W} height={Math.max(0, y(l.endDepth) - y(l.startDepth))} fill={patternFill(l.pattern)} />
          </g>
        ))}
        <rect x="10" y={top} width={W} height={H} fill="none" stroke="var(--input)" />
        {sel && (
          <rect x="7" y={y(sel.startDepth) - 1} width={W + 6} height={y(sel.endDepth) - y(sel.startDepth) + 2} fill="none" stroke="var(--primary)" strokeWidth="2.5" rx="2" />
        )}
        {waterLevel != null && <path d={`M4 ${y(waterLevel)}H${W + 16}`} stroke="var(--water)" strokeWidth="2" strokeDasharray="4 2" />}
      </svg>
      <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">{t.whereInBorewell}</figcaption>
    </figure>
  );
}
