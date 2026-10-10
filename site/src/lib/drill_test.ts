import { assertEquals } from "jsr:@std/assert@1.0.19";
import { dayMix, dayTokenRows, drillWeeks, hourMix, hourTokenRows, href, parseView } from "./drill.ts";
import { emptyText, type Day, type Hour, type ToolWeek, type Week } from "./shape.ts";

const tool = (o: Partial<ToolWeek> = {}): ToolWeek => ({
  complete: true, tokens: { input: 0, cacheRead: 700, cacheWrite: 0, output: 10 }, costUSD: 5, perDay: [], perHour: [],
  context: { avgLongSession: 0, p95: 0, peak: 0 }, models: {}, subagentModels: {}, ...o,
});
const week = (w: string, start: string, o: Partial<Week> = {}): Week => ({ week: w, start, status: "complete", claudeCode: tool(), codex: null, ...o });
// An incomplete week starts before the oldest log, so it is the oldest week.
const weeks = [week("2026-W40", "2026-09-28"), week("2026-W39", "2026-09-21"), week("2026-W38", "2026-09-14", { status: "incomplete" })];

Deno.test("parseView opens a valid week and day with its measure", () => {
  assertEquals(parseView("?week=2026-W40&day=2026-09-29&by=cost", weeks), { view: { level: "day", week: weeks[0], day: "2026-09-29" }, by: "cost", notice: null });
});

Deno.test("parseView falls back with a notice for an unknown or incomplete week and an outside day, and ignores a bad measure", () => {
  assertEquals(parseView("?week=2026-W12", weeks), { view: { level: "overview" }, by: "input", notice: "No data for week 2026-W12." });
  assertEquals(parseView("?week=2026-W38", weeks).notice, "2026-W38 starts before the oldest log, so it is not plotted.");
  assertEquals(parseView("?week=2026-W40&day=2026-10-05&by=nope", weeks), { view: { level: "week", week: weeks[0] }, by: "input", notice: "2026-10-05 is not in 2026-W40." });
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

Deno.test("a tool without prices has no cost data, even in an idle hour", () => {
  // regression: Codex's idle hours made its cost-by-model chart say "none"
  const w = week("2026-W40", "2026-09-28", { codex: tool({ costUSD: null, models: { "gpt-5.5": { calls: 1, input: 5, output: 1, costUSD: null } } }) });
  assertEquals(emptyText(hourMix([w], w, "2026-09-29", "codex", "cost", "models").rows), "no data");
});

Deno.test("the week list leaves out weeks where neither tool has data", () => {
  // regression: half the real week links opened pages that said only "no data"
  const ws = [week("2026-W40", "2026-09-28"), week("2026-W39", "2026-09-21", { claudeCode: null }), week("2026-W38", "2026-09-14")];
  assertEquals(drillWeeks(ws).map((w) => w.week), ["2026-W40", "2026-W38"]);
});
