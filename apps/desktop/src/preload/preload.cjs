const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  getRuntimeInfo: async () => ipcRenderer.invoke('desktop:get-runtime-info'),
});
