/**
 * Making files to share: PDF reports, Excel workbooks and pictures of the borewell drawing.
 * Everything is built on this computer; nothing is uploaded.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Borewell, BorewellRecord } from "@strata/core";
import { kmBetween } from "@strata/core";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import logoUrl from "@/assets/letterhead-logo.jpg";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { PatternDefs } from "@/components/geology/patterns";
import { api, isPreview } from "./api";
import { columnPipeText, formatDate, pumpText, zoneName } from "./format";

// Light-theme colours for anything printed or saved: files are read outside the app's theme.
const PRINT_COLOURS: Record<string, string> = {
  "--foreground": "#16202a", "--muted-foreground": "#5a6774", "--input": "#b9c3cc", "--muted": "#f5f7f9",
  "--pattern-ink": "rgba(20,24,28,0.28)", "--pipe-plain": "#d3d9df", "--pipe-screen": "#3d5f9e", "--pipe-slot": "#ffffff",
  "--water": "#1a86e8", "--primary": "#0d6883", "--card": "#ffffff",
};

/** Makes on-screen SVG markup standalone: namespace, patterns, a white page, fixed colours and font. */
export function printableSvg(markup: string): string {
  const defs = renderToStaticMarkup(<PatternDefs />).match(/<defs>([\s\S]*)<\/defs>/)?.[1] ?? "";
  let svg = markup.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" `);
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>text{font-family:Helvetica,Arial,sans-serif}</style><rect width="100%" height="100%" fill="#ffffff"/><defs>${defs}</defs>`);
  return svg.replace(/var\((--[a-z-]+)\)/g, (_, name: string) => PRINT_COLOURS[name] ?? "#000000");
}

/** The borewell drawing as a standalone SVG with fixed colours and fonts. */
export function drawingSvg(r: BorewellRecord): string {
  return printableSvg(renderToStaticMarkup(<BorewellProfile borewell={r.borewell} strata={r.strata} pipes={r.pipes} height={450} forPrint />));
}

/** Renders standalone SVG to a PNG. `scale` 2 gives a sharp image for printing. */
export async function svgToPng(svg: string, scale = 2): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const [, vw, vh] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((ok) => canvas.toBlob((b) => ok(b!), "image/png"));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: vw, height: vh };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const drawingPng = (r: BorewellRecord, scale = 2) => svgToPng(drawingSvg(r), scale);

// ── PDF ──────────────────────────────────────────────────────────────────

const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin
const INK = rgb(0.086, 0.125, 0.165), QUIET = rgb(0.353, 0.404, 0.455), LINE = rgb(0.835, 0.863, 0.886), ACCENT = rgb(0.051, 0.408, 0.514);
const METHOD: Record<string, string> = { ROTARY: "Rotary", DTH: "DTH (down-the-hole)", MANUAL: "Manual", UNKNOWN: "Not known" };
const LOCATION: Record<string, string> = { gps: "from GPS", photo: "from a photo's GPS", map: "picked on the map", typed: "typed in", address: "approximate, from the address", imported: "from an Excel file", unknown: "" };

const PIPE_LENGTH_FT = 10;
const MAX_MAPS = 20;

type TileCache = Map<string, Promise<HTMLImageElement | null>>;

/** One map picture from the online street map, or null if it does not arrive (no internet, or too slow). */
function tile(z: number, x: number, y: number, cache: TileCache) {
  const key = `${z}/${x}/${y}`;
  let got = cache.get(key);
  if (!got) {
    got = new Promise<HTMLImageElement | null>((done) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // so the canvas it is drawn on can be saved
      img.onload = () => done(img);
      img.onerror = () => done(null);
      setTimeout(() => done(null), 6000);
      img.src = `https://tile.openstreetmap.org/${key}.png`;
    });
    cache.set(key, got);
  }
  return got;
}

/**
 * A street map centred on a place with a dot on it, `width` by `height` points, as PNG bytes.
 * Null when the map cannot be fetched; the report is then made without it.
 */
async function mapPng(lat: number, lon: number, width: number, height: number, cache: TileCache, zoom = 16): Promise<Uint8Array | null> {
  if (isPreview) return null;
  const W = Math.round(width * 2), H = Math.round(height * 2), T = 256, n = 2 ** zoom;
  // Where the place is on the world map at this zoom, in pixels (web Mercator).
  const cx = ((lon + 180) / 360) * n * T;
  const rad = (lat * Math.PI) / 180;
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * T;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  const jobs: Promise<boolean>[] = [];
  for (let tx = Math.floor(x0 / T); tx * T < x0 + W; tx++) for (let ty = Math.floor(y0 / T); ty * T < y0 + H; ty++) {
    jobs.push(tile(zoom, tx, ty, cache).then((img) => { if (img) g.drawImage(img, Math.round(tx * T - x0), Math.round(ty * T - y0)); return !!img; }));
  }
  if (!(await Promise.all(jobs)).every(Boolean)) return null;
  g.beginPath(); g.arc(W / 2, H / 2, 11, 0, 2 * Math.PI); g.fillStyle = "#0d6883"; g.fill();
  g.lineWidth = 5; g.strokeStyle = "#ffffff"; g.stroke();
  try {
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null; // the map server did not allow its pictures to be copied
  }
}

/** What is printed across the top of a report: who made it. Any part may be empty. */
export interface Letterhead {
  name: string; address: string; contact: string;
  /** A registration number such as the GSTIN, and the line printed at the foot of each page. */
  taxId: string; tagline: string;
  /** Print the company's logo, which carries its name, in place of the name in words. */
  logo: boolean;
}
export const LETTERHEAD_KEY = "report-letterhead";
/** Used until something else is saved in Settings: the letterhead of Drinking Water Organisation. */
export const DEFAULT_LETTERHEAD: Letterhead = {
  name: "Drinking Water Organisation", address: "509, Laxmanpuri Extension, Indira Nagar, Lucknow", contact: "9335249074, 9532888668",
  taxId: "GSTIN 09AMYPS9135J1ZX", tagline: "Sustaining Life Through Water.", logo: true,
};
/** A letterhead saved before a part existed has that part empty, not the default's. */
export const letterheadFrom = (saved: Partial<Letterhead> | null | undefined): Letterhead =>
  saved ? { name: "", address: "", contact: "", taxId: "", tagline: "", logo: false, ...saved } : DEFAULT_LETTERHEAD;
const LOGO_SHAPE = 867 / 296, TEAL = rgb(0.145, 0.486, 0.639), BLUE = rgb(0, 0.439, 0.753);
const NEARBY_KM = 1, NEARBY_MOST = 5;

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  /** `header` is the small line at the top left of every page, after "StrataField". */
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private title: string,
    readonly size: [number, number] = A4, private header = "Borewell report", private letterhead: Letterhead | null = null, private logo: PDFImage | null = null) {}

  newPage() {
    this.page = this.doc.addPage(this.size);
    this.pages.push(this.page);
    this.y = this.size[1] - M;
    const lh = this.letterhead;
    // The first page of a report carries the maker's letterhead when one is set in Settings.
    const lines = lh ? [lh.address, lh.contact, lh.taxId].filter(Boolean) : [];
    if (lh && this.pages.length === 1 && (lh.name || this.logo || lines.length)) {
      // As on the printed letterhead: the logo (or the name) on the left, the address lines on the right.
      const right = this.size[0] - M, top = this.size[1] - M + 8, H = 52;
      if (this.logo) this.page.drawImage(this.logo, { x: M, y: top - H, width: H * LOGO_SHAPE, height: H });
      else if (lh.name) this.text(this.fit(lh.name, 280, 17, true), M, top - 34, 17, INK, true);
      lines.forEach((line, i) => {
        const t = this.fit(line, 250, 10);
        this.text(t, right - this.font.widthOfTextAtSize(t, 10), top - 14 - i * 14 - (3 - lines.length) * 7, 10, TEAL);
      });
      this.y = top - H - 8;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: right, y: this.y }, thickness: 1.2, color: TEAL });
      this.y -= 24;
      return;
    }
    this.text(`StrataField · ${this.header}`, M, this.y, 8, QUIET);
    this.text(this.title, this.size[0] - M - this.font.widthOfTextAtSize(this.title, 8), this.y, 8, QUIET);
    this.y -= 22;
  }
  /** Starts a new page if fewer than `need` points are left. */
  room(need: number) {
    if (this.y - need < M + 24) this.newPage();
  }
  text(s: string, x: number, y: number, size = 9.5, colour = INK, useBold = false) {
    this.page.drawText(safe(s), { x, y, size, font: useBold ? this.bold : this.font, color: colour });
  }
  fit(s: string, width: number, size = 9.5, useBold = false) {
    const f = useBold ? this.bold : this.font;
    let out = safe(s);
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > width) out = out.slice(0, -2) + "…";
    return out;
  }
  /** The text over at most two lines of `width`; what does not fit on the second is cut short. */
  wrap(s: string, width: number, size = 9.5, useBold = false): string[] {
    const f = useBold ? this.bold : this.font;
    const words = safe(s).split(" ");
    let first = "";
    while (words.length && f.widthOfTextAtSize(first ? `${first} ${words[0]}` : words[0], size) <= width) first = first ? `${first} ${words.shift()}` : words.shift()!;
    if (!first) return [this.fit(s, width, size, useBold)];
    return words.length ? [first, this.fit(words.join(" "), width, size, useBold)] : [first];
  }
  rule(y = this.y) {
    this.page.drawLine({ start: { x: M, y }, end: { x: this.size[0] - M, y }, thickness: 0.6, color: LINE });
  }
  /**
   * A simple table with a heading row; continues on a new page when it runs out of room.
   * `left` is where it starts, for a table that sits beside another.
   */
  table(heading: string, cols: { label: string; width: number; right?: boolean }[], rows: string[][], left = M) {
    this.room(60);
    this.text(heading, left, this.y, 11, INK, true);
    this.y -= 16;
    const width = cols.reduce((sum, c) => sum + c.width, 0);
    const head = () => {
      let x = left;
      for (const c of cols) {
        const w = this.bold.widthOfTextAtSize(c.label, 8);
        this.text(c.label, c.right ? x + c.width - w - 6 : x, this.y, 8, QUIET, true);
        x += c.width;
      }
      this.y -= 5;
      this.page.drawLine({ start: { x: left, y: this.y }, end: { x: left + width, y: this.y }, thickness: 0.6, color: LINE });
      this.y -= 12;
    };
    head();
    for (const row of rows) {
      if (this.y < M + 36) { this.newPage(); head(); }
      let x = left;
      row.forEach((cell, i) => {
        const c = cols[i];
        const t = this.fit(cell, c.width - 8);
        const w = this.font.widthOfTextAtSize(t, 9);
        this.text(t, c.right ? x + c.width - w - 6 : x, this.y, 9);
        x += c.width;
      });
      this.y -= 14;
    }
    if (!rows.length) { this.text("None recorded.", left, this.y, 9, QUIET); this.y -= 14; }
    this.y -= 10;
  }
}

/** Characters the built-in PDF font cannot draw are replaced so a report never fails to save. */
function safe(s: string) {
  return s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
}

/** One or more borewells as a PDF: details, the drawing, layers, pipes and water readings. */
/** `onProgress` is told which borewell (counting from 1) is being drawn, for a long report. */
export async function buildReport(records: BorewellRecord[], onProgress?: (n: number) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(records.length === 1 ? `${records[0].borewell.borewellId} borewell report` : "Borewell reports");
  doc.setCreator("StrataField");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // A map for each borewell is only fetched for a short report: hundreds of them would be slow and
  // more than the map server allows.
  const tiles: TileCache = new Map();
  const withMaps = records.length <= MAX_MAPS;
  const letterhead = letterheadFrom(await api.settings.get<Partial<Letterhead>>(LETTERHEAD_KEY).catch(() => null));
  const logo = letterhead.logo ? await fetch(logoUrl).then((got) => got.arrayBuffer()).then((bytes) => doc.embedJpg(bytes)).catch(() => null) : null;
  // For "Nearby borewells": every other borewell with a location. Left out of a long report.
  const others = withMaps ? (await api.borewells.search({}).catch(() => [])).map((i) => i.borewell).filter((o) => o.latitude != null && o.longitude != null) : [];

  for (const [n, r] of records.entries()) {
    onProgress?.(n + 1);
    const b = r.borewell;
    const lowered = b.date ? formatDate(b.date) : "";
    const w = new Writer(doc, font, bold, b.borewellId, A4, lowered ? `Borewell report · tubewell lowered ${lowered}` : "Borewell report", letterhead, logo);
    w.newPage();
    w.text(w.fit(`${b.borewellId}${b.ownerName ? ` · ${b.ownerName}` : ""}`, A4[0] - 2 * M, 18, true), M, w.y, 18, INK, true);
    w.y -= 16;
    w.text(w.fit([zoneName(b.project), [b.area, b.city].filter(Boolean).join(", "), b.date && `tubewell lowered ${formatDate(b.date)}`].filter(Boolean).join(" · "), A4[0] - 2 * M), M, w.y, 10, QUIET);
    w.y -= 14;
    w.rule();
    w.y -= 18;

    // Details on the left, drawing on the right.
    const top = w.y;
    const png = await drawingPng(r);
    const image = await doc.embedPng(png.bytes);
    const drawW = 250, drawH = (png.height / png.width) * drawW;
    w.page.drawImage(image, { x: A4[0] - M - drawW, y: top - drawH + 6, width: drawW, height: drawH });

    const ft = (v: number | null) => (v == null ? "—" : `${v} ft`);
    const inch = (v: number | null) => (v == null ? "—" : `${v}"`);
    // The pipe goes down in 10 ft lengths, so the count is the tubewell's depth in tens, rounded up.
    const tubewell = Math.max(0, ...r.pipes.map((p) => p.endDepth));
    const located = b.latitude != null && b.longitude != null;
    // Short facts sit two to a row; long ones take a whole row.
    const facts: [string, string, boolean?][] = [
      ["Total depth", ft(b.totalDepth)],
      ["Water level", ft(b.waterLevel)],
      ...(b.dynamicWaterLevel != null ? [["Water level while pumping", ft(b.dynamicWaterLevel)] as [string, string]] : []),
      ["Hole size / pipe size", `${inch(b.boreDia)} / ${inch(b.pipeDia)}`],
      ["Drilling method", b.drillingMethod ? METHOD[b.drillingMethod] : "—"],
      ["Tubewell lowering date", lowered || "—"],
      ["Zone", zoneName(b.project)],
      ["Pipe pieces (10 ft each)", tubewell > 0 ? `${Math.ceil(tubewell / PIPE_LENGTH_FT)}` : "—"],
      ...(b.pumpLowering != null ? [["Pump lowered to", ft(b.pumpLowering)] as [string, string]] : []),
      ...(columnPipeText(b) ? [["Column pipe", columnPipeText(b)] as [string, string]] : []),
      ...(pumpText(b) ? [["Pump", pumpText(b), true] as [string, string, boolean]] : []),
      ["Owner", b.ownerName || "—", true],
      ["Address", [b.houseNo, b.address, b.area, b.city].filter(Boolean).join(", ") || "—", true],
      ["GPS location", located ? `${b.latitude!.toFixed(5)}, ${b.longitude!.toFixed(5)}${LOCATION[b.locationSource] ? ` (${LOCATION[b.locationSource]})` : ""}` : "Not recorded", true],
    ];
    const LEFT = 250, HALF = LEFT / 2;
    let col = 0;
    for (const [k, v, wide] of facts) {
      if (wide && col === 1) { w.y -= 28; col = 0; }
      const x = M + col * HALF;
      w.text(k, x, w.y, 8, QUIET);
      const lines = wide ? w.wrap(v, LEFT - 10, 10.5, true) : [w.fit(v, HALF - 10, 10.5, true)];
      lines.forEach((line, i) => w.text(line, x, w.y - 12 - i * 13, 10.5, INK, true));
      if (wide || col === 1) { w.y -= 28 + (lines.length - 1) * 13; col = 0; } else col = 1;
    }
    if (col === 1) w.y -= 28;
    if (b.remarks) {
      w.text("Notes", M, w.y, 8, QUIET);
      w.text(w.fit(b.remarks, LEFT), M, w.y - 12, 10);
      w.y -= 28;
    }
    // A small map of where the borewell is, in the room left beside the drawing.
    const mapH = Math.min(190, w.y - (top - drawH) - 14);
    const map = withMaps && located && mapH >= 80 ? await mapPng(b.latitude!, b.longitude!, LEFT - 10, mapH, tiles) : null;
    if (map) {
      const mapY = w.y - mapH + 6;
      w.page.drawImage(await doc.embedPng(map), { x: M, y: mapY, width: LEFT - 10, height: mapH });
      w.page.drawRectangle({ x: M, y: mapY, width: LEFT - 10, height: mapH, borderColor: LINE, borderWidth: 0.6 });
      w.text("Map © OpenStreetMap contributors", M, mapY - 9, 6.5, QUIET);
      w.y = mapY - 12;
    }
    w.y = Math.min(w.y, top - drawH) - 16;

    const num = (v: number) => String(Math.round(v * 10) / 10);
    const pipeRows = r.pipes.map((p) => [num(p.startDepth), num(p.endDepth), num(p.endDepth - p.startDepth), p.pipeType === "slotted" ? "Screen pipe (water enters)" : "Plain pipe", String(p.diameter ?? b.pipeDia ?? "—")]);
    // With no notes to show and room on the page, the layers and the pipes sit side by side, which
    // usually keeps the whole report on one sheet. Otherwise one follows the other at full width.
    const plain = r.strata.every((l) => !l.remarks && !l.waterBearing);
    const tallest = Math.max(r.strata.length, r.pipes.length, 1) * 14 + 43;
    if (plain && w.y - tallest > M + 24) {
      const start = w.y, half = (A4[0] - 2 * M - 20) / 2;
      w.table("Soil layers", [
        { label: "From (ft)", width: 50, right: true }, { label: "To (ft)", width: 45, right: true }, { label: "Thickness (ft)", width: 70, right: true }, { label: "Soil type", width: half - 165 },
      ], r.strata.map((l) => [num(l.startDepth), num(l.endDepth), num(l.endDepth - l.startDepth), l.material]));
      const afterLayers = w.y;
      w.y = start;
      w.table("Pipes", [
        { label: "From (ft)", width: 42, right: true }, { label: "To (ft)", width: 38, right: true }, { label: "Length (ft)", width: 52, right: true }, { label: "Type", width: half - 180 }, { label: "Size (inch)", width: 48, right: true },
      ], pipeRows.map((row) => row.map((cell) => cell.replace(" (water enters)", ""))), M + half + 20);
      w.y = Math.min(w.y, afterLayers);
    } else {
      w.table("Soil layers", [
        { label: "From (ft)", width: 60, right: true }, { label: "To (ft)", width: 60, right: true },
        { label: "Thickness (ft)", width: 80, right: true }, { label: "Soil type", width: 130 }, { label: "Holds water", width: 70 }, { label: "Notes", width: A4[0] - 2 * M - 400 },
      ], r.strata.map((l) => [num(l.startDepth), num(l.endDepth), num(l.endDepth - l.startDepth), l.material, l.waterBearing ? "Yes" : "", l.remarks]));
      w.table("Pipes", [
        { label: "From (ft)", width: 60, right: true }, { label: "To (ft)", width: 60, right: true },
        { label: "Length (ft)", width: 80, right: true }, { label: "Type", width: 200 }, { label: "Size (inch)", width: 80, right: true },
      ], pipeRows);
    }

    if (r.waterReadings.length) {
      w.table("Water readings", [
        { label: "Measured on", width: 120 }, { label: "Water level (ft)", width: 110, right: true }, { label: "While pumping (ft)", width: 120, right: true }, { label: "Notes", width: A4[0] - 2 * M - 350 },
      ], r.waterReadings.map((x) => [formatDate(x.measuredOn), x.staticLevel == null ? "—" : String(x.staticLevel), x.dynamicLevel == null ? "—" : String(x.dynamicLevel), x.remarks || x.source]));
    }

    if (located) {
      const near = others.filter((o) => o.id !== b.id)
        .map((o) => ({ o, km: kmBetween(b.latitude!, b.longitude!, o.latitude!, o.longitude!) }))
        .filter((n) => n.km <= NEARBY_KM).sort((x, y) => x.km - y.km).slice(0, NEARBY_MOST);
      if (near.length) {
        w.table(`Nearby borewells (within ${NEARBY_KM} km)`, [
          { label: "Borewell", width: 130 }, { label: "Owner", width: 150 }, { label: "Away", width: 60, right: true },
          { label: "Total depth (ft)", width: 85, right: true }, { label: "Water level (ft)", width: 85, right: true },
        ], near.map(({ o, km }) => [o.borewellId, o.ownerName || "—", km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`, o.totalDepth == null ? "—" : String(o.totalDepth), o.waterLevel == null ? "—" : String(o.waterLevel)]));
      }
    }

    // Lines to sign, as on a drilling log: the client on the left, the driller on the right.
    if (w.y - 37 < M + 12) w.newPage(); // the lines and their labels need 37 points above the footer
    w.y -= 26;
    for (const [label, x] of [["Client", M], ["Driller", A4[0] - M - 170]] as const) {
      w.page.drawLine({ start: { x, y: w.y }, end: { x: x + 170, y: w.y }, thickness: 0.6, color: QUIET });
      w.text(label, x, w.y - 11, 8, QUIET);
    }
    w.y -= 20;

    w.pages.forEach((p, i) => {
      const foot = `Made with StrataField.${lowered ? ` Tubewell lowered on ${lowered}.` : ""} Layer depths are as recorded at the borewell.`;
      p.drawText(safe(foot), { x: M, y: M - 8, size: 7.5, font, color: QUIET });
      const n = `Page ${i + 1} of ${w.pages.length}`;
      p.drawText(n, { x: A4[0] - M - font.widthOfTextAtSize(n, 7.5), y: M - 8, size: 7.5, font, color: QUIET });
      p.drawLine({ start: { x: M, y: M + 4 }, end: { x: A4[0] - M, y: M + 4 }, thickness: 0.6, color: ACCENT, opacity: 0.4 });
      if (letterhead.tagline) {
        const line = safe(`\u201C${letterhead.tagline.replace(/^["\u201C]|["\u201D]$/g, "")}\u201D`);
        p.drawText(line, { x: (A4[0] - bold.widthOfTextAtSize(line, 8.5)) / 2, y: M + 10, size: 8.5, font: bold, color: BLUE });
      }
    });
  }
  return doc.save();
}

/** What a cross-section PDF needs: the drawing, the line, and the borewells used along it. */
export interface SectionReport {
  name: string;
  /** The drawing as the screen shows it (for print), from `renderToStaticMarkup(<SectionDrawing forPrint />)`. */
  drawingMarkup: string;
  line: [number, number][];
  lengthKm: number;
  corridorKm: number;
  /** Borewells near the line, and how many of them the drawing shows. */
  nearby: number;
  borewells: { borewell: Borewell; alongKm: number; offsetKm: number; layers: number }[];
}

const A4_LANDSCAPE: [number, number] = [A4[1], A4[0]];

/** A cross-section as a PDF: the drawing with its key, what the line is, and the borewells used. */
export async function buildSectionPdf(r: SectionReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.name} cross-section`);
  doc.setCreator("StrataField");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const made = formatDate(new Date().toISOString());
  const [W] = A4_LANDSCAPE;
  const w = new Writer(doc, font, bold, r.name, A4_LANDSCAPE, "Cross-section");
  const km = (v: number) => `${v.toFixed(1)} km`;

  w.newPage();
  w.text(w.fit(r.name, W - 2 * M, 18, true), M, w.y, 18, INK, true);
  w.y -= 16;
  const bends = r.line.length - 2;
  const shown = r.borewells.length;
  w.text(w.fit([
    `Line A to A' ${km(r.lengthKm)}${bends > 0 ? ` with ${bends} bend${bends === 1 ? "" : "s"} (distances along the line)` : ""}`,
    `borewells within ${r.corridorKm} km of the line`,
    shown < r.nearby ? `${shown} of ${r.nearby} nearby borewells shown (the closest to the line)` : `${shown} borewell${shown === 1 ? "" : "s"}`,
  ].join(" · "), W - 2 * M), M, w.y, 10, QUIET);
  w.y -= 14;
  w.rule();
  w.y -= 10;

  const png = await svgToPng(printableSvg(r.drawingMarkup), 2);
  const image = await doc.embedPng(png.bytes);
  const drawW = W - 2 * M, drawH = Math.min((png.height / png.width) * drawW, w.y - M - 90);
  const fitW = (png.width / png.height) * drawH;
  w.page.drawImage(image, { x: M + (drawW - fitW) / 2, y: w.y - drawH, width: fitW, height: drawH });
  w.y -= drawH + 16;

  // Key, in words (the colours are the ones on the screen).
  const key = [
    "Coloured columns: layers measured at a borewell.",
    "Faded bands between columns: estimates (dashed edge: borewells within 2.5 km; dotted: 2.5 to 5 km apart).",
    "Hatched: not enough borewells to say.  Blue line: water level.",
  ];
  for (const k of key) { w.text(w.fit(k, W - 2 * M, 8.5), M, w.y, 8.5, QUIET); w.y -= 12; }

  w.newPage();
  w.table("Borewells along the line, from A to A'", [
    { label: "#", width: 30, right: true }, { label: "Borewell ID", width: 110 }, { label: "Area", width: 170 },
    { label: "From A (km)", width: 80, right: true }, { label: "Off the line (km)", width: 100, right: true },
    { label: "Total depth (ft)", width: 95, right: true }, { label: "Water level (ft)", width: 95, right: true },
    { label: "Layers", width: W - 2 * M - 680, right: true },
  ], r.borewells.map((b, i) => [
    String(i + 1), b.borewell.borewellId, [b.borewell.area, b.borewell.city].filter(Boolean).join(", "),
    b.alongKm.toFixed(2), Math.abs(b.offsetKm).toFixed(2),
    b.borewell.totalDepth == null ? "—" : String(b.borewell.totalDepth), b.borewell.waterLevel == null ? "—" : String(b.borewell.waterLevel),
    String(b.layers),
  ]));
  w.table("The line", [{ label: "Point", width: 80 }, { label: "Latitude", width: 110, right: true }, { label: "Longitude", width: 110, right: true }],
    r.line.map((p, i) => [i === 0 ? "A" : i === r.line.length - 1 ? "A'" : `Bend ${i}`, p[0].toFixed(5), p[1].toFixed(5)]));

  w.pages.forEach((p, i) => {
    const foot = `Made with StrataField on ${made}. Only the coloured columns are measured; everything between them is an estimate.`;
    p.drawText(safe(foot), { x: M, y: M - 8, size: 7.5, font, color: QUIET });
    const n = `Page ${i + 1} of ${w.pages.length}`;
    p.drawText(n, { x: W - M - font.widthOfTextAtSize(n, 7.5), y: M - 8, size: 7.5, font, color: QUIET });
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.6, color: ACCENT, opacity: 0.4 });
  });
  return doc.save();
}

// ── Saving ───────────────────────────────────────────────────────────────

/**
 * Asks where to save and writes the file. Resolves to the saved path, or null if the user cancelled.
 */
export async function saveFile(suggestedName: string, kind: "pdf" | "excel" | "png", bytes: Uint8Array): Promise<string | null> {
  if (isPreview) throw new Error("Saving files works in the StrataField app, not in the browser preview.");
  const filters = {
    pdf: [{ name: "PDF report", extensions: ["pdf"] }],
    excel: [{ name: "Excel workbook", extensions: ["xlsx"] }],
    png: [{ name: "Picture", extensions: ["png"] }],
  }[kind];
  // The end-to-end test stands in for the Save dialog, only in builds made for it.
  const testSave = import.meta.env.VITE_E2E === "1" ? (window as { __STRATA_TEST_SAVE__?: (name: string) => string | null }).__STRATA_TEST_SAVE__ : undefined;
  // ...and can take the file's bytes itself, to look at what would have been saved.
  const testKeep = import.meta.env.VITE_E2E === "1" ? (window as { __STRATA_TEST_KEEP__?: (bytes: Uint8Array) => void }).__STRATA_TEST_KEEP__ : undefined;
  if (testKeep) { testKeep(bytes); return suggestedName; }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = testSave ? testSave(suggestedName) : await save({ defaultPath: suggestedName, filters });
  if (!path) return null;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}

/** A safe file name from a borewell ID or title. */
export const fileName = (s: string) => s.replace(/[<>:"/\\|?*]+/g, "-").trim() || "StrataField";
