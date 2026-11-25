const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

const settings = require('./settings');
const drives = require('./drives');
const sysinfo = require('./sysinfo');
const wallpaper = require('./wallpaper');
const themes = require('./themes');
const { Converter } = require('./converter');

const ROOT = path.join(__dirname, '..', '..');
const ICON = path.join(ROOT, 'build', 'icon.png');

const THEME_BG = {
  paper: { bg: '#FFFFFF', fg: '#0C0F14' },
  cream: { bg: '#F5F4F2', fg: '#0C0F14' },
  sand: { bg: '#E9E4E0', fg: '#0C0F14' },
  nude: { bg: '#EEE5E0', fg: '#0C0F14' },
  ink: { bg: '#0C0F14', fg: '#F5F4F2' }
};

let win = null;
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

// Wallpaper windows sit behind every other window; without this Chromium thinks
// they're hidden ("occluded") and stops painting the animation.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// Video wallpapers: hardware video overlays bypass the docked (layered child) window
// and show up black behind the desktop icons. Compose video through the GPU instead.
app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
app.commandLine.appendSwitch('disable-background-timer-throttling');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('io.github.myproperties.app');

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const theme = THEME_BG[settings.get('appTheme')] || THEME_BG.cream;
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: theme.bg,
    icon: ICON,
    title: 'MyProperties',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.bg, symbolColor: theme.fg, height: 44 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  // Dev helper: MP_CAPTURE=<dir> npm start  -> saves a PNG of every page (used for README screenshots).
  if (process.env.MP_CAPTURE) win.webContents.once('did-finish-load', () => captureAll(process.env.MP_CAPTURE));

  win.on('close', (e) => {
    if (!quitting && settings.get('closeToTray') && wallpaper.status().active) {
      e.preventDefault();
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function captureAll(dir) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  // packaged GUI apps have no console: mirror logs into the capture folder
  const logFile = path.join(dir, 'capture.log');
  for (const level of ['log', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...a) => { orig(...a); try { fs.appendFileSync(logFile, a.map(String).join(' ') + '\n'); } catch {} };
  }
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.message || e));
  win.setAlwaysOnTop(true);
  win.focus();
  const pages = (process.env.MP_CAPTURE_PAGES || 'home,explorer,system,audio,wallpaper,themes,about').split(',');
  await sleep(1500);
  for (const p of pages) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-nav="${p}"]').click()`);
    if (p === 'explorer' && process.env.MP_CAPTURE_SCAN) {
      // optionally show a finished scan of a folder in the screenshot
      const target = JSON.stringify(process.env.MP_CAPTURE_SCAN);
      await sleep(1500);
      const r = await win.webContents.executeJavaScript(`window.api.scan.start({ kind: 'path', paths: [${target}], label: ${target} }, true).then(JSON.stringify, (e) => 'ERR ' + e.message)`);
      console.log('scan start ->', r);
      for (let i = 0; i < 40; i++) {
        await sleep(1000);
        if (await win.webContents.executeJavaScript(`!document.querySelector('#ex-result').classList.contains('hidden')`)) break;
        console.log('waiting', i, await win.webContents.executeJavaScript(`document.querySelector('#ex-p-files').textContent`));
      }
      console.log('result visible ->', await win.webContents.executeJavaScript(`!document.querySelector('#ex-result').classList.contains('hidden')`));
      await win.webContents.executeJavaScript(`(document.querySelectorAll('#ex-tree .tree-row.dir')[1] || {}).click?.(); document.querySelector('#ex-result').scrollIntoView()`);
    }
    await sleep(p === 'system' || p === 'home' ? 9000 : 3000);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${p}.png`), img.toPNG());
  }
  if (process.env.MP_CAPTURE_QUIT !== '0') { quitting = true; app.quit(); }
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('MyProperties');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open MyProperties', click: showWindow },
    { type: 'separator' },
    {
      label: wallpaper.status().active ? 'Stop animated wallpaper' : 'Restore last wallpaper',
      enabled: wallpaper.status().active || !!settings.get('wallpaper'),
      click: async () => {
        if (wallpaper.status().active) await wallpaper.stop();
        else if (settings.get('wallpaper')) await wallpaper.apply(settings.get('wallpaper'));
        send('wp:status', wallpaper.status());
        rebuild();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  rebuild();
  tray.on('click', showWindow);
  tray.rebuild = rebuild;
}

// ---- folder scanner (worker thread) -------------------------------------------
let scanner = null;
let reqSeq = 0;
const pending = new Map();

function scannerRequest(type, payload = {}) {
  if (!scanner) return Promise.reject(new Error('No scan available. Run a scan first.'));
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    scanner.postMessage({ type, reqId, ...payload });
  });
}

// Never terminate() a worker mid-scan: it may be inside a native (koffi) call and
// that aborts the whole process. Instead flip the shared cancel flag and ask it to exit.
const retiring = new Set();
function disposeScanner(w) {
  if (!w) return;
  Atomics.store(w.cancelFlag, 0, 1);
  retiring.add(w);
  w.once('exit', () => retiring.delete(w));
  w.postMessage({ type: 'dispose' });
}

function startScan(source, includeFiles) {
  disposeScanner(scanner);
  scanner = null;
  for (const p of pending.values()) p.reject(new Error('Scan restarted'));
  pending.clear();
  const cancelBuf = new SharedArrayBuffer(4);
  const w = new Worker(path.join(__dirname, 'scanner-worker.js'), { workerData: { cancelBuf } });
  w.cancelFlag = new Int32Array(cancelBuf);
  scanner = w;
  w.on('message', (m) => {
    if (w !== scanner) return;
    if (m.type === 'progress') send('scan:progress', m);
    else if (m.type === 'done') { if (process.env.MP_CAPTURE) console.log('scan done', m.summary.files, 'files'); send('scan:done', m.summary); }
    else if (m.type === 'cancelled') send('scan:cancelled');
    else if (m.type === 'info') console.log('[scanner]', m.message);
    else if (m.type === 'error') { console.error('scan error', m.error); send('scan:error', m.error); }
    else if (m.type === 'reply') {
      const p = pending.get(m.reqId);
      if (!p) return;
      pending.delete(m.reqId);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    }
  });
  w.on('error', (e) => { console.error('scanner worker error', e); send('scan:error', e.message); });
  w.postMessage({ type: 'scan', source, includeFiles });
  return { ok: true };
}

// ---- system info exports ------------------------------------------------------------
function flatten(obj, prefix = '', lines = [], depth = 0) {
  if (obj === null || obj === undefined) return lines;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      if (v && typeof v === 'object') { lines.push(`${'  '.repeat(depth)}${prefix} #${i + 1}`); flatten(v, '', lines, depth + 1); }
      else lines.push(`${'  '.repeat(depth)}${prefix} #${i + 1}: ${v}`);
    });
    return lines;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      lines.push(`${'  '.repeat(depth)}${k}:`);
      flatten(v, k, lines, depth + 1);
    } else if (v !== '' && v !== null && v !== undefined) {
      lines.push(`${'  '.repeat(depth)}${k}: ${v}`);
    }
  }
  return lines;
}

function sysReportHtml(data) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const render = (v) => {
    if (v === null || v === undefined || v === '') return '<span class="m">—</span>';
    if (Array.isArray(v)) {
      if (!v.length) return '<span class="m">none</span>';
      if (typeof v[0] !== 'object') return esc(v.join(', '));
      return v.map((x) => `<div class="card">${render(x)}</div>`).join('');
    }
    if (typeof v === 'object') {
      return `<table>${Object.entries(v).map(([k, x]) => `<tr><th>${esc(k)}</th><td>${render(x)}</td></tr>`).join('')}</table>`;
    }
    return esc(v);
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PC report</title><style>
:root{--bg:#F5F4F2;--card:#fff;--ink:#0C0F14;--muted:#2E2F33;--line:#E9E4E0;--gold:#A87C3A}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Pretendard","Segoe UI",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:40px 24px}h1{margin:0 0 4px}h2{margin:32px 0 12px;color:var(--gold);text-transform:capitalize}
section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 20px}
table{border-collapse:collapse;width:100%}th{text-align:left;font-weight:600;color:var(--muted);width:240px;vertical-align:top;padding:4px 12px 4px 0}
td{padding:4px 0;word-break:break-word}.card{border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:6px 0}.m{color:#999}
</style></head><body><main><h1>PC report</h1><p>Generated by MyProperties on ${new Date().toLocaleString()}</p>
${Object.entries(data).map(([k, v]) => `<h2>${esc(k)}</h2><section>${render(v)}</section>`).join('')}
</main></body></html>`;
}

// ---- IPC --------------------------------------------------------------------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args));
}

function registerIpc() {
  const converter = new Converter(send);

  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, electron: process.versions.electron }));
  handle('settings:get', () => settings.all());
  handle('settings:set', (obj) => {
    const s = settings.merge(obj);
    if ('openAtLogin' in obj) {
      app.setLoginItemSettings({ openAtLogin: !!obj.openAtLogin, args: ['--hidden'] });
    }
    if (obj.appTheme && win) {
      const t = THEME_BG[obj.appTheme] || THEME_BG.cream;
      try { win.setTitleBarOverlay({ color: t.bg, symbolColor: t.fg }); } catch {}
      win.setBackgroundColor(t.bg);
    }
    return s;
  });

  handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:files', async (filters, multi = true) => {
    const r = await dialog.showOpenDialog(win, { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters });
    return r.canceled ? [] : r.filePaths;
  });
  handle('dialog:save', async (defaultPath, filters) => {
    const r = await dialog.showSaveDialog(win, { defaultPath, filters });
    return r.canceled ? null : r.filePath;
  });

  handle('shell:reveal', (p) => shell.showItemInFolder(p));
  handle('shell:open', (p) => shell.openPath(p));
  handle('shell:external', (url) => /^https?:/.test(url) && shell.openExternal(url));
  handle('fs:stat', (p) => { try { const s = fs.statSync(p); return { size: s.size, dir: s.isDirectory() }; } catch { return null; } });

  // explorer
  handle('drives:list', () => drives.listDrives());
  handle('scan:start', (source, includeFiles) => startScan(source, includeFiles));
  handle('scan:cancel', () => { disposeScanner(scanner); scanner = null; return { ok: true }; });
  handle('scan:children', (opts) => scannerRequest('children', opts));
  handle('scan:search', (q) => scannerRequest('search', { q }));
  handle('scan:largest', (opts) => scannerRequest('largest', opts || {}));
  handle('scan:types', () => scannerRequest('types'));
  handle('scan:path', (id) => scannerRequest('path', { id }));
  handle('scan:export', async ({ format, maxDepth, includeFiles, rootId = 0, suggested = 'folder-tree' }) => {
    const filters = { txt: 'Text tree', csv: 'CSV spreadsheet', json: 'JSON', html: 'HTML page' };
    const file = await dialog.showSaveDialog(win, {
      defaultPath: `${suggested}.${format}`,
      filters: [{ name: filters[format], extensions: [format] }]
    });
    if (file.canceled) return null;
    return scannerRequest('export', { format, file: file.filePath, maxDepth, includeFiles, rootId });
  });

  // system
  handle('sys:section', (key) => sysinfo.section(key));
  handle('sys:live', () => sysinfo.live());
  handle('sys:export', async (format) => {
    const file = await dialog.showSaveDialog(win, {
      defaultPath: `pc-report.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    });
    if (file.canceled) return null;
    const data = await sysinfo.all();
    if (format === 'json') fs.writeFileSync(file.filePath, JSON.stringify(data, null, 2));
    else if (format === 'html') fs.writeFileSync(file.filePath, sysReportHtml(data));
    else fs.writeFileSync(file.filePath, `PC report: MyProperties\n${new Date().toLocaleString()}\n\n` + flatten(data).join('\n'));
    return { ok: true, file: file.filePath };
  });

  // converter
  handle('conv:start', (jobs, opts) => {
    settings.set('converter', opts);
    return converter.start(jobs, opts);
  });
  handle('conv:cancel', (id) => converter.cancel(id));

  // wallpaper
  handle('wp:apply', async (config) => {
    const r = await wallpaper.apply(config);
    settings.set('wallpaper', config);
    createTray();
    tray?.rebuild?.();
    return r;
  });
  handle('wp:update', (partial) => {
    const r = wallpaper.update(partial);
    if (r.ok) settings.set('wallpaper', wallpaper.status().config);
    return r;
  });
  handle('wp:stop', async () => { const r = await wallpaper.stop(); tray?.rebuild?.(); return r; });
  handle('wp:status', () => wallpaper.status());

  // windows themes
  handle('theme:state', () => themes.getState());
  handle('theme:mode', (opts) => themes.setMode(opts));
  handle('theme:transparency', (on) => themes.setTransparency(on));
  handle('theme:accent', (opts) => themes.setAccent(opts));
  handle('theme:wallpaper', (opts) => themes.setStaticWallpaper(opts));
  handle('theme:list', () => themes.listThemeFiles());
  handle('theme:apply', (file) => themes.applyThemeFile(file));
  handle('theme:restartExplorer', () => themes.restartExplorer());
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  createTray();

  const last = settings.get('wallpaper');
  if (last && settings.get('restoreWallpaper')) {
    wallpaper.apply(last).then(() => tray?.rebuild?.()).catch((e) => console.error('restore wallpaper failed', e));
  }
});

let scannersStopped = false;
app.on('before-quit', (e) => {
  quitting = true;
  // let scan workers leave their native calls before Node tears them down
  if (!scannersStopped && (scanner || retiring.size)) {
    e.preventDefault();
    scannersStopped = true;
    disposeScanner(scanner);
    scanner = null;
    const done = () => app.quit();
    const timer = setTimeout(done, 3000);
    const check = setInterval(() => { if (!retiring.size) { clearInterval(check); clearTimeout(timer); done(); } }, 50);
  }
});
app.on('will-quit', () => { wallpaper.stop().catch(() => {}); });
app.on('window-all-closed', () => {
  if (!wallpaper.status().active) app.quit();
});
