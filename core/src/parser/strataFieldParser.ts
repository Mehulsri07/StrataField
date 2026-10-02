/**
 * StrataField Smart Auto-Parser — strataFieldParser.ts
 *
 * Parses standard-format borewell Excel files automatically without user column mapping.
 * Handles: unit detection (ft/m), material normalisation, multi-borewell sheets,
 * pipe type detection, anomaly flagging.
 *
 * Standard format (the field files):
 *   Col 0: Site, address and details ("Water Level = 85 ft"...), written beside the layer rows
 *   Col 1: Depth (end of each interval, in fixed steps)
 *   Col 2: Empty spacer
 *   Col 3: Material (clay/sand/etc.), repeated on every row of a thick layer
 *   Col 4 or 5: Pipe type (screens are written in col 4, plain pipe in col 5)
 *   Col 7: Assembly depth
 *
 * Some logs are drawn to scale instead: each soil name is written once inside its layer (col 2) and
 * the depth where the layer ends is written at that point ("16 mt"), with the pipe drawn the same
 * way against the assembly depths in col 7.
 */

import * as xlsx from 'xlsx';
import { MATERIAL_NORMALISATION_MAP, PIPE_SUBTYPE_MAP, DEFAULT_MATERIALS, METRES_TO_FEET } from '../constants';
import type {
  ExcelParseResult, ParsedBoreholeMetadata, ParsedStrataLayer,
  ParsedPipeSegment, ParseAnomaly, AnomalyCode, DepthUnit, PipeSubtype
} from '../types';

// ─── Header Detection Patterns ──────────────────────────────────────────────

const STRETA_HEADER_PATTERNS = [
  /streta\s*chart/i,
  /strata\s*chart/i,
  /lowering\s*ass[ae]mbly/i,
  /bore\s*log/i,
  /lithological\s*log/i,
];

const GL_PATTERNS = [
  /^g\.?\s*l\.?$/i,
  /ground\s*level/i,
];

const UNIT_FT_PATTERNS = [/feet/i, /\bft\b/i, /foot/i];
const UNIT_M_PATTERNS = [/met[re]{2}/i, /\bmtr?\b/i, /\bm\b/];

// ─── Core Parser ────────────────────────────────────────────────────────────

/** Where the layers are in a sheet that is not laid out the standard way. Columns and rows count from 0. */
export interface ColumnMapping {
  /** The depth where each layer ends. */
  depthCol: number;
  /** The depth where each layer starts, when the sheet has one; otherwise a layer starts where the last ended. */
  fromCol?: number | null;
  materialCol: number;
  pipeCol?: number | null;
  /** The first row that holds a layer. */
  firstRow: number;
  unit: DepthUnit;
}

/** The first sheet of a workbook as rows of cells. */
export function readSheetRows(data: Uint8Array | ArrayBuffer): any[][] {
  const workbook = xlsx.read(data, { type: 'array' });
  return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
}

const num = (cell: unknown) => parseFloat(String(cell ?? ''));
const round1 = (n: number) => Math.round(n * 10) / 10;
const cellAt = (row: any[] | undefined, re: RegExp) => (row || []).findIndex(c => typeof c === 'string' && re.test(c));
/** A size written like 15" (inches). */
const inches = (cell: unknown) => { const m = /^\s*([0-9.]+)\s*"/.exec(String(cell ?? '')); return m ? parseFloat(m[1]) : null; };
/** A soil or pipe name: a word, not a depth ("16 mt"), a size (15") or a ground-level mark ("G. L."). */
const isLabel = (cell: unknown) => typeof cell === 'string' && /[a-z]{3}/i.test(cell) && !/^\s*[\d.]+\s*[a-z."']{0,5}\s*$/i.test(cell);

const SOIL_HEADING = /str[ae]ta\s*chart/i;
const PIPE_HEADING = /lowering\s*ass[ae]mbly/i;

/**
 * A first guess at where the layers are: from a heading row ("From", "To"/"Depth", "Soil type"...)
 * when there is one, otherwise from the column of rising numbers and the wordiest column beside it.
 */
export function guessMapping(rows: any[][]): ColumnMapping | null {
  const find = (row: any[], re: RegExp) => row.findIndex(c => typeof c === 'string' && re.test(c));
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i] || [];
    const materialCol = find(row, /soil|material|strata|streta|formation|litholog/i);
    const depthCol = find(row, /^\s*to\b|depth/i);
    if (materialCol < 0 || depthCol < 0 || materialCol === depthCol) continue;
    const fromCol = find(row, /^\s*from\b/i), pipeCol = find(row, /pipe|casing|assembly/i);
    return {
      depthCol, materialCol, firstRow: i + 1,
      fromCol: fromCol >= 0 ? fromCol : null,
      pipeCol: pipeCol >= 0 && pipeCol !== materialCol ? pipeCol : null,
      unit: /\(m\)|met(re|er)/i.test(row.join(' ')) ? 'm' : 'ft',
    };
  }
  // No heading row: the depth column is the one with the most rising numbers.
  const width = Math.max(0, ...rows.map(r => r?.length ?? 0));
  let best: { col: number; rowsWith: number[] } | null = null;
  for (let c = 0; c < width; c++) {
    const rowsWith: number[] = [];
    let last = 0;
    rows.forEach((r, i) => { const v = num(r?.[c]); if (v > last) { rowsWith.push(i); last = v; } });
    if (rowsWith.length >= 3 && (!best || rowsWith.length > best.rowsWith.length)) best = { col: c, rowsWith };
  }
  if (!best) return null;
  const words = (c: number) => best!.rowsWith.filter(i => typeof rows[i]?.[c] === 'string' && rows[i][c].trim()).length;
  let materialCol = -1;
  for (let c = 0; c < width; c++) if (c !== best.col && words(c) > (materialCol < 0 ? 0 : words(materialCol))) materialCol = c;
  if (materialCol < 0) return null;
  const firstRow = best.rowsWith.find(i => typeof rows[i]?.[materialCol] === 'string') ?? best.rowsWith[0];
  return { depthCol: best.col, materialCol, firstRow, fromCol: null, pipeCol: null, unit: 'ft' };
}

/**
 * Parses a workbook from its raw bytes. Reading the file is the caller's job
 * (the app reads it through Tauri; tests read it with node:fs), so this runs anywhere.
 */
export function parseStrataWorkbook(data: Uint8Array | ArrayBuffer, mapping?: ColumnMapping): ExcelParseResult {
  return parseStrataRows(readSheetRows(data), mapping);
}

/** Reads the layers from a sheet's rows: the standard layout, or wherever `mapping` says they are. */
export function parseStrataRows(rows: any[][], mapping?: ColumnMapping): ExcelParseResult {
  const anomalies: ParseAnomaly[] = [];

  if (!rows || rows.length < 3) {
    return makeFailResult('File contains too few rows to parse.', anomalies);
  }

  // 1. Find the borewell's block: the first heading row with a soil chart. (A sheet may begin with
  //    a pipe-only page, and may hold further borewells below; only the first is read.)
  let headerRowIdx = -1, endIdx = rows.length;
  if (mapping) {
    // The user has said where the layers are; rows above them are read for details.
    headerRowIdx = mapping.firstRow;
  } else {
    const headers = rows.map((r, i) => (STRETA_HEADER_PATTERNS.some(p => p.test((r || []).join(' '))) ? i : -1)).filter(i => i >= 0);
    headerRowIdx = headers.find(i => cellAt(rows[i], SOIL_HEADING) >= 0) ?? headers[0] ?? -1;
    if (headerRowIdx === -1) {
      addAnomaly(anomalies, 'NON_STANDARD_FORMAT', 'critical',
        'Could not detect standard "Streta Chart" header. This file requires manual column mapping.');
      return makeFailResult('Non-standard format detected.', anomalies);
    }
    const next = headers.find(i => i > headerRowIdx);
    if (next !== undefined) {
      endIdx = next;
      addAnomaly(anomalies, 'MULTI_BOREWELL_SHEET', 'warning',
        `Multiple borewell sections detected. Second header at row ${next + 1}. Only the first borewell is parsed.`);
    }
  }

  // 2. Where things are, from the headings. Usually the soil chart is on the left ("Streta Chart"
  //    in column 2: depths one column to its left, soil names under it or one to its right) and the
  //    pipe on the right ("Lowering Assambly" in column 5: pipe names under it or one to its left,
  //    assembly depths two to its right). Some logs mirror this, with the pipe first.
  const S = mapping ? -1 : cellAt(rows[headerRowIdx], SOIL_HEADING), L = mapping ? -1 : cellAt(rows[headerRowIdx], PIPE_HEADING);
  const mirrored = S >= 1 && L >= 1 && L < S;
  const soilMarkCol = S >= 1 ? S - 1 : 1, soilNameCols = S >= 1 ? [S, S + 1] : [2, 3];
  const pipeNameCols = mirrored ? [L, L + 1] : S >= 1 && L > S ? [L - 1, L] : [4, 5];
  const pipeMarkCol = mirrored ? L - 1 : S >= 1 && L > S ? L + 2 : 7;

  // 3. Find G.L. (Ground Level) row — data starts after it
  let glRowIdx = -1;
  for (let i = headerRowIdx + 1; i < endIdx; i++) {
    if (GL_PATTERNS.some(p => p.test(String((rows[i] || [])[0] || '').trim()))) {
      glRowIdx = i;
      break;
    }
  }
  const dataStartIdx = mapping ? mapping.firstRow : glRowIdx >= 0 ? glRowIdx + 1 : headerRowIdx + 2;
  const dataEndIdx = endIdx;

  // 4. Extract metadata. The details are written in the first column, mostly beside the layer rows.
  //    The hole and pipe sizes are also written under the two headings, for logs without detail lines.
  const metadata = extractMetadata(rows, endIdx);
  if (!mapping) {
    const under = rows[headerRowIdx + 1] || [];
    if (metadata.boreDia === null && S >= 0) metadata.boreDia = inches(under[S]);
    if (metadata.pipeDia === null && L >= 0) metadata.pipeDia = inches(under[L]) ?? inches(under[L + 1]);
  }

  // 5. Detect units from a unit written beside a depth, metadata text, or interval sizes
  const detectedUnit = mapping?.unit ?? detectUnit(rows, headerRowIdx, dataStartIdx, endIdx, anomalies, [soilMarkCol, 0, pipeMarkCol]);
  metadata.detectedUnit = detectedUnit;
  const conversionFactor = detectedUnit === 'm' ? METRES_TO_FEET : 1;

  // 6. Parse strata layers and pipes
  const strata: ParsedStrataLayer[] = [];
  const pipes: ParsedPipeSegment[] = [];

  if (mapping) {
    const depthCol = mapping.depthCol, materialCol = mapping.materialCol, fromCol = mapping.fromCol ?? -1;
    const pipeCell = (row: any[]) => String(row[mapping.pipeCol ?? -1] || '').trim();
    let prevEndDepth = 0;

    for (let i = dataStartIdx; i < dataEndIdx; i++) {
      const row = rows[i] || [];

      // Depth column = the end of each interval (column 1 in the standard layout)
      const depthRaw = num(row[depthCol]);
      if (isNaN(depthRaw) || depthRaw <= 0) continue;

      const depthFt = depthRaw * conversionFactor;

      // Non-monotonic depth check
      if (depthFt <= prevEndDepth) {
        addAnomaly(anomalies, 'DEPTH_NON_MONOTONIC', 'warning',
          `Row ${i + 1}: Depth ${depthRaw} ${detectedUnit} is not monotonically increasing. Skipped.`, i);
        continue;
      }

      const materialRaw = String(row[materialCol] || '').trim();
      if (!materialRaw) continue;

      // Normalise material name
      const { normalised, materialId, color, pattern, unknown } = normaliseMaterial(materialRaw);
      if (unknown) {
        addAnomaly(anomalies, 'MATERIAL_UNKNOWN', 'warning',
          `Row ${i + 1}: Material "${materialRaw}" not in dictionary. Kept as-is.`, i);
      }

      // No gap check here: each row gives a layer's bottom and the layer starts where the previous
      // one ended, so rows never leave a gap. A big step between rows is just a thick layer.

      // A "From" column can leave a gap after the previous layer; it can never reach back into it.
      const fromFt = num(row[fromCol]) * conversionFactor;
      const startDepth = fromFt > prevEndDepth && fromFt < depthFt ? fromFt : prevEndDepth;

      strata.push({
        startDepth,
        endDepth: depthFt,
        material: normalised,
        materialId,
        color,
        pattern,
      });

      const pipeRaw = pipeCell(row);
      if (pipeRaw) {
        const pipeResult = parsePipeType(pipeRaw);
        if (pipeResult) {
          pipes.push({
            startDepth,
            endDepth: depthFt,
            pipeType: pipeResult.pipeType,
            pipeSubtype: pipeResult.subtype,
            originalLabel: pipeRaw,
          });
        } else {
          addAnomaly(anomalies, 'PIPE_TYPE_UNKNOWN', 'warning',
            `Row ${i + 1}: Pipe type "${pipeRaw}" not recognised. Defaulted to plain.`, i);
          pipes.push({
            startDepth,
            endDepth: depthFt,
            pipeType: 'plain',
            pipeSubtype: 'PLAIN',
            originalLabel: pipeRaw,
          });
        }
      }

      prevEndDepth = depthFt;
    }
  } else {
    // One rule covers every way these logs are written (a row every 10 ft, a row every 3 m pipe
    // with depths only where the soil changes, or names and depths drawn to scale on separate rows):
    // at each depth, the piece that ends there is the one named on that row, or else the last one
    // named above it since the previous depth.
    const read = (nameCols: number[], markCol: number, flagBackwards: boolean) => {
      const pieces: { row: number; name: string; startDepth: number; endDepth: number }[] = [];
      let from = 0, pending: { row: number; name: string } | null = null;
      for (let i = dataStartIdx; i < dataEndIdx; i++) {
        const row = rows[i] || [];
        const label = nameCols.map(c => row[c]).find(isLabel);
        if (label) pending = { row: i, name: String(label).trim() };
        const raw = num(row[markCol]);
        if (!(raw > 0)) continue;
        const depth = detectedUnit === 'm' ? round1(raw * METRES_TO_FEET) : raw;
        if (depth <= from) {
          if (flagBackwards) {
            addAnomaly(anomalies, 'DEPTH_NON_MONOTONIC', 'warning',
              `Row ${i + 1}: Depth ${raw} ${detectedUnit} is not monotonically increasing. Skipped.`, i);
          }
        } else if (pending) {
          pieces.push({ ...pending, startDepth: from, endDepth: depth });
          from = depth;
        }
        pending = null;
      }
      return pieces;
    };

    for (const piece of read(soilNameCols, soilMarkCol, true)) {
      const { normalised, materialId, color, pattern, unknown } = normaliseMaterial(piece.name);
      if (unknown) {
        addAnomaly(anomalies, 'MATERIAL_UNKNOWN', 'warning', `Row ${piece.row + 1}: Material "${piece.name}" not in dictionary. Kept as-is.`, piece.row);
      }
      strata.push({ startDepth: piece.startDepth, endDepth: piece.endDepth, material: normalised, materialId, color, pattern });
    }

    // The pipe has its own depths (the assembly column); a log without them shares the soil's.
    const ownDepths = rows.slice(dataStartIdx, dataEndIdx).some(r => num((r || [])[pipeMarkCol]) > 0);
    for (const piece of read(pipeNameCols, ownDepths ? pipeMarkCol : soilMarkCol, false)) {
      const kind = parsePipeType(piece.name);
      if (!kind) {
        addAnomaly(anomalies, 'PIPE_TYPE_UNKNOWN', 'warning', `Row ${piece.row + 1}: Pipe type "${piece.name}" not recognised. Defaulted to plain.`, piece.row);
      }
      pipes.push({ startDepth: piece.startDepth, endDepth: piece.endDepth, pipeType: kind?.pipeType ?? 'plain', pipeSubtype: kind?.subtype ?? 'PLAIN', originalLabel: piece.name });
    }
  }

  // The details are written in the log's own unit; the app keeps everything in feet.
  if (detectedUnit === 'm') {
    if (metadata.totalDepth !== null) metadata.totalDepth = round1(metadata.totalDepth * METRES_TO_FEET);
    if (metadata.waterLevel !== null) metadata.waterLevel = round1(metadata.waterLevel * METRES_TO_FEET);
  }

  // 7. Logs are written in fixed steps, so a thick layer repeats its soil on every row
  //    ("Clay, Clay, Clay"). Rows that touch and are the same become one layer or pipe piece.
  const layers = mergeRuns(strata, (a, b) => a.material === b.material && a.materialId === b.materialId);
  const pipeRuns = mergeRuns(pipes, (a, b) => a.pipeType === b.pipeType && a.pipeSubtype === b.pipeSubtype);

  // 8. Post-parse checks
  if (strata.length === 0) {
    addAnomaly(anomalies, 'NO_STRATA_FOUND', 'critical',
      'No strata layers could be parsed from the data rows.');
  }

  // Update totalDepth from parsed data if not in metadata
  if (metadata.totalDepth === null && strata.length > 0) {
    metadata.totalDepth = strata[strata.length - 1].endDepth;
  }

  if (!metadata.ownerName) {
    addAnomaly(anomalies, 'SITE_NAME_MISSING', 'warning', 'Site/owner name not detected. Enter manually.');
  }
  if (!metadata.date) {
    addAnomaly(anomalies, 'DATE_MISSING', 'warning', 'Drill date not detected. Enter manually.');
  }
  if (metadata.waterLevel === null) {
    addAnomaly(anomalies, 'WATER_LEVEL_MISSING', 'warning', 'Water level not detected. Enter manually.');
  }

  const hasCritical = anomalies.some(a => a.severity === 'critical');

  return {
    success: strata.length > 0,
    metadata,
    strata: layers,
    pipes: pipeRuns,
    anomalies,
    requiresManualReview: hasCritical,
  };
}

function mergeRuns<T extends { startDepth: number; endDepth: number }>(items: T[], same: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.endDepth === item.startDepth && same(last, item)) last.endDepth = item.endDepth;
    else out.push({ ...item });
  }
  return out;
}

// ─── Metadata Extraction ────────────────────────────────────────────────────

function extractMetadata(rows: any[][], endIdx: number): ParsedBoreholeMetadata {
  const meta: ParsedBoreholeMetadata = {
    siteName: null,
    ownerName: null,
    address: null,
    city: null,
    date: null,
    boreDia: null,
    pipeDia: null,
    totalDepth: null,
    waterLevel: null,
    detectedUnit: 'ft',
  };

  // Scan the first column of the whole borewell: details sit above, beside and below the layers.
  for (let i = 0; i < endIdx; i++) {
    const row = rows[i] || [];
    const col0 = String(row[0] || '').trim();
    const col0Lower = col0.toLowerCase();

    // Site block: the name, then the address over one or more lines, then the city, ending at a
    // blank cell or at the first detail line ("Water Level = ...").
    const site = /^site\s*:?\s*[-–]?\s*(.*)$/i.exec(col0);
    if (site && (site[1] || /^site\s*:?$/i.test(col0)) && !/^sites?\s+\w+\s*=/.test(col0Lower)) {
      const lines: string[] = site[1] ? [site[1].trim()] : [];
      for (let k = i + 1; k < endIdx && lines.length < 6; k++) {
        const line = String((rows[k] || [])[0] || '').trim();
        if (!line || /[=:]/.test(line)) break;
        lines.push(line);
      }
      if (lines.length > 0) meta.siteName = meta.ownerName = lines[0];
      if (lines.length > 2) meta.city = lines[lines.length - 1].replace(/\.$/, '');
      if (lines.length > 1) meta.address = lines.slice(1, lines.length > 2 ? -1 : undefined).join(', ');
    }

    // Bore diameter + total depth (often on same line)
    const bdMatch = col0.match(/bore\s*(?:dia|diameter)\s*[:=]\s*([0-9.]+)/i);
    if (bdMatch) {
      meta.boreDia = parseFloat(bdMatch[1]);
      const tdMatch = col0.match(/\/[-/\s]*([0-9.]+)\s*(?:ft|feet|m|met)/i);
      if (tdMatch) {
        meta.totalDepth = parseFloat(tdMatch[1]);
      }
    }

    // Pipe diameter
    const pdMatch = col0.match(/(?:tube\s*well|pipe\s*dia|casing\s*dia)\s*[:=]\s*([0-9.]+)/i);
    if (pdMatch) {
      meta.pipeDia = parseFloat(pdMatch[1]);
    }

    // Water level
    const wlMatch = col0.match(/(?:water\s*level|swl)\s*(?:depth)?\s*[:=]\s*([0-9.]+)/i);
    if (wlMatch) {
      meta.waterLevel = parseFloat(wlMatch[1]);
    }

    // Date
    const dateMatch = col0.match(/date\s*[:=]\s*([0-9\-/.]+)/i);
    if (dateMatch) {
      meta.date = parseDate(dateMatch[1]);
    }
  }

  return meta;
}

// ─── Unit Detection ─────────────────────────────────────────────────────────

function detectUnit(rows: any[][], headerRowIdx: number, dataStartIdx: number, dataEndIdx: number, anomalies: ParseAnomaly[], cols = [1, 0, 7]): DepthUnit {
  // 0. A unit written beside a depth ("16 mt", "Bore Dia = 12" / 370 ft") settles it.
  const beside = rows.slice(0, dataEndIdx).flatMap(r => cols.map(c => String((r || [])[c] ?? ''))).join(' | ');
  const metres = /\d\s*(?:m|mt|mtr|mtrs|met(?:er|re)s?)\b/i.test(beside), feet = /\d\s*(?:ft|feet|foot)\b/i.test(beside);
  if (metres !== feet) return metres ? 'm' : 'ft';

  // 1. Check metadata text for unit keywords
  let metadataUnit: DepthUnit | null = null;
  for (let i = 0; i < Math.min(headerRowIdx, 15); i++) {
    const text = (rows[i] || []).map(c => String(c || '')).join(' ');
    if (UNIT_FT_PATTERNS.some(p => p.test(text))) metadataUnit = 'ft';
    if (UNIT_M_PATTERNS.some(p => p.test(text))) metadataUnit = 'm';
  }

  // 2. Infer from interval sizes
  const depths: number[] = [];
  for (let i = dataStartIdx; i < Math.min(dataEndIdx, dataStartIdx + 10); i++) {
    const row = rows[i] || [];
    const val = parseFloat(String(row[cols[0]] || ''));
    if (!isNaN(val) && val > 0) depths.push(val);
  }

  let intervalUnit: DepthUnit | null = null;
  if (depths.length >= 2) {
    const intervals = [];
    for (let i = 1; i < depths.length; i++) {
      intervals.push(depths[i] - depths[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // 10ft intervals vs 3m intervals
    if (Math.abs(avgInterval - 10) < 3) intervalUnit = 'ft';
    else if (Math.abs(avgInterval - 3) < 1.5) intervalUnit = 'm';
  }

  // 3. Resolve conflicts
  if (metadataUnit && intervalUnit && metadataUnit !== intervalUnit) {
    addAnomaly(anomalies, 'UNIT_MIXED', 'warning',
      `Metadata suggests ${metadataUnit} but intervals suggest ${intervalUnit}. Using interval-based detection.`);
    return intervalUnit;
  }

  if (intervalUnit) return intervalUnit;
  if (metadataUnit) return metadataUnit;

  addAnomaly(anomalies, 'UNIT_AMBIGUOUS', 'warning',
    'Could not determine depth unit. Defaulting to feet.');
  return 'ft';
}

// ─── Material Normalisation ─────────────────────────────────────────────────

function normaliseMaterial(raw: string): {
  normalised: string; materialId: string | null;
  color: string; pattern: string; unknown: boolean;
} {
  const key = raw.toLowerCase().trim();

  // First try the normalisation map
  const mapped = MATERIAL_NORMALISATION_MAP[key];
  const lookupName = mapped || raw.trim();

  // Then find in default materials
  const mat = DEFAULT_MATERIALS.find(m => m.name.toLowerCase() === lookupName.toLowerCase());
  if (mat) {
    return {
      normalised: mat.name,
      materialId: mat.id,
      color: mat.color,
      pattern: mat.pattern,
      unknown: false,
    };
  }

  // Fallback: try partial matching (order matters — first hit wins)
  const partialMatches: [string[], string][] = [
    [['sand'], 'medium_sand'],
    [['clay'], 'clay'],
    [['kankar', 'kanker'], 'kankar'],
    [['gravel'], 'gravel'],
  ];
  for (const [needles, materialId] of partialMatches) {
    if (!needles.some(n => key.includes(n))) continue;
    const fallback = DEFAULT_MATERIALS.find(m => m.id === materialId);
    if (fallback) {
      return { normalised: fallback.name, materialId: fallback.id, color: fallback.color, pattern: fallback.pattern, unknown: false };
    }
  }

  // Truly unknown
  return {
    normalised: raw.trim(),
    materialId: null,
    color: '#8D6E63',
    pattern: 'solid',
    unknown: true,
  };
}

// ─── Pipe Type Parsing ──────────────────────────────────────────────────────

function parsePipeType(raw: string): { pipeType: 'plain' | 'slotted'; subtype: PipeSubtype } | null {
  const key = raw.toLowerCase().trim();
  const match = PIPE_SUBTYPE_MAP[key];
  if (match) return match;

  // Partial match
  for (const [pattern, result] of Object.entries(PIPE_SUBTYPE_MAP)) {
    if (key.includes(pattern)) return result;
  }

  // Keyword fallback
  if (key.includes('plain') || key.includes('pipe') || key.includes('casing')) {
    return { pipeType: 'plain', subtype: 'PLAIN' };
  }
  if (key.includes('screen') || key.includes('slot') || key.includes('ribbed') || key.includes('filter')) {
    return { pipeType: 'slotted', subtype: 'RIBBED_SCREEN' };
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addAnomaly(list: ParseAnomaly[], code: AnomalyCode, severity: 'warning' | 'critical', message: string, row?: number): void {
  list.push({ code, severity, message, row });
}

function parseDate(dateStr: string): string | null {
  const clean = dateStr.trim();

  const match = clean.match(/^(\d{1,2})[/\-.] ?(\d{1,2})[/\-.] ?(\d{2,4})$/);
  if (match) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) { const t = day; day = month; month = t; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const matchIso = clean.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (matchIso) {
    return `${matchIso[1]}-${String(parseInt(matchIso[2])).padStart(2, '0')}-${String(parseInt(matchIso[3])).padStart(2, '0')}`;
  }

  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }

  return null;
}

function makeFailResult(message: string, anomalies: ParseAnomaly[]): ExcelParseResult {
  return {
    success: false,
    metadata: {
      siteName: null, ownerName: null, address: null, city: null, date: null,
      boreDia: null, pipeDia: null, totalDepth: null, waterLevel: null,
      detectedUnit: 'ft',
    },
    strata: [],
    pipes: [],
    anomalies,
    requiresManualReview: true,
    failureReason: message,
  };
}
