const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('receiver-get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('receiver-set-config', cfg),
  onStatus: (cb) => ipcRenderer.on('receiver-status', (_e, data) => cb(data))
});
