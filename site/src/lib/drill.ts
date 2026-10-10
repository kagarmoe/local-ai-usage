// Drill-down: the view a URL asks for, links between views, and per-day and per-hour rows. Pure; imports only shape.ts.
import {
  addDays, anyPlotted, DAYS, MEASURES, mixRow, palette, present, tokenRow, tokenSeries,
  type Day, type Hour, type Measure, type Row, type Series, type Tool, type ToolWeek, type Week, type Which,
} from "./shape.ts";

export type View = { level: "overview" } | { level: "week"; week: Week } | { level: "day"; week: Week; day: string };
export type Nav = { view: View; by: Measure; notice: string | null };

/** The week's 7 days: ISO date and a "Tue 09-29" label. */
export const days = (w: Week) => DAYS.map((d, i) => {
  const date = addDays(w.start, i);
  return { date, label: `${d} ${date.slice(5)}` };
});

/** Weeks in the week list, newest first: plotted weeks where either tool has data. Other plotted weeks still open from a URL. */
export const drillWeeks = (weeks: Week[]) => anyPlotted(weeks).filter((w) => w.claudeCode || w.codex).reverse();

/** The view a query string asks for. An unknown or incomplete week falls back to the overview, a day outside the week to the week, each with a notice; a bad measure falls back to input. */
export function parseView(search: string, weeks: Week[]): Nav {
  const q = new URLSearchParams(search), wk = q.get("week"), day = q.get("day");
  const by = MEASURES.find((m) => m === q.get("by")) ?? "input";
  const nav = (view: View, notice: string | null = null): Nav => ({ view, by, notice });
  if (!wk) return nav({ level: "overview" });
  const w = anyPlotted(weeks).find((w) => w.week === wk);
  if (!w) {
    const early = weeks.some((x) => x.week === wk && x.status === "incomplete");
    return nav({ level: "overview" }, early ? `${wk} starts before the oldest log, so it is not plotted.` : `No data for week ${wk}.`);
  }
  if (!day) return nav({ level: "week", week: w });
  return days(w).some((d) => d.date === day) ? nav({ level: "day", week: w, day }) : nav({ level: "week", week: w }, `${day} is not in ${wk}.`);
}

/** A link to a view. The default measure (input) is left out. */
export function href({ week, day, by }: { week?: string; day?: string; by: Measure }) {
  const q = new URLSearchParams();
  if (week) q.set("week", week);
  if (week && day) q.set("day", day);
  if (by !== "input") q.set("by", by);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

const zeroTokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
// A day or hour with no activity is zero; its cost is null when the tool has no prices (week cost null).
const zeroCost = (t: ToolWeek) => (t.costUSD === null ? null : 0);

/** One tool's 7 days of a week; null stats when the tool has no data that week. */
function perDay(w: Week, tool: Tool): { base: Row; d: Day | null }[] {
  const t = w[tool];
  return days(w).map(({ date, label }) => ({
    base: { day: label, date },
    d: t ? t.perDay.find((d) => d.date === date) ?? { date, sessions: 0, calls: 0, tokens: zeroTokens, costUSD: zeroCost(t), models: {}, subagentModels: {} } : null,
  }));
}

/** One tool's 24 hours of a day; null stats when the tool has no data that week. perHour lists only active hours. */
function perHour(w: Week, date: string, tool: Tool): { base: Row; h: Hour | null }[] {
  const t = w[tool], dow = days(w).findIndex((d) => d.date === date) + 1;
  return Array.from({ length: 24 }, (_, hour) => ({
    base: { hour: `${String(hour).padStart(2, "0")}:00` },
    h: t ? t.perHour.find((h) => h.dow === dow && h.hour === hour) ?? { dow, hour, input: 0, output: 0, costUSD: zeroCost(t), models: {}, subagentModels: {} } : null,
  }));
}

export function dayTokenRows(w: Week, tool: Tool): { series: Series; rows: Row[] } {
  const series = tokenSeries(tool);
  return { series, rows: perDay(w, tool).map(({ base, d }) => tokenRow(series, d?.tokens ?? null, base)) };
}

export const dayCostRows = (w: Week, tool: Tool): Row[] => perDay(w, tool).map(({ base, d }) => ({ ...base, cost: d ? d.costUSD : null }));

export function dayMix(weeks: Week[], w: Week, tool: Tool, measure: Measure, which: Which): { series: Series; rows: Row[] } {
  const pal = palette(weeks, tool), rows = perDay(w, tool).map(({ base, d }) => mixRow(pal, d, which, measure, base));
  return { series: present(pal, rows), rows };
}

/** perHour has no cache split: input here includes cache. */
export const HOUR_TOKEN_SERIES: Series = [{ key: "input", label: "Input (cache included)" }, { key: "output", label: "Output" }];

export const hourTokenRows = (w: Week, date: string, tool: Tool): Row[] =>
  perHour(w, date, tool).map(({ base, h }) => ({ ...base, input: h?.input ?? null, output: h?.output ?? null }));

export const hourCostRows = (w: Week, date: string, tool: Tool): Row[] => perHour(w, date, tool).map(({ base, h }) => ({ ...base, cost: h ? h.costUSD : null }));

export function hourMix(weeks: Week[], w: Week, date: string, tool: Tool, measure: Measure, which: Which): { series: Series; rows: Row[] } {
  const pal = palette(weeks, tool), rows = perHour(w, date, tool).map(({ base, h }) => mixRow(pal, h, which, measure, base));
  return { series: present(pal, rows), rows };
}

/** A tool's stats for one day of the week (zero if it was idle), or null when the tool has no data that week. */
export const dayOf = (w: Week, date: string, tool: Tool): Day | null => perDay(w, tool).find((x) => x.base.date === date)?.d ?? null;
