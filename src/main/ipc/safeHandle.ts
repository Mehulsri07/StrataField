/**
 * Utility to register IPC handlers safely without double-registration errors during hot reloads.
 */

import { ipcMain } from 'electron';

export function safeHandle(channel: string, listener: (...args: any[]) => any): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}
