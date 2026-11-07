// Render the icon SVGs to transparent 1024x1024 PNGs with Electron/Chromium.
// Usage: Electron.app/Contents/MacOS/Electron design/icon/tools/render.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'render');

const SIZE = 1024;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: false, textRendering: 'geometricPrecision' },
  });
  win.setContentSize(SIZE, SIZE);

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.svg'));
  for (const file of files) {
    const svg = fs.readFileSync(path.join(SRC, file), 'utf8');
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>html,body{margin:0;padding:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
      svg{display:block;width:${SIZE}px;height:${SIZE}px}</style></head>
      <body>${svg}</body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 700));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
    const png = image.resize({ width: SIZE, height: SIZE, quality: 'best' }).toPNG();
    const outFile = path.join(OUT, file.replace(/\.svg$/, '.png'));
    fs.writeFileSync(outFile, png);
    console.log('rendered', outFile, png.length, 'bytes');
  }
  win.destroy();
  app.quit();
});
