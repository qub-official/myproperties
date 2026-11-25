const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  app: { info: invoke('app:info') },
  settings: { get: invoke('settings:get'), set: invoke('settings:set') },
  dialog: { folder: invoke('dialog:folder'), files: invoke('dialog:files'), save: invoke('dialog:save') },
  shell: { reveal: invoke('shell:reveal'), open: invoke('shell:open'), external: invoke('shell:external') },
  fs: { stat: invoke('fs:stat'), pathForFile: (file) => webUtils.getPathForFile(file) },
  drives: { list: invoke('drives:list') },
  scan: {
    start: invoke('scan:start'),
    cancel: invoke('scan:cancel'),
    children: invoke('scan:children'),
    search: invoke('scan:search'),
    largest: invoke('scan:largest'),
    types: invoke('scan:types'),
    path: invoke('scan:path'),
    export: invoke('scan:export'),
    onProgress: on('scan:progress'),
    onDone: on('scan:done'),
    onError: on('scan:error')
  },
  sys: { section: invoke('sys:section'), live: invoke('sys:live'), export: invoke('sys:export') },
  conv: {
    start: invoke('conv:start'),
    cancel: invoke('conv:cancel'),
    onProgress: on('conv:progress'),
    onIdle: on('conv:idle')
  },
  wp: {
    apply: invoke('wp:apply'),
    update: invoke('wp:update'),
    stop: invoke('wp:stop'),
    status: invoke('wp:status'),
    onStatus: on('wp:status')
  },
  theme: {
    state: invoke('theme:state'),
    mode: invoke('theme:mode'),
    transparency: invoke('theme:transparency'),
    accent: invoke('theme:accent'),
    wallpaper: invoke('theme:wallpaper'),
    list: invoke('theme:list'),
    apply: invoke('theme:apply'),
    restartExplorer: invoke('theme:restartExplorer')
  }
});
