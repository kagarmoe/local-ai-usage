// Pure data shaping: weeks in, chart rows out. No imports, so Deno tests it directly.

export type Tokens = { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning?: number };
export type ModelStat = { calls: number; input: number; output: number; costUSD: number | null };
export type Models = Record<string, ModelStat>;
export type Day = { date: string; sessions: number; calls: number; tokens: Tokens; costUSD: number | null; models: Models; subagentModels: Models };
export type Hour = { dow: number; hour: number; input: number; output: number; costUSD: number | null; models: Models; subagentModels: Models };
export type ToolWeek = {
  complete: boolean;
  tokens: Tokens;
  costUSD: number | null;
  perDay: Day[];
  perHour: Hour[];
  context: { avgLongSession: number; p95: number; peak: number };
  models: Models;
  subagentModels: Models;
  rateLimits?: { fiveHourPeakPct: number | null; weeklyPeakPct: number | null };
};
export type Week = { week: string; start: string; status: string; claudeCode: ToolWeek | null; codex: ToolWeek | null };
export type Tool = "claudeCode" | "codex";
export type Meta = {
  schemaVersion: number;
  generatedAt: string;
  costBasis: string;
  baseline: {
    label: string;
    claudeCode: { inputPerDay: number; peakContext: number; subagentOpusShare?: number | null };
    codex: { inputPerDay: number; peakContext: number; weeklyRateLimitPeakPct: number } | null;
  };
  events: { date: string; label: string }[];
};
export type Row = Record<string, string | number | null>;
export type Series = { key: string; label: string; color?: string }[];
export type Measure = "input" | "cost" | "calls";
export type Which = "models" | "subagentModels";
export type Unit = "tokens" | "calls" | "%" | "$";
export type Kpi = { tool: string; label: string; unit: Unit; week: string | null; latest: number | null; baseline: number | null; change: number | null; spark: (number | null)[] };
export type Plotted = { week: string; start: string; data: ToolWeek | null };

export const TOOLS: Tool[] = ["claudeCode", "codex"];
export const TOOL_NAMES: Record<Tool, string> = { claudeCode: "Claude Code", codex: "Codex" };
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MEASURES: Measure[] = ["input", "cost", "calls"];
export const WHICH: Which[] = ["models", "subagentModels"];
export const MEASURE_UNIT: Record<Measure, Unit> = { input: "tokens", cost: "$", calls: "calls" };

/** weeks.jsonl text → weeks, newest first. Blank lines (the trailing newline) are skipped. */
export const parseWeeks = (text: string): Week[] => text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** All input, cache included. */
export const allInput = (t: Tokens) => t.input + t.cacheRead + t.cacheWrite;

/** Same formula as the baseline: all input, cache included, over 7 days. */
export const inputPerDay = (t: ToolWeek) => Math.round(allInput(t.tokens) / 7);

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Complete weeks, oldest first, from the first one where `has` holds. */
function from(weeks: Week[], has: (w: Week) => boolean): Week[] {
  const rows = [...weeks].reverse().filter((w) => w.status !== "incomplete");
  const first = rows.findIndex(has);
  return first < 0 ? [] : rows.slice(first);
}

/** A tool's plotted weeks, oldest first: from its first week with data, incomplete weeks dropped. `data: null` = no data. */
export const plotted = (weeks: Week[], tool: Tool): Plotted[] =>
  from(weeks, (w) => !!w[tool]).map((w) => ({ week: w.week, start: w.start, data: w[tool] }));

/** Weeks either tool plots, oldest first. */
export const anyPlotted = (weeks: Week[]) => from(weeks, (w) => !!(w.claudeCode || w.codex));

/** One row per plotted week, `{ week, [key]: value }`; null where the tool has no data. */
export const weekly = (weeks: Week[], tool: Tool, key: string, value: (t: ToolWeek) => number | null): Row[] =>
  plotted(weeks, tool).map((r) => ({ week: r.week, [key]: r.data ? value(r.data) : null }));

export const trendRows = (weeks: Week[], tool: Tool) => weekly(weeks, tool, "inputPerDay", inputPerDay);

export const CONTEXT_SERIES: Series = [
  { key: "avgLongSession", label: "Average" },
  { key: "p95", label: "p95" },
  { key: "peak", label: "Peak" },
];

export const contextRows = (weeks: Week[], tool: Tool): Row[] =>
  plotted(weeks, tool).map((r) => ({
    week: r.week, avgLongSession: r.data?.context.avgLongSession ?? null, p95: r.data?.context.p95 ?? null, peak: r.data?.context.peak ?? null,
  }));

export const RATE_SERIES: Series = [{ key: "fiveHour", label: "5-hour" }, { key: "weekly", label: "Weekly" }];

export const rateRows = (weeks: Week[]): Row[] =>
  plotted(weeks, "codex").map((r) => ({ week: r.week, fiveHour: r.data?.rateLimits?.fiveHourPeakPct ?? null, weekly: r.data?.rateLimits?.weeklyPeakPct ?? null }));

/** Both tools on one row per week, from the earlier tool's first week with data; null where a tool has none. */
export const bothRows = (weeks: Week[], value: (t: ToolWeek) => number): Row[] =>
  anyPlotted(weeks).map((w) => ({ week: w.week, claudeCode: w.claudeCode ? value(w.claudeCode) : null, codex: w.codex ? value(w.codex) : null }));

/** Events inside a plotted week become a marker on that week; others get none. */
export function eventMarkers(weeks: Week[], tool: Tool, events: Meta["events"]) {
  const rows = plotted(weeks, tool);
  return events.flatMap((e) => {
    const r = rows.find((r) => r.start <= e.date && e.date < addDays(r.start, 7));
    return r ? [{ week: r.week, label: e.label }] : [];
  });
}

/** Token types. Codex reasoning is part of output, so output here excludes it and the stack adds up. */
export const tokenSeries = (tool: Tool): Series => [
  { key: "input", label: "Input (uncached)" },
  { key: "cacheRead", label: "Cache read" },
  { key: "cacheWrite", label: "Cache write" },
  ...(tool === "codex"
    ? [{ key: "output", label: "Output (excl. reasoning)" }, { key: "reasoning", label: "Reasoning" }]
    : [{ key: "output", label: "Output" }]),
];

const tokenValue = (t: Tokens, key: string) => (key === "output" ? t.output - (t.reasoning ?? 0) : t[key as keyof Tokens] ?? 0);

/** One row of tokens by type; every type null when there is no data. */
export const tokenRow = (series: Series, t: Tokens | null, base: Row): Row =>
  ({ ...base, ...Object.fromEntries(series.map((s) => [s.key, t ? tokenValue(t, s.key) : null])) });

export function tokenRows(weeks: Week[], tool: Tool): { series: Series; rows: Row[] } {
  const series = tokenSeries(tool);
  return { series, rows: plotted(weeks, tool).map((r) => tokenRow(series, r.data?.tokens ?? null, { week: r.week })) };
}

/**
 * A tool's model colours: its 7 models with the most input over all plotted weeks (main thread and subagents),
 * then "other". Every model chart of the tool uses it, so a model keeps its key and colour.
 * Keys are m0…m7: model ids contain dots, which Recharts reads as paths.
 */
export function palette(weeks: Week[], tool: Tool): Series {
  const totals: Record<string, number> = {};
  for (const r of plotted(weeks, tool)) {
    for (const stats of [r.data?.models, r.data?.subagentModels]) for (const [id, s] of Object.entries(stats ?? {})) totals[id] = (totals[id] ?? 0) + s.input;
  }
  const ids = Object.keys(totals).filter((id) => id !== "other").sort((a, b) => totals[b] - totals[a] || a.localeCompare(b));
  const top = ids.slice(0, 7), labels = ids.length > 7 || "other" in totals ? [...top, "other"] : top;
  return labels.map((label, i) => ({ key: `m${i}`, label, color: i === top.length ? "var(--chart-8)" : `var(--chart-${i + 1})` }));
}

const measureOf = (s: ModelStat, m: Measure) => (m === "input" ? s.input : m === "calls" ? s.calls : s.costUSD);

/** One model-mix row: each model's measure added into its palette key; models outside the palette, and raw "other", go to "other". Null stats give null cells; a null cost makes its cell null. */
export function mixRow(pal: Series, stats: Models | null, measure: Measure, base: Row): Row {
  const row: Row = { ...base };
  for (const s of pal) row[s.key] = stats ? 0 : null;
  for (const [id, s] of Object.entries(stats ?? {})) {
    const key = (pal.find((p) => p.label === id) ?? pal.at(-1))?.key;
    if (!key) continue;
    const v = measureOf(s, measure), cur = row[key];
    row[key] = v === null || cur === null ? null : (cur as number) + v;
  }
  return row;
}

/** The series with at least one non-zero value. */
export const present = (series: Series, rows: Row[]) => series.filter((s) => rows.some((r) => typeof r[s.key] === "number" && r[s.key] !== 0));

/** A measure per plotted week by model, main thread (`models`) or subagents (`subagentModels`). */
export function modelMix(weeks: Week[], tool: Tool, measure: Measure, which: Which): { series: Series; rows: Row[] } {
  const pal = palette(weeks, tool);
  const rows = plotted(weeks, tool).map((r) => mixRow(pal, r.data?.[which] ?? null, measure, { week: r.week }));
  return { series: present(pal, rows), rows };
}

/** Cache reads as a percent of input in the newest plotted week with data, or null. */
export function cacheReadPct(weeks: Week[], tool: Tool): number | null {
  const t = plotted(weeks, tool).filter((r) => r.data).at(-1)?.data?.tokens;
  const all = t ? allInput(t) : 0;
  return t && all ? Math.round((t.cacheRead / all) * 100) : null;
}

/** Percent of subagent calls on Opus models, or null when there are no subagent calls. */
export function opusShare(t: ToolWeek): number | null {
  const stats = Object.entries(t.subagentModels), calls = (s: typeof stats) => s.reduce((n, [, m]) => n + m.calls, 0);
  const all = calls(stats);
  return all ? Math.round((calls(stats.filter(([id]) => id.includes("opus"))) / all) * 100) : null;
}

/** KPI tiles per tool: the latest complete week against the baseline, and a sparkline over the tool's plotted weeks. A tool missing that week shows no data. */
export function kpis(weeks: Week[], meta: Meta): Record<Tool, Kpi[]> {
  const w = weeks.find((w) => w.status !== "incomplete"), b = meta.baseline;
  const tile = (tool: Tool, label: string, unit: Unit, value: (t: ToolWeek) => number | null, baseline: number | null): Kpi => {
    const t = w?.[tool], latest = t ? value(t) : null;
    // Percent tiles change in points; others in percent of the baseline.
    const change = latest === null || baseline === null ? null : unit === "%" ? latest - baseline : baseline ? Math.round(((latest - baseline) / baseline) * 100) : null;
    return { tool: TOOL_NAMES[tool], label, unit, week: w?.week ?? null, latest, baseline, change, spark: plotted(weeks, tool).map((r) => (r.data ? value(r.data) : null)) };
  };
  const share = b.claudeCode.subagentOpusShare;
  return {
    claudeCode: [
      tile("claudeCode", "Input per day", "tokens", inputPerDay, b.claudeCode.inputPerDay),
      tile("claudeCode", "Cost per week", "$", (t) => t.costUSD, null),
      tile("claudeCode", "Peak context", "tokens", (t) => t.context.peak, b.claudeCode.peakContext),
      tile("claudeCode", "Subagent Opus share", "%", opusShare, share == null ? null : Math.round(share * 100)),
    ],
    codex: [
      tile("codex", "Input per day", "tokens", inputPerDay, b.codex?.inputPerDay ?? null),
      tile("codex", "Weekly rate-limit peak", "%", (t) => t.rateLimits?.weeklyPeakPct ?? null, b.codex?.weeklyRateLimitPeakPct ?? null),
      tile("codex", "Peak context", "tokens", (t) => t.context.peak, b.codex?.peakContext ?? null),
      tile("codex", "Cost per week", "$", (t) => t.costUSD, null),
    ],
  };
}

/** 7 × 24 input by weekday (ISO dow 1 = Monday, first row) and hour, summed over both tools and all complete weeks. */
export function heatmap(weeks: Week[]): number[][] {
  const grid = DAYS.map(() => Array<number>(24).fill(0));
  for (const w of weeks) {
    if (w.status === "incomplete") continue;
    for (const t of [w.claudeCode, w.codex]) for (const h of t?.perHour ?? []) grid[h.dow - 1][h.hour] += h.input;
  }
  return grid;
}

/** "down 40% from baseline", "up 4 points from baseline", "level with baseline", or null. */
export function changeText(change: number | null, unit: Unit = "tokens") {
  if (change === null) return null;
  if (change === 0) return "level with baseline";
  const n = Math.abs(change), by = unit === "%" ? `${n} point${n === 1 ? "" : "s"}` : `${n}%`;
  return `${change < 0 ? "down" : "up"} ${by} from baseline`;
}

const UNITS: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];

/** 192000000 → "192M". A value that rounds to 1000 of a unit takes the next one: 999,999 → "1M", not "1000K". */
export function fmt(n: number): string {
  const u = UNITS.find(([d]) => Math.abs(n) >= d * 0.99995);
  return u ? `${+(n / u[0]).toFixed(1)}${u[1]}` : String(n);
}

/** 802.98 → "$803", 1234 → "$1.2K", 0.416 → "$0.42". */
export const money = (n: number) => (Math.abs(n) < 9.995 ? `$${n.toFixed(2)}` : `$${fmt(Math.round(n))}`);

/** Axis and tooltip format per unit. */
export const AXIS: Record<Unit, (v: number) => string> = { tokens: fmt, calls: fmt, "%": (v) => `${v}%`, $: money };

/** A table cell or tile value with its unit ("192M tokens", "$803", "32%"), or "no data". */
export const cell = (v: unknown, unit: Unit = "tokens") =>
  typeof v === "number" ? (unit === "tokens" || unit === "calls" ? `${fmt(v)} ${unit}` : AXIS[unit](v)) : v == null ? "no data" : String(v);

/** "1 complete week, 2026-W40" or "3 complete weeks, 2026-W38 to 2026-W40". */
export const span = (rows: Row[]) =>
  rows.length === 0 ? "no complete weeks yet"
  : rows.length === 1 ? `1 complete week, ${rows[0].week}`
  : `${rows.length} complete weeks, ${rows[0].week} to ${rows[rows.length - 1].week}`;

const total = (r: Row, keys: string[]) => keys.reduce((n, k) => n + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);

/** The series with the largest total over the rows, or null when every value is empty. */
export function topSeries(series: Series, rows: Row[]): Series[number] | null {
  let best: Series[number] | null = null, max = 0;
  for (const s of series) {
    const v = rows.reduce((n, r) => n + total(r, [s.key]), 0);
    if (v > max) [best, max] = [s, v];
  }
  return best;
}

/** The row with the largest sum over the series, and that sum; null when every value is empty. */
export function peakRow(rows: Row[], series: Series): { row: Row; total: number } | null {
  let best: { row: Row; total: number } | null = null;
  for (const row of rows) {
    const v = total(row, series.map((s) => s.key));
    if (v > (best?.total ?? 0)) best = { row, total: v };
  }
  return best;
}
