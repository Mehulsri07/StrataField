import { useEffect, useRef, useState } from "react";
import { CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { Search } from "lucide-react";
import { placeFits, type Borewell, type Place, type PlaceHint } from "@strata/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { BaseMap } from "./BaseMap";
import { BorewellPins } from "./BorewellPins";
import { text } from "@/text";

/** `found` is the name of the searched place the point came from; absent when it was clicked on the map. */
interface Point { latitude: number; longitude: number; found?: string }

function ClickToPlace({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({ click: (e) => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }) });
  return null;
}

/**
 * A search box over the map: type a place, colony or road and choose from the matches. With
 * `tries`, it first searches each in turn (the address as written, other spellings, shorter parts)
 * and lists the matches of the first one that finds the place itself, not a loose match.
 */
function PlaceSearch({ initial, tries, onChoose }: { initial: string; tries?: string[]; onChoose: (p: Place) => void }) {
  const [query, setQuery] = useState(tries?.length ? "" : initial);
  const [places, setPlaces] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<string | null>(tries?.length ? "Searching for the address…" : null);
  /** The text put in the box by choosing a match, which must not start another search. */
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    if (!tries?.length) return;
    let stale = false;
    (async () => {
      for (const t of tries) {
        const found = await api.searchPlaces(t).then((all) => all.filter((p) => placeFits(t, p)), () => null);
        if (stale) return;
        if (found === null) { chosen.current = t; setQuery(t); setStatus("Searching for a place needs an internet connection. You can still click the spot on the map."); return; }
        if (found.length) { chosen.current = t; setQuery(t); setPlaces(found); setActive(0); setStatus(null); return; }
      }
      chosen.current = tries[0];
      setQuery(tries[0]);
      setStatus("Nothing on the map matches this address. Try a colony or road name, or click the spot on the map.");
    })();
    return () => { stale = true; };
    // Once per opening of the map: the picker is opened afresh for each borewell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === chosen.current) { setPlaces([]); setStatus(null); return; }
    let stale = false;
    // Wait for a pause in typing, and ignore answers to searches that have since been replaced.
    const timer = setTimeout(() => {
      setStatus("Searching…");
      api.searchPlaces(q).then(
        (found) => { if (!stale) { setPlaces(found); setActive(0); setStatus(found.length ? null : "No place found. Try the colony or area name, or click the spot on the map."); } },
        (e) => { if (!stale) { setPlaces([]); setStatus(String(e)); } },
      );
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  const choose = (p: Place) => {
    chosen.current = p.name;
    setQuery(p.name);
    setPlaces([]);
    onChoose(p);
  };

  return (
    <div className="absolute left-14 top-2.5 z-10 w-[min(24rem,calc(100%-4.5rem))]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          autoFocus
          role="combobox"
          aria-label="Search for a place"
          aria-expanded={places.length > 0}
          aria-controls="place-matches"
          aria-activedescendant={places.length ? `place-${active}` : undefined}
          autoComplete="off"
          className="bg-background pl-8 shadow-md"
          placeholder="Search for a place, colony or road"
          value={query}
          onChange={(e) => { chosen.current = null; setQuery(e.target.value); }}
          onKeyDown={(e) => {
            if (!places.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % places.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active + places.length - 1) % places.length); }
            else if (e.key === "Enter") { e.preventDefault(); choose(places[active]); }
            else if (e.key === "Escape") { e.stopPropagation(); setPlaces([]); }
          }}
        />
      </div>
      {places.length > 0 ? (
        <ul id="place-matches" role="listbox" aria-label="Matching places" className="mt-1 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md">
          {places.map((p, i) => (
            <li
              key={i} id={`place-${i}`} role="option" aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-accent" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <b className="font-medium">{p.name}</b>
              {p.detail && <span className="block truncate text-xs text-muted-foreground">{p.detail}</span>}
            </li>
          ))}
        </ul>
      ) : status && (
        <p role="status" className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-md">{status}</p>
      )}
    </div>
  );
}

/**
 * Choose a borewell's position: search for a place to jump there, then click the exact spot.
 * Other borewells are shown faintly for reference.
 */
export function MapPicker({ open, initial, search = "", tries, hint, others, heading, detail, onClose, onPick, onSkip }: {
  open: boolean;
  initial: Point | null;
  /** When borewells are placed one after another: whose turn it is, and a way to leave it for later. */
  heading?: string;
  detail?: string;
  onSkip?: () => void;
  /** What to search for as soon as the map opens, e.g. the address typed in the form. */
  search?: string;
  /** Searches to try in turn when the map opens (see `searchTries`); used instead of `search`. */
  tries?: string[];
  /** Borewells already placed at the same site or colony: the map opens on them. Only a view. */
  hint?: PlaceHint | null;
  others: Borewell[];
  onClose: () => void;
  onPick: (p: Point) => void;
}) {
  const [point, setPoint] = useState<Point | null>(initial);
  const map = useRef<LeafletMap | null>(null);
  // Opened on the remembered place: close enough to click a spot, or to see a whole site.
  const [[south, west], [north, east]] = hint?.bounds ?? [[0, 0], [0, 0]];
  const near = !initial && hint ? { center: [(south + north) / 2, (west + east) / 2] as [number, number], zoom: north - south < 0.004 && east - west < 0.004 ? 17 : 16 } : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{heading ?? "Pick the borewell on the map"}</DialogTitle>
          <DialogDescription>
            {detail && <span className="mb-1 block text-foreground">{detail}</span>}
            {near && hint
              ? <>The map shows the {hint.borewells.length === 1 ? "borewell" : `${hint.borewells.length} borewells`} already placed that mention “{hint.word}”. Click exactly where this one is: each borewell on a site is in a different spot. </>
              : "Search for a place to go there, then zoom in and click exactly where the borewell is. "}
            Click again to move it.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-md border border-border">
          {open && (
            <>
              <BaseMap center={initial ? [initial.latitude, initial.longitude] : near?.center} zoom={initial ? 16 : near?.zoom ?? 12} onReady={(m) => { map.current = m; }}>
                <BorewellPins borewells={others} faint />
                {near && hint?.borewells.map((b) => (
                  <CircleMarker key={b.id} center={[b.latitude!, b.longitude!]} radius={6} interactive={false} pathOptions={{ color: "#16202a", weight: 2, fill: false }}>
                    <Tooltip permanent direction="top" offset={[0, -6]}>{b.borewellId}</Tooltip>
                  </CircleMarker>
                ))}
                <ClickToPlace onPick={setPoint} />
                {point && (
                  <CircleMarker
                    center={[point.latitude, point.longitude]}
                    radius={9}
                    pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#0d6883", fillOpacity: 1, className: "strata-pin-selected" }}
                  />
                )}
              </BaseMap>
              <PlaceSearch
                initial={search}
                tries={initial ? undefined : tries}
                onChoose={(p) => {
                  setPoint({ latitude: p.latitude, longitude: p.longitude, found: [p.name, p.detail].filter(Boolean).join(", ") });
                  map.current?.setView([p.latitude, p.longitude], 17);
                }}
              />
            </>
          )}
        </div>
        <DialogFooter>
          <span className="num mr-auto self-center text-sm text-muted-foreground">
            {point ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}${point.found ? " · approximate, click the exact spot" : ""}` : "No point chosen yet"}
          </span>
          <Button variant="outline" onClick={onClose}>{onSkip ? "Stop for now" : text.actions.cancel}</Button>
          {onSkip && <Button variant="outline" onClick={onSkip}>Skip this one</Button>}
          <Button disabled={!point} onClick={() => point && onPick(point)}>Use this location</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
