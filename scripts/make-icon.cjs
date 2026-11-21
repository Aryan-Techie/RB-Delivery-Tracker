// Renders scripts/icon.html to build/icon.png (installer + exe icon) and
// public/icon.png (window icon). Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadFile(path.join(root, "scripts", "icon.html"));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png = img.resize({ width: 512, height: 512 }).toPNG();
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(path.join(root, "build", "icon.png"), png);
  fs.writeFileSync(path.join(root, "public", "icon.png"), png);
  console.log("icon written");
  app.quit();
});
