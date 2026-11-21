// Where the data lives. Inside the desktop app (Tauri) the Rust backend reads and
// writes a JSON file in the user's AppData folder. In a plain browser (development
// only) it falls back to localStorage.

import { type Data, emptyData, normalizeData } from "./model";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface LoadResult {
  json: string | null;
  /** Set when the main file was unreadable and a backup was used instead. */
  recoveredFrom?: string;
}

export interface Store {
  load(): Promise<LoadResult>;
  save(json: string): Promise<void>;
  exportCsv(fileName: string, text: string): Promise<boolean>;
  openDataFolder(): Promise<void>;
  dataPath(): Promise<string>;
}

declare global {
  interface Window {
    rbStore?: Store;
  }
}

const LS_KEY = "rb-tracker-data";

const browserStore: Store = {
  async load() {
    try {
      return { json: localStorage.getItem(LS_KEY) };
    } catch {
      return { json: null };
    }
  },
  async save(json) {
    localStorage.setItem(LS_KEY, json);
  },
  async exportCsv(fileName, text) {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },
  async openDataFolder() {},
  async dataPath() {
    return "Browser storage (development)";
  },
};

const tauriStore: Store = {
  load: () => invoke<LoadResult>("load_data"),
  save: (json) => invoke("save_data", { json }),
  exportCsv: (fileName, text) => invoke<boolean>("export_csv", { fileName, text }),
  openDataFolder: () => invoke("open_data_folder"),
  dataPath: () => invoke<string>("data_path"),
};
export const store: Store = isTauri() ? tauriStore : window.rbStore ?? browserStore;
export const isDesktop = isTauri() || Boolean(window.rbStore);

export async function loadData(): Promise<{ data: Data; notice?: string }> {
  const res = await store.load();
  if (!res.json) return { data: emptyData() };
  const data = normalizeData(JSON.parse(res.json));
  return {
    data,
    notice: res.recoveredFrom ? `The data file was damaged. Restored from backup ${res.recoveredFrom}.` : undefined,
  };
}

export async function saveData(data: Data): Promise<void> {
  await store.save(JSON.stringify(data));
}
