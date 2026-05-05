import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, nativeTheme, shell } from 'electron';

const dirname = fileURLToPath(new URL('.', import.meta.url));

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

/**
 * Create the primary application window. In development electron-vite serves
 * the renderer over HTTP via `ELECTRON_RENDERER_URL`; in production the bundled
 * `index.html` is loaded from the packaged app directory.
 */
export const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: '',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202021' : '#ffffff',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(dirname, '../preload/preload.mjs'),
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle('');
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);

    return { action: 'deny' };
  });

  if (isDev) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

    if (rendererUrl !== undefined && rendererUrl !== '') {
      await window.loadURL(rendererUrl);
    }
  } else {
    await window.loadFile(join(dirname, '../renderer/index.html'));
  }

  return window;
};
