const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getVersion: () => ipcRenderer.invoke('get-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  fetchVersions: () => ipcRenderer.invoke('fetch-versions'),
  downloadApk: (opts) => ipcRenderer.invoke('download-apk', opts),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, v) => cb(v)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, p) => cb(p)),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close')
});
