/**
 * StrataField Smart Auto-Parser — strataFieldParser.ts
 *
 * Parses standard-format borewell Excel files automatically without user column mapping.
 * Handles: unit detection (ft/m), material normalisation, multi-borewell sheets,
 * pipe type detection, anomaly flagging.
 *
 * Standard format (5/6 field files):
 *   Col 0: Site info / metadata labels
 *   Col 1: Depth (end of each interval)
 *   Col 2: Empty spacer
 *   Col 3: Material (clay/sand/etc.)
 *   Col 4: Pipe type (Plain pipe / Ribbed Screen)
 *   Col 5: Empty
 *   Col 6: Assembly depth
 */

import * as xlsx from 'xlsx';
import fs from 'node:fs';
import { MATERIAL_NORMALISATION_MAP, PIPE_SUBTYPE_MAP, DEFAULT_MATERIALS, METRES_TO_FEET } from '../../shared/constants';
import type {
  ExcelParseResult, ParsedBoreholeMetadata, ParsedStrataLayer,
  ParsedPipeSegment, ParseAnomaly, AnomalyCode, DepthUnit, PipeSubtype
} from '../../shared/types';

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

export function smartParseExcel(filePath: string): ExcelParseResult {
  const anomalies: ParseAnomaly[] = [];

  // 1. Read file
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err: any) {
    if (err.code === 'EBUSY') {
      throw new Error('The file is locked or open in another program. Please close it and try again.');
    }
    throw new Error(`Failed to read file: ${err.message || String(err)}`);
  }

  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  if (!rows || rows.length < 3) {
    return makeFailResult('File contains too few rows to parse.', anomalies);
  }

  // 2. Detect standard format: look for "Streta Chart" header row
  let headerRowIdx = -1;
  let secondHeaderIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const rowText = (rows[i] || []).map(c => String(c || '')).join(' ');
    if (STRETA_HEADER_PATTERNS.some(p => p.test(rowText))) {
      if (headerRowIdx === -1) {
        headerRowIdx = i;
      } else if (secondHeaderIdx === -1) {
        secondHeaderIdx = i;
        addAnomaly(anomalies, 'MULTI_BOREWELL_SHEET', 'warning',
          `Multiple borewell sections detected. Second header at row ${i + 1}. Only the first borewell is parsed.`);
        break;
      }
    }
  }

  // Non-standard format detection
  if (headerRowIdx === -1) {
    addAnomaly(anomalies, 'NON_STANDARD_FORMAT', 'critical',
      'Could not detect standard "Streta Chart" header. This file requires manual column mapping.');
    return makeFailResult('Non-standard format detected.', anomalies);
  }

  // 3. Find G.L. (Ground Level) row — data starts after it
  let glRowIdx = -1;
  const searchEnd = secondHeaderIdx > 0 ? secondHeaderIdx : rows.length;

  for (let i = headerRowIdx + 1; i < searchEnd; i++) {
    const row = rows[i] || [];
    const firstCell = String(row[0] || '').trim();
    if (GL_PATTERNS.some(p => p.test(firstCell))) {
      glRowIdx = i;
      break;
    }
  }

  const dataStartIdx = glRowIdx >= 0 ? glRowIdx + 1 : headerRowIdx + 2;

  // 4. Extract metadata from rows above the header
  const metadata = extractMetadata(rows, headerRowIdx, anomalies);

  // 5. Detect units from metadata text + interval sizes
  const detectedUnit = detectUnit(rows, headerRowIdx, dataStartIdx, searchEnd, anomalies);
  metadata.detectedUnit = detectedUnit;
  const conversionFactor = detectedUnit === 'm' ? METRES_TO_FEET : 1;

  // 6. Parse strata layers and pipes
  const strata: ParsedStrataLayer[] = [];
  const pipes: ParsedPipeSegment[] = [];
  let prevEndDepth = 0;

  const dataEndIdx = secondHeaderIdx > 0 ? secondHeaderIdx : rows.length;

  for (let i = dataStartIdx; i < dataEndIdx; i++) {
    const row = rows[i] || [];

    // Col 1 = depth (end of interval)
    const depthRaw = parseFloat(String(row[1] || ''));
    if (isNaN(depthRaw) || depthRaw <= 0) continue;

    const depthFt = depthRaw * conversionFactor;

    // Non-monotonic depth check
    if (depthFt <= prevEndDepth) {
      addAnomaly(anomalies, 'DEPTH_NON_MONOTONIC', 'warning',
        `Row ${i + 1}: Depth ${depthRaw} ${detectedUnit} is not monotonically increasing. Skipped.`, i);
      continue;
    }

    // Col 3 = material
    const materialRaw = String(row[3] || '').trim();
    if (!materialRaw) continue;

    // Normalise material name
    const { normalised, materialId, color, pattern, unknown } = normaliseMaterial(materialRaw);
    if (unknown) {
      addAnomaly(anomalies, 'MATERIAL_UNKNOWN', 'warning',
        `Row ${i + 1}: Material "${materialRaw}" not in dictionary. Kept as-is.`, i);
    }

    // Depth gap check
    const expectedStep = detectedUnit === 'm' ? 3 * conversionFactor : 10;
    const gap = depthFt - prevEndDepth;
    if (gap > expectedStep * 1.5 && prevEndDepth > 0) {
      addAnomaly(anomalies, 'DEPTH_GAP', 'warning',
        `Row ${i + 1}: Gap of ${(gap / conversionFactor).toFixed(1)} ${detectedUnit} between layers (expected ~${expectedStep / conversionFactor}).`, i);
    }

    strata.push({
      startDepth: prevEndDepth,
      endDepth: depthFt,
      material: normalised,
      materialId,
      color,
      pattern,
    });

    // Col 4 = pipe type
    const pipeRaw = String(row[4] || '').trim();
    if (pipeRaw) {
      const pipeResult = parsePipeType(pipeRaw);
      if (pipeResult) {
        pipes.push({
          startDepth: prevEndDepth,
          endDepth: depthFt,
          pipeType: pipeResult.pipeType,
          pipeSubtype: pipeResult.subtype,
          originalLabel: pipeRaw,
        });
      } else {
        addAnomaly(anomalies, 'PIPE_TYPE_UNKNOWN', 'warning',
          `Row ${i + 1}: Pipe type "${pipeRaw}" not recognised. Defaulted to plain.`, i);
        pipes.push({
          startDepth: prevEndDepth,
          endDepth: depthFt,
          pipeType: 'plain',
          pipeSubtype: 'PLAIN',
          originalLabel: pipeRaw,
        });
      }
    }

    prevEndDepth = depthFt;
  }

  // 7. Post-parse checks
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
    strata,
    pipes,
    anomalies,
    requiresManualReview: hasCritical,
  };
}

// ─── Metadata Extraction ────────────────────────────────────────────────────

function extractMetadata(rows: any[][], headerRowIdx: number, anomalies: ParseAnomaly[]): ParsedBoreholeMetadata {
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

  // Scan rows above the header for metadata
  for (let i = 0; i < Math.min(headerRowIdx, 20); i++) {
    const row = rows[i] || [];
    const col0 = String(row[0] || '').trim();
    const col0Lower = col0.toLowerCase();

    // Site name detection
    if (col0Lower === 'site:' || col0Lower === 'site') {
      // Next rows typically contain: Site name, Address, City
      const siteRow = rows[i + 1];
      const addrRow = rows[i + 2];
      const cityRow = rows[i + 3];

      if (siteRow && String(siteRow[0] || '').trim()) {
        meta.siteName = String(siteRow[0]).trim();
        meta.ownerName = meta.siteName;
      }
      if (addrRow && String(addrRow[0] || '').trim()) {
        meta.address = String(addrRow[0]).trim();
      }
      if (cityRow && String(cityRow[0] || '').trim()) {
        meta.city = String(cityRow[0]).trim().replace(/\.$/, '');
      }
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

function detectUnit(rows: any[][], headerRowIdx: number, dataStartIdx: number, dataEndIdx: number, anomalies: ParseAnomaly[]): DepthUnit {
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
    const val = parseFloat(String(row[1] || ''));
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

  // Fallback: try partial matching
  if (key.includes('sand')) {
    const sandMat = DEFAULT_MATERIALS.find(m => m.id === 'medium_sand')!;
    return { normalised: sandMat.name, materialId: sandMat.id, color: sandMat.color, pattern: sandMat.pattern, unknown: false };
  }
  if (key.includes('clay')) {
    const clayMat = DEFAULT_MATERIALS.find(m => m.id === 'clay')!;
    return { normalised: clayMat.name, materialId: clayMat.id, color: clayMat.color, pattern: clayMat.pattern, unknown: false };
  }
  if (key.includes('kankar') || key.includes('kanker')) {
    const kankarMat = DEFAULT_MATERIALS.find(m => m.id === 'kankar')!;
    return { normalised: kankarMat.name, materialId: kankarMat.id, color: kankarMat.color, pattern: kankarMat.pattern, unknown: false };
  }
  if (key.includes('gravel')) {
    const gravelMat = DEFAULT_MATERIALS.find(m => m.id === 'gravel')!;
    return { normalised: gravelMat.name, materialId: gravelMat.id, color: gravelMat.color, pattern: gravelMat.pattern, unknown: false };
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
  };
}
