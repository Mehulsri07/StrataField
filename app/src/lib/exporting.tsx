/**
 * Making files to share: PDF reports, Excel workbooks and pictures of the borewell drawing.
 * Everything is built on this computer; nothing is uploaded.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Borewell, BorewellRecord } from "@strata/core";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BorewellProfile } from "@/components/geology/BorewellProfile";
import { PatternDefs } from "@/components/geology/patterns";
import { isPreview } from "./api";
import { formatDate, pumpText, zoneName } from "./format";

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
  return printableSvg(renderToStaticMarkup(<BorewellProfile borewell={r.borewell} strata={r.strata} pipes={r.pipes} height={560} forPrint />));
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

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private title: string,
    readonly size: [number, number] = A4, private header = "Borewell report") {}

  newPage() {
    this.page = this.doc.addPage(this.size);
    this.pages.push(this.page);
    this.y = this.size[1] - M;
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
  rule(y = this.y) {
    this.page.drawLine({ start: { x: M, y }, end: { x: this.size[0] - M, y }, thickness: 0.6, color: LINE });
  }
  /** A simple table with a heading row; continues on a new page when it runs out of room. */
  table(heading: string, cols: { label: string; width: number; right?: boolean }[], rows: string[][]) {
    this.room(60);
    this.text(heading, M, this.y, 11, INK, true);
    this.y -= 16;
    const head = () => {
      let x = M;
      for (const c of cols) {
        const w = this.bold.widthOfTextAtSize(c.label, 8);
        this.text(c.label, c.right ? x + c.width - w - 6 : x, this.y, 8, QUIET, true);
        x += c.width;
      }
      this.y -= 5;
      this.rule();
      this.y -= 12;
    };
    head();
    for (const row of rows) {
      if (this.y < M + 36) { this.newPage(); head(); }
      let x = M;
      row.forEach((cell, i) => {
        const c = cols[i];
        const t = this.fit(cell, c.width - 8);
        const w = this.font.widthOfTextAtSize(t, 9);
        this.text(t, c.right ? x + c.width - w - 6 : x, this.y, 9);
        x += c.width;
      });
      this.y -= 14;
    }
    if (!rows.length) { this.text("None recorded.", M, this.y, 9, QUIET); this.y -= 14; }
    this.y -= 10;
  }
}

/** Characters the built-in PDF font cannot draw are replaced so a report never fails to save. */
function safe(s: string) {
  return s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
}

/** One or more borewells as a PDF: details, the drawing, layers, pipes and water readings. */
export async function buildReport(records: BorewellRecord[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(records.length === 1 ? `${records[0].borewell.borewellId} borewell report` : "Borewell reports");
  doc.setCreator("StrataField");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const made = formatDate(new Date().toISOString());

  for (const r of records) {
    const b = r.borewell;
    const w = new Writer(doc, font, bold, b.borewellId);
    w.newPage();
    w.text(w.fit(`${b.borewellId}${b.ownerName ? ` · ${b.ownerName}` : ""}`, A4[0] - 2 * M, 18, true), M, w.y, 18, INK, true);
    w.y -= 16;
    w.text(w.fit([zoneName(b.project), [b.area, b.city].filter(Boolean).join(", "), b.date && `drilled ${formatDate(b.date)}`].filter(Boolean).join(" · "), A4[0] - 2 * M), M, w.y, 10, QUIET);
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
    const facts: [string, string][] = [
      ["Total depth", ft(b.totalDepth)],
      ["Water level", ft(b.waterLevel)],
      ...(b.dynamicWaterLevel != null ? [["Water level while pumping", ft(b.dynamicWaterLevel)] as [string, string]] : []),
      ["Hole size / pipe size", `${inch(b.boreDia)} / ${inch(b.pipeDia)}`],
      ["Drilling method", b.drillingMethod ? METHOD[b.drillingMethod] : "—"],
      ...(pumpText(b) ? [["Pump", pumpText(b)] as [string, string]] : []),
      ...(b.pumpLowering != null ? [["Pump lowered to", ft(b.pumpLowering)] as [string, string]] : []),
      ["Date drilled", b.date ? formatDate(b.date) : "—"],
      ["Owner", b.ownerName || "—"],
      ["Address", [b.houseNo, b.address, b.area, b.city].filter(Boolean).join(", ") || "—"],
      ["GPS location", b.latitude != null && b.longitude != null ? `${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}` : "Not recorded"],
      ...(b.latitude != null && LOCATION[b.locationSource] ? [["", LOCATION[b.locationSource]] as [string, string]] : []),
      ["Zone", zoneName(b.project)],
      ["Soil layers", `${r.strata.length}`],
      ["Pipe pieces", `${r.pipes.length}`],
    ];
    for (const [k, v] of facts) {
      if (k) w.text(k, M, w.y, 8, QUIET);
      w.text(w.fit(v, 250 - 10, 10.5, true), M, w.y - (k ? 12 : 0), 10.5, INK, true);
      w.y -= k ? 28 : 16;
    }
    if (b.remarks) {
      w.text("Notes", M, w.y, 8, QUIET);
      w.text(w.fit(b.remarks, 250), M, w.y - 12, 10);
      w.y -= 28;
    }
    w.y = Math.min(w.y, top - drawH) - 16;

    w.table("Soil layers", [
      { label: "From (ft)", width: 60, right: true }, { label: "To (ft)", width: 60, right: true },
      { label: "Thickness (ft)", width: 80, right: true }, { label: "Soil type", width: 130 }, { label: "Holds water", width: 70 }, { label: "Notes", width: A4[0] - 2 * M - 400 },
    ], r.strata.map((l) => [String(l.startDepth), String(l.endDepth), String(Math.round((l.endDepth - l.startDepth) * 10) / 10), l.material, l.waterBearing ? "Yes" : "", l.remarks]));

    w.table("Pipes", [
      { label: "From (ft)", width: 60, right: true }, { label: "To (ft)", width: 60, right: true },
      { label: "Length (ft)", width: 80, right: true }, { label: "Type", width: 200 }, { label: "Size (inch)", width: 80, right: true },
    ], r.pipes.map((p) => [String(p.startDepth), String(p.endDepth), String(Math.round((p.endDepth - p.startDepth) * 10) / 10), p.pipeType === "slotted" ? "Screen pipe (water enters)" : "Plain pipe", String(p.diameter ?? b.pipeDia ?? "—")]));

    if (r.waterReadings.length) {
      w.table("Water readings", [
        { label: "Measured on", width: 120 }, { label: "Water level (ft)", width: 110, right: true }, { label: "While pumping (ft)", width: 120, right: true }, { label: "Notes", width: A4[0] - 2 * M - 350 },
      ], r.waterReadings.map((x) => [formatDate(x.measuredOn), x.staticLevel == null ? "—" : String(x.staticLevel), x.dynamicLevel == null ? "—" : String(x.dynamicLevel), x.remarks || x.source]));
    }

    w.pages.forEach((p, i) => {
      const foot = `Made with StrataField on ${made}. Layer depths are as recorded at the borewell.`;
      p.drawText(safe(foot), { x: M, y: M - 8, size: 7.5, font, color: QUIET });
      const n = `Page ${i + 1} of ${w.pages.length}`;
      p.drawText(n, { x: A4[0] - M - font.widthOfTextAtSize(n, 7.5), y: M - 8, size: 7.5, font, color: QUIET });
      p.drawLine({ start: { x: M, y: M + 4 }, end: { x: A4[0] - M, y: M + 4 }, thickness: 0.6, color: ACCENT, opacity: 0.4 });
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
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = testSave ? testSave(suggestedName) : await save({ defaultPath: suggestedName, filters });
  if (!path) return null;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}

/** A safe file name from a borewell ID or title. */
export const fileName = (s: string) => s.replace(/[<>:"/\\|?*]+/g, "-").trim() || "StrataField";
