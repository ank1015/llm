import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { getGatewaySession, loginGateway, signOutGateway } from './gateway-credentials.js';
import { createEmbeddedServerController } from './server/embedded-server.js';

import type { RuntimeInfo } from '../shared/desktop-api.js';

const embeddedServer = createEmbeddedServerController();

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'LLM Desktop',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), 'dist/preload/preload.cjs'),
    },
  });

  void window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    'desktop:get-runtime-info',
    (): RuntimeInfo => ({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      server: embeddedServer.getState(),
    })
  );

  ipcMain.handle('desktop:get-gateway-session', () => getGatewaySession());

  ipcMain.handle(
    'desktop:login-gateway',
    (_event, credentials: { readonly username?: string; readonly password?: string }) =>
      loginGateway(credentials.username ?? '', credentials.password ?? '')
  );

  ipcMain.handle('desktop:sign-out-gateway', () => signOutGateway());
};

registerIpcHandlers();

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  void embeddedServer.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);

    return { action: 'deny' };
  });
});
