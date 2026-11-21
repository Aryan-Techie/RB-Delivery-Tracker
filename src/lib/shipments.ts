import { daysBetween, dayOf } from "./dates";
import type { ImportedShipment } from "./shipment-import";

export type ShipmentStage = "unknown" | "pre_transit" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
export interface ShipmentEvent { time: string | null; description: string; location?: string | null; stage?: string | null }
export interface Shipment extends Omit<ImportedShipment, "warnings" | "source"> {
  id: string;
  stage: ShipmentStage;
  events: ShipmentEvent[];
  lastChecked: string | null;
  lastError: string | null;
  sourceName: string | null;
  issue: boolean;
  note: string;
  deliveredAt: string | null;
}
export interface ShipmentSettings { preTransitDays: number; noScanDays: number; transitDays: number; outForDeliveryDays: number }
export const DEFAULT_SHIPMENT_SETTINGS: ShipmentSettings = { preTransitDays: 3, noScanDays: 7, transitDays: 21, outForDeliveryDays: 2 };
export interface ShipmentData { version: 1; shipments: Shipment[]; settings: ShipmentSettings }
export function emptyShipments(): ShipmentData { return { version: 1, shipments: [], settings: { ...DEFAULT_SHIPMENT_SETTINGS } }; }

export function loadShipmentData(text: string | null): ShipmentData {
  if (!text) return emptyShipments();
  const raw = JSON.parse(text) as Partial<ShipmentData>;
  if (!raw || raw.version !== 1 || !Array.isArray(raw.shipments)) throw new Error("Invalid shipment data file");
  return { version: 1, shipments: raw.shipments, settings: { ...DEFAULT_SHIPMENT_SETTINGS, ...raw.settings } };
}

function validDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dayOf(d);
}

export function lastScanDay(shipment: Shipment): string | null {
  return shipment.events.map(e => validDay(e.time)).filter((d): d is string => !!d).sort().at(-1) ?? null;
}

export function alertReasons(s: Shipment, settings: ShipmentSettings, today: string): string[] {
  const reasons: string[] = [];
  const lastScan = lastScanDay(s);
  const dated = s.events.map(e => ({ day: validDay(e.time), stage: normalizeStage(e.stage) })).filter((e): e is { day: string; stage: ShipmentStage } => !!e.day).sort((a, b) => a.day.localeCompare(b.day));
  let stageStart: string | null = null;
  for (const event of dated) { if (event.stage === s.stage) stageStart ??= event.day; else stageStart = null; }
  stageStart ??= s.stage === "pre_transit" ? validDay(s.shippedDate) : null;
  const age = (d: string) => Math.max(0, daysBetween(d, today));
  if (s.issue) reasons.push("Issue marked for follow-up");
  if (s.stage === "exception") reasons.push("Delivery exception");
  if (s.stage === "unknown" && s.shippedDate && age(s.shippedDate) >= settings.preTransitDays) reasons.push("No confirmed tracking status");
  if (s.stage === "pre_transit" && stageStart && age(stageStart) >= settings.preTransitDays) reasons.push(`Pre-transit · ${age(stageStart)} days`);
  if (s.stage === "in_transit" && stageStart && age(stageStart) >= settings.transitDays) reasons.push(`In transit · ${age(stageStart)} days`);
  if (s.stage === "out_for_delivery" && stageStart && age(stageStart) >= settings.outForDeliveryDays) reasons.push(`Out for delivery · ${age(stageStart)} days`);
  if (s.stage !== "delivered" && lastScan && age(lastScan) >= settings.noScanDays) reasons.push(`No scan · ${age(lastScan)} days`);
  if (s.lastError) reasons.push("Tracking check failed");
  return reasons;
}

export function normalizeStage(stage: string | null | undefined): ShipmentStage {
  const s = (stage ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["info_received", "pre_transit", "pending", "registered", "label_created"].includes(s)) return "pre_transit";
  if (["in_transit", "transit", "accepted", "customs"].includes(s)) return "in_transit";
  if (["out_for_delivery", "outfordelivery"].includes(s)) return "out_for_delivery";
  if (["delivered"].includes(s)) return "delivered";
  if (["exception", "failed_attempt", "delivery_failure", "alert", "available_for_pickup", "ready_for_pickup", "pickup", "returned", "expired", "undelivered"].includes(s)) return "exception";
  return "unknown";
}

export function purgeDelivered(data: ShipmentData, today: string): ShipmentData {
  const shipments = data.shipments.filter(s => {
    const delivered = validDay(s.deliveredAt);
    return s.issue || s.stage !== "delivered" || !delivered || daysBetween(delivered, today) < 10;
  });
  return shipments.length === data.shipments.length ? data : { ...data, shipments };
}

export function fromImport(row: ImportedShipment): Shipment {
  const { warnings: _warnings, source: _source, ...fields } = row;
  return { ...fields, id: crypto.randomUUID(), stage: "unknown", events: [], lastChecked: null, lastError: null, sourceName: null, issue: false, note: "", deliveredAt: null };
}
