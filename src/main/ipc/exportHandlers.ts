/**
 * IPC handlers for report exports (PDF and Excel formats).
 */

import { safeHandle } from './safeHandle';
import { pdfExporter } from '../services/pdfExporter';
import { excelExporter } from '../services/excelExporter';
import { IPC_CHANNELS } from '../../shared/types';

export function registerExportHandlers(): void {
  // Handle PDF compilation
  safeHandle(IPC_CHANNELS.EXPORT_PDF, async (_event, borewellIds: string[], savePath: string) => {
    try {
      await pdfExporter.exportRecords(borewellIds, savePath);
      return { success: true };
    } catch (err: any) {
      console.error('IPC EXPORT_PDF Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Handle Excel compilation
  safeHandle(IPC_CHANNELS.EXPORT_EXCEL, async (_event, borewellIds: string[], savePath: string) => {
    try {
      await excelExporter.exportRecords(borewellIds, savePath);
      return { success: true };
    } catch (err: any) {
      console.error('IPC EXPORT_EXCEL Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
