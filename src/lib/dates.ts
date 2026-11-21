// Calendar-day maths on the computer's local clock (India: IST).
// A "day" is a local date, written YYYY-MM-DD. Time of day never matters for
// due dates: a ring sent at 9 am and one sent at 7 pm on Monday are both due
// on the same day.

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date of an instant, as YYYY-MM-DD. */
export function dayOf(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(day: string, n: number): string {
  const d = new Date((dayNumber(day) + n) * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * An ISO instant on the chosen day. Today keeps the real time; a past day gets
 * noon so the date never slips across midnight.
 */
export function instantOn(day: string, now: Date): string {
  if (day === dayOf(now)) return now.toISOString();
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(day: string): { y: number; m: number; d: number; w: number } {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return { y, m, d, w };
}

/** "Mon 10 Nov" (adds the year when it is not the current one). */
export function shortDay(day: string, today: string): string {
  const p = parts(day);
  const year = p.y !== parts(today).y ? ` ${p.y}` : "";
  return `${WEEKDAYS[p.w]} ${p.d} ${MONTHS[p.m - 1]}${year}`;
}

/** "Today", "Yesterday", "Tomorrow" or the short day. */
export function relativeDay(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return shortDay(day, today);
}

/** "Wednesday, 11 November 2026" */
export function longDay(day: string): string {
  const p = parts(day);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${WEEKDAYS_LONG[p.w]}, ${p.d} ${months[p.m - 1]} ${p.y}`;
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? "am" : "pm"}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
