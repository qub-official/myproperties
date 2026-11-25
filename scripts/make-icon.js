// Renders the app icon (SVG) to build/icon.png using Electron's offscreen renderer.
// Usage: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg', `<svg width="${SIZE}" height="${SIZE}"`)}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('wrote', out);
  app.quit();
});
