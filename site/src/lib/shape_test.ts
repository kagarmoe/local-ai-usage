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
