import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';

import {
  isWithinDesktop,
  resolveDesktopPath,
} from '../../backend/services/desktop-files-service.js';
import { IpcChannel } from '../../shared/ipc-contract.js';

import type { BackendController } from '../../backend/server.js';
import type { AppInfo, BackendInfo, PingResult, Theme } from '../../shared/ipc-contract.js';

const titleBarBackgroundByTheme: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#202021',
};

/**
 * Register IPC handlers exposed to the renderer through the preload bridge.
 *
 * Keep handlers thin — heavy logic belongs in `src/backend/services/*` so it
 * can be reused across HTTP routes and IPC calls.
 */
export const registerIpcHandlers = (backend: BackendController): void => {
  ipcMain.handle(IpcChannel.GetAppInfo, (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome ?? 'unknown',
      platform: process.platform,
    };
  });

  ipcMain.handle(IpcChannel.GetBackendStatus, (): BackendInfo => backend.getInfo());

  ipcMain.handle(IpcChannel.SetTitleBarTheme, (event, theme: Theme): void => {
    if (theme !== 'light' && theme !== 'dark') {
      return;
    }

    nativeTheme.themeSource = theme;
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setBackgroundColor(titleBarBackgroundByTheme[theme]);
  });

  ipcMain.handle(IpcChannel.TrashDesktopEntry, async (_event, path: unknown): Promise<void> => {
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new Error('path is required');
    }

    const targetPath = resolveDesktopPath(path);

    if (!isWithinDesktop(targetPath)) {
      throw new Error('Path is outside the allowed root');
    }

    await shell.trashItem(targetPath);
  });

  ipcMain.handle(IpcChannel.PingBackend, async (): Promise<PingResult> => {
    const info = backend.getInfo();

    if (info.status !== 'running' || info.url === null) {
      return {
        ok: false,
        message: `Backend is not running (status: ${info.status}).`,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${info.url}/api/health`);

      if (!response.ok) {
        return {
          ok: false,
          message: `Backend health check failed with HTTP ${String(response.status)}.`,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        message: `Backend is healthy at ${info.url}.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown backend error.',
        timestamp: new Date().toISOString(),
      };
    }
  });
};
