/**
 * Tests for strataFieldParser.ts
 *
 * Strategy: build real XLSX buffers in memory with the same `xlsx` library the
 * parser already uses, write them to a temp file, then call smartParseExcel.
 * No mocking required — the parser touches only fs and xlsx, both of which
 * work fine in a Node/vitest environment.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as xlsx from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { smartParseExcel } from './strataFieldParser';

// Hardcoded — intentionally NOT imported from constants.
// If the constant changes, these tests must go red and force a conscious update.
const EXPECTED_METRES_TO_FEET = 3.28084;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Write a 2-D array as an XLSX file and return the file path.
 * The caller is responsible for cleaning up.
 */
function writeTempXlsx(rows: (string | number | null)[][]): string {
  const ws = xlsx.utils.aoa_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.join(os.tmpdir(), `sf-test-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/**
 * Build a minimal "standard format" sheet.
 *
 * Column layout the parser expects (0-indexed):
 *   0: site/metadata label | 1: depth | 2: spacer |
 *   3: material             | 4: pipe  | 5: spacer | 6: assembly depth
 *
 * The sheet must contain a "Streta Chart" header row and a "G.L." row
 * before the data rows start.
 */
function buildStandardRows(
  dataRows: { depth: number; material: string; pipe?: string }[],
  opts: { unitHint?: string } = {}
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];

  // Metadata rows (above header)
  if (opts.unitHint) {
    rows.push([opts.unitHint, null, null, null, null, null, null]);
  } else {
    rows.push(['Site Info', null, null, null, null, null, null]);
  }

  // Standard header row (col 0 triggers STRETA_HEADER_PATTERNS)
  rows.push(['Streta Chart', null, null, null, null, null, null]);

  // G.L. row — data starts on the next row
  rows.push(['G.L.', null, null, null, null, null, null]);

  // Data rows
  for (const dr of dataRows) {
    rows.push([null, dr.depth, null, dr.material, dr.pipe ?? null, null, null]);
  }

  return rows;
}

// ─── Temp file registry ───────────────────────────────────────────────────────

const tempFiles: string[] = [];

function createTemp(rows: (string | number | null)[][]): string {
  const p = writeTempXlsx(rows);
  tempFiles.push(p);
  return p;
}

afterAll(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

// ─── Anomaly detection tests ──────────────────────────────────────────────────

describe('anomaly detection', () => {
  it('flags DEPTH_NON_MONOTONIC when a depth value goes backwards', () => {
    // Row sequence: 10 → 20 → 15 (non-monotonic) → 30
    const rows = buildStandardRows([
      { depth: 10, material: 'Clay' },
      { depth: 20, material: 'Sand' },
      { depth: 15, material: 'Clay' },   // ← backwards — should be flagged
      { depth: 30, material: 'Sand' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    const anomalyCodes = result.anomalies.map(a => a.code);
    expect(anomalyCodes).toContain('DEPTH_NON_MONOTONIC');

    // The non-monotonic row must be skipped — only 3 strata should survive
    expect(result.strata.length).toBe(3);
  });

  it('flags MATERIAL_UNKNOWN for a material not in the dictionary', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'Obsidian Crust' },  // definitely not in the map
      { depth: 20, material: 'Clay' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    const unknownAnomaly = result.anomalies.find(a => a.code === 'MATERIAL_UNKNOWN');
    expect(unknownAnomaly).toBeDefined();
    expect(unknownAnomaly?.message).toMatch(/Obsidian Crust/);
  });

  it('flags NON_STANDARD_FORMAT (critical) when the header row is absent', () => {
    // A sheet with no "Streta Chart" / "Strata Chart" header at all.
    // Must have ≥ 3 rows so the parser reaches the header-detection phase
    // rather than the "too few rows" early-exit.
    const rows: (string | number | null)[][] = [
      ['Random data',  10, null, 'Clay', null, null, null],
      ['More data',    20, null, 'Sand', null, null, null],
      ['Even more',    30, null, 'Clay', null, null, null],
    ];
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.success).toBe(false);
    expect(result.requiresManualReview).toBe(true);
    expect(result.anomalies.some(a => a.code === 'NON_STANDARD_FORMAT')).toBe(true);
  });

  it('flags UNIT_MIXED when metadata says feet but intervals look like metres', () => {
    // Metadata text contains "feet", but depth intervals are ~3 apart (metres pattern)
    const rows = buildStandardRows(
      [
        { depth: 3,  material: 'Clay' },
        { depth: 6,  material: 'Sand' },
        { depth: 9,  material: 'Clay' },
        { depth: 12, material: 'Sand' },
      ],
      { unitHint: 'Depth in feet' }  // metadata says "feet"
      // but 3-unit intervals → interval detector says 'm'
    );
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.anomalies.some(a => a.code === 'UNIT_MIXED')).toBe(true);
  });

  it('flags PIPE_TYPE_UNKNOWN for an unrecognised pipe label and defaults to plain', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'Clay',  pipe: 'Titanium Mesh' },  // unrecognised
      { depth: 20, material: 'Sand',  pipe: 'Plain Pipe' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.anomalies.some(a => a.code === 'PIPE_TYPE_UNKNOWN')).toBe(true);

    // The unknown pipe should still produce a segment defaulted to plain
    const titaniumSegment = result.pipes.find(p => p.originalLabel === 'Titanium Mesh');
    expect(titaniumSegment).toBeDefined();
    expect(titaniumSegment?.pipeType).toBe('plain');
    expect(titaniumSegment?.pipeSubtype).toBe('PLAIN');
  });

  it('flags MULTI_BOREWELL_SHEET (warning) when a second header is found', () => {
    const rows: (string | number | null)[][] = [
      ['Site Info', null, null, null, null, null, null],
      ['Streta Chart', null, null, null, null, null, null],  // first header
      ['G.L.', null, null, null, null, null, null],
      [null, 10, null, 'Clay', 'Plain Pipe', null, null],
      [null, 20, null, 'Sand', 'Plain Pipe', null, null],
      // second borewell starts here
      ['Streta Chart', null, null, null, null, null, null],  // second header
      ['G.L.', null, null, null, null, null, null],
      [null, 10, null, 'Clay', 'Plain Pipe', null, null],
    ];
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.anomalies.some(a => a.code === 'MULTI_BOREWELL_SHEET')).toBe(true);
    // Only the first borewell's layers should be present
    expect(result.strata.length).toBe(2);
  });
});

// ─── Unit conversion tests ────────────────────────────────────────────────────

describe('unit conversion', () => {
  it('converts metre depths to feet using METRES_TO_FEET when unit is detected as metres', () => {
    // 3-unit intervals → interval detector picks 'm'
    const metreDepths = [3, 6, 9, 12];
    const rows = buildStandardRows(
      metreDepths.map((d, i) => ({ depth: d, material: i % 2 === 0 ? 'Clay' : 'Sand' }))
    );
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.metadata.detectedUnit).toBe('m');

    // Each strata endDepth must equal the original metre value × 3.28084 (METRES_TO_FEET)
    metreDepths.forEach((depthM, idx) => {
      const expectedFt = depthM * EXPECTED_METRES_TO_FEET;
      expect(result.strata[idx].endDepth).toBeCloseTo(expectedFt, 4);
    });
  });

  it('leaves feet depths unchanged (conversion factor = 1) when unit is feet', () => {
    // 10-unit intervals → interval detector picks 'ft'
    const ftDepths = [10, 20, 30, 40];
    const rows = buildStandardRows(
      ftDepths.map((d, i) => ({ depth: d, material: i % 2 === 0 ? 'Clay' : 'Sand' }))
    );
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.metadata.detectedUnit).toBe('ft');

    ftDepths.forEach((depthFt, idx) => {
      expect(result.strata[idx].endDepth).toBeCloseTo(depthFt, 4);
    });
  });

  it('correctly converts 1 metre to 3.28084 feet (METRES_TO_FEET constant sanity check)', () => {
    // Single-interval sheet at exactly 1 m — interval ambiguous so metadata hint needed.
    // Use explicit 'm' keyword in metadata to force metre detection.
    const rows: (string | number | null)[][] = [
      ['Depth in metres', null, null, null, null, null, null],
      ['Streta Chart', null, null, null, null, null, null],
      ['G.L.', null, null, null, null, null, null],
      [null, 1, null, 'Clay', null, null, null],
    ];
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    // The metadata unit hint should have been picked up
    expect(result.metadata.detectedUnit).toBe('m');
    expect(result.strata[0].endDepth).toBeCloseTo(3.28084, 4);  // 1m × 3.28084 ft/m
  });
});

// ─── Material normalisation tests ─────────────────────────────────────────────

describe('material normalisation', () => {
  it('normalises "sand (y)" to "Yellow Sand"', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'sand (y)' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.strata[0].material).toBe('Yellow Sand');
    expect(result.strata[0].materialId).toBe('yellow_sand');
  });

  it('normalises "kanker clay" to "Kankar"', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'kanker clay' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.strata[0].material).toBe('Kankar');
    expect(result.strata[0].materialId).toBe('kankar');
  });
});

// ─── Pipe type parsing tests ──────────────────────────────────────────────────

describe('pipe type parsing', () => {
  it('maps "ribbed screen" to slotted / RIBBED_SCREEN', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'Clay', pipe: 'Ribbed Screen' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.pipes[0].pipeType).toBe('slotted');
    expect(result.pipes[0].pipeSubtype).toBe('RIBBED_SCREEN');
  });

  it('maps "plain pipe" to plain / PLAIN', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'Clay', pipe: 'Plain Pipe' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.pipes[0].pipeType).toBe('plain');
    expect(result.pipes[0].pipeSubtype).toBe('PLAIN');
  });
});
