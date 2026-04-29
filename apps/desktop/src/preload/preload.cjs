const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  getGatewaySession: async () => ipcRenderer.invoke('desktop:get-gateway-session'),
  getRuntimeInfo: async () => ipcRenderer.invoke('desktop:get-runtime-info'),
  loginGateway: async (credentials) => ipcRenderer.invoke('desktop:login-gateway', credentials),
  signOutGateway: async () => ipcRenderer.invoke('desktop:sign-out-gateway'),
});
