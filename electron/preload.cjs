// Exposes a small, fixed API to the page. The page never gets Node access.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rbStore", {
  load: () => ipcRenderer.invoke("data:load"),
  save: (json) => ipcRenderer.invoke("data:save", json),
  exportCsv: (fileName, text) => ipcRenderer.invoke("data:export-csv", { fileName, text }),
  openDataFolder: () => ipcRenderer.invoke("data:open-folder"),
  dataPath: () => ipcRenderer.invoke("data:path"),
});
