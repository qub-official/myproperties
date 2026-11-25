// Windows personalization: light/dark mode, accent color, transparency,
// static wallpaper and .theme files.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { regQuery, regSetDword, regSetString, regSetBinary, runPS } = require('./ps');
const { broadcastSettingChange, setDesktopWallpaper } = require('./win32');

const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const DWM = 'HKCU\\Software\\Microsoft\\Windows\\DWM';
const ACCENT = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent';
const DESKTOP = 'HKCU\\Control Panel\\Desktop';

const hex2 = (n) => n.toString(16).padStart(2, '0');

function parseHex(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color || '');
  if (!m) throw new Error('Invalid color ' + color);
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function mix({ r, g, b }, target, amount) {
  return {
    r: Math.round(r + (target - r) * amount),
    g: Math.round(g + (target - g) * amount),
    b: Math.round(b + (target - b) * amount)
  };
}

async function getState() {
  const [apps, system, transparency, accentDword, prevalenceTaskbar, prevalenceTitle, wallpaper, style, tile] = await Promise.all([
    regQuery(PERSONALIZE, 'AppsUseLightTheme'),
    regQuery(PERSONALIZE, 'SystemUsesLightTheme'),
    regQuery(PERSONALIZE, 'EnableTransparency'),
    regQuery(DWM, 'AccentColor'),
    regQuery(PERSONALIZE, 'ColorPrevalence'),
    regQuery(DWM, 'ColorPrevalence'),
    regQuery(DESKTOP, 'WallPaper'),
    regQuery(DESKTOP, 'WallpaperStyle'),
    regQuery(DESKTOP, 'TileWallpaper')
  ]);

  let accent = null;
  if (typeof accentDword === 'number') {
    // AccentColor is stored as 0xAABBGGRR
    const r = accentDword & 255, g = (accentDword >> 8) & 255, b = (accentDword >> 16) & 255;
    accent = '#' + hex2(r) + hex2(g) + hex2(b);
  }

  return {
    appsLight: apps !== 0,
    systemLight: system === 1,
    transparency: transparency !== 0,
    accent,
    accentOnTaskbar: prevalenceTaskbar === 1,
    accentOnTitleBars: prevalenceTitle === 1,
    wallpaper: wallpaper || '',
    wallpaperStyle: styleName(String(style ?? '10'), String(tile ?? '0'))
  };
}

function styleName(style, tile) {
  if (tile === '1') return 'tile';
  return { '0': 'center', '2': 'stretch', '6': 'fit', '10': 'fill', '22': 'span' }[style] || 'fill';
}

async function setMode({ appsLight, systemLight }) {
  if (typeof appsLight === 'boolean') await regSetDword(PERSONALIZE, 'AppsUseLightTheme', appsLight ? 1 : 0);
  if (typeof systemLight === 'boolean') await regSetDword(PERSONALIZE, 'SystemUsesLightTheme', systemLight ? 1 : 0);
  broadcastSettingChange('ImmersiveColorSet');
  return getState();
}

async function setTransparency(on) {
  await regSetDword(PERSONALIZE, 'EnableTransparency', on ? 1 : 0);
  broadcastSettingChange('ImmersiveColorSet');
  return getState();
}

async function setAccent({ color, onTaskbar, onTitleBars }) {
  if (color) {
    const base = parseHex(color);
    // 8-swatch palette Windows uses for Start/taskbar/hover states: light -> dark.
    const swatches = [
      mix(base, 255, 0.6), mix(base, 255, 0.4), mix(base, 255, 0.2), base,
      mix(base, 0, 0.2), mix(base, 0, 0.4), mix(base, 0, 0.6), mix(base, 0, 0.75)
    ];
    const paletteHex = swatches.map((c) => hex2(c.r) + hex2(c.g) + hex2(c.b) + '00').join('');
    const abgr = (0xff << 24 | base.b << 16 | base.g << 8 | base.r) >>> 0;
    const argb = (0xc4 << 24 | base.r << 16 | base.g << 8 | base.b) >>> 0;
    const dark = swatches[4];
    const darkAbgr = (0xff << 24 | dark.b << 16 | dark.g << 8 | dark.r) >>> 0;

    await regSetDword(DESKTOP, 'AutoColorization', 0).catch(() => {});
    await regSetBinary(ACCENT, 'AccentPalette', paletteHex);
    await regSetDword(ACCENT, 'AccentColorMenu', abgr);
    await regSetDword(ACCENT, 'StartColorMenu', darkAbgr);
    await regSetDword(DWM, 'AccentColor', abgr);
    await regSetDword(DWM, 'ColorizationColor', argb);
    await regSetDword(DWM, 'ColorizationAfterglow', argb);
  }
  if (typeof onTaskbar === 'boolean') await regSetDword(PERSONALIZE, 'ColorPrevalence', onTaskbar ? 1 : 0);
  if (typeof onTitleBars === 'boolean') await regSetDword(DWM, 'ColorPrevalence', onTitleBars ? 1 : 0);
  broadcastSettingChange('ImmersiveColorSet');
  return getState();
}

async function setStaticWallpaper({ file, style = 'fill' }) {
  const map = { fill: ['10', '0'], fit: ['6', '0'], stretch: ['2', '0'], tile: ['0', '1'], center: ['0', '0'], span: ['22', '0'] };
  const [ws, tw] = map[style] || map.fill;
  await regSetString(DESKTOP, 'WallpaperStyle', ws);
  await regSetString(DESKTOP, 'TileWallpaper', tw);
  if (file) setDesktopWallpaper(file);
  else {
    const currentFile = await regQuery(DESKTOP, 'WallPaper');
    setDesktopWallpaper(currentFile || '');
  }
  return getState();
}

function listThemeFiles() {
  const dirs = [
    { dir: path.join(process.env.WINDIR || 'C:\\Windows', 'Resources', 'Themes'), source: 'Windows' },
    { dir: path.join(process.env.WINDIR || 'C:\\Windows', 'Resources', 'Easy of Access Themes'), source: 'Contrast' },
    { dir: path.join(process.env.WINDIR || 'C:\\Windows', 'Resources', 'Ease of Access Themes'), source: 'Contrast' },
    { dir: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Themes'), source: 'Yours' }
  ];
  const out = [];
  const seen = new Set();
  for (const { dir, source } of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.theme')) continue;
      const full = path.join(dir, e.name);
      if (seen.has(full.toLowerCase())) continue;
      seen.add(full.toLowerCase());
      out.push({ name: readThemeName(full) || e.name.replace(/\.theme$/i, ''), file: full, source });
    }
  }
  return out;
}

function readThemeName(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const m = /^\s*DisplayName\s*=\s*(.+)$/im.exec(text);
    if (!m) return null;
    const v = m[1].trim();
    return v.startsWith('@') ? null : v; // skip resource references like @%SystemRoot%\...
  } catch {
    return null;
  }
}

async function applyThemeFile(file) {
  const err = await shell.openPath(file);
  if (err) throw new Error(err);
  return { ok: true };
}

async function restartExplorer() {
  await runPS('Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 800; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer }');
  return { ok: true };
}

module.exports = { getState, setMode, setTransparency, setAccent, setStaticWallpaper, listThemeFiles, applyThemeFile, restartExplorer };
