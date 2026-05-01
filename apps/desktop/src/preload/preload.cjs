const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  getRuntimeInfo: async () => ipcRenderer.invoke('desktop:get-runtime-info'),
  onStartupError: (callback) => {
    ipcRenderer.on('desktop:startup-error', (_event, message) => callback(message));
  },
});
