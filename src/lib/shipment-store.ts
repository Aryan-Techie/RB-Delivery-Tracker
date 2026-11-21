import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { dayOf } from "./dates";
import { emptyShipments, loadShipmentData, purgeDelivered, type ShipmentData } from "./shipments";

const KEY = "rb-tracker-shipments";
async function read(): Promise<string | null> {
  return isTauri() ? invoke<string | null>("load_shipments") : localStorage.getItem(KEY);
}
async function write(data: ShipmentData): Promise<void> {
  const json = JSON.stringify(data);
  if (isTauri()) await invoke("save_shipments", { json });
  else localStorage.setItem(KEY, json);
}

export function useShipmentStore() {
  const [data, setData] = useState<ShipmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<ShipmentData>(emptyShipments());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const update = useCallback((fn: (current: ShipmentData) => ShipmentData) => {
    const next = fn(latest.current);
    latest.current = next;
    setData(next);
    chain.current = chain.current.catch(() => {}).then(() => write(next)).then(() => setError(null), () => { setError("Shipment changes could not be saved. Keep the app open and try again."); });
  }, []);
  useEffect(() => {
    let active = true;
    read().then(text => {
      if (!active) return;
      const loaded = loadShipmentData(text);
      const clean = purgeDelivered(loaded, dayOf(new Date()));
      latest.current = clean;
      setData(clean);
      if (clean !== loaded) chain.current = chain.current.then(() => write(clean)).catch(() => setError("Expired shipments could not be removed from disk."));
    }).catch(() => { if (active) setError("Shipment data could not be opened. No shipment data was changed."); });
    return () => { active = false; };
  }, []);
  return { data, update, error };
}
