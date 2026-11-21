// Data model and every rule of the tracker. Pure functions: no I/O, no clock
// reads (callers pass `now` / `today`), so all of it is unit-tested.
//
// A ring is one PDF number. Each time it goes to the manufacturer is a trip:
// the first trip is "new", every later one is a "repair". A trip with no
// receivedAt is still at the manufacturer.
//
// Due date = the day it was sent + the allowed days (6 for new, 2 for repair by
// default). On the due date it shows "Due today"; from the day after it is
// red ("Late").

import { addDays, dayOf, daysBetween } from "./dates";
import { cleanLabel, hasLetterPrefix, parseList, trackingKey } from "./ids";

export type TripKind = "new" | "repair";

export interface Trip {
  kind: TripKind;
  sentAt: string; // ISO instant
  receivedAt: string | null;
}

export interface Ring {
  id: string;
  key: string;
  label: string;
  createdAt: string;
  trips: Trip[];
}

export interface Settings {
  businessName: string;
  newDays: number;
  repairDays: number;
}

export interface Data {
  version: 1;
  rings: Ring[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { businessName: "", newDays: 6, repairDays: 2 };

export function emptyData(): Data {
  return { version: 1, rings: [], settings: { ...DEFAULT_SETTINGS } };
}

export const DAYS_MIN = 1;
export const DAYS_MAX = 60;

export function validDays(n: number): boolean {
  return Number.isInteger(n) && n >= DAYS_MIN && n <= DAYS_MAX;
}

/** Accept a loaded file, filling anything missing. Throws on a file that is not ours. */
export function normalizeData(raw: unknown): Data {
  if (!raw || typeof raw !== "object") throw new Error("Not a tracker file");
  const obj = raw as Partial<Data>;
  if (!Array.isArray(obj.rings)) throw new Error("Not a tracker file");
  const s = (obj.settings ?? {}) as Partial<Settings>;
  const settings: Settings = {
    businessName: typeof s.businessName === "string" ? s.businessName : "",
    newDays: validDays(Number(s.newDays)) ? Number(s.newDays) : DEFAULT_SETTINGS.newDays,
    repairDays: validDays(Number(s.repairDays)) ? Number(s.repairDays) : DEFAULT_SETTINGS.repairDays,
  };
  const rings = obj.rings.filter(
    (r): r is Ring =>
      !!r && typeof r.id === "string" && typeof r.key === "string" && typeof r.label === "string" && Array.isArray(r.trips),
  );
  return { version: 1, rings, settings };
}

// ── Status ──────────────────────────────────────────────────────────────────

export type Level = "ontime" | "due" | "late";

export interface RingView {
  ring: Ring;
  trip: Trip;
  /** 0 for the first trip, 1 for the first repair, ... */
  repairNo: number;
  out: boolean;
  sentDay: string;
  dueDay: string;
  allowed: number;
  /** Days since sent (out) or days it took (back). */
  days: number;
  /** For an open trip: on time, due today or late. For a closed trip: whether it came back late. */
  level: Level;
  /** Days past the due date (0 when not late). */
  lateBy: number;
  receivedDay: string | null;
  lastActivity: string;
}

export function allowedDays(kind: TripKind, s: Settings): number {
  return kind === "repair" ? s.repairDays : s.newDays;
}

export function viewTrip(ring: Ring, index: number, settings: Settings, today: string): RingView {
  const trip = ring.trips[index];
  const allowed = allowedDays(trip.kind, settings);
  const sentDay = dayOf(trip.sentAt);
  const dueDay = addDays(sentDay, allowed);
  const out = trip.receivedAt === null;
  const receivedDay = trip.receivedAt ? dayOf(trip.receivedAt) : null;
  const endDay = receivedDay ?? today;
  const days = Math.max(0, daysBetween(sentDay, endDay));
  const lateBy = Math.max(0, daysBetween(dueDay, endDay));
  let level: Level;
  if (lateBy > 0) level = "late";
  else if (out && endDay === dueDay) level = "due";
  else level = "ontime";
  const repairNo = ring.trips.slice(0, index + 1).filter((t) => t.kind === "repair").length;
  return {
    ring,
    trip,
    repairNo: trip.kind === "repair" ? repairNo : 0,
    out,
    sentDay,
    dueDay,
    allowed,
    days,
    level,
    lateBy,
    receivedDay,
    lastActivity: trip.receivedAt ?? trip.sentAt,
  };
}

/** Status of a ring = its latest trip. */
export function viewRing(ring: Ring, settings: Settings, today: string): RingView {
  return viewTrip(ring, ring.trips.length - 1, settings, today);
}

export function viewAll(data: Data, today: string): RingView[] {
  return data.rings.filter((r) => r.trips.length > 0).map((r) => viewRing(r, data.settings, today));
}

/** Out first by urgency: most days late, then due today, then soonest due. */
export function byUrgency(a: RingView, b: RingView): number {
  if (a.lateBy !== b.lateBy) return b.lateBy - a.lateBy;
  if (a.dueDay !== b.dueDay) return a.dueDay < b.dueDay ? -1 : 1;
  return a.ring.label.localeCompare(b.ring.label, undefined, { numeric: true });
}

export function byRecent(a: RingView, b: RingView): number {
  return a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : 0;
}

export interface Summary {
  out: RingView[];
  late: RingView[];
  dueToday: RingView[];
  repairsOut: RingView[];
  backToday: RingView[];
  sentToday: RingView[];
  back: RingView[];
}

export function summarize(views: RingView[], today: string): Summary {
  const out = views.filter((v) => v.out).sort(byUrgency);
  const back = views.filter((v) => !v.out).sort(byRecent);
  return {
    out,
    late: out.filter((v) => v.level === "late"),
    dueToday: out.filter((v) => v.level === "due"),
    repairsOut: out.filter((v) => v.trip.kind === "repair"),
    backToday: back.filter((v) => v.receivedDay === today),
    sentToday: out.filter((v) => v.sentDay === today),
    back,
  };
}

export function matchesSearch(v: RingView, q: string): boolean {
  const query = q.trim();
  if (!query) return true;
  const key = trackingKey(query);
  const label = cleanLabel(query);
  return v.ring.label.includes(label) || (key !== null && v.ring.key.includes(key));
}

// ── Batch plan: what a pasted list will do ───────────────────────────────────

export type Mode = "auto" | "send" | "receive";

export type PlanKind = "send_new" | "send_repair" | "receive" | "skip" | "error";

export interface PlanRow {
  label: string;
  key: string | null;
  kind: PlanKind;
  reason?: string;
  ringId?: string;
  /** Label of the existing ring when the typed one differs ("1108" typed, "K-1108" stored). */
  existingLabel?: string;
}

export function findByKey(data: Data, key: string): Ring | undefined {
  return data.rings.find((r) => r.key === key);
}

export function plan(text: string, data: Data, mode: Mode, day: string): PlanRow[] {
  const seen = new Set<string>();
  return parseList(text).map((label): PlanRow => {
    const key = trackingKey(label);
    if (key === null) return { label, key, kind: "error", reason: "No number in it" };
    if (seen.has(key)) return { label, key, kind: "skip", reason: "Listed twice" };
    seen.add(key);

    const ring = findByKey(data, key);
    const base = { label, key, ringId: ring?.id, existingLabel: ring && ring.label !== label ? ring.label : undefined };
    if (!ring || ring.trips.length === 0) {
      if (mode === "receive") return { ...base, kind: "error", reason: "Not in the tracker" };
      return { ...base, kind: "send_new" };
    }
    const last = ring.trips[ring.trips.length - 1];
    if (last.receivedAt === null) {
      if (mode === "send") return { ...base, kind: "skip", reason: "Already at manufacturer" };
      if (daysBetween(dayOf(last.sentAt), day) < 0) {
        return { ...base, kind: "error", reason: "Date is before it was sent" };
      }
      return { ...base, kind: "receive" };
    }
    if (mode === "receive") return { ...base, kind: "skip", reason: "Already received" };
    if (daysBetween(dayOf(last.receivedAt), day) < 0) {
      return { ...base, kind: "error", reason: "Date is before it came back" };
    }
    return { ...base, kind: "send_repair" };
  });
}

export function isAction(kind: PlanKind): boolean {
  return kind === "send_new" || kind === "send_repair" || kind === "receive";
}

export interface PlanCounts {
  send_new: number;
  send_repair: number;
  receive: number;
  skip: number;
  error: number;
}

export function countPlan(rows: PlanRow[]): PlanCounts {
  const c: PlanCounts = { send_new: 0, send_repair: 0, receive: 0, skip: 0, error: 0 };
  for (const r of rows) c[r.kind] += 1;
  return c;
}

type NewId = () => string;

function defaultId(): string {
  return crypto.randomUUID();
}

/** Apply the action rows of a plan at `at` (ISO). Returns new data; the input is not changed. */
export function applyPlan(data: Data, rows: PlanRow[], at: string, newId: NewId = defaultId): Data {
  const rings = data.rings.map((r) => ({ ...r, trips: [...r.trips] }));
  const byKey = new Map(rings.map((r) => [r.key, r]));
  for (const row of rows) {
    if (!isAction(row.kind) || row.key === null) continue;
    let ring = byKey.get(row.key);
    if (row.kind === "send_new") {
      if (!ring) {
        ring = { id: newId(), key: row.key, label: row.label, createdAt: at, trips: [] };
        rings.push(ring);
        byKey.set(row.key, ring);
      }
      ring.trips.push({ kind: ring.trips.length === 0 ? "new" : "repair", sentAt: at, receivedAt: null });
    } else if (ring && row.kind === "send_repair") {
      ring.trips.push({ kind: "repair", sentAt: at, receivedAt: null });
    } else if (ring && row.kind === "receive") {
      const i = ring.trips.length - 1;
      ring.trips[i] = { ...ring.trips[i], receivedAt: at };
    }
    // Prefer the party's full label ("K-1108") over a bare number from the manufacturer.
    if (ring && !hasLetterPrefix(ring.label) && hasLetterPrefix(row.label)) ring.label = row.label;
  }
  return { ...data, rings };
}

// ── Single-ring actions ─────────────────────────────────────────────────────

function updateRing(data: Data, id: string, fn: (r: Ring) => Ring | null): Data {
  const rings: Ring[] = [];
  for (const r of data.rings) {
    if (r.id !== id) rings.push(r);
    else {
      const next = fn({ ...r, trips: [...r.trips] });
      if (next) rings.push(next);
    }
  }
  return { ...data, rings };
}

export function receiveRing(data: Data, id: string, at: string): Data {
  return updateRing(data, id, (r) => {
    const i = r.trips.length - 1;
    if (i < 0 || r.trips[i].receivedAt !== null) return r;
    r.trips[i] = { ...r.trips[i], receivedAt: at };
    return r;
  });
}

export function sendForRepair(data: Data, id: string, at: string): Data {
  return updateRing(data, id, (r) => {
    const last = r.trips[r.trips.length - 1];
    if (!last || last.receivedAt === null) return r;
    r.trips.push({ kind: "repair", sentAt: at, receivedAt: null });
    return r;
  });
}

/** Take back the latest step: un-receive, or remove the latest send. A ring with no trips left is removed. */
export function undoLastStep(data: Data, id: string): Data {
  return updateRing(data, id, (r) => {
    const i = r.trips.length - 1;
    if (i < 0) return null;
    if (r.trips[i].receivedAt !== null) r.trips[i] = { ...r.trips[i], receivedAt: null };
    else r.trips.pop();
    return r.trips.length > 0 ? r : null;
  });
}

export function deleteRing(data: Data, id: string): Data {
  return updateRing(data, id, () => null);
}

export function lastStepLabel(ring: Ring): string {
  const last = ring.trips[ring.trips.length - 1];
  if (!last) return "";
  if (last.receivedAt !== null) return "Undo “received”";
  return last.kind === "repair" ? "Undo “sent for repair”" : "Undo “sent” (removes the number)";
}
