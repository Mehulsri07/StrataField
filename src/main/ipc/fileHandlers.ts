/**
 * IPC handlers for photos, attachments, and native file dialogs.
 */

import { dialog, BrowserWindow, shell } from 'electron';
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

  safeHandle('file:openPath', (_event, filePath: string) => {
    return shell.openPath(filePath);
  });

  // Native Electron Dialog handlers
  // Use event.sender to reliably get the originating BrowserWindow in both dev and
  // packaged builds. BrowserWindow.getFocusedWindow() returns null in production when
  // the window loses OS focus during the async IPC round-trip.
  safeHandle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (event, options: Electron.OpenDialogOptions) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return { canceled: true, filePaths: [] };
      return await dialog.showOpenDialog(win, options);
    } catch (err) {
      console.error('DIALOG_OPEN_FILE error:', err);
      return { canceled: true, filePaths: [] };
    }
  });

  safeHandle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async (event, options: Electron.OpenDialogOptions) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return { canceled: true, filePaths: [] };
      return await dialog.showOpenDialog(win, {
        ...options,
        properties: ['openDirectory', ...(options.properties || [])]
      });
    } catch (err) {
      console.error('DIALOG_OPEN_DIRECTORY error:', err);
      return { canceled: true, filePaths: [] };
    }
  });

  safeHandle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (event, options: Electron.SaveDialogOptions) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return { canceled: true, filePath: '' };
      return await dialog.showSaveDialog(win, options);
    } catch (err) {
      console.error('DIALOG_SAVE_FILE error:', err);
      return { canceled: true, filePath: '' };
    }
  });

  // Excel parsing
  safeHandle(IPC_CHANNELS.EXCEL_PARSE, (_event, filePath: string) => {
    return excelParser.parseFile(filePath);
  });
}
