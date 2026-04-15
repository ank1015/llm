const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupApp', {
  checkDependencies: async () => ipcRenderer.invoke('setup:check-dependencies'),
  launchMainApp: async () => ipcRenderer.invoke('setup:launch-main-app'),
});
