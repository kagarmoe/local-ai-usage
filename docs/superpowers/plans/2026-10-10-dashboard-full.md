# Dashboard full chart set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add every chart v1 deferred (cost, model mix by measure, subagent mix, context, Codex rate limits, both-tools view, KPI sparklines) plus the Week and Day drill-down views to the dashboard in `site/`.

**Architecture:** Two pure modules hold all logic and are unit-tested with Deno: `shape.ts` (weekly rows, palette, mixes, KPI tiles, formatting) and `drill.ts` (query-string views, links, per-day and per-hour rows). React components only lay out what those return. Routing is the query string on one page (`history.pushState`), no router dependency.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind 4, shadcn/ui, Recharts 3.8, Deno test (`jsr:@std/assert@1.0.19`).

**Spec:** `docs/superpowers/specs/2026-10-10-dashboard-full-design.md` (extends `docs/superpowers/specs/2026-10-09-dashboard-design.md`).

## Global Constraints

- `site/` change only. Data, swamp, Blob and Vercel do not change.
- `site/src/lib/shape.ts` has no imports. `site/src/lib/drill.ts` imports only `./shape.ts`. Both must run under Deno and Vite.
- No new dependencies.
- Tests: `PATH=$HOME/.swamp/deno:$PATH deno task test` (from the worktree root) must pass. Build: `cd site && npm run build` must pass.
- Codex has no prices: Codex cost shows "no data". No prices are invented.
- Model chart keys are `m0`…`m7`, never model ids (ids contain dots, which Recharts reads as paths).
- Units: tokens as K/M/B (`fmt`; 999,999 → "1M"); money `$803`, `$1.2K`, `$0.42`; percent `32%`.
- Drill links are real `<a href>` links. A plain left click navigates in place; modified clicks behave normally.
- The measure switch marks the current measure with `aria-current="true"`. Sparklines are `aria-hidden`.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318`.
- Never push. Never touch `main`.

## Review Focus

1. **Codex has one plotted week** (W40 only) → its lines show one point, its sparkline is hidden, summaries say "1 complete week, 2026-W40". Pinned: Task 1 `span` assertion.
2. **Codex cost is null everywhere** → Codex cost and cost-by-model charts say "no data"; no $0 bars. Pinned: Task 1 mix test (null cost → null cells, series drop).
3. **A pasted, reloaded, or Back/Forward URL** → the view matches the URL; an unknown week, an incomplete week, or an outside day falls back with a notice. Pinned: Task 2 `parseView` tests.
4. **A drilled week where one tool has no data** (W39 Codex) → that tool's cards say "no data", not zero bars. Pinned: Task 2 day-rows test.
5. **A model ranked low by input but high by calls** (Codex `unknown`: input 0, calls > 0) keeps its key and colour across measures. Pinned: Task 1 palette test.

---

### Task 1: Data layer (`shape.ts`)

**Files:**
- Modify (full rewrite): `site/src/lib/shape.ts`
- Modify (full rewrite): `site/src/lib/shape_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2 and 3):
  - Types `Tokens, ModelStat, Models, Day, Hour, ToolWeek, Week, Tool, Meta, Row, Series, Measure, Which, Unit, Kpi, Plotted`.
  - Constants `TOOLS, TOOL_NAMES, DAYS, MEASURES, WHICH, MEASURE_UNIT, CONTEXT_SERIES, RATE_SERIES, AXIS`.
  - Functions `parseWeeks, allInput, inputPerDay, addDays, plotted, anyPlotted, weekly, trendRows, contextRows, rateRows, bothRows, eventMarkers, tokenSeries, tokenRow, tokenRows, palette, mixRow, present, modelMix, cacheReadPct, opusShare, kpis, heatmap, changeText, fmt, money, span, cell, topSeries, peakRow`.
  - `kpis(weeks, meta): Record<Tool, Kpi[]>`; `modelMix(weeks, tool, measure, which): { series: Series; rows: Row[] }`; `mixRow(pal, stats: Models | null, measure, base: Row): Row`; `tokenRow(series, tokens: Tokens | null, base: Row): Row`; `peakRow(rows, series): { row: Row; total: number } | null`; `topSeries(series, rows): Series[number] | null`; `cell(v: unknown, unit?: Unit): string`.

- [ ] **Step 1: Write the failing tests**

Replace `site/src/lib/shape_test.ts` with:

```ts
import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  bothRows, changeText, eventMarkers, fmt, heatmap, inputPerDay, kpis, modelMix, money, parseWeeks, span, tokenRows, trendRows,
  type Meta, type ModelStat, type ToolWeek, type Week,
} from "./shape.ts";

/** A complete tool week with 100 input tokens per day. */
const tool = (o: Partial<ToolWeek> = {}): ToolWeek => ({
  complete: true, tokens: { input: 0, cacheRead: 700, cacheWrite: 0, output: 10 }, costUSD: null, perDay: [], perHour: [],
  context: { avgLongSession: 0, p95: 0, peak: 1000 }, models: {}, subagentModels: {}, ...o,
});
const week = (w: string, start: string, o: Partial<Week> = {}): Week => ({ week: w, start, status: "complete", claudeCode: tool(), codex: null, ...o });
const meta = (codex: Meta["baseline"]["codex"] = null): Meta => ({
  schemaVersion: 1, generatedAt: "", costBasis: "", events: [],
  baseline: { label: "b", claudeCode: { inputPerDay: 200, peakContext: 2000, subagentOpusShare: 0.5 }, codex },
});
const stat = (input: number, o: Partial<ModelStat> = {}): ModelStat => ({ calls: 1, input, output: 0, costUSD: null, ...o });

Deno.test("trends skip incomplete weeks and show a missing tool as null", () => {
  const text = [
    week("2026-W41", "2026-10-05", { status: "incomplete" }),
    week("2026-W40", "2026-09-28", { claudeCode: null }),
    week("2026-W39", "2026-09-21"),
  ].map((w) => JSON.stringify(w) + "\n").join("");
  assertEquals(trendRows(parseWeeks(text), "claudeCode"), [
    { week: "2026-W39", inputPerDay: 100 },
    { week: "2026-W40", inputPerDay: null },
  ]);
});

Deno.test("model mix keeps the 7 models with the most input and groups the rest, and any raw other, as other", () => {
  const models: ToolWeek["models"] = Object.fromEntries([..."abcdefghi"].map((m, i) => [m, stat(100 - i)]));
  models.other = stat(5);
  const mix = modelMix([week("2026-W40", "2026-09-28", { claudeCode: tool({ models }) })], "claudeCode", "input", "models");
  assertEquals(mix.series.map((s) => s.label), ["a", "b", "c", "d", "e", "f", "g", "other"]);
  assertEquals(mix.series.at(-1)?.color, "var(--chart-8)");
  assertEquals(mix.rows[0].m7, 93 + 92 + 5);
});

Deno.test("a model keeps its palette key across main thread, subagents and measures; null cost gives null cells and empty series drop", () => {
  // b has the most input overall, so b is m0 everywhere, even where it has none.
  const weeks = [week("2026-W40", "2026-09-28", {
    claudeCode: tool({ models: { a: stat(10, { costUSD: 1 }) }, subagentModels: { b: stat(50, { calls: 3 }), a: stat(1) } }),
  })];
  const main = modelMix(weeks, "claudeCode", "input", "models");
  assertEquals(main.series, [{ key: "m1", label: "a", color: "var(--chart-2)" }]);
  const calls = modelMix(weeks, "claudeCode", "calls", "subagentModels");
  assertEquals(calls.series.map((s) => [s.key, s.label, calls.rows[0][s.key]]), [["m0", "b", 3], ["m1", "a", 1]]);
  const cost = modelMix(weeks, "claudeCode", "cost", "subagentModels");
  assertEquals([cost.series, cost.rows[0].m0, cost.rows[0].m1], [[], null, null]);
});

Deno.test("KPIs compare the latest complete week with the baseline, with a sparkline over plotted weeks", () => {
  const busy = tool({ tokens: { input: 0, cacheRead: 7000, cacheWrite: 0, output: 0 } });
  const weeks = [week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: busy }), week("2026-W40", "2026-09-28"), week("2026-W39", "2026-09-21", { claudeCode: busy })];
  assertEquals(kpis(weeks, meta()).claudeCode[0], {
    tool: "Claude Code", label: "Input per day", unit: "tokens", week: "2026-W40", latest: 100, baseline: 200, change: -50, spark: [1000, 100],
  });
});

Deno.test("KPIs show no data when the tool is missing from the latest complete week or has no baseline", () => {
  const k = kpis([week("2026-W40", "2026-09-28", { claudeCode: null, codex: tool() }), week("2026-W39", "2026-09-21")], meta(null));
  const tile = (t: "claudeCode" | "codex", label: string) => k[t].find((x) => x.label === label)!;
  assertEquals([tile("claudeCode", "Input per day").latest, tile("claudeCode", "Input per day").change], [null, null]); // not W39's value passed off as current
  assertEquals([tile("codex", "Input per day").latest, tile("codex", "Input per day").baseline, tile("codex", "Input per day").change], [100, null, null]);
  assertEquals(tile("codex", "Weekly rate-limit peak").latest, null); // no rate limits recorded
});

Deno.test("Opus share counts subagent calls on Opus models, and a % tile changes in points", () => {
  const claudeCode = tool({ subagentModels: { "claude-opus-5-5": stat(0, { calls: 3 }), "claude-sonnet-5-5": stat(0, { calls: 1 }) } });
  const t = kpis([week("2026-W40", "2026-09-28", { claudeCode })], meta()).claudeCode.find((x) => x.label === "Subagent Opus share")!;
  assertEquals([t.latest, t.baseline, t.change, changeText(t.change, t.unit)], [75, 50, 25, "up 25 points from baseline"]);
});

Deno.test("Codex token rows take reasoning out of output so the stack adds up", () => {
  const codex = tool({ tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 50, reasoning: 20 } });
  const { series, rows } = tokenRows([week("2026-W40", "2026-09-28", { codex })], "codex");
  assertEquals(series.map((s) => s.key), ["input", "cacheRead", "cacheWrite", "output", "reasoning"]);
  assertEquals([rows[0].output, rows[0].reasoning], [30, 20]);
});

Deno.test("both-tools rows start at the earlier tool's first week and show a missing tool as null", () => {
  const weeks = [week("2026-W40", "2026-09-28", { codex: tool() }), week("2026-W39", "2026-09-21"), week("2026-W38", "2026-09-14", { claudeCode: null })];
  assertEquals(bothRows(weeks, inputPerDay), [{ week: "2026-W39", claudeCode: 100, codex: null }, { week: "2026-W40", claudeCode: 100, codex: 100 }]);
});

Deno.test("an event marks the plotted week that contains it, and nothing when its week is not plotted", () => {
  const weeks = [week("2026-W41", "2026-10-05", { status: "incomplete" }), week("2026-W40", "2026-09-28")];
  const events = [{ date: "2026-10-04", label: "in W40" }, { date: "2026-10-09", label: "in W41" }];
  assertEquals(eventMarkers(weeks, "claudeCode", events), [{ week: "2026-W40", label: "in W40" }]);
});

Deno.test("the heatmap puts ISO weekday 7 on Sunday, sums both tools, and skips incomplete weeks", () => {
  const ph = (dow: number, hour: number, input: number) => [{ dow, hour, input, output: 0, costUSD: null, models: {}, subagentModels: {} }];
  const grid = heatmap([
    week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: tool({ perHour: ph(1, 9, 50) }) }),
    week("2026-W40", "2026-09-28", { claudeCode: tool({ perHour: ph(7, 23, 5) }), codex: tool({ perHour: ph(7, 23, 2) }) }),
  ]);
  assertEquals([grid[6][23], grid[0][9]], [7, 0]);
});

Deno.test("fmt rounds up a unit at the edge, money keeps cents only under $10, span counts one week", () => {
  assertEquals([fmt(999_999), fmt(999_949), fmt(192_000_000), fmt(999)], ["1M", "999.9K", "192M", "999"]); // regression: 999,999 was "1000K"
  assertEquals([money(802.98), money(1234), money(0.416), money(9.996)], ["$803", "$1.2K", "$0.42", "$10"]);
  assertEquals([span([{ week: "2026-W40" }]), span([{ week: "2026-W39" }, { week: "2026-W40" }])], ["1 complete week, 2026-W40", "2 complete weeks, 2026-W39 to 2026-W40"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `PATH=$HOME/.swamp/deno:$PATH deno task test 2>&1 | tail -20` (worktree root)
Expected: FAIL — type check errors such as `Module '"./shape.ts"' has no exported member 'bothRows'` / `'money'` / `'span'`.

- [ ] **Step 3: Write the implementation**

Replace `site/src/lib/shape.ts` with:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=$HOME/.swamp/deno:$PATH deno task test 2>&1 | tail -5` (worktree root)
Expected: `ok | 47 passed | 0 failed` (44 before; this file goes from 8 to 11 tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/shape.ts site/src/lib/shape_test.ts
git commit -m "feat(site): data layer for cost, mixes by measure, context, rate limits, KPI tiles"
```
(with the two trailers from Global Constraints)

Note: `npm run build` fails after this task because the components still use the v1 API. Task 3 fixes that. Do not edit components in this task.

---

### Task 2: Drill-down logic (`drill.ts`)

**Files:**
- Create: `site/src/lib/drill.ts`
- Create: `site/src/lib/drill_test.ts`

**Interfaces:**
- Consumes (Task 1, `./shape.ts`): `addDays, anyPlotted, DAYS, MEASURES, mixRow, palette, present, tokenRow, tokenSeries` and types `Day, Hour, Measure, Row, Series, Tool, ToolWeek, Week, Which`.
- Produces (used by Task 3):
  - `type View = { level: "overview" } | { level: "week"; week: Week } | { level: "day"; week: Week; day: string }`
  - `type Nav = { view: View; by: Measure; notice: string | null }`
  - `days(w: Week): { date: string; label: string }[]` (7 entries, label `"Tue 09-29"`)
  - `drillWeeks(weeks: Week[]): Week[]` (newest first)
  - `parseView(search: string, weeks: Week[]): Nav`
  - `href(to: { week?: string; day?: string; by: Measure }): string`
  - `dayTokenRows(w, tool): { series: Series; rows: Row[] }`, `dayCostRows(w, tool): Row[]`, `dayMix(weeks, w, tool, measure, which): { series; rows }` — rows have `day` (label) and `date` keys.
  - `HOUR_TOKEN_SERIES: Series`, `hourTokenRows(w, date, tool): Row[]`, `hourCostRows(w, date, tool): Row[]`, `hourMix(weeks, w, date, tool, measure, which): { series; rows }` — rows have an `hour` key (`"09:00"`).
  - `dayOf(w, date, tool): Day | null`

- [ ] **Step 1: Write the failing tests**

Create `site/src/lib/drill_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { dayMix, dayTokenRows, hourTokenRows, href, parseView } from "./drill.ts";
import type { Day, Hour, ToolWeek, Week } from "./shape.ts";

const tool = (o: Partial<ToolWeek> = {}): ToolWeek => ({
  complete: true, tokens: { input: 0, cacheRead: 700, cacheWrite: 0, output: 10 }, costUSD: 5, perDay: [], perHour: [],
  context: { avgLongSession: 0, p95: 0, peak: 0 }, models: {}, subagentModels: {}, ...o,
});
const week = (w: string, start: string, o: Partial<Week> = {}): Week => ({ week: w, start, status: "complete", claudeCode: tool(), codex: null, ...o });
const weeks = [week("2026-W41", "2026-10-05", { status: "incomplete" }), week("2026-W40", "2026-09-28"), week("2026-W39", "2026-09-21")];

Deno.test("parseView opens a valid week and day with its measure", () => {
  assertEquals(parseView("?week=2026-W40&day=2026-09-29&by=cost", weeks), { view: { level: "day", week: weeks[1], day: "2026-09-29" }, by: "cost", notice: null });
});

Deno.test("parseView falls back with a notice for an unknown or incomplete week and an outside day, and ignores a bad measure", () => {
  assertEquals(parseView("?week=2026-W12", weeks), { view: { level: "overview" }, by: "input", notice: "No data for week 2026-W12." });
  assertEquals(parseView("?week=2026-W41", weeks).notice, "2026-W41 is still in progress; its charts appear when it ends.");
  assertEquals(parseView("?week=2026-W40&day=2026-10-05&by=nope", weeks), { view: { level: "week", week: weeks[1] }, by: "input", notice: "2026-10-05 is not in 2026-W40." });
});

Deno.test("href keeps week and day and leaves out the default measure", () => {
  assertEquals(
    [href({ by: "input" }), href({ week: "2026-W40", by: "input" }), href({ week: "2026-W40", day: "2026-09-29", by: "calls" })],
    ["/", "/?week=2026-W40", "/?week=2026-W40&day=2026-09-29&by=calls"],
  );
});

Deno.test("day rows show a missing day as zero and a tool with no data that week as null", () => {
  const models = { a: { calls: 2, input: 6, output: 4, costUSD: 1.5 } };
  const day: Day = { date: "2026-09-29", sessions: 1, calls: 2, tokens: { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 }, costUSD: 1.5, models, subagentModels: {} };
  const w = week("2026-W40", "2026-09-28", { claudeCode: tool({ perDay: [day], models }) });
  const { rows } = dayTokenRows(w, "claudeCode");
  assertEquals([rows.length, rows[0], rows[1].cacheWrite], [7, { day: "Mon 09-28", date: "2026-09-28", input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, 3]);
  assertEquals(dayTokenRows(w, "codex").rows[0].input, null);
  assertEquals(dayMix([w], w, "claudeCode", "cost", "models").rows.map((r) => r.m0), [0, 1.5, 0, 0, 0, 0, 0]);
});

Deno.test("hour rows take only that weekday's hours and fill the rest with zero", () => {
  const h = (dow: number, hour: number, input: number): Hour => ({ dow, hour, input, output: 0, costUSD: null, models: {}, subagentModels: {} });
  const w = week("2026-W40", "2026-09-28", { claudeCode: tool({ perHour: [h(2, 9, 50), h(3, 9, 7)] }) });
  const rows = hourTokenRows(w, "2026-09-29", "claudeCode");
  assertEquals([rows.length, rows[9], rows[10].input], [24, { hour: "09:00", input: 50, output: 0 }, 0]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `PATH=$HOME/.swamp/deno:$PATH deno task test 2>&1 | tail -20`
Expected: FAIL — `Module not found "file:///…/site/src/lib/drill.ts"`.

- [ ] **Step 3: Write the implementation**

Create `site/src/lib/drill.ts`:

```ts
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

/** Weeks you can open, newest first: every week either tool plots. */
export const drillWeeks = (weeks: Week[]) => anyPlotted(weeks).reverse();

/** The view a query string asks for. An unknown or incomplete week falls back to the overview, a day outside the week to the week, each with a notice; a bad measure falls back to input. */
export function parseView(search: string, weeks: Week[]): Nav {
  const q = new URLSearchParams(search), wk = q.get("week"), day = q.get("day");
  const by = MEASURES.find((m) => m === q.get("by")) ?? "input";
  const nav = (view: View, notice: string | null = null): Nav => ({ view, by, notice });
  if (!wk) return nav({ level: "overview" });
  const w = anyPlotted(weeks).find((w) => w.week === wk);
  if (!w) {
    const busy = weeks.some((x) => x.week === wk && x.status === "incomplete");
    return nav({ level: "overview" }, busy ? `${wk} is still in progress; its charts appear when it ends.` : `No data for week ${wk}.`);
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
  const pal = palette(weeks, tool), rows = perDay(w, tool).map(({ base, d }) => mixRow(pal, d?.[which] ?? null, measure, base));
  return { series: present(pal, rows), rows };
}

/** perHour has no cache split: input here includes cache. */
export const HOUR_TOKEN_SERIES: Series = [{ key: "input", label: "Input (cache included)" }, { key: "output", label: "Output" }];

export const hourTokenRows = (w: Week, date: string, tool: Tool): Row[] =>
  perHour(w, date, tool).map(({ base, h }) => ({ ...base, input: h?.input ?? null, output: h?.output ?? null }));

export const hourCostRows = (w: Week, date: string, tool: Tool): Row[] => perHour(w, date, tool).map(({ base, h }) => ({ ...base, cost: h ? h.costUSD : null }));

export function hourMix(weeks: Week[], w: Week, date: string, tool: Tool, measure: Measure, which: Which): { series: Series; rows: Row[] } {
  const pal = palette(weeks, tool), rows = perHour(w, date, tool).map(({ base, h }) => mixRow(pal, h?.[which] ?? null, measure, base));
  return { series: present(pal, rows), rows };
}

/** A tool's stats for one day of the week (zero if it was idle), or null when the tool has no data that week. */
export const dayOf = (w: Week, date: string, tool: Tool): Day | null => perDay(w, tool).find((x) => x.base.date === date)?.d ?? null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=$HOME/.swamp/deno:$PATH deno task test 2>&1 | tail -5`
Expected: `ok | 52 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/drill.ts site/src/lib/drill_test.ts
git commit -m "feat(site): drill-down views, links, and per-day and per-hour rows"
```
(with the two trailers)

---

### Task 3: Components and routing

**Files:**
- Modify: `site/src/components/ui/chart.tsx` (three small edits)
- Modify: `site/src/components/Section.tsx:16` (h2 → h3)
- Create: `site/src/components/Nav.tsx`
- Modify (full rewrite): `site/src/components/Charts.tsx`
- Modify (full rewrite): `site/src/components/KpiCards.tsx`
- Modify (full rewrite): `site/src/components/Heatmap.tsx`
- Create: `site/src/components/Drill.tsx`
- Modify (full rewrite): `site/src/App.tsx`

**Interfaces:**
- Consumes: all of Task 1's and Task 2's exports listed above.
- Produces: the built site. No later task consumes code from here.

No unit tests in this task (the spec rules out component tests; v1 has no React test setup). The gate is `npm run build` plus the Deno suite.

- [ ] **Step 1: Tooltip value format (`chart.tsx`)**

In `site/src/components/ui/chart.tsx`, `ChartTooltipContent`:

1. In the props type, after the line `labelKey?: string` (inside the `& { … }` block that also has `nameKey?: string`), add:
   ```ts
       valueFormatter?: (value: number) => string
   ```
2. In the destructured parameters, after `labelKey,` add `valueFormatter,`.
3. Replace
   ```tsx
                            ? item.value.toLocaleString()
   ```
   with
   ```tsx
                            ? (valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString())
   ```

- [ ] **Step 2: Card headings are h3 (`Section.tsx`)**

In `site/src/components/Section.tsx` line 16, replace `<CardTitle><h2>{title}</h2></CardTitle>` with `<CardTitle><h3>{title}</h3></CardTitle>`. (The view heading becomes the h2.)

- [ ] **Step 3: Navigation (`Nav.tsx`)**

Create `site/src/components/Nav.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

const NavContext = createContext<(to: string) => void>(() => {});

/** The current query string, and `go` to push a new URL. Back and Forward update it too. */
export function useLocationSearch(): [string, (to: string) => void] {
  const [search, setSearch] = useState(location.search);
  useEffect(() => {
    const onPop = () => setSearch(location.search);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to: string) => {
    history.pushState(null, "", to);
    setSearch(location.search);
  }, []);
  return [search, go];
}

export const NavProvider = ({ go, children }: { go: (to: string) => void; children: ReactNode }) => <NavContext value={go}>{children}</NavContext>;

export const useGo = () => useContext(NavContext);

/** A real link. A plain left click navigates in place; modified clicks (new tab, new window) behave as normal. */
export function Link({ to, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const go = useGo();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    e.preventDefault();
    go(to);
  };
  return <a {...rest} href={to} onClick={onClick} />;
}
```

- [ ] **Step 4: Charts (`Charts.tsx`)**

Replace `site/src/components/Charts.tsx` with:

```tsx
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { Section } from "@/components/Section";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  allInput, AXIS, bothRows, cell, changeText, CONTEXT_SERIES, contextRows, eventMarkers, fmt, inputPerDay, MEASURE_UNIT, money, peakRow,
  RATE_SERIES, rateRows, span, TOOL_NAMES, TOOLS, topSeries, trendRows,
  type Kpi, type Measure, type Meta, type Row, type Series, type Tool, type Unit, type Week, type Which,
} from "@/lib/shape";

type X = "week" | "day" | "hour";
type Data = { series: Series; rows: Row[] };
type Select = (row: Row) => void;

const X_LABEL: Record<X, string> = { week: "Week", day: "Day", hour: "Hour" };
const AT: Record<X, string> = { week: "in", day: "on", hour: "at" };
const MEASURE_NOUN: Record<Measure, string> = { input: "input", cost: "cost", calls: "calls" };
const MEASURE_TEXT: Record<Measure, string> = { input: "input tokens", cost: "estimated cost at API list price", calls: "calls" };
const DASH = [undefined, "6 3", "2 3", "8 3 2 3"];
const LABEL = { fill: "var(--foreground)", fontSize: 12 };
const COST: Series = [{ key: "cost", label: "Estimated cost" }];

const config = (series: Series): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? `var(--chart-${i + 1})` }]));

const NoData = () => <p className="py-16 text-center text-sm text-muted-foreground">No data</p>;

/** Stacked bars. Clicking a bar calls onSelect with its row. A legend only when there is more than one series. */
function Stacked({ rows, series, x, unit, onSelect }: Data & { x: X; unit: Unit; onSelect?: Select }) {
  return (
    <ChartContainer config={config(series)} className="h-64 w-full">
      <BarChart data={rows} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} tickLine={false} />
        <YAxis width={56} tickFormatter={AXIS[unit]} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={AXIS[unit]} />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Bar
            key={s.key} dataKey={s.key} stackId="a" fill={`var(--color-${s.key})`}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={onSelect ? (_, i) => onSelect(rows[i]) : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Lines over weeks, each with its own colour and dash. With several lines, each is labelled at its last point. */
function Lines({ rows, series, unit, yMax, children }: Data & { unit: Unit; yMax?: number | null; children?: ReactNode }) {
  const labelled = series.length > 1;
  return (
    <ChartContainer config={config(series)} className="h-64 w-full">
      <LineChart data={rows} accessibilityLayer margin={{ top: 5, right: labelled ? 64 : 16, bottom: 5, left: 5 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} />
        <YAxis width={56} tickFormatter={AXIS[unit]} domain={[0, (max: number) => Math.max(max, yMax ?? 0)]} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={AXIS[unit]} />} />
        {series.map((s, i) => (
          <Line key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} strokeDasharray={DASH[i % DASH.length]} />
        ))}
        {labelled && series.map((s) => {
          const last = rows.findLast((r) => typeof r[s.key] === "number");
          return last && (
            <ReferenceDot key={`label-${s.key}`} x={String(last.week)} y={last[s.key] as number} r={0} label={{ ...LABEL, value: s.label, position: "right" }} />
          );
        })}
        {children}
      </LineChart>
    </ChartContainer>
  );
}

/** Input per day for one tool against its baseline, with event markers. */
export function Trend({ weeks, tool, meta, kpi }: { weeks: Week[]; tool: Tool; meta: Meta; kpi: Kpi }) {
  const rows = trendRows(weeks, tool), name = TOOL_NAMES[tool], change = changeText(kpi.change, kpi.unit);
  return (
    <Section
      title={change ? `${name} input per day ${change}` : `${name} input per day`}
      summary={`Line chart of ${name} input tokens per day for ${span(rows)}. ${kpi.baseline === null ? "There is no baseline for this tool." : `The dashed line is the baseline, ${fmt(kpi.baseline)} tokens.`}`}
      columns={["Week", "Input per day"]}
      rows={rows.map((r) => [String(r.week), cell(r.inputPerDay)])}
    >
      <Lines rows={rows} series={[{ key: "inputPerDay", label: "Input per day" }]} unit="tokens" yMax={kpi.baseline}>
        {kpi.baseline !== null && (
          <ReferenceLine y={kpi.baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Baseline", position: "insideTopRight" }} />
        )}
        {eventMarkers(weeks, tool, meta.events).map((e) => (
          <ReferenceLine key={e.week + e.label} x={e.week} stroke="var(--foreground)" label={{ ...LABEL, value: e.label, position: "insideTopLeft" }} />
        ))}
      </Lines>
    </Section>
  );
}

/** Input per day for both tools on one scale, and weekly input stacked by tool. */
export function BothTools({ weeks }: { weeks: Week[] }) {
  const perDay = bothRows(weeks, inputPerDay), total = bothRows(weeks, (t) => allInput(t.tokens));
  const series: Series = TOOLS.map((t, i) => ({ key: t, label: TOOL_NAMES[t], color: `var(--chart-${i + 1})` }));
  const yMax = Math.max(0, ...perDay.flatMap((r) => TOOLS.map((t) => Number(r[t] ?? 0))));
  const last = total.at(-1), cc = Number(last?.claudeCode ?? 0), sum = cc + Number(last?.codex ?? 0);
  return (
    <Section
      title={last && sum ? `Claude Code had ${Math.round((cc / sum) * 100)}% of combined input in ${last.week}` : "Claude Code and Codex input: no data"}
      summary={`Input per day for each tool on one scale, and weekly input (cache included) stacked by tool, for ${span(total)}.`}
      columns={["Week", ...TOOLS.flatMap((t) => [`${TOOL_NAMES[t]} per day`, `${TOOL_NAMES[t]} per week`])]}
      rows={perDay.map((r, i) => [String(r.week), ...TOOLS.flatMap((t) => [cell(r[t]), cell(total[i][t])])])}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {series.map((s) => (
          <figure key={s.key}>
            <figcaption className="text-sm text-muted-foreground">{s.label} input per day</figcaption>
            <Lines rows={perDay} series={[s]} unit="tokens" yMax={yMax} />
          </figure>
        ))}
      </div>
      <Stacked rows={total} series={series} x="week" unit="tokens" />
    </Section>
  );
}

/** Tokens by type per period. The title names the busiest period unless the caller gives a finding. */
export function TokensCard({ tool, data, x, scope, title, note, onSelect }: {
  tool: Tool; data: Data; x: X; scope: string; title?: string; note?: string; onSelect?: Select;
}) {
  const name = TOOL_NAMES[tool], peak = peakRow(data.rows, data.series);
  return (
    <Section
      title={!peak ? `${name} tokens: no data` : title ?? `${name}'s busiest ${x} was ${peak.row[x]}, ${fmt(peak.total)} tokens`}
      summary={`Stacked bar chart of ${name} tokens per ${x} by type, ${scope}.${note ? ` ${note}` : ""}`}
      columns={[X_LABEL[x], ...data.series.map((s) => s.label)]}
      rows={data.rows.map((r) => [String(r[x]), ...data.series.map((s) => cell(r[s.key]))])}
    >
      {peak ? <Stacked {...data} x={x} unit="tokens" onSelect={onSelect} /> : <NoData />}
    </Section>
  );
}

/** Estimated cost per period at API list price. */
export function CostCard({ tool, rows, x, scope, onSelect }: { tool: Tool; rows: Row[]; x: X; scope: string; onSelect?: Select }) {
  const name = TOOL_NAMES[tool], peak = peakRow(rows, COST);
  return (
    <Section
      title={peak ? `${name} cost peaked at ${money(peak.total)} ${AT[x]} ${peak.row[x]} (estimate at API list price)` : `${name} cost: no data`}
      summary={`Bar chart of ${name} cost per ${x} in US dollars, an estimate at API list price, ${scope}.${!peak && tool === "codex" ? " Codex has no prices yet, so there is no estimate." : ""}`}
      columns={[X_LABEL[x], "Estimated cost"]}
      rows={rows.map((r) => [String(r[x]), cell(r.cost, "$")])}
    >
      {peak ? <Stacked rows={rows} series={COST} x={x} unit="$" onSelect={onSelect} /> : <NoData />}
    </Section>
  );
}

/** A model mix by the current measure, main thread or subagents. The title names the top model. */
export function MixCard({ tool, by, which, mix, x, scope, onSelect }: {
  tool: Tool; by: Measure; which: Which; mix: Data; x: X; scope: string; onSelect?: Select;
}) {
  const name = TOOL_NAMES[tool], thread = which === "models" ? "main-thread" : "subagent", top = topSeries(mix.series, mix.rows), unit = MEASURE_UNIT[by];
  return (
    <Section
      title={top ? `${top.label} has the most ${name} ${thread} ${MEASURE_NOUN[by]}` : `${name} ${thread} ${MEASURE_NOUN[by]} by model: no data`}
      summary={`Stacked bar chart of ${name} ${thread} ${MEASURE_TEXT[by]} per ${x} by model, ${scope}. Models outside the tool's top 7 are grouped as other.`}
      columns={[X_LABEL[x], ...mix.series.map((s) => s.label)]}
      rows={mix.rows.map((r) => [String(r[x]), ...mix.series.map((s) => cell(r[s.key], unit))])}
    >
      {top ? <Stacked {...mix} x={x} unit={unit} onSelect={onSelect} /> : <NoData />}
    </Section>
  );
}

/** Context size per week: average over long sessions, p95 and peak, with the baseline peak. */
export function ContextCard({ weeks, tool, baseline }: { weeks: Week[]; tool: Tool; baseline: number | null }) {
  const rows = contextRows(weeks, tool), name = TOOL_NAMES[tool], last = rows.findLast((r) => r.peak !== null);
  return (
    <Section
      title={last ? `${name} peak context was ${fmt(last.peak as number)} tokens in ${last.week}${baseline === null ? "" : `, baseline ${fmt(baseline)}`}` : `${name} context: no data`}
      summary={`Line chart of ${name} context size per week: the average over long sessions, the 95th percentile (p95), and the peak, for ${span(rows)}. ${baseline === null ? "There is no baseline." : `The dashed line is the baseline peak, ${fmt(baseline)} tokens.`}`}
      columns={["Week", ...CONTEXT_SERIES.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...CONTEXT_SERIES.map((s) => cell(r[s.key]))])}
    >
      {last ? (
        <Lines rows={rows} series={CONTEXT_SERIES} unit="tokens" yMax={baseline}>
          {baseline !== null && (
            <ReferenceLine y={baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Baseline peak", position: "insideBottomLeft" }} />
          )}
        </Lines>
      ) : <NoData />}
    </Section>
  );
}

/** The highest share of each Codex rate-limit window used per week, against the 100% limit. */
export function RateLimits({ weeks }: { weeks: Week[] }) {
  const rows = rateRows(weeks), last = rows.findLast((r) => r.fiveHour !== null || r.weekly !== null);
  return (
    <Section
      title={last ? `In ${last.week}, Codex peaked at ${cell(last.fiveHour, "%")} of its 5-hour limit and ${cell(last.weekly, "%")} of its weekly limit` : "Codex rate limits: no data"}
      summary={`Line chart of the highest share of each Codex rate-limit window used per week, for ${span(rows)}. The line at 100% is the limit.`}
      columns={["Week", ...RATE_SERIES.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...RATE_SERIES.map((s) => cell(r[s.key], "%"))])}
    >
      {last ? (
        <Lines rows={rows} series={RATE_SERIES} unit="%" yMax={100}>
          <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ ...LABEL, value: "Limit", position: "insideTopLeft" }} />
        </Lines>
      ) : <NoData />}
    </Section>
  );
}
```

- [ ] **Step 5: KPI rows with sparklines (`KpiCards.tsx`)**

Replace `site/src/components/KpiCards.tsx` with:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cell, changeText, TOOL_NAMES, TOOLS, type Kpi, type Tool } from "@/lib/shape";

/** The tile's metric over the tool's plotted weeks, with gaps where there is no data. Hidden from assistive tech: the tile text carries the value. */
function Spark({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums), min = Math.min(...nums), W = 100, H = 24;
  const x = (i: number) => ((i / (values.length - 1)) * W).toFixed(1);
  const y = (v: number) => (max === min ? H / 2 : H - ((v - min) / (max - min)) * H).toFixed(1);
  const d = values.map((v, i) => (v === null ? "" : `${i > 0 && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`)).join("");
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full overflow-visible">
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One row of four tiles per tool. */
export function KpiRows({ k }: { k: Record<Tool, Kpi[]> }) {
  return (
    <>
      {TOOLS.map((t) => (
        <section key={t} aria-label={`${TOOL_NAMES[t]} key figures`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {k[t].map((tile) => (
            <Card key={tile.label}>
              <CardHeader>
                <CardDescription>{tile.tool} · {tile.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{cell(tile.latest, tile.unit)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>{tile.week ?? "No complete week"} · {tile.baseline === null ? "no baseline" : `baseline ${cell(tile.baseline, tile.unit)}`}</p>
                {tile.change !== null && <p className="font-medium text-foreground">{changeText(tile.change, tile.unit)}</p>}
                <Spark values={tile.spark} />
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Heatmap takes a grid (`Heatmap.tsx`)**

Replace `site/src/components/Heatmap.tsx` with:

```tsx
import { Section } from "@/components/Section";
import { DAYS, fmt } from "@/lib/shape";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/** 7 × 24 HTML table: one hue at increasing strength, and each cell prints its value. `scope` says which weeks the grid sums. */
export function Heatmap({ grid, scope }: { grid: number[][]; scope: string }) {
  const max = Math.max(...grid.flat());
  const peak = grid.flatMap((r, d) => r.map((v, h) => ({ v, d, h }))).reduce((a, b) => (b.v > a.v ? b : a));
  return (
    <Section
      title={max ? `Busiest hour: ${DAYS[peak.d]} ${HOURS[peak.h]}:00` : "Input by weekday and hour: no data"}
      summary={`Input tokens by weekday and hour (Pacific time), Claude Code and Codex combined, ${scope}. Stronger color means more input.`}
    >
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px] tabular-nums">
          <caption className="sr-only">Input tokens by weekday and hour</caption>
          <thead>
            <tr>
              <td />
              {HOURS.map((h) => <th key={h} scope="col" className="font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={DAYS[d]}>
                <th scope="row" className="pr-1 text-left font-normal">{DAYS[d]}</th>
                {row.map((v, h) => {
                  const pct = max ? Math.round((v / max) * 100) : 0;
                  return (
                    <td key={h} className="h-7 min-w-8 px-0.5 text-center"
                      style={{ background: `color-mix(in oklch, var(--chart-1) ${Math.round(pct * 0.85)}%, transparent)` }}>
                      {v ? fmt(v) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
```

- [ ] **Step 7: Drill-down views (`Drill.tsx`)**

Create `site/src/components/Drill.tsx`:

```tsx
import { CostCard, MixCard, TokensCard } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { Link, useGo } from "@/components/Nav";
import { Section } from "@/components/Section";
import { dayCostRows, dayMix, dayOf, days, dayTokenRows, HOUR_TOKEN_SERIES, hourCostRows, hourMix, hourTokenRows, href } from "@/lib/drill";
import { fmt, heatmap, MEASURES, TOOLS, WHICH, type Measure, type Row, type Week } from "@/lib/shape";
import { cn } from "@/lib/utils";

const MEASURE_LABEL: Record<Measure, string> = { input: "Input", cost: "Cost", calls: "Calls" };
const LINK = "underline underline-offset-4";

/** Where you are; the last item is the current page. */
export function Breadcrumb({ items }: { items: { label: string; to: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-1 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={it.to} className="flex gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === items.length - 1
              ? <span aria-current="page" className="text-foreground">{it.label}</span>
              : <Link to={it.to} className={LINK}>{it.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Switches the measure of every model-mix chart on the page and keeps the week and day. */
export function MeasureSwitch({ by, to }: { by: Measure; to: (m: Measure) => string }) {
  return (
    <nav aria-label="Model mix measure" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Model mix by</span>
      {MEASURES.map((m) => (
        <Link
          key={m} to={to(m)} aria-current={m === by ? "true" : undefined}
          className={cn("rounded-md border px-3 py-1", m === by ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {MEASURE_LABEL[m]}
        </Link>
      ))}
    </nav>
  );
}

/** Links to every week you can open, newest first. */
export function WeekList({ weeks, by }: { weeks: Week[]; by: Measure }) {
  return (
    <Section title="Weeks" summary="Open a week to see it by day, and a day to see it by hour.">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {weeks.map((w) => (
          <li key={w.week}>
            <Link to={href({ week: w.week, by })} className={LINK}>{w.week}</Link> <span className="text-muted-foreground">from {w.start}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** One week, one bar per day. Clicking a bar opens that day. */
export function WeekView({ weeks, w, by }: { weeks: Week[]; w: Week; by: Measure }) {
  const go = useGo(), open = (r: Row) => go(href({ week: w.week, day: String(r.date), by })), scope = `for each day of ${w.week}`;
  return (
    <>
      <nav aria-label={`Days of ${w.week}`}>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {days(w).map((d) => <li key={d.date}><Link to={href({ week: w.week, day: d.date, by })} className={LINK}>{d.label}</Link></li>)}
        </ul>
      </nav>
      <div className="grid gap-6 lg:grid-cols-2">
        {TOOLS.map((t) => <TokensCard key={t} tool={t} data={dayTokenRows(w, t)} x="day" scope={scope} onSelect={open} />)}
        {TOOLS.map((t) => <CostCard key={t} tool={t} rows={dayCostRows(w, t)} x="day" scope={scope} onSelect={open} />)}
        <div className="lg:col-span-2"><MeasureSwitch by={by} to={(m) => href({ week: w.week, by: m })} /></div>
        {WHICH.flatMap((which) => TOOLS.map((t) => (
          <MixCard key={t + which} tool={t} by={by} which={which} mix={dayMix(weeks, w, t, by, which)} x="day" scope={scope} onSelect={open} />
        )))}
      </div>
      <Heatmap grid={heatmap([w])} scope={`in ${w.week}`} />
    </>
  );
}

/** One day, one bar per hour. */
export function DayView({ weeks, w, day, by }: { weeks: Week[]; w: Week; day: string; by: Measure }) {
  const label = days(w).find((d) => d.date === day)?.label ?? day, scope = `for each hour of ${label} (${w.week})`;
  return (
    <>
      <MeasureSwitch by={by} to={(m) => href({ week: w.week, day, by: m })} />
      <div className="grid gap-6 lg:grid-cols-2">
        {WHICH.flatMap((which) => TOOLS.map((t) => (
          <MixCard key={t + which} tool={t} by={by} which={which} mix={hourMix(weeks, w, day, t, by, which)} x="hour" scope={scope} />
        )))}
        {TOOLS.map((t) => {
          const d = dayOf(w, day, t);
          const note = d && `Day totals by type: ${fmt(d.tokens.input)} uncached input, ${fmt(d.tokens.cacheRead)} cache read, ${fmt(d.tokens.cacheWrite)} cache write, ${fmt(d.tokens.output)} output.`;
          return <TokensCard key={t} tool={t} data={{ series: HOUR_TOKEN_SERIES, rows: hourTokenRows(w, day, t) }} x="hour" scope={scope} note={note ?? undefined} />;
        })}
        {TOOLS.map((t) => <CostCard key={t} tool={t} rows={hourCostRows(w, day, t)} x="hour" scope={scope} />)}
      </div>
    </>
  );
}
```

- [ ] **Step 8: Routing (`App.tsx`)**

Replace `site/src/App.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { BothTools, ContextCard, CostCard, MixCard, RateLimits, TokensCard, Trend } from "@/components/Charts";
import { Breadcrumb, DayView, MeasureSwitch, WeekList, WeekView } from "@/components/Drill";
import { Heatmap } from "@/components/Heatmap";
import { KpiRows } from "@/components/KpiCards";
import { NavProvider, useGo, useLocationSearch } from "@/components/Nav";
import { days, drillWeeks, href, parseView, type Nav } from "@/lib/drill";
import { cacheReadPct, heatmap, kpis, modelMix, parseWeeks, span, tokenRows, TOOL_NAMES, TOOLS, weekly, WHICH, type Measure, type Meta, type Row, type Week } from "@/lib/shape";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; meta: Meta; weeks: Week[] };

export default function App() {
  const [s, setS] = useState<State>({ status: "loading" });
  const [search, go] = useLocationSearch();
  useEffect(() => {
    const get = (p: string) => fetch(p).then((r) => {
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.text();
    });
    Promise.all([get("/data/meta.json"), get("/data/weeks.jsonl")])
      .then(([m, w]) => setS({ status: "ok", meta: JSON.parse(m), weeks: parseWeeks(w) }))
      .catch(() => setS({ status: "error" }));
  }, []);
  return (
    <NavProvider go={go}>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">AI usage: Claude Code and Codex</h1>
          {s.status === "ok" && (
            <p className="text-sm text-muted-foreground">
              Token use per week against the baseline ({s.meta.baseline.label}). Data as of {new Date(s.meta.generatedAt).toLocaleString()}.
            </p>
          )}
        </header>
        {s.status === "loading" && <p role="status">Loading usage data…</p>}
        {s.status === "error" && <p role="alert">Could not load usage data.</p>}
        {s.status === "ok" && <Routed meta={s.meta} weeks={s.weeks} nav={parseView(search, s.weeks)} />}
      </main>
    </NavProvider>
  );
}

function Routed({ meta, weeks, nav: { view, by, notice } }: { meta: Meta; weeks: Week[]; nav: Nav }) {
  const heading = useRef<HTMLHeadingElement>(null), shown = useRef<string | null>(null);
  const week = view.level === "overview" ? null : view.week.week;
  const day = view.level === "day" ? days(view.week).find((d) => d.date === view.day) ?? null : null;
  const key = `${week}/${day?.date}`;
  // After navigating to another view, move focus to its heading. Not on first load, and not when only the measure changes.
  useEffect(() => {
    if (shown.current !== null && shown.current !== key) heading.current?.focus();
    shown.current = key;
  }, [key]);
  const crumbs = week === null ? [] : [
    { label: "All weeks", to: href({ by }) },
    { label: week, to: href({ week, by }) },
    ...(day ? [{ label: day.label, to: href({ week, day: day.date, by }) }] : []),
  ];
  return (
    <>
      {crumbs.length > 0 && <Breadcrumb items={crumbs} />}
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">{day ? `${day.label}, ${week}` : week ?? "All weeks"}</h2>
      {notice && <p role="status" className="rounded-md border px-3 py-2 text-sm">{notice}</p>}
      {view.level === "overview" && <Overview meta={meta} weeks={weeks} by={by} />}
      {view.level === "week" && <WeekView weeks={weeks} w={view.week} by={by} />}
      {view.level === "day" && <DayView weeks={weeks} w={view.week} day={view.day} by={by} />}
    </>
  );
}

function Overview({ meta, weeks, by }: { meta: Meta; weeks: Week[]; by: Measure }) {
  const go = useGo(), k = kpis(weeks, meta), open = (r: Row) => go(href({ week: String(r.week), by }));
  return (
    <>
      <KpiRows k={k} />
      <div className="grid gap-6 lg:grid-cols-2">
        {TOOLS.map((t) => <Trend key={t} weeks={weeks} meta={meta} tool={t} kpi={k[t].find((x) => x.label === "Input per day")!} />)}
      </div>
      <BothTools weeks={weeks} />
      <MeasureSwitch by={by} to={(m) => href({ by: m })} />
      <div className="grid gap-6 lg:grid-cols-2">
        {WHICH.flatMap((which) => TOOLS.map((t) => {
          const mix = modelMix(weeks, t, by, which);
          return <MixCard key={t + which} tool={t} by={by} which={which} mix={mix} x="week" scope={`for ${span(mix.rows)}`} onSelect={open} />;
        }))}
        {TOOLS.map((t) => {
          const data = tokenRows(weeks, t), pct = cacheReadPct(weeks, t);
          const title = pct === null ? undefined : `${pct}% of ${TOOL_NAMES[t]} input is cache reads`;
          return <TokensCard key={t} tool={t} data={data} x="week" scope={`for ${span(data.rows)}`} title={title} onSelect={open} />;
        })}
        {TOOLS.map((t) => {
          const rows = weekly(weeks, t, "cost", (w) => w.costUSD);
          return <CostCard key={t} tool={t} rows={rows} x="week" scope={`for ${span(rows)}`} onSelect={open} />;
        })}
        {TOOLS.map((t) => <ContextCard key={t} weeks={weeks} tool={t} baseline={meta.baseline[t]?.peakContext ?? null} />)}
        <RateLimits weeks={weeks} />
      </div>
      <Heatmap grid={heatmap(weeks)} scope="summed over all complete weeks" />
      <WeekList weeks={drillWeeks(weeks)} by={by} />
    </>
  );
}
```

- [ ] **Step 9: Build and test**

Run: `cd site && npm run build 2>&1 | tail -15`
Expected: `✓ built in …` with no TypeScript errors (a chunk-size warning is fine).

Run (worktree root): `PATH=$HOME/.swamp/deno:$PATH deno task test 2>&1 | tail -3`
Expected: `ok | 52 passed | 0 failed`.

If `tsc` reports a type error, fix it in the smallest way that keeps the behaviour above, and say what you changed in the report.

- [ ] **Step 10: Commit**

```bash
git add site/src/components site/src/App.tsx
git status --short   # every new file under site/ must be listed (the global gitignore hides /site and lib/)
git commit -m "feat(site): full chart set and week and day drill-down views"
```
(with the two trailers)

---

### Task 4: Local preview on real data

**Files:**
- Modify (if the preview finds a defect): files from Task 3.
- Modify: `docs/superpowers/handoffs/2026-10-09-dashboard-handoff.md`

Controller task (needs a browser). No new unit tests unless a defect in `shape.ts` or `drill.ts` turns up; such a fix gets a failing test first.

- [ ] **Step 1: Build with the real data**

```bash
cd site && npm run build
P=$HOME/.claude/jobs/1c5e0728/tmp/preview
[ -d "$P/data-real" ] || cp -R "$P/dist/data" "$P/data-real"   # the real render output; dist is replaced next
rm -rf "$P/dist" && cp -R dist "$P/dist" && cp -R "$P/data-real" "$P/dist/data"
```
Expected: `$P/dist/data/weeks.jsonl` and `meta.json` present.

- [ ] **Step 2: Serve and check three views, light and dark, at 1280×900**

Serve `$P/dist` with `python3 -m http.server` (query strings on `/` serve `index.html`). With headless Playwright:
- `/`, `/?week=2026-W40`, `/?week=2026-W40&day=2026-09-29&by=cost`, `/?week=2026-W12` (notice).
- For each: 0 console errors; viewport screenshots (not full page); dark mode via `emulateMedia({ colorScheme: "dark" })`.
- Click a bar on the overview → week view; Back → overview.
Expected: every card renders a chart or "No data"; Codex cost cards say "no data"; labels readable in dark mode.

- [ ] **Step 3: Fix the Codex "Baseline" label overlap**

v1's preview found the Codex trend chart's "Baseline" label overlapping the `2026-W40` tick. Check it; if it still overlaps, move the label (for example `position: "insideBottomRight"`), rebuild, re-check.

- [ ] **Step 4: Update the handoff and commit**

Record in the handoff's State section: the full chart set is built, tests and build pass, the preview result, and the screenshot paths. Commit:

```bash
git add docs/superpowers/handoffs/2026-10-09-dashboard-handoff.md site/
git commit -m "docs: handoff records the full chart set and its preview"
```
(with the two trailers)
