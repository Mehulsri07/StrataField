/**
 * Service to parse Excel spreadsheets.
 * Reads worksheet structures and sends row contents to the renderer for column mapping.
 */

import * as xlsx from 'xlsx';
import fs from 'node:fs';

export const excelParser = {
  parseFile(filePath: string): any[][] {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const workbook = xlsx.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert sheet rows to 2D grid array (header: 1 returns raw array of cells per row)
      const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      return rows;
    } catch (err) {
      console.error('Failed to parse Excel file:', err);
      throw err;
    }
  }
};
