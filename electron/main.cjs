// Electron main process: one window, and the data file on disk.
//
// Data: %APPDATA%\RB Tracker\rb-tracker-data.json, written atomically (temp file,
// then rename). One copy per day goes to the backups folder; the newest 60 are
// kept. Uninstalling the app leaves the data in place.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Development keeps its own data folder; RB_USER_DATA (scripts/shoot.cjs) points at a scratch one.
if (process.env.RB_USER_DATA) app.setPath("userData", process.env.RB_USER_DATA);
else if (!app.isPackaged) app.setPath("userData", path.join(app.getPath("appData"), "RB Tracker Dev"));

const DATA_DIR = app.getPath("userData");
const DATA_FILE = path.join(DATA_DIR, "rb-tracker-data.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const KEEP_BACKUPS = 60;

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isValidJson(text) {
  try {
    const obj = JSON.parse(text);
    return obj && Array.isArray(obj.rings);
  } catch {
    return false;
  }
}

function backupOncePerDay() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `rb-tracker-data-${today()}.json`);
  if (!fs.existsSync(target)) {
    const text = fs.readFileSync(DATA_FILE, "utf8");
    if (isValidJson(text)) fs.writeFileSync(target, text, "utf8");
  }
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^rb-tracker-data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  }
}

function newestGoodBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const f of files) {
    const text = fs.readFileSync(path.join(BACKUP_DIR, f), "utf8");
    if (isValidJson(text)) return { name: f, text };
  }
  return null;
}

ipcMain.handle("data:load", () => {
  if (!fs.existsSync(DATA_FILE)) return { json: null };
  const text = fs.readFileSync(DATA_FILE, "utf8");
  if (isValidJson(text)) {
    try {
      backupOncePerDay();
    } catch (err) {
      console.error("backup failed", err);
    }
    return { json: text };
  }
  // The main file is damaged: keep it aside and fall back to the newest backup.
  fs.copyFileSync(DATA_FILE, path.join(DATA_DIR, `rb-tracker-data.damaged-${Date.now()}.json`));
  const backup = newestGoodBackup();
  return backup ? { json: backup.text, recoveredFrom: backup.name } : { json: null };
});

ipcMain.handle("data:save", (_event, json) => {
  if (typeof json !== "string" || !isValidJson(json)) throw new Error("Refusing to save invalid data");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, DATA_FILE);
});

ipcMain.handle("data:export-csv", async (event, { fileName, text }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, {
    title: "Export to Excel",
    defaultPath: path.join(app.getPath("documents"), String(fileName)),
    filters: [{ name: "CSV (Excel)", extensions: ["csv"] }],
  });
  if (res.canceled || !res.filePath) return false;
  // BOM so Excel opens it as UTF-8.
  fs.writeFileSync(res.filePath, "﻿" + String(text), "utf8");
  return true;
});

ipcMain.handle("data:open-folder", async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await shell.openPath(DATA_DIR);
});

ipcMain.handle("data:path", () => DATA_FILE);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: "RB Tracker",
    backgroundColor: "#f5f5f7",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "dist", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  // Nothing in the app opens other pages; keep it that way.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  if (process.env.RB_DEV_URL) mainWindow.loadURL(process.env.RB_DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
