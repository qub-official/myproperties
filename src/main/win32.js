// Thin Win32 bindings through koffi (no native compilation needed).
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');

const api = {
  FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)'),
  FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *name)'),
  SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp, uint32_t flags, uint32_t timeout, intptr_t result)'),
  SendMessageTimeoutStrW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, const char16_t *lp, uint32_t flags, uint32_t timeout, intptr_t result)'),
  EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)'),
  SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
  SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
  GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
  SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
  SetLayeredWindowAttributes: user32.func('bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
  GetClientRect: user32.func('bool __stdcall GetClientRect(intptr_t hwnd, _Out_ RECT *rect)'),
  ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
  IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
  SystemParametersInfoW: user32.func('bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, const char16_t *pv, uint32_t winIni)')
};

const C = {
  GWL_STYLE: -16,
  GWL_EXSTYLE: -20,
  WS_CHILD: 0x40000000,
  WS_VISIBLE: 0x10000000,
  WS_POPUP: 0x80000000,
  WS_CAPTION: 0x00C00000,
  WS_THICKFRAME: 0x00040000,
  WS_EX_LAYERED: 0x00080000,
  WS_EX_TOOLWINDOW: 0x00000080,
  WS_EX_APPWINDOW: 0x00040000,
  WS_EX_NOACTIVATE: 0x08000000,
  LWA_ALPHA: 0x2,
  SWP_NOSIZE: 0x1,
  SWP_NOMOVE: 0x2,
  SWP_NOZORDER: 0x4,
  SWP_NOACTIVATE: 0x10,
  SWP_FRAMECHANGED: 0x20,
  SWP_SHOWWINDOW: 0x40,
  SMTO_NORMAL: 0x0,
  SMTO_ABORTIFHUNG: 0x2,
  HWND_BROADCAST: 0xffff,
  WM_SETTINGCHANGE: 0x001A,
  SPI_SETDESKWALLPAPER: 0x0014,
  SPIF_UPDATEINIFILE: 0x1,
  SPIF_SENDCHANGE: 0x2
};

function hwndFromBuffer(buf) {
  return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
}

function getRect(hwnd) {
  const r = {};
  api.GetWindowRect(hwnd, r);
  return r;
}

function broadcastSettingChange(area) {
  try {
    api.SendMessageTimeoutStrW(C.HWND_BROADCAST, C.WM_SETTINGCHANGE, 0, area, C.SMTO_ABORTIFHUNG, 2000, 0);
  } catch (err) {
    console.error('broadcast failed', err);
  }
}

function setDesktopWallpaper(file) {
  return api.SystemParametersInfoW(C.SPI_SETDESKWALLPAPER, 0, file || '', C.SPIF_UPDATEINIFILE | C.SPIF_SENDCHANGE);
}

module.exports = { api, C, hwndFromBuffer, getRect, broadcastSettingChange, setDesktopWallpaper };
