import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStrataLogs, readSheetRows } from '../parser/strataFieldParser';
import { logTemplateBytes, logTemplateWorkbook, logTemplateRows, TEMPLATE_EXAMPLE } from './logTemplate';

/** The log as it comes back after being saved as an .xlsx file and opened again. */
const roundTrip = (wb: XLSX.WorkBook) => readSheetRows(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));

describe('the Excel log template', () => {
  it('reads back every detail filled in, exactly', () => {
    const [log] = parseStrataLogs(logTemplateRows(TEMPLATE_EXAMPLE));
    expect(log.success).toBe(true);
    expect(log.anomalies.filter((a) => a.severity === 'critical')).toEqual([]);
    expect(log.metadata).toMatchObject({
      siteName: 'Sharma Residence', ownerName: 'Sharma Residence', address: 'B-12, Sector 4, Vikas Nagar', city: 'Lucknow',
      date: '2026-03-14', boreDia: 10, pipeDia: 4, totalDepth: 400, waterLevel: 95, pumpLowering: 220,
      pumpHp: 15, pumpModel: 'KSB 3C/15', detectedUnit: 'ft', location: { latitude: 26.8912, longitude: 80.9876 },
    });
  });

  it('reads back every layer and every pipe, in feet', () => {
    const [log] = parseStrataLogs(logTemplateRows(TEMPLATE_EXAMPLE));
    expect(log.strata.map((l) => [l.startDepth, l.endDepth, l.materialId])).toEqual([
      [0, 20, 'clay'], [20, 50, 'medium_sand'], [50, 100, 'clay'], [100, 140, 'coarse_sand'], [140, 180, 'clay_kankar'],
      [180, 230, 'medium_sand'], [230, 310, 'clay'], [310, 360, 'fine_sand'], [360, 400, 'clay'],
    ]);
    expect(log.pipes.map((p) => [p.startDepth, p.endDepth, p.pipeType])).toEqual([
      [0, 100, 'plain'], [100, 140, 'slotted'], [140, 180, 'plain'], [180, 230, 'slotted'], [230, 400, 'plain'],
    ]);
    expect(log.strata.every((l) => l.materialId)).toBe(true); // every soil name on the list is recognised
  });

  it('survives being saved and opened as a real Excel file', () => {
    const [log] = parseStrataLogs(roundTrip(logTemplateWorkbook()).length ? roundTrip(exampleOnly()) : []);
    expect(log.metadata.waterLevel).toBe(95);
    expect(log.strata).toHaveLength(9);
  });

  it('opens on the blank log, which reads as an empty log rather than as something else', () => {
    const rows = roundTrip(logTemplateWorkbook());
    const [log] = parseStrataLogs(rows);
    expect(log.strata).toEqual([]);
    expect(log.metadata.location).toBeNull();
    expect(log.anomalies.some((a) => a.code === 'NON_STANDARD_FORMAT')).toBe(false);
  });

  it('saves as an Excel file that opens on the blank log', () => {
    const wb = XLSX.read(logTemplateBytes(), { type: 'array' });
    expect(wb.SheetNames[0]).toBe('Log');
  });

  it('lists every built-in soil name on its own sheet, and how to fill it in', () => {
    const wb = logTemplateWorkbook();
    expect(wb.SheetNames).toEqual(['Log', 'Example', 'Soil names', 'How to fill it in']);
    const soils = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Soil names'], { header: 1 }).flat();
    expect(soils).toEqual(expect.arrayContaining(['Clay', 'Fine Sand', 'Coarse Sand', 'Kankar', 'Plain pipe', 'Slotted pipe']));
  });
});

/** The template with its example as the first sheet, as a driller's filled-in copy would be. */
function exampleOnly() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logTemplateRows(TEMPLATE_EXAMPLE)), 'Log');
  return wb;
}

describe('a Location line in any log', () => {
  const log = (line: string) => parseStrataLogs(logTemplateRows({ ...TEMPLATE_EXAMPLE, location: '' }).map((r) => (String(r[0] ?? '').startsWith('Location') ? [line, ...r.slice(1)] : r)))[0];

  it('reads numbers or a Google Maps link', () => {
    expect(log('Location = 26.8512, 80.9467').metadata.location).toEqual({ latitude: 26.8512, longitude: 80.9467 });
    expect(log('Location = https://maps.google.com/?q=26.8512,80.9467').metadata.location).toEqual({ latitude: 26.8512, longitude: 80.9467 });
    expect(log('GPS : 26.8512 N 80.9467 E').metadata.location).toEqual({ latitude: 26.8512, longitude: 80.9467 });
  });

  it('reads nothing from a line that is not a position', () => {
    expect(log('Location = near the water tank').metadata.location).toBeNull();
  });
});

describe('a title above the chart', () => {
  it('is not taken for the chart heading, even when it says "Streta Chart"', () => {
    const rows = logTemplateRows(TEMPLATE_EXAMPLE);
    rows[0] = ['STRETA CHART OF TUBE WELL'];
    const [log] = parseStrataLogs(rows);
    expect(log.success).toBe(true);
    expect(log.strata).toHaveLength(9);
    expect(log.anomalies.some((a) => a.code === 'MULTI_BOREWELL_SHEET')).toBe(false);
  });
});
