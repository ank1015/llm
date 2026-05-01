import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannel } from '../shared/ipc-contract.js';

import type { DesktopApi } from '../shared/ipc-contract.js';

const api: DesktopApi = {
  getAppInfo: async () => ipcRenderer.invoke(IpcChannel.GetAppInfo),
  getBackendStatus: async () => ipcRenderer.invoke(IpcChannel.GetBackendStatus),
  pingBackend: async () => ipcRenderer.invoke(IpcChannel.PingBackend),
  setTitleBarTheme: async (theme) => ipcRenderer.invoke(IpcChannel.SetTitleBarTheme, theme),
  trashDesktopEntry: async (path) => ipcRenderer.invoke(IpcChannel.TrashDesktopEntry, path),
};

contextBridge.exposeInMainWorld('api', api);
