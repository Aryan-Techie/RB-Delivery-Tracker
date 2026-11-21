// Excel-friendly CSV: one row per trip, newest ring activity first.

import { type Data, viewTrip, byRecent, viewRing } from "./model";

function cell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: Data, today: string): string {
  const header = ["PDF number", "Tracking number", "Trip", "Sent on", "Due on", "Received on", "Days", "Status"];
  const lines = [header.map(cell).join(",")];
  const rings = data.rings
    .filter((r) => r.trips.length > 0)
    .map((r) => viewRing(r, data.settings, today))
    .sort(byRecent)
    .map((v) => v.ring);
  for (const ring of rings) {
    ring.trips.forEach((_, i) => {
      const v = viewTrip(ring, i, data.settings, today);
      const trip = v.trip.kind === "new" ? "New" : `Repair ${v.repairNo}`;
      let status: string;
      if (v.out) status = v.level === "late" ? `Late by ${v.lateBy} days` : v.level === "due" ? "Due today" : "At manufacturer";
      else status = v.level === "late" ? `Came back ${v.lateBy} days late` : "Came back on time";
      lines.push(
        [ring.label, ring.key, trip, v.sentDay, v.dueDay, v.receivedDay ?? "", v.days, status].map(cell).join(","),
      );
    });
  }
  return lines.join("\r\n");
}

export function csvFileName(today: string): string {
  return `rb-tracker-${today}.csv`;
}
