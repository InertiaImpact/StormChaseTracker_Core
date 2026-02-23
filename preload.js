const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  onToggleConfig: (cb) => ipcRenderer.on('toggle-config', (_e, show) => cb(show)),
  toggleFullscreen: (enable) => ipcRenderer.invoke('toggle-fullscreen', enable),
  intellishiftAuthorize: (creds) => ipcRenderer.invoke('intellishift-auth', creds),
  intellishiftGetVehicles: () => ipcRenderer.invoke('intellishift-vehicles'),
  intellishiftTokenStatus: () => ipcRenderer.invoke('intellishift-token-status'),
  onIntellishiftTokenStatus: (cb) => ipcRenderer.on('intellishift-token-status', (_e, data) => cb(data))
});
