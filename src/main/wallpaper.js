// Animated wallpaper engine: renders a BrowserWindow per display and docks it
// behind the desktop icons (supports the classic WorkerW layout and the
// Windows 11 24H2+ layout where WorkerW lives inside Progman).
const { BrowserWindow, screen, powerMonitor, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { api, C, hwndFromBuffer, getRect, setDesktopWallpaper } = require('./win32');
const { regQuery } = require('./ps');

let windows = [];
let current = null;
let listenersBound = false;

function findDesktopHost() {
  const progman = api.FindWindowW('Progman', null);
  if (!progman) throw new Error('Could not find the Windows desktop (Progman).');

  // Ask Explorer to spawn the WorkerW that sits behind the icons.
  api.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, C.SMTO_NORMAL, 1000, 0);
  api.SendMessageTimeoutW(progman, 0x052C, 0, 0, C.SMTO_NORMAL, 1000, 0);

  // Windows 11 24H2+: SHELLDLL_DefView and WorkerW are children of Progman.
  const defView = api.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  const innerWorker = api.FindWindowExW(progman, 0, 'WorkerW', null);
  if (defView && innerWorker) {
    return { mode: 'modern', parent: progman, insertAfter: defView };
  }

  // Classic layout: a top-level WorkerW right after the one that hosts DefView.
  let workerw = 0;
  api.EnumWindows((hwnd) => {
    if (api.FindWindowExW(hwnd, 0, 'SHELLDLL_DefView', null)) {
      workerw = api.FindWindowExW(0, hwnd, 'WorkerW', null);
    }
    return true;
  }, 0);
  if (workerw) return { mode: 'classic', parent: workerw, insertAfter: 0 };

  return { mode: 'fallback', parent: progman, insertAfter: defView || 0 };
}

function dock(win, display, host) {
  const hwnd = hwndFromBuffer(win.getNativeWindowHandle());
  const phys = screen.dipToScreenRect(null, display.bounds);
  const parentRect = getRect(host.parent);

  let style = Number(api.GetWindowLongPtrW(hwnd, C.GWL_STYLE));
  style = (style & ~(C.WS_POPUP | C.WS_CAPTION | C.WS_THICKFRAME)) | C.WS_CHILD | C.WS_VISIBLE;
  api.SetWindowLongPtrW(hwnd, C.GWL_STYLE, style);

  let ex = Number(api.GetWindowLongPtrW(hwnd, C.GWL_EXSTYLE));
  ex = (ex & ~C.WS_EX_APPWINDOW) | C.WS_EX_TOOLWINDOW | C.WS_EX_NOACTIVATE;
  if (host.mode === 'modern') ex |= C.WS_EX_LAYERED;
  api.SetWindowLongPtrW(hwnd, C.GWL_EXSTYLE, ex);
  if (host.mode === 'modern') api.SetLayeredWindowAttributes(hwnd, 0, 255, C.LWA_ALPHA);

  api.SetParent(hwnd, host.parent);

  const flags = C.SWP_NOACTIVATE | C.SWP_FRAMECHANGED | C.SWP_SHOWWINDOW | (host.insertAfter ? 0 : C.SWP_NOZORDER);
  const x = phys.x - parentRect.left;
  const y = phys.y - parentRect.top;
  api.SetWindowPos(hwnd, host.insertAfter || 0, x, y, phys.width, phys.height, flags);

  // Safety net: if the drawable (client) area is still smaller than the window
  // (leftover frame insets), grow the window so the content covers every pixel.
  const outer = getRect(hwnd);
  const client = {};
  api.GetClientRect(hwnd, client);
  const padX = (outer.right - outer.left) - (client.right - client.left);
  const padY = (outer.bottom - outer.top) - (client.bottom - client.top);
  if (padX > 0 || padY > 0) {
    const left = Math.floor(padX / 2);
    api.SetWindowPos(hwnd, host.insertAfter || 0, x - left, y, phys.width + padX, phys.height + padY,
      C.SWP_NOACTIVATE | (host.insertAfter ? 0 : C.SWP_NOZORDER));
  }
  return hwnd;
}

function wallpaperPayload(config) {
  const out = { ...config };
  if (config.src && (config.type === 'video' || config.type === 'image')) {
    out.srcUrl = pathToFileURL(config.src).href;
  }
  return out;
}

// Resolves when a wallpaper page reports that its content is on screen.
const readyWaiters = new Map();
ipcMain.on('wallpaper:ready', (e) => {
  const fn = readyWaiters.get(e.sender.id);
  if (fn) { readyWaiters.delete(e.sender.id); fn(); }
});
function whenReady(win, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const id = win.webContents.id;
    const timer = setTimeout(() => { readyWaiters.delete(id); resolve(false); }, timeoutMs);
    readyWaiters.set(id, () => { clearTimeout(timer); resolve(true); });
  });
}

let applySeq = 0;
async function apply(config) {
  const seq = ++applySeq;
  // Keep the current wallpaper on screen while the new one loads (a video can
  // take several seconds to start); swap only once the new one is ready.
  const previous = windows;
  if (!previous.length) staticWallpaper = (await regQuery('HKCU\\Control Panel\\Desktop', 'WallPaper')) || '';
  const displays = config.displays === 'primary' ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
  const fresh = [];

  try {
    for (const display of displays) {
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        show: false,
        frame: false,
        // no invisible resize border: with it the page is inset ~7px and the old
        // wallpaper peeks through at the screen edges
        thickFrame: false,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#0C0F14',
        webPreferences: {
          preload: path.join(__dirname, '..', 'wallpaper', 'wallpaper-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          autoplayPolicy: 'no-user-gesture-required'
        }
      });
      win.setMenu(null);
      fresh.push({ win, display });
      await win.loadFile(path.join(__dirname, '..', 'wallpaper', 'wallpaper.html'));
      const ready = whenReady(win);
      win.webContents.send('wallpaper:config', wallpaperPayload(config));
      fresh[fresh.length - 1].ready = ready;
    }
    await Promise.all(fresh.map((f) => f.ready));
    if (seq !== applySeq) throw new Error('superseded'); // a newer apply() started meanwhile

    const host = findDesktopHost();
    for (const { win, display } of fresh) {
      win.showInactive();
      dock(win, display, host);
    }
    windows = fresh.map((f) => f.win);
    for (const w of previous) if (!w.isDestroyed()) w.destroy();
    current = config;
    bindPowerListeners();
    if (config.pauseOnBattery && powerMonitor.isOnBatteryPower()) broadcast('wallpaper:pause', true);
    return { ok: true, mode: host.mode, displays: displays.length };
  } catch (err) {
    // throw away the half-built wallpaper; whatever was running stays as it is
    for (const { win } of fresh) if (!win.isDestroyed()) win.destroy();
    if (err.message === 'superseded') return { ok: false, superseded: true };
    throw err;
  }
}

function broadcast(channel, payload) {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

function bindPowerListeners() {
  if (listenersBound) return;
  listenersBound = true;
  powerMonitor.on('on-battery', () => current?.pauseOnBattery && broadcast('wallpaper:pause', true));
  powerMonitor.on('on-ac', () => broadcast('wallpaper:pause', false));
  powerMonitor.on('lock-screen', () => broadcast('wallpaper:pause', true));
  powerMonitor.on('unlock-screen', () => broadcast('wallpaper:pause', !!(current?.pauseOnBattery && powerMonitor.isOnBatteryPower())));
  screen.on('display-metrics-changed', () => current && apply(current).catch(() => {}));
  screen.on('display-added', () => current && apply(current).catch(() => {}));
  screen.on('display-removed', () => current && apply(current).catch(() => {}));
}

// Remember the static wallpaper while ours is running so we can repaint it
// synchronously on stop (even if the app is quitting right after).
let staticWallpaper = null;

async function stop({ refresh = true } = {}) {
  applySeq++; // cancel any apply() that is still loading
  const had = windows.length > 0;
  const list = windows;
  windows = [];
  current = null;
  for (const w of list) if (!w.isDestroyed()) w.destroy();
  if (had && refresh) {
    // Repaint the desktop so the normal wallpaper comes back.
    setDesktopWallpaper(staticWallpaper ?? (await regQuery('HKCU\\Control Panel\\Desktop', 'WallPaper')) ?? '');
  }
  return { ok: true };
}

function update(partial) {
  if (!current) return { ok: false };
  current = { ...current, ...partial };
  broadcast('wallpaper:config', wallpaperPayload(current));
  return { ok: true };
}

module.exports = {
  apply,
  stop,
  update,
  status: () => ({ active: windows.length > 0, config: current })
};
