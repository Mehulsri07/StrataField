/**
 * IPC handlers for report exports (PDF and Excel formats).
 */

import fs from 'node:fs';
import path from 'node:path';
import { safeHandle } from './safeHandle';
import { pdfExporter } from '../services/pdfExporter';
import { excelExporter } from '../services/excelExporter';
import { IPC_CHANNELS } from '../../shared/types';

export function registerExportHandlers(): void {
  // Handle PDF compilation
  safeHandle(IPC_CHANNELS.EXPORT_PDF, async (event, borewellIds: string[], savePath: string) => {
    try {
      await pdfExporter.exportRecords(borewellIds, savePath, (current, total) => {
        event.sender.send('export:progress', current, total);
      });
      return { success: true };
    } catch (err: any) {
      console.error('IPC EXPORT_PDF Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Handle Excel compilation
  safeHandle(IPC_CHANNELS.EXPORT_EXCEL, async (event, borewellIds: string[], savePath: string) => {
    try {
      await excelExporter.exportRecords(borewellIds, savePath, (current, total) => {
        event.sender.send('export:progress', current, total);
      });
      return { success: true };
    } catch (err: any) {
      console.error('IPC EXPORT_EXCEL Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Handle PNG Image saving from base64 dataURL
  safeHandle(IPC_CHANNELS.EXPORT_PNG, async (_event, dataUrl: string, savePath: string) => {
    try {
      // Security: validate the savePath has a valid image extension
      const resolved = path.resolve(savePath);
      const ext = path.extname(resolved).toLowerCase();
      if (ext !== '.png') {
        return { success: false, error: 'Invalid file extension — only .png is allowed.' };
      }

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(resolved, base64Data, 'base64');
      return { success: true };
    } catch (err: any) {
      console.error('IPC EXPORT_PNG Failed:', err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
