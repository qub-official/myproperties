// Tiny JSON settings store kept in the user's AppData folder.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  appTheme: 'cream',
  wallpaper: null,          // last applied wallpaper config
  restoreWallpaper: true,   // re-apply wallpaper when the app starts
  openAtLogin: false,
  closeToTray: true,
  converter: { format: 'mp3', bitrate: 192, sampleRate: 0, channels: 0, normalize: false, outDir: '' }
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('settings save failed', err);
  }
}

module.exports = {
  all: () => ({ ...load() }),
  get: (key) => load()[key],
  set(key, value) {
    load()[key] = value;
    save();
    return value;
  },
  merge(obj) {
    Object.assign(load(), obj);
    save();
    return { ...cache };
  }
};
