const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  startSending: () => ipcRenderer.invoke('start-sending'),
  stopSending: () => ipcRenderer.invoke('stop-sending'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data))
});
