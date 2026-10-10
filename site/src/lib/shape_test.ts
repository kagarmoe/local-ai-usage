import { assertEquals } from "jsr:@std/assert@1.0.19";
import { eventMarkers, heatmap, kpis, modelMix, parseWeeks, tokenRows, trendRows, type Meta, type ToolWeek, type Week } from "./shape.ts";

/** A complete tool week with 100 input tokens per day. */
const tool = (o: Partial<ToolWeek> = {}): ToolWeek => ({
  complete: true, tokens: { input: 0, cacheRead: 700, cacheWrite: 0, output: 10 }, perHour: [], context: { peak: 1000 }, models: {}, subagentModels: {}, ...o,
});
const week = (w: string, start: string, o: Partial<Week> = {}): Week => ({ week: w, start, status: "complete", claudeCode: tool(), codex: null, ...o });
const meta = (codex: Meta["baseline"]["codex"] = null): Meta => ({
  schemaVersion: 1, generatedAt: "", costBasis: "", events: [],
  baseline: { label: "b", claudeCode: { inputPerDay: 200, peakContext: 2000 }, codex },
});

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
  const models: ToolWeek["models"] = Object.fromEntries([..."abcdefghi"].map((m, i) => [m, { calls: 1, input: 100 - i, output: 0, costUSD: null }]));
  models.other = { calls: 1, input: 5, output: 0, costUSD: null };
  const mix = modelMix([week("2026-W40", "2026-09-28", { claudeCode: tool({ models }) })], "claudeCode");
  assertEquals(mix.series.map((s) => s.label), ["a", "b", "c", "d", "e", "f", "g", "other"]);
  assertEquals(mix.rows[0].m7, 93 + 92 + 5);
});

Deno.test("model mix adds subagent input to the main-thread input per model", () => {
  const stat = (input: number) => ({ calls: 1, input, output: 0, costUSD: null });
  const mix = modelMix([week("2026-W40", "2026-09-28", { claudeCode: tool({ models: { a: stat(10) }, subagentModels: { a: stat(5), b: stat(7) } }) })], "claudeCode");
  assertEquals(mix.series.map((s) => s.label), ["a", "b"]);
  assertEquals([mix.rows[0].m0, mix.rows[0].m1], [15, 7]);
});

Deno.test("KPIs compare the latest complete week with the baseline", () => {
  const busy = tool({ tokens: { input: 0, cacheRead: 7000, cacheWrite: 0, output: 0 } });
  const [cc] = kpis([week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: busy }), week("2026-W40", "2026-09-28")], meta());
  assertEquals(cc, { tool: "Claude Code", label: "Input per day", unit: "tokens", week: "2026-W40", latest: 100, baseline: 200, changePct: -50 });
});

Deno.test("KPIs show no data when the tool is missing from the latest complete week or has no baseline", () => {
  const k = kpis([week("2026-W40", "2026-09-28", { claudeCode: null, codex: tool() }), week("2026-W39", "2026-09-21")], meta(null));
  assertEquals([k[0].latest, k[0].changePct], [null, null]); // not W39's value passed off as current
  assertEquals([k[2].latest, k[2].baseline, k[2].changePct], [100, null, null]);
  assertEquals(k[4].latest, null); // no rate limits recorded
});

Deno.test("Codex token rows take reasoning out of output so the stack adds up", () => {
  const codex = tool({ tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 50, reasoning: 20 } });
  const { series, rows } = tokenRows([week("2026-W40", "2026-09-28", { codex })], "codex");
  assertEquals(series.map((s) => s.key), ["input", "cacheRead", "cacheWrite", "output", "reasoning"]);
  assertEquals([rows[0].output, rows[0].reasoning], [30, 20]);
});

Deno.test("an event marks the plotted week that contains it, and nothing when its week is not plotted", () => {
  const weeks = [week("2026-W41", "2026-10-05", { status: "incomplete" }), week("2026-W40", "2026-09-28")];
  const events = [{ date: "2026-10-04", label: "in W40" }, { date: "2026-10-09", label: "in W41" }];
  assertEquals(eventMarkers(weeks, "claudeCode", events), [{ week: "2026-W40", label: "in W40" }]);
});

Deno.test("the heatmap puts ISO weekday 7 on Sunday, sums both tools, and skips incomplete weeks", () => {
  const ph = (dow: number, hour: number, input: number) => [{ dow, hour, input }];
  const grid = heatmap([
    week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: tool({ perHour: ph(1, 9, 50) }) }),
    week("2026-W40", "2026-09-28", { claudeCode: tool({ perHour: ph(7, 23, 5) }), codex: tool({ perHour: ph(7, 23, 2) }) }),
  ]);
  assertEquals([grid[6][23], grid[0][9]], [7, 0]);
});
