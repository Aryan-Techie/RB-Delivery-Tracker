import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeStage, type Shipment, type ShipmentData, type ShipmentEvent } from "./shipments";

type Result = { ok: true; stage: string; events: Array<ShipmentEvent & { local_time?: string | null }>; source: string; delivered_at: string | null } | { ok: false; error: string; kind: string; retry_after_ms: number | null };
type Update = (fn: (current: ShipmentData) => ShipmentData) => void;
const WAIT_MS = 30_000;
const RECHECK_MS = 6 * 60 * 60_000;
const ERROR_RECHECK_MS = 60 * 60_000;

export function useTracking(data: ShipmentData | null, update: Update) {
  const latest = useRef(data);
  latest.current = data;
  const busy = useRef(false);
  const lastAttempt = useRef(0);
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async (shipment: Shipment) => {
    if (!isTauri()) { setNotice("Tracking checks are available in the installed Windows app."); return; }
    if (busy.current || Date.now() - lastAttempt.current < WAIT_MS) { setNotice("Please wait a moment between tracking checks."); return; }
    busy.current = true;
    lastAttempt.current = Date.now();
    setChecking(shipment.id);
    setNotice("");
    const checkedAt = new Date().toISOString();
    try {
      const result = await invoke<Result>("track_shipment", { number: shipment.trackingNumber, carrier: shipment.carrier || null, postcode: shipment.postcode || null });
      update(current => ({ ...current, shipments: current.shipments.map(s => {
        if (s.id !== shipment.id || s.trackingNumber !== shipment.trackingNumber) return s;
        if (!result.ok) return { ...s, lastChecked: checkedAt, lastError: result.error || "Tracking is unavailable." };
        const stage = normalizeStage(result.stage);
        // An empty or unknown answer never erases previously known progress.
        if (stage === "unknown" && s.stage !== "unknown") return { ...s, lastChecked: checkedAt, lastError: "The source returned no confirmed status; showing the previous result." };
        const events = result.events.map(e => ({ ...e, time: e.time || e.local_time || null }));
        return { ...s, stage, events, sourceName: result.source || null, lastChecked: checkedAt, lastError: null,
          deliveredAt: stage === "delivered" ? (result.delivered_at || s.deliveredAt) : null };
      }) }));
    } catch {
      update(current => ({ ...current, shipments: current.shipments.map(s => s.id === shipment.id ? { ...s, lastChecked: checkedAt, lastError: "Tracking could not be checked. Try again later." } : s) }));
    } finally { busy.current = false; setChecking(null); }
  }, [update]);
  useEffect(() => {
    if (!isTauri()) return;
    const tick = () => {
      if (busy.current || Date.now() - lastAttempt.current < WAIT_MS) return;
      const due = latest.current?.shipments.find(s => s.stage !== "delivered" && (!s.lastChecked || Date.now() - new Date(s.lastChecked).getTime() >= (s.lastError ? ERROR_RECHECK_MS : RECHECK_MS)));
      if (due) void refresh(due);
    };
    const start = window.setTimeout(tick, 2000);
    const timer = window.setInterval(tick, WAIT_MS);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, [refresh]);
  return { checking, notice, refresh };
}
