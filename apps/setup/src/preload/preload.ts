import { contextBridge, ipcRenderer } from 'electron';

import type { DependencyCheck, LaunchResult } from '../shared/setup-api.js';

const setupApi = {
  checkDependencies: async (): Promise<DependencyCheck[]> =>
    ipcRenderer.invoke('setup:check-dependencies') as Promise<DependencyCheck[]>,
  launchMainApp: async (): Promise<LaunchResult> =>
    ipcRenderer.invoke('setup:launch-main-app') as Promise<LaunchResult>,
};

contextBridge.exposeInMainWorld('setupApp', setupApi);
