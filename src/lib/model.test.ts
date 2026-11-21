import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dayOf, instantOn } from "./dates";
import { parseList, trackingKey } from "./ids";
import {
  applyPlan,
  countPlan,
  emptyData,
  normalizeData,
  plan,
  receiveRing,
  sendForRepair,
  summarize,
  undoLastStep,
  viewAll,
  viewRing,
  type Data,
} from "./model";
import { toCsv } from "./csv";

let n = 0;
const id = () => `id-${++n}`;
const at = (day: string) => new Date(`${day}T10:00:00`).toISOString();

function send(data: Data, text: string, day: string) {
  return applyPlan(data, plan(text, data, "auto", day), at(day), id);
}

describe("tracking key", () => {
  it("drops the letter prefix and leading zeros", () => {
    expect(trackingKey("K-1108")).toBe("1108");
    expect(trackingKey("kan 01108")).toBe("1108");
    expect(trackingKey("1108")).toBe("1108");
    expect(trackingKey(" K1108A ")).toBe("1108A");
    expect(trackingKey("K-1108/2")).toBe("1108/2");
    expect(trackingKey("K-0")).toBe("0");
  });
  it("rejects text without a digit", () => {
    expect(trackingKey("ABC")).toBeNull();
    expect(trackingKey("   ")).toBeNull();
  });
});

describe("parseList", () => {
  it("reads an Excel column, rows and lists", () => {
    expect(parseList("K1101\r\nK1102\n\nk1103")).toEqual(["K1101", "K1102", "K1103"]);
    expect(parseList("K1101\tK1102")).toEqual(["K1101", "K1102"]);
    expect(parseList("K1101, K1102; K1103")).toEqual(["K1101", "K1102", "K1103"]);
  });
  it("splits on spaces only when every piece has a digit", () => {
    expect(parseList("K 1108")).toEqual(["K 1108"]);
    expect(parseList("K1101 K1102 1103")).toEqual(["K1101", "K1102", "1103"]);
  });
});

describe("dates", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-11-10", "2026-11-16")).toBe(6);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addDays("2026-11-28", 6)).toBe("2026-12-04");
  });
  it("puts a past day at noon and keeps today's real time", () => {
    const now = new Date("2026-11-11T18:30:00");
    expect(instantOn("2026-11-11", now)).toBe(now.toISOString());
    expect(dayOf(instantOn("2026-11-01", now))).toBe("2026-11-01");
  });
});

describe("due dates and colours", () => {
  const sentDay = "2026-11-10";
  const data = send(emptyData(), "K-1108", sentDay);
  const ring = data.rings[0];

  it("new ring: on time for 6 days, due on day 6, red from day 7", () => {
    expect(viewRing(ring, data.settings, "2026-11-15").level).toBe("ontime");
    const due = viewRing(ring, data.settings, "2026-11-16");
    expect(due.dueDay).toBe("2026-11-16");
    expect(due.level).toBe("due");
    const late = viewRing(ring, data.settings, "2026-11-17");
    expect(late.level).toBe("late");
    expect(late.lateBy).toBe(1);
  });

  it("repair: due 2 days after it was sent again, red from day 3", () => {
    let d = receiveRing(data, ring.id, at("2026-11-14"));
    d = sendForRepair(d, ring.id, at("2026-11-15"));
    const r = d.rings[0];
    expect(viewRing(r, d.settings, "2026-11-16").level).toBe("ontime");
    expect(viewRing(r, d.settings, "2026-11-17").level).toBe("due");
    const late = viewRing(r, d.settings, "2026-11-18");
    expect(late.level).toBe("late");
    expect(late.repairNo).toBe(1);
  });

  it("a ring that came back after its due date stays marked late", () => {
    const d = receiveRing(data, ring.id, at("2026-11-18"));
    const v = viewRing(d.rings[0], d.settings, "2026-11-20");
    expect(v.out).toBe(false);
    expect(v.level).toBe("late");
    expect(v.lateBy).toBe(2);
    expect(v.days).toBe(8);
  });
});

describe("plan and apply", () => {
  it("auto: new number is sent, an out one is received, a received one goes for repair", () => {
    let d = send(emptyData(), "K1101\nK1102", "2026-11-01");
    d = send(d, "1101", "2026-11-05"); // manufacturer writes the bare number
    const rows = plan("K1101\nK1102\nK1103", d, "auto", "2026-11-06");
    expect(rows.map((r) => r.kind)).toEqual(["send_repair", "receive", "send_new"]);
    d = applyPlan(d, rows, at("2026-11-06"), id);
    expect(d.rings).toHaveLength(3);
    expect(d.rings[0].trips.map((t) => t.kind)).toEqual(["new", "repair"]);
  });

  it("receive mode never creates numbers", () => {
    const d = send(emptyData(), "K1101", "2026-11-01");
    const rows = plan("1101\n9999", d, "receive", "2026-11-02");
    expect(rows[0].kind).toBe("receive");
    expect(rows[0].existingLabel).toBe("K1101");
    expect(rows[1].kind).toBe("error");
  });

  it("send mode skips rings that are already out", () => {
    const d = send(emptyData(), "K1101", "2026-11-01");
    expect(plan("K1101", d, "send", "2026-11-02")[0].kind).toBe("skip");
  });

  it("flags duplicates, text without numbers and dates before sending", () => {
    const d = send(emptyData(), "K1101", "2026-11-05");
    const rows = plan("K1101\nK-1101\nhello", d, "auto", "2026-11-03");
    expect(rows.map((r) => r.kind)).toEqual(["error", "skip", "error"]);
    expect(countPlan(rows)).toMatchObject({ error: 2, skip: 1 });
  });

  it("upgrades a bare number to the party's full label", () => {
    let d = send(emptyData(), "1108", "2026-11-01");
    d = send(d, "K-1108", "2026-11-02");
    expect(d.rings[0].label).toBe("K-1108");
  });

  it("does not change the input data", () => {
    const d = send(emptyData(), "K1101", "2026-11-01");
    const before = JSON.stringify(d);
    send(d, "K1101", "2026-11-02");
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("summary, undo, csv, load", () => {
  it("summarizes today", () => {
    let d = send(emptyData(), "A1\nA2\nA3", "2026-11-01");
    d = send(d, "A1", "2026-11-11");
    d = send(d, "A4", "2026-11-11");
    const s = summarize(viewAll(d, "2026-11-11"), "2026-11-11");
    expect(s.out).toHaveLength(3);
    expect(s.late.map((v) => v.ring.label)).toEqual(["A2", "A3"]);
    expect(s.backToday.map((v) => v.ring.label)).toEqual(["A1"]);
    expect(s.sentToday.map((v) => v.ring.label)).toEqual(["A4"]);
  });

  it("undo walks back one step at a time and removes an empty ring", () => {
    let d = send(emptyData(), "A1", "2026-11-01");
    const rid = d.rings[0].id;
    d = receiveRing(d, rid, at("2026-11-03"));
    d = undoLastStep(d, rid);
    expect(d.rings[0].trips[0].receivedAt).toBeNull();
    d = undoLastStep(d, rid);
    expect(d.rings).toHaveLength(0);
  });

  it("exports one CSV row per trip", () => {
    let d = send(emptyData(), "K-1,5", "2026-11-01");
    d = send(d, "1", "2026-11-03");
    d = send(d, "1", "2026-11-04");
    const lines = toCsv(d, "2026-11-11").split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("PDF number,Tracking number,Trip,Sent on,Due on,Received on,Days,Status");
    expect(lines.some((l) => l.startsWith("K-1,1,Repair 1,2026-11-04,2026-11-06,,7,Late by 5 days"))).toBe(true);
  });

  it("loads a file and fills defaults", () => {
    const d = normalizeData({ rings: [], settings: { newDays: 0 } });
    expect(d.settings.newDays).toBe(6);
    expect(() => normalizeData({ foo: 1 })).toThrow();
  });
});
