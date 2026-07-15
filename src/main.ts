import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDatabase } from './main/database/db';
import { registerAllIpcHandlers } from './main/ipc';
import { backupService } from './main/services/backupService';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Remove the native File/Edit/View/Window menu bar
Menu.setApplicationMenu(null);

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Explicit security settings — do not rely on Electron defaults which
      // could change between major versions without a visible compile error.
      contextIsolation: true,   // renderer cannot access Node/Electron APIs directly
      nodeIntegration: false,   // Node.js is not available in the renderer process
      sandbox: false,           // required for preload script to use Node APIs (path, ipcRenderer)
      webSecurity: true,        // enforces same-origin policy in the renderer
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  try {
    await initDatabase();
    registerAllIpcHandlers();

    // Periodic backup every 10 minutes — catches power cuts and task-kills that
    // skip before-quit. The backup service runs integrity_check before writing
    // so a bad DB is never silently backed up over a good one.
    const TEN_MINUTES = 10 * 60 * 1000;
    setInterval(() => {
      try {
        backupService.performBackup();
      } catch (err) {
        console.error('Periodic backup failed:', err);
      }
    }, TEN_MINUTES);
  } catch (err) {
    console.error('Failed to initialize database during startup:', err);
    // Still open the window — the renderer will show IPC errors rather than a blank crash
  }
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Perform database backup on exit
app.on('before-quit', () => {
  try {
    backupService.performBackup();
  } catch (err) {
    console.error('Failed to run automatic shutdown backup:', err);
  }
});
