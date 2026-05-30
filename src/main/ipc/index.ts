/**
 * Main coordinator to register all Electron IPC handlers.
 */

import { registerBorewellHandlers } from './borewellHandlers';
import { registerStrataHandlers } from './strataHandlers';
import { registerPipeHandlers } from './pipeHandlers';
import { registerFileHandlers } from './fileHandlers';
import { registerGeocodeHandlers } from './geocodeHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerExportHandlers } from './exportHandlers';

export function registerAllIpcHandlers(): void {
  registerBorewellHandlers();
  registerStrataHandlers();
  registerPipeHandlers();
  registerFileHandlers();
  registerGeocodeHandlers();
  registerSettingsHandlers();
  registerExportHandlers();
}
