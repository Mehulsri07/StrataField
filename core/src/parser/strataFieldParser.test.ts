/**
 * Tests for strataFieldParser.ts
 *
 * Strategy: build real XLSX buffers in memory with the same `xlsx` library the
 * parser already uses, write them to a temp file, read the bytes back and
 * parse them the same way the app does. No mocking required.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as xlsx from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { guessMapping, parsePump, parseStrataLogs, parseStrataRows, parseStrataWorkbook } from './strataFieldParser';

const smartParseExcel = (filePath: string) => parseStrataWorkbook(fs.readFileSync(filePath));

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

describe('thick layers', () => {
  it('does not warn about gaps when layers are simply thicker than usual', () => {
    const rows = buildStandardRows([20, 40, 60, 100, 160].map((depth, i) => ({ depth, material: i % 2 ? 'Sand' : 'Clay' })));
    const result = smartParseExcel(createTemp(rows));
    expect(result.anomalies.filter((a) => a.code === 'DEPTH_GAP')).toEqual([]);
    expect(result.strata.map((l) => [l.startDepth, l.endDepth])).toEqual([[0, 20], [20, 40], [40, 60], [60, 100], [100, 160]]);
  });
});

describe('anomaly detection', () => {
  it('flags DEPTH_NON_MONOTONIC when a depth value goes backwards', () => {
    // Row sequence: 10 → 20 → 15 (non-monotonic) → 30
    const rows = buildStandardRows([
      { depth: 10, material: 'Clay' },
      { depth: 20, material: 'Sand' },
      { depth: 15, material: 'Clay' },   // ← backwards — should be flagged
      { depth: 30, material: 'Gravel' },
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
    expect(result.failureReason).toBe('Non-standard format detected.');
  });

  it('explains why a file with too few rows cannot be parsed', () => {
    const filePath = createTemp([['Site:', 'Only one row']]);
    const result = smartParseExcel(filePath);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('File contains too few rows to parse.');
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

    // Each strata endDepth is the metre value × 3.28084 (METRES_TO_FEET), to a tenth of a foot
    metreDepths.forEach((depthM, idx) => {
      const expectedFt = Math.round(depthM * EXPECTED_METRES_TO_FEET * 10) / 10;
      expect(result.strata[idx].endDepth).toBe(expectedFt);
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
    expect(result.strata[0].endDepth).toBe(3.3);  // 1 m × 3.28084 ft/m, to a tenth of a foot
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

  // Decided 29 Sep 2026: Clay Kankar is its own material, not plain Kankar.
  it('normalises "kanker clay" to "Clay Kankar"', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'kanker clay' },
    ]);
    const filePath = createTemp(rows);
    const result = smartParseExcel(filePath);

    expect(result.strata[0].material).toBe('Clay Kankar');
    expect(result.strata[0].materialId).toBe('clay_kankar');
  });

  it('keeps plain "kankar" as Kankar', () => {
    const result = smartParseExcel(createTemp(buildStandardRows([{ depth: 10, material: 'Kanker' }])));
    expect(result.strata[0].materialId).toBe('kankar');
  });

  it('recognises sandy kankar, rock and boulders', () => {
    const rows = buildStandardRows([
      { depth: 10, material: 'Sandy Kankar' },
      { depth: 20, material: 'Hard Rock' },
      { depth: 30, material: 'Boulders' },
    ]);
    const result = smartParseExcel(createTemp(rows));
    expect(result.strata.map(s => s.materialId)).toEqual(['sandy_kankar', 'rock', 'boulder']);
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

describe('sheets that are not in the standard layout', () => {
  const headed = [
    ['Borewell at Chinhat'],
    ['From (ft)', 'To (ft)', 'Soil type', 'Pipe'],
    [0, 30, 'Clay', 'Plain pipe'],
    [40, 90, 'Fine Sand', 'Screen'],   // nothing logged from 30 to 40
    [90, 150, 'Coarse Sand', 'Screen'],
  ];

  it('are not read without being told where the layers are', () => {
    expect(parseStrataRows(headed).success).toBe(false);
  });

  it('guesses the columns from a heading row, and keeps a gap a From column leaves', () => {
    const m = guessMapping(headed)!;
    expect(m).toMatchObject({ fromCol: 0, depthCol: 1, materialCol: 2, pipeCol: 3, firstRow: 2, unit: 'ft' });
    const r = parseStrataRows(headed, m);
    expect(r.success).toBe(true);
    expect(r.strata.map(l => [l.startDepth, l.endDepth, l.materialId])).toEqual([[0, 30, 'clay'], [40, 90, 'fine_sand'], [90, 150, 'coarse_sand']]);
    // The two screen rows touch, so they are one piece of pipe.
    expect(r.pipes.map(p => [p.pipeType, p.startDepth, p.endDepth])).toEqual([['plain', 0, 30], ['slotted', 40, 150]]);
  });

  it('guesses the columns without a heading row: rising numbers and the words beside them', () => {
    const bare = [['Site A', null, null], [null, 'Clay', 20], [null, 'Sand', 55], [null, 'Gravel', 80]];
    const m = guessMapping(bare)!;
    expect(m).toMatchObject({ depthCol: 2, materialCol: 1, firstRow: 1 });
    expect(parseStrataRows(bare, m).strata.map(l => l.endDepth)).toEqual([20, 55, 80]);
  });

  it('converts metres when the user says the depths are in metres', () => {
    const r = parseStrataRows(headed, { ...guessMapping(headed)!, unit: 'm' });
    expect(r.strata[0].endDepth).toBeCloseTo(30 * EXPECTED_METRES_TO_FEET, 3);
  });
});

describe('a field log as it is really written', () => {
  // The shape of the real files (made-up values): a letterhead, the two headings, then the site,
  // address and details down the first column beside the layer rows, depths in 10 ft steps with the
  // soil repeated on every row, screens in column 4 and plain pipe in column 5, and the date at the end.
  const side = ['Verma Residence', 'Sector 9, Indira Nagar', 'Lucknow.', null, null, 'Total Lowering = 130 ft', 'Slot = 20G/16',
    'Water Level =  85 ft', 'Bore Dia = 12" / 140 ft', 'Tube Well =  8"/130 ft'];
  const soils = ['Clay', 'Clay', 'Clay', 'Sand', 'Sand', 'Clay', 'Clay', 'Clay', 'Clay', 'Sand ', 'Sand', 'Sand', 'Clay', 'Clay'];
  const rows: (string | number | null)[][] = [
    [null, null, null, null, 'Example Drilling Co, Lucknow'],
    [],
    [null, null, 'Streta Chart', null, null, 'Lowering Assambly'],
    ['Site:', 'G.L.', '12"', 'G.L.', null, 'G.L.', '8"'],
    ...soils.map((soil, i) => {
      const depth = (i + 1) * 10, screen = depth > 90 && depth <= 120, pipe = depth <= 130;
      return [side[i] ?? null, depth, null, soil, pipe && screen ? 'Ribbed Screen' : null, pipe && !screen ? 'Plain pipe' : null, null, pipe ? depth : null];
    }),
    [], [],
    ['Date : 14/3/2019', null, 'Client', null, null, null, 'Driller'],
  ];
  const r = parseStrataRows(rows);

  it('joins rows of the same soil into one layer', () => {
    expect(r.strata.map(l => [l.startDepth, l.endDepth, l.material])).toEqual([
      [0, 30, 'Clay'], [30, 50, 'Sand'], [50, 90, 'Clay'], [90, 120, 'Sand'], [120, 140, 'Clay'],
    ]);
  });

  it('reads the pipe from either pipe column, and joins it into pieces', () => {
    expect(r.pipes.map(p => [p.pipeType, p.startDepth, p.endDepth])).toEqual([['plain', 0, 90], ['slotted', 90, 120], ['plain', 120, 130]]);
  });

  it('reads the details written beside and below the layers', () => {
    expect(r.metadata).toMatchObject({
      ownerName: 'Verma Residence', address: 'Sector 9, Indira Nagar', city: 'Lucknow',
      waterLevel: 85, boreDia: 12, totalDepth: 140, pipeDia: 8, date: '2019-03-14', detectedUnit: 'ft',
    });
    expect(r.anomalies.map(a => a.code)).toEqual([]);
  });
});

describe('a sheet with more than one log', () => {
  const block = (site: string, rows: (string | number | null)[][]) => [
    [null, null, 'Streta Chart', null, null, 'Lowering Assambly'],
    [`Site: ${site}`, 'G. L.', '10"', 'G. L.', null, '6"'],
    ...rows,
    [], [],
  ];
  const a = [['Lucknow', 50, 'Clay', null, null, 'Plain pipe', null, 50], ['Water Level = 60 ft', 200, 'Sand', 'Good', null, 'Slotted pipe', null, 200]];
  const b = [['Kanpur', 80, 'Clay', null, null, 'Plain pipe', null, 80], ['Water Level = 90 ft', 300, 'Gravel', null, null, 'Slotted pipe', null, 300]];

  it('reads each log as its own borewell, with its own details', () => {
    const logs = parseStrataLogs([...block('First House', a), ...block('Second House', b)]);
    expect(logs.map(l => [l.metadata.ownerName, l.metadata.waterLevel, l.strata.map(s => s.endDepth)])).toEqual([
      ['First House', 60, [50, 200]], ['Second House', 90, [80, 300]],
    ]);
    expect(logs[1].anomalies.map(x => x.code)).not.toContain('SAME_AS_FIRST_LOG');
  });

  it('marks a second log with the same layers as the same borewell drawn again', () => {
    const logs = parseStrataLogs([...block('First House', a), ...block('First House', a)]);
    expect(logs).toHaveLength(2);
    expect(logs[1].anomalies.map(x => x.code)).toContain('SAME_AS_FIRST_LOG');
  });

  it('keeps "Good" beside a soil as a note on that layer, never as a soil', () => {
    const [log] = parseStrataLogs(block('First House', [...a, [null, null, null, 'Moderate'], [null, 260, 'Clay', null, null, 'Plain pipe', null, 260]]));
    expect(log.strata.map(s => [s.material, s.remarks ?? ''])).toEqual([['Clay', ''], ['Sand', 'Good'], ['Clay', '']]);
  });
});

describe('the pump written on a log', () => {
  it('splits the power from the make and model, however they are ordered', () => {
    expect(parsePump('KSB , 12C/17 5 HP')).toEqual({ hp: 5, model: 'KSB 12C/17' });
    expect(parsePump('3AH/12 , 1.5 HP')).toEqual({ hp: 1.5, model: '3AH/12' });
    expect(parsePump('CRI 1.5HP/15 stage')).toEqual({ hp: 1.5, model: 'CRI 15 stage' });
    expect(parsePump('KSB 7C/ 22')).toEqual({ hp: null, model: 'KSB 7C/22' });
    expect(parsePump('3 HP / 15 Stage')).toEqual({ hp: 3, model: '15 Stage' });
  });

  const log = (pumpRows: (string | number | null)[][]) => parseStrataRows([
    [null, null, 'Streta Chart', null, null, 'Lowering Assambly'],
    ['Site: Example House', 'G. L.', '10"', 'G. L.', null, '6"'],
    ['Lucknow', 50, 'Clay', null, null, 'Plain pipe', null, 50],
    ...pumpRows,
    ['Water Level = 60 ft', 200, 'Sand', null, null, 'Slotted pipe', null, 200],
  ]).metadata;

  it('reads the lowering and the pump from their usual lines, beside the layer rows', () => {
    expect(log([['Pump Lowering = 220 Ft', 100, 'Clay', null, null, 'Plain pipe', null, 100], ['Pump =  KSB 12C/17 , 5 HP', 150, 'Clay', null, null, 'Plain pipe', null, 150]]))
      .toMatchObject({ pumpLowering: 220, pumpHp: 5, pumpModel: 'KSB 12C/17', waterLevel: 60 });
  });

  it('leaves the pump empty when the lines are blank, and never takes the depth beside them', () => {
    expect(log([['Pump Lowering = ', 100, 'Clay'], ['Pump = ', 150, 'Clay']]))
      .toMatchObject({ pumpLowering: null, pumpHp: null, pumpModel: null });
  });

  it('reads a value written in the next cell when the label has no "="', () => {
    expect(log([['Pump lowered at', '36 mt (50 mm)', 'Clay'], ['Pump model', '12C/17 KSB'], ['Praposed Pump House', 150, 'Clay']]))
      .toMatchObject({ pumpLowering: 118.1, pumpHp: null, pumpModel: '12C/17 KSB' });
  });
});

describe('a field log drawn to scale, in metres', () => {
  // Made-up values in the shape of a real log: each soil is written once inside its layer and the
  // depth where it ends is written at that point, with the pipe drawn against its own depths.
  const rows: (string | number | null)[][] = [
    [null, null, null, null, 'Example Drilling Co, Lucknow'],
    [],
    [null, null, 'Streta Chart', null, null, 'Lowering Assambly'],
    ['Site:', 'G. L. ', '15"', 'G. L.', null, 'A G L'],
    ['Example Mall'],
    ['Ring Road'],
    ['Lucknow', null, 'Clay', null, null, 'Plain pipe'],
    [null, '16 mt'],
    [null, null, null, null, null, null, null, '18 mt'],
    [null, null, 'Sand', 'Good', 'Ribbed Screen'],
    [null, '26 mt', null, null, null, null, null, '24 mt'],
    ['Pump Lowering = ', null, 'Clay'],
    ['Pump =  ', '29 mt', null, null, null, 'Plain pipe'],
    ['Water Level =  12 mt', null, 'Sand', 'Good', null, null, null, '30 mt'],
    ['Bore Dia = 15" / 40 mt', '32 mt', null, null, 'Ribbed Screen', null, null, '33 mt'],
    ['Tube Well =  8" / 36 mt', null, 'Clay', null, null, 'Plain pipe', null, '36 mt'],
    [null, '40 mt'],
    [], [],
    ['Date : 16/9/2025', null, 'Client'],
  ];
  const r = parseStrataRows(rows);
  const ft = (m: number) => Math.round(m * EXPECTED_METRES_TO_FEET * 10) / 10;

  it('gives each soil the next depth mark below it, converted to feet', () => {
    expect(r.success).toBe(true);
    expect(r.metadata.detectedUnit).toBe('m');
    expect(r.strata.map(l => [l.startDepth, l.endDepth, l.material])).toEqual([
      [0, ft(16), 'Clay'], [ft(16), ft(26), 'Sand'], [ft(26), ft(29), 'Clay'], [ft(29), ft(32), 'Sand'], [ft(32), ft(40), 'Clay'],
    ]);
  });

  it('reads the pipe the same way, against the assembly depths', () => {
    expect(r.pipes.map(p => [p.pipeType, p.startDepth, p.endDepth])).toEqual([
      ['plain', 0, ft(18)], ['slotted', ft(18), ft(24)], ['plain', ft(24), ft(30)], ['slotted', ft(30), ft(33)], ['plain', ft(33), ft(36)],
    ]);
  });

  it('reads the details, in feet', () => {
    expect(r.metadata).toMatchObject({ ownerName: 'Example Mall', address: 'Ring Road', city: 'Lucknow', boreDia: 15, pipeDia: 8, date: '2025-09-16', totalDepth: ft(40), waterLevel: ft(12) });
    expect(r.anomalies.map(a => a.code)).toEqual([]);
  });
});

describe('the site block', () => {
  const log = (site: string[]) => parseStrataRows([
    [null, null, 'Streta Chart'], ['Site:'],
    ...[10, 20, 30, 40, 50, 60].map((depth, i) => [site[i] ?? (i === 5 ? 'Water Level = 60 ft' : null), depth, null, i % 2 ? 'Sand' : 'Clay']),
  ]).metadata;

  it('takes the last line as the city and everything between as the address', () => {
    expect(log(['Example Hospital', 'Plot 12', 'Gomti Nagar', 'Lucknow'])).toMatchObject({ ownerName: 'Example Hospital', address: 'Plot 12, Gomti Nagar', city: 'Lucknow' });
    expect(log(['Example Hospital', 'Gomti Nagar', 'Lucknow.'])).toMatchObject({ ownerName: 'Example Hospital', address: 'Gomti Nagar', city: 'Lucknow' });
    expect(log(['Example Hospital', 'Gomti Nagar'])).toMatchObject({ ownerName: 'Example Hospital', address: 'Gomti Nagar', city: null });
  });
});

describe('a field log with a row for every 3 m pipe', () => {
  // Made-up values in the shape of real logs: the soil is on every row, its depth is written only
  // where the soil changes, and the pipe has its own depth on every row (the assembly column).
  const soil = ['Clay', 'Clay', 'Clay', 'Sand', 'Sand', 'Clay', 'Sand', 'Sand', 'Clay', 'Clay'];
  const soilEnds: Record<number, number> = { 2: 9, 4: 14, 5: 18, 7: 24, 9: 40 };
  const screen = [false, false, false, true, true, false, true, true];
  const rows: (string | number | null)[][] = [
    [null, null, 'Streta Chart', null, null, 'Lowering Assambly'],
    ['Site: Example Farm, Kasba', 'G. L. ', '14"', 'G. L.', null, 'A G L', '6"'],
    ...soil.map((name, i) => [i === 3 ? 'Bore Dia = 14" / 40 Mt' : null, soilEnds[i] ?? null, null, name,
      screen[i] === true ? 'Ribbed Screen' : null, screen[i] === false ? 'Plain pipe' : null, null, i < screen.length ? (i + 1) * 3 : null]),
    [], ['Date :  ', null, 'Client'],
  ];
  const r = parseStrataRows(rows);
  const ft = (m: number) => Math.round(m * EXPECTED_METRES_TO_FEET * 10) / 10;

  it('ends each layer at the depth written where the soil changes', () => {
    expect(r.strata.map(l => [l.startDepth, l.endDepth, l.material])).toEqual([
      [0, ft(9), 'Clay'], [ft(9), ft(14), 'Sand'], [ft(14), ft(18), 'Clay'], [ft(18), ft(24), 'Sand'], [ft(24), ft(40), 'Clay'],
    ]);
  });

  it('reads the pipe from its own depths, not the soil depths', () => {
    expect(r.pipes.map(p => [p.pipeType, p.startDepth, p.endDepth])).toEqual([
      ['plain', 0, ft(9)], ['slotted', ft(9), ft(15)], ['plain', ft(15), ft(18)], ['slotted', ft(18), ft(24)],
    ]);
  });

  it('takes a site name written on the same line as "Site:", and the sizes under the headings', () => {
    expect(r.metadata).toMatchObject({ ownerName: 'Example Farm, Kasba', boreDia: 14, pipeDia: 6, totalDepth: ft(40), detectedUnit: 'm' });
  });
});

describe('a sheet that starts with a pipe-only page and has the soil chart on the right', () => {
  // Made-up values in the shape of a real log: first a page listing only the pipes, then the
  // borewell with the pipe list on the left and the soil chart on the right.
  const pipePage: (string | number | null)[][] = [
    [null, null, 'Lowering Assambly'], ['Site:', 'G. L. ', '8"', 'G. L.'],
    ['Example School', null, null, '6 Mtr Plain Pipe', null, 2], [null, '9 Mtr', null, '3 Mtr Plain Pipe', null, 1], [],
  ];
  const rows: (string | number | null)[][] = [
    ...pipePage,
    [null, null, 'Lowering Assambly', null, null, null, null, 'Streta Chart'],
    ['Site:', 'G. L. ', '8"', 'G. L.', null, null, 'G. L. ', '15"', 'G. L.'],
    ['Example School', null, null, '6 Mtr Plain Pipe', null, 4, null, null, 'Clay'],
    ['Aliganj', null, null, null, null, null, '5 Mtr', null, 'Clay'],
    ['Lucknow', '9 Mtr', null, '3 Mtr Plain Pipe', null, 3, null, null, 'Sand'],
    [null, null, null, '6 Mtr Slotted Pipe', null, 2, '12 Mtr', null, 'Sand'],
    [null, '15 Mtr', null, null, null, null, null, null, 'Clay'],
    [null, '18 Mtr', null, '3 Mtr Plain Pipe', null, 1, null, null, 'Clay'],
    [null, null, null, null, null, null, '20 Mtr', null, 'Clay'],
  ];
  const r = parseStrataRows(rows);
  const ft = (m: number) => Math.round(m * EXPECTED_METRES_TO_FEET * 10) / 10;

  it('reads the borewell block, with soil and pipe each from their own side', () => {
    expect(r.strata.map(l => [l.startDepth, l.endDepth, l.material])).toEqual([[0, ft(5), 'Clay'], [ft(5), ft(12), 'Sand'], [ft(12), ft(20), 'Clay']]);
    expect(r.pipes.map(p => [p.pipeType, p.startDepth, p.endDepth])).toEqual([['plain', 0, ft(9)], ['slotted', ft(9), ft(15)], ['plain', ft(15), ft(18)]]);
    expect(r.metadata).toMatchObject({ ownerName: 'Example School', address: 'Aliganj', city: 'Lucknow', boreDia: 15, pipeDia: 8 });
    expect(r.anomalies.map(a => a.code)).not.toContain('MULTI_BOREWELL_SHEET');
    expect(r.strata.every(l => l.materialId)).toBe(true);
  });
});
