import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import { buildWorkbook, exportRows } from './excel';
import type { BorewellRecord } from '../types';

const record: BorewellRecord = {
  borewell: {
    id: 'b1', projectId: 'p', project: 'Zone 1 · Old City', borewellId: 'BW-2026-019', ownerName: 'Pradeep Mishra', houseNo: '', area: 'Aminabad',
    city: 'Lucknow', address: '', latitude: 26.846, longitude: 80.927, locationSource: 'gps', locationAccuracyM: null, groundElevationM: null,
    elevationSource: null, boreDia: 10, pipeDia: 6, totalDepth: 340, waterLevel: 124, dynamicWaterLevel: null, depthUnit: 'ft',
    drillingMethod: 'DTH', recordQuality: 'good', remarks: '', date: '2026-08-08', createdAt: '', updatedAt: '', importBatchId: null,
    importSource: null, importMethod: 'manual', deletedAt: null, waterLevelOn: '2026-08-08',
  },
  strata: [
    { id: 's1', borewellId: 'b1', startDepth: 0, endDepth: 15, material: 'Clay', materialId: 'clay', color: '#000', pattern: 'lines', remarks: 'Top soil', waterBearing: false },
    { id: 's2', borewellId: 'b1', startDepth: 15, endDepth: 76, material: 'Yellow Sand', materialId: 'yellow_sand', color: '#000', pattern: 'dots', remarks: '', waterBearing: true },
  ],
  pipes: [{ id: 'p1', borewellId: 'b1', startDepth: 0, endDepth: 130, pipeType: 'plain', pipeSubtype: 'PLAIN', diameter: null }],
  waterReadings: [{ id: 'w1', borewellId: 'b1', measuredOn: '2026-08-08', staticLevel: 124, dynamicLevel: null, source: 'When drilled', remarks: '' }],
  photos: [], files: [], history: [],
};

describe('Excel export', () => {
  it('uses plain column headings and one row per item', () => {
    const rows = exportRows([record]);
    expect(rows.borewells[0]).toMatchObject({ 'Borewell ID': 'BW-2026-019', 'Water level (ft)': 124, 'Location from': 'GPS' });
    expect(rows.layers.map(l => [l['Soil type'], l['Thickness (ft)'], l['Holds water']])).toEqual([['Clay', 15, ''], ['Yellow Sand', 61, 'Yes']]);
    expect(rows.pipes[0]).toMatchObject({ Type: 'Plain pipe', 'Size (inch)': 6 });
    expect(rows.water[0]).toMatchObject({ 'Notes': 'When drilled' });
  });

  it('writes a workbook with four sheets that opens again', () => {
    const wb = xlsx.read(buildWorkbook([record]), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Borewells', 'Soil layers', 'Pipes', 'Water readings']);
    const layers = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Soil layers']);
    expect(layers).toHaveLength(2);
    expect(layers[1]['Soil type']).toBe('Yellow Sand');
  });

  it('still writes headings when there is nothing to export', () => {
    const wb = xlsx.read(buildWorkbook([]), { type: 'array' });
    expect(xlsx.utils.sheet_to_json(wb.Sheets.Borewells, { header: 1 })[0]).toEqual(['Borewell ID']);
  });
});
