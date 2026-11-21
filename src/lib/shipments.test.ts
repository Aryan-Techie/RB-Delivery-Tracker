import { describe, expect, it } from "vitest";
import { alertReasons, DEFAULT_SHIPMENT_SETTINGS, normalizeStage, purgeDelivered, type Shipment, type ShipmentData } from "./shipments";

const base: Shipment = { id: "1", trackingNumber: "TEST123", awb: "", shippedDate: "2026-11-01", name: "Example", address: "", country: "", postcode: "", carrier: "", service: "", weight: "", city: "", state: "", shop: "", stage: "pre_transit", events: [], lastChecked: null, lastError: null, sourceName: null, issue: false, note: "", deliveredAt: null };
const data = (shipments: Shipment[]): ShipmentData => ({ version: 1, shipments, settings: DEFAULT_SHIPMENT_SETTINGS });
describe("shipment attention and retention", () => {
  it("flags label-only shipments on the chosen day without claiming an unknown status", () => {
    expect(alertReasons(base, DEFAULT_SHIPMENT_SETTINGS, "2026-11-03")).toEqual([]);
    expect(alertReasons(base, DEFAULT_SHIPMENT_SETTINGS, "2026-11-04")).toContain("Pre-transit · 3 days");
    expect(alertReasons({ ...base, stage: "unknown" }, DEFAULT_SHIPMENT_SETTINGS, "2026-11-04")).toContain("No confirmed tracking status");
  });
  it("flags no movement separately and does not reset an active stage on same-stage scans", () => {
    const s: Shipment = { ...base, stage: "in_transit", events: [{ time: "2026-11-02", description: "accepted", stage: "accepted" }, { time: "2026-11-05", description: "moving", stage: "in_transit" }] };
    expect(alertReasons(s, { ...DEFAULT_SHIPMENT_SETTINGS, transitDays: 10 }, "2026-11-12")).toEqual(expect.arrayContaining(["In transit · 10 days", "No scan · 7 days"]));
  });
  it("keeps open issues and delivered shipments without reliable delivery dates", () => {
    const delivered = { ...base, stage: "delivered" as const, deliveredAt: "2026-11-01" };
    const held = { ...delivered, id: "2", issue: true };
    const unknownDate = { ...delivered, id: "3", deliveredAt: null };
    expect(purgeDelivered(data([delivered, held, unknownDate]), "2026-11-10").shipments).toHaveLength(3);
    expect(purgeDelivered(data([delivered, held, unknownDate]), "2026-11-11").shipments.map(s => s.id)).toEqual(["2", "3"]);
  });
  it("maps carrier events without inventing a delivered state", () => {
    expect(normalizeStage("registered")).toBe("pre_transit");
    expect(normalizeStage("customs")).toBe("in_transit");
    expect(normalizeStage("failed_attempt")).toBe("exception");
    expect(normalizeStage("something new")).toBe("unknown");
  });
});
