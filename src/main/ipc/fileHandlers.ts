/**
 * IPC handlers for photos, attachments, and native file dialogs.
 */

import { dialog, BrowserWindow } from 'electron';
import { safeHandle } from './safeHandle';
import { photoRepository } from '../database/photoRepository';
import { fileRepository } from '../database/fileRepository';
import { excelParser } from '../services/excelParser';
import { IPC_CHANNELS } from '../../shared/types';

export function registerFileHandlers(): void {
  // Photos CRUD
  safeHandle(IPC_CHANNELS.PHOTO_GET, (_event, borewellId: string) => {
    return photoRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.PHOTO_ADD, (_event, photo: any) => {
    return photoRepository.add(photo);
  });

  safeHandle(IPC_CHANNELS.PHOTO_DELETE, (_event, id: string) => {
    return photoRepository.delete(id);
  });

  // Reference files
  safeHandle(IPC_CHANNELS.FILE_GET, (_event, borewellId: string) => {
    return fileRepository.getByBorewellId(borewellId);
  });

  safeHandle(IPC_CHANNELS.FILE_SAVE, (_event, borewellId: string, files: any) => {
    return fileRepository.save(borewellId, files);
  });

  // Native Electron Dialog handlers
  safeHandle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (_event, options: Electron.OpenDialogOptions) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(window, options);
  });

  safeHandle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async (_event, options: Electron.OpenDialogOptions) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(window, {
      ...options,
      properties: ['openDirectory', ...(options.properties || [])]
    });
  });

  safeHandle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (_event, options: Electron.SaveDialogOptions) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return { canceled: true, filePath: '' };
    return dialog.showSaveDialog(window, options);
  });

  // Excel parsing
  safeHandle(IPC_CHANNELS.EXCEL_PARSE, (_event, filePath: string) => {
    return excelParser.parseFile(filePath);
  });
}
