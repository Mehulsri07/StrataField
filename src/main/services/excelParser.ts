import * as xlsx from 'xlsx';
import fs from 'node:fs';

export const excelParser = {
  parseFile(filePath: string): { cells: Record<string, { v: any; w: string }>; rows: any[][] } {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const workbook = xlsx.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert worksheet keys (A1, B2, etc.) to a coordinate lookup map
      const cells: Record<string, { v: any; w: string }> = {};
      Object.keys(worksheet).forEach((key) => {
        if (!key.startsWith('!')) {
          const cell = worksheet[key];
          if (cell) {
            cells[key] = {
              v: cell.v !== undefined ? cell.v : null,
              w: cell.w || (cell.v !== undefined ? String(cell.v) : '')
            };
          }
        }
      });

      // Convert sheet rows to 2D grid array
      const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      return { cells, rows };
    } catch (err) {
      console.error('Failed to parse Excel file:', err);
      throw err;
    }
  }
};
