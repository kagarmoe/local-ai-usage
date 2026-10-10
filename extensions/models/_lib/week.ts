// ISO weeks in the local time zone. Day steps use setDate, so DST days stay whole days.

const WEEK_MS = 7 * 86_400_000;

/** Local midnight of the Monday that starts d's ISO week. */
export function weekStart(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

/** ISO week label, e.g. "2026-W41". The week belongs to the year of its Thursday. */
export function isoWeek(d: Date): string {
  const monday = weekStart(d);
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const year = thursday.getFullYear();
  const week1 = weekStart(new Date(year, 0, 4));
  const n = Math.round((monday.getTime() - week1.getTime()) / WEEK_MS) + 1;
  return `${year}-W${String(n).padStart(2, "0")}`;
}

/** Local start (inclusive) and end (exclusive) of an ISO week label. */
export function weekBounds(week: string): { start: Date; end: Date } {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Bad ISO week: ${week}`);
  const start = weekStart(new Date(Number(m[1]), 0, 4));
  start.setDate(start.getDate() + (Number(m[2]) - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** Weeks from the one holding `oldest` up to, not including, the current week. */
export function completedWeeks(oldest: Date, now: Date): string[] {
  const out: string[] = [];
  const current = weekStart(now).getTime();
  for (const d = weekStart(oldest); d.getTime() < current; d.setDate(d.getDate() + 7)) out.push(isoWeek(d));
  return out;
}

/** Local calendar date, YYYY-MM-DD. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export const isoDow = (d: Date): number => ((d.getDay() + 6) % 7) + 1;
