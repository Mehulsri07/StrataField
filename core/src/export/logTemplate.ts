/**
 * An Excel template for drilling logs, laid out exactly as StrataField's reader expects (the usual
 * field log: details down column A, soil chart in B–D, pipe in F–H). Filled in and imported, every
 * detail comes back without anything to check. Built from code so the template and the reader can
 * be tested together (logTemplate.test.ts).
 */
import * as XLSX from 'xlsx';
import { DEFAULT_MATERIALS } from '../constants';

type Cell = string | number | null;

export interface TemplateValues {
  name: string;
  address: string;
  city: string;
  /** Inches. */
  boreDia: string;
  pipeDia: string;
  /** Feet. */
  totalDepth: string;
  waterLevel: string;
  pumpLowering: string;
  pump: string;
  /** DD-MM-YYYY. */
  date: string;
  /** "26.8512, 80.9467" or a Google Maps link. */
  location: string;
  /** Each layer by the depth of its bottom, in feet, top first. */
  layers: [number, string][];
  /** Each pipe piece by the depth of its bottom, in feet; each must end at a layer's bottom. */
  pipes: [number, string][];
}

export const BLANK: TemplateValues = {
  name: '', address: '', city: 'Lucknow', boreDia: '', pipeDia: '', totalDepth: '', waterLevel: '',
  pumpLowering: '', pump: '', date: '', location: '', layers: [], pipes: [],
};

export const TEMPLATE_EXAMPLE: TemplateValues = {
  name: 'Sharma Residence', address: 'B-12, Sector 4, Vikas Nagar', city: 'Lucknow',
  boreDia: '10', pipeDia: '4', totalDepth: '400', waterLevel: '95', pumpLowering: '220', pump: 'KSB 3C/15 , 15 HP',
  date: '14-03-2026', location: '26.8912, 80.9876',
  layers: [[20, 'Clay'], [50, 'Sand'], [100, 'Clay'], [140, 'Coarse Sand'], [180, 'Clay Kankar'], [230, 'Sand'], [310, 'Clay'], [360, 'Fine Sand'], [400, 'Clay']],
  pipes: [[100, 'Plain pipe'], [140, 'Slotted pipe'], [180, 'Plain pipe'], [230, 'Slotted pipe'], [400, 'Plain pipe']],
};

/** Rows for the layer chart in a blank log: enough for a deep borewell with many layers. */
const BLANK_LAYER_ROWS = 60;

/**
 * The log as rows of cells. The title must not contain "strata chart" or "lowering assembly": the
 * reader looks for those words to find where the chart starts.
 */
export function logTemplateRows(v: TemplateValues = BLANK): Cell[][] {
  const details: string[] = [
    v.name, v.address, v.city, '',
    `Pump Lowering = ${v.pumpLowering}${v.pumpLowering ? ' ft' : ''}`,
    `Pump = ${v.pump}`,
    `Water Level = ${v.waterLevel}${v.waterLevel ? ' ft' : ''}`,
    `Bore Dia = ${v.boreDia}${v.boreDia ? '"' : ''} / ${v.totalDepth} ft`,
    `Tube Well = ${v.pipeDia}${v.pipeDia ? '"' : ''} / ${v.totalDepth} ft`,
    `Date = ${v.date}`,
    `Location = ${v.location}`,
  ];
  const pipes = new Map(v.pipes);
  const count = Math.max(v.layers.length || BLANK_LAYER_ROWS, details.length);
  const rows: Cell[][] = [
    ['Tube well record — Drinking Water Organisation'],
    [],
    [null, null, 'Strata Chart', null, null, 'Lowering Assembly'],
    ['Site:', 'G. L.', v.boreDia ? `${v.boreDia}"` : null, 'G. L.', null, 'G. L.', v.pipeDia ? `${v.pipeDia}"` : null],
  ];
  for (let i = 0; i < count; i++) {
    const [bottom, soil] = v.layers[i] ?? [null, null];
    const pipe = bottom != null ? pipes.get(bottom) : undefined;
    rows.push([details[i] || null, bottom, null, soil, null, pipe ?? null, null, pipe ? bottom : null]);
  }
  return rows;
}

const PIPE_NAMES = ['Plain pipe', 'Slotted pipe', 'Ribbed screen', 'Blind pipe'];

const HOW_TO = [
  ['How to fill in the log'],
  [],
  ['Make one copy of this file for each borewell, and fill in the sheet called "Log". Keep it as the first sheet.'],
  ['The sheet called "Example" shows a borewell filled in. StrataField reads the first sheet only.'],
  [],
  ['Column A, under "Site:"'],
  ['  Line 1: the site or owner name.  Line 2: the address (house or plot number, sector, colony).  Line 3: the city.'],
  ['  Then leave one line empty.'],
  ['  Then write each number after the "=" already there. Depths in feet.'],
  ['  Date: day-month-year, for example 14-03-2026.'],
  ['  Location: stand at the borewell, open Google Maps on the phone, press and hold on the blue dot,'],
  ['  and copy the numbers that appear (for example 26.8912, 80.9876). A Google Maps link also works.'],
  [],
  ['Columns B and D: the soil layers, one row per layer, from the top down'],
  ['  B: the depth in feet where the layer ends (its bottom).  D: the soil, written as on the "Soil names" sheet.'],
  ['  Leave the remaining rows empty. Do not write depths below the bottom of the borewell.'],
  [],
  ['Columns F and H: the pipe lowered, one row per piece, from the top down'],
  ['  F: the kind of pipe (see "Soil names").  H: the depth in feet where that piece ends.'],
  ['  Write a pipe piece on the row of the layer whose bottom is at the same depth.'],
  [],
  ['Do not move the headings, add columns, or merge cells.'],
];

/** The template as an .xlsx file's bytes, ready to save. */
export const logTemplateBytes = () => new Uint8Array(XLSX.write(logTemplateWorkbook(), { type: 'array', bookType: 'xlsx' }));

/** The template workbook: the blank log first, then an example, the names to use, and instructions. */
export function logTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const widths = [{ wch: 42 }, { wch: 10 }, { wch: 4 }, { wch: 18 }, { wch: 4 }, { wch: 18 }, { wch: 6 }, { wch: 10 }];
  for (const [name, values] of [['Log', BLANK], ['Example', TEMPLATE_EXAMPLE]] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(logTemplateRows(values));
    sheet['!cols'] = widths;
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  const soils = DEFAULT_MATERIALS.filter((m) => m.lithologyFamily !== 'NONE').map((m) => [m.name]);
  const names = XLSX.utils.aoa_to_sheet([['Soil names (column D)'], ...soils, [], ['Pipe names (column F)'], ...PIPE_NAMES.map((p) => [p])]);
  names['!cols'] = [{ wch: 28 }];
  XLSX.utils.book_append_sheet(wb, names, 'Soil names');
  const how = XLSX.utils.aoa_to_sheet(HOW_TO);
  how['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, how, 'How to fill it in');
  return wb;
}
