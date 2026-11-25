const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wallpaperApi', {
  onConfig: (cb) => ipcRenderer.on('wallpaper:config', (_e, cfg) => cb(cfg)),
  onPause: (cb) => ipcRenderer.on('wallpaper:pause', (_e, v) => cb(v)),
  ready: () => ipcRenderer.send('wallpaper:ready')
});
