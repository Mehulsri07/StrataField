import { useState } from "react";
import { CircleMarker, useMapEvents } from "react-leaflet";
import type { Borewell } from "@strata/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BaseMap } from "./BaseMap";
import { BorewellPins } from "./BorewellPins";
import { text } from "@/text";

interface Point { latitude: number; longitude: number }

function ClickToPlace({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({ click: (e) => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }) });
  return null;
}

/** Choose a borewell's position by clicking on the map. Other borewells are shown faintly for reference. */
export function MapPicker({ open, initial, others, onClose, onPick }: {
  open: boolean;
  initial: Point | null;
  others: Borewell[];
  onClose: () => void;
  onPick: (p: Point) => void;
}) {
  const [point, setPoint] = useState<Point | null>(initial);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pick the borewell on the map</DialogTitle>
          <DialogDescription>Zoom in and click exactly where the borewell is. Click again to move it.</DialogDescription>
        </DialogHeader>
        <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-md border border-border">
          {open && (
            <BaseMap center={initial ? [initial.latitude, initial.longitude] : undefined} zoom={initial ? 16 : 12}>
              <BorewellPins borewells={others} faint />
              <ClickToPlace onPick={setPoint} />
              {point && (
                <CircleMarker
                  center={[point.latitude, point.longitude]}
                  radius={9}
                  pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#0d6883", fillOpacity: 1, className: "strata-pin-selected" }}
                />
              )}
            </BaseMap>
          )}
        </div>
        <DialogFooter>
          <span className="num mr-auto self-center text-sm text-muted-foreground">
            {point ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` : "No point chosen yet"}
          </span>
          <Button variant="outline" onClick={onClose}>{text.actions.cancel}</Button>
          <Button disabled={!point} onClick={() => point && onPick(point)}>Use this location</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
