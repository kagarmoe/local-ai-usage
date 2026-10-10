// Pure data shaping: weeks in, chart rows out. No imports, so Deno tests it directly.

export type Tokens = { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning?: number };
export type ModelStat = { calls: number; input: number; output: number; costUSD: number | null };
export type ToolWeek = {
  complete: boolean;
  tokens: Tokens;
  perHour: { dow: number; hour: number; input: number }[];
  context: { peak: number };
  models: Record<string, ModelStat>;
  subagentModels: Record<string, ModelStat>;
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
    claudeCode: { inputPerDay: number; peakContext: number };
    codex: { inputPerDay: number; peakContext: number; weeklyRateLimitPeakPct: number } | null;
  };
  events: { date: string; label: string }[];
};
export type Row = Record<string, string | number | null>;
export type Series = { key: string; label: string }[];
export type Kpi = { tool: string; label: string; unit: "tokens" | "%"; week: string | null; latest: number | null; baseline: number | null; changePct: number | null };

export const TOOL_NAMES: Record<Tool, string> = { claudeCode: "Claude Code", codex: "Codex" };
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** weeks.jsonl text → weeks, newest first. Blank lines (the trailing newline) are skipped. */
export const parseWeeks = (text: string): Week[] => text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** Same formula as the baseline: all input, cache included, over 7 days. */
export const inputPerDay = (t: ToolWeek) => Math.round((t.tokens.input + t.tokens.cacheRead + t.tokens.cacheWrite) / 7);

/** A tool's plotted weeks, oldest first: from its first week with data, incomplete weeks dropped. `data: null` = no data. */
function plotted(weeks: Week[], tool: Tool) {
  const rows = [...weeks].reverse().filter((w) => w.status !== "incomplete").map((w) => ({ week: w.week, start: w.start, data: w[tool] }));
  const first = rows.findIndex((r) => r.data);
  return first < 0 ? [] : rows.slice(first);
}

export const trendRows = (weeks: Week[], tool: Tool) =>
  plotted(weeks, tool).map((r) => ({ week: r.week, inputPerDay: r.data ? inputPerDay(r.data) : null }));

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Events inside a plotted week become a marker on that week; others get none. */
export function eventMarkers(weeks: Week[], tool: Tool, events: Meta["events"]) {
  const rows = plotted(weeks, tool);
  return events.flatMap((e) => {
    const r = rows.find((r) => r.start <= e.date && e.date < addDays(r.start, 7));
    return r ? [{ week: r.week, label: e.label }] : [];
  });
}

/** Tokens by type per plotted week. Codex reasoning is part of output, so output here excludes it and the stack adds up. */
export function tokenRows(weeks: Week[], tool: Tool): { series: Series; rows: Row[] } {
  const series: Series = [
    { key: "input", label: "Input (uncached)" },
    { key: "cacheRead", label: "Cache read" },
    { key: "cacheWrite", label: "Cache write" },
    ...(tool === "codex"
      ? [{ key: "output", label: "Output (excl. reasoning)" }, { key: "reasoning", label: "Reasoning" }]
      : [{ key: "output", label: "Output" }]),
  ];
  const value = (t: Tokens, key: string) => (key === "output" ? t.output - (t.reasoning ?? 0) : t[key as keyof Tokens] ?? 0);
  return {
    series,
    rows: plotted(weeks, tool).map((r) => Object.fromEntries([["week", r.week], ...series.map((s) => [s.key, r.data ? value(r.data.tokens, s.key) : null])])),
  };
}

/** Input per plotted week by model, main thread plus subagents: the tool's 7 models with the most input, the rest (and any raw "other") as "other". */
export function modelMix(weeks: Week[], tool: Tool): { series: Series; rows: Row[] } {
  const rows = plotted(weeks, tool), totals: Record<string, number> = {};
  const stats = (t: ToolWeek | null) => [...Object.entries(t?.models ?? {}), ...Object.entries(t?.subagentModels ?? {})];
  for (const r of rows) for (const [m, s] of stats(r.data)) totals[m] = (totals[m] ?? 0) + s.input;
  const top = Object.keys(totals).filter((m) => m !== "other").sort((a, b) => totals[b] - totals[a]).slice(0, 7);
  const labels = Object.keys(totals).length > top.length ? [...top, "other"] : top;
  // Model ids contain dots, which Recharts reads as paths: key the series m0…m7.
  const series = labels.map((label, i) => ({ key: `m${i}`, label }));
  const keyOf = (m: string) => series[top.includes(m) ? top.indexOf(m) : labels.length - 1].key;
  return {
    series,
    rows: rows.map((r) => {
      const row: Row = { week: r.week };
      for (const s of series) row[s.key] = r.data ? 0 : null;
      for (const [m, s] of stats(r.data)) row[keyOf(m)] = (row[keyOf(m)] as number) + s.input;
      return row;
    }),
  };
}

/** Cache reads as a percent of input in the newest plotted week with data, or null. */
export function cacheReadPct(weeks: Week[], tool: Tool): number | null {
  const t = plotted(weeks, tool).filter((r) => r.data).at(-1)?.data?.tokens;
  const all = t ? t.input + t.cacheRead + t.cacheWrite : 0;
  return t && all ? Math.round((t.cacheRead / all) * 100) : null;
}

/** The five KPI cards: the latest complete week against the baseline. A tool missing that week shows no data. */
export function kpis(weeks: Week[], meta: Meta): Kpi[] {
  const w = weeks.find((w) => w.status !== "incomplete"), b = meta.baseline;
  const card = (tool: Tool, label: string, unit: Kpi["unit"], value: (t: ToolWeek) => number | null, baseline: number | null): Kpi => {
    const t = w?.[tool], latest = t ? value(t) : null;
    const changePct = latest === null || !baseline ? null : Math.round(((latest - baseline) / baseline) * 100);
    return { tool: TOOL_NAMES[tool], label, unit, week: w?.week ?? null, latest, baseline, changePct };
  };
  return [
    card("claudeCode", "Input per day", "tokens", inputPerDay, b.claudeCode.inputPerDay),
    card("claudeCode", "Peak context", "tokens", (t) => t.context.peak, b.claudeCode.peakContext),
    card("codex", "Input per day", "tokens", inputPerDay, b.codex?.inputPerDay ?? null),
    card("codex", "Peak context", "tokens", (t) => t.context.peak, b.codex?.peakContext ?? null),
    card("codex", "Weekly rate-limit peak", "%", (t) => t.rateLimits?.weeklyPeakPct ?? null, b.codex?.weeklyRateLimitPeakPct ?? null),
  ];
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

/** "down 40% from baseline", "up 12% from baseline", "level with baseline", or null. */
export const changeText = (pct: number | null) =>
  pct === null ? null : pct === 0 ? "level with baseline" : `${pct < 0 ? "down" : "up"} ${Math.abs(pct)}% from baseline`;

/** 192000000 → "192M". */
export const fmt = (n: number) =>
  n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
