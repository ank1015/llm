import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { getDesktopState } from './desktop-state.js';
import { createEmbeddedServerController } from './server/embedded-server.js';

import type { RuntimeInfo } from '../shared/desktop-api.js';

const embeddedServer = createEmbeddedServerController(app.getAppPath());

const createWindow = async (): Promise<void> => {
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

  try {
    const desktopState = await getDesktopState();
    const serverState = await embeddedServer.start({ projectsRoot: desktopState.projectsRoot });

    if (!serverState.url) {
      throw new Error('Embedded app did not return a URL.');
    }

    await window.loadURL(serverState.url);
  } catch (error) {
    await window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
    window.webContents.once('did-finish-load', () => {
      window.webContents.send(
        'desktop:startup-error',
        error instanceof Error ? error.message : 'Failed to start embedded app.'
      );
    });
  }
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
};

registerIpcHandlers();

app.whenReady().then(() => {
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
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
