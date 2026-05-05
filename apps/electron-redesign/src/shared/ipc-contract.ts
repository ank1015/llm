/**
 * Typed contract for Electron IPC channels exposed from the main process to the
 * renderer through the preload bridge.
 *
 * Keep this file pure (no runtime imports of `electron` or `node:*`) so it can
 * be safely consumed by the renderer bundle.
 */

export const IpcChannel = {
  GetAppInfo: 'app:get-info',
  GetBackendStatus: 'backend:get-status',
  PingBackend: 'backend:ping',
  SetTitleBarTheme: 'app:set-title-bar-theme',
  TrashDesktopEntry: 'desktop:trash-entry',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export type BackendStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
export type Theme = 'light' | 'dark';

export type Platform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd';

export interface AppInfo {
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
  readonly chromeVersion: string;
  readonly platform: Platform;
}

export interface BackendInfo {
  readonly status: BackendStatus;
  readonly url: string | null;
  readonly port: number | null;
  readonly error?: string;
}

export interface PingResult {
  readonly ok: boolean;
  readonly message: string;
  readonly timestamp: string;
}

/**
 * Shape of the API exposed on `window.api` via the preload contextBridge.
 * Renderer code should import this type to obtain typed access.
 */
export interface DesktopApi {
  readonly getAppInfo: () => Promise<AppInfo>;
  readonly getBackendStatus: () => Promise<BackendInfo>;
  readonly pingBackend: () => Promise<PingResult>;
  readonly setTitleBarTheme: (theme: Theme) => Promise<void>;
  readonly trashDesktopEntry: (path: string) => Promise<void>;
}
