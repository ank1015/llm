import { app, BrowserWindow } from 'electron';

import { createBackendController } from '../backend/server.js';

import { registerIpcHandlers } from './ipc/register-ipc.js';
import { createMainWindow } from './windows/main-window.js';

const backend = createBackendController();

const bootstrap = async (): Promise<void> => {
  await backend.start();
  registerIpcHandlers(backend);
  await createMainWindow();
};

app.whenReady().then(() => {
  void bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  void backend.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
