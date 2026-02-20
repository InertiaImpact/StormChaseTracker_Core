const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  startNmea: () => ipcRenderer.invoke('start-nmea'),
  stopNmea: () => ipcRenderer.invoke('stop-nmea'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data))
});
