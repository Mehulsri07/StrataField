/**
 * Excel export: one workbook with a sheet each for borewells, soil layers, pipes and water readings.
 * Column headings are plain English so the file makes sense to anyone who opens it.
 */
import * as xlsx from 'xlsx';
import type { BorewellRecord } from '../types';

const LOCATION: Record<string, string> = {
  gps: 'GPS', photo: "Photo's GPS", map: 'Picked on map', typed: 'Typed in', address: 'Approximate (address)', imported: 'From Excel', unknown: '',
};

export function exportRows(records: BorewellRecord[]) {
  const borewells = records.map(({ borewell: b }) => ({
    'Borewell ID': b.borewellId,
    Owner: b.ownerName,
    Zone: b.project,
    'House / plot': b.houseNo,
    Address: b.address,
    Area: b.area,
    City: b.city,
    Latitude: b.latitude,
    Longitude: b.longitude,
    'Location from': LOCATION[b.locationSource] ?? '',
    'Date drilled': b.date,
    'Total depth (ft)': b.totalDepth,
    'Water level (ft)': b.waterLevel,
    'Water level while pumping (ft)': b.dynamicWaterLevel,
    'Hole size (inch)': b.boreDia,
    'Pipe size (inch)': b.pipeDia,
    'Drilling method': b.drillingMethod ?? '',
    'Ground height above sea level (m)': b.groundElevationM,
    Notes: b.remarks,
  }));
  const layers = records.flatMap(({ borewell: b, strata }) => strata.map(l => ({
    'Borewell ID': b.borewellId,
    'From (ft)': l.startDepth,
    'To (ft)': l.endDepth,
    'Thickness (ft)': Math.round((l.endDepth - l.startDepth) * 10) / 10,
    'Soil type': l.material,
    'Holds water': l.waterBearing ? 'Yes' : '',
    Notes: l.remarks,
  })));
  const pipes = records.flatMap(({ borewell: b, pipes }) => pipes.map(p => ({
    'Borewell ID': b.borewellId,
    'From (ft)': p.startDepth,
    'To (ft)': p.endDepth,
    Type: p.pipeType === 'slotted' ? 'Screen pipe' : 'Plain pipe',
    'Size (inch)': p.diameter ?? b.pipeDia,
  })));
  const water = records.flatMap(({ borewell: b, waterReadings }) => waterReadings.map(w => ({
    'Borewell ID': b.borewellId,
    'Measured on': w.measuredOn,
    'Water level (ft)': w.staticLevel,
    'While pumping (ft)': w.dynamicLevel,
    Notes: w.remarks || w.source,
  })));
  return { borewells, layers, pipes, water };
}

/** Builds the .xlsx file as bytes. */
export function buildWorkbook(records: BorewellRecord[]): Uint8Array {
  const rows = exportRows(records);
  const wb = xlsx.utils.book_new();
  const add = (name: string, data: object[], heading: string[]) => {
    const ws = data.length ? xlsx.utils.json_to_sheet(data) : xlsx.utils.aoa_to_sheet([heading]);
    const cols = Object.keys(data[0] ?? Object.fromEntries(heading.map(h => [h, '']))).map(k => ({
      wch: Math.min(40, Math.max(k.length, ...data.map(r => String((r as Record<string, unknown>)[k] ?? '').length)) + 2),
    }));
    ws['!cols'] = cols;
    xlsx.utils.book_append_sheet(wb, ws, name);
  };
  add('Borewells', rows.borewells, ['Borewell ID']);
  add('Soil layers', rows.layers, ['Borewell ID', 'From (ft)', 'To (ft)', 'Soil type']);
  add('Pipes', rows.pipes, ['Borewell ID', 'From (ft)', 'To (ft)', 'Type']);
  add('Water readings', rows.water, ['Borewell ID', 'Measured on', 'Water level (ft)']);
  return xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
