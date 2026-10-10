import { assertEquals } from "jsr:@std/assert@1.0.19";
import { aggregateWeek } from "./aggregate.ts";
import { call } from "./test_util.ts";
import { weekBounds } from "./week.ts";

const W41 = weekBounds("2026-W41").start;

Deno.test("aggregateWeek returns null for a week with no calls", () => {
  assertEquals(aggregateWeek([], W41, false), null);
});

Deno.test("aggregateWeek: DST week has 7 local days; both 01:30s land in Sunday hour 1 with a per-hour model mix", () => {
  const w = aggregateWeek([
    call("2026-11-01T01:30:00-07:00"),
    call("2026-11-01T01:30:00-08:00", { model: "claude-sonnet-5-5", main: false, session: "sub" }),
  ], weekBounds("2026-W44").start, false)!;
  assertEquals(w.perDay.map((d) => d.date), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assertEquals(w.perDay[6].calls, 2);
  assertEquals(w.perHour.map((h) => [h.dow, h.hour, h.input]), [[7, 1, 220]]);
  assertEquals(Object.keys(w.perHour[0].models), ["claude-opus-5-5"]);
  assertEquals(Object.keys(w.perHour[0].subagentModels), ["claude-sonnet-5-5"]);
});

Deno.test("aggregateWeek: an unpriced model has null cost; totals sum priced calls only", () => {
  const w = aggregateWeek([
    call("2026-10-06T09:00:00-07:00", { costUSD: 2 }),
    call("2026-10-06T09:10:00-07:00", { model: "new-model", costUSD: null }),
  ], W41, false)!;
  assertEquals(w.models["new-model"].costUSD, null);
  assertEquals(w.models["claude-opus-5-5"], { calls: 1, input: 110, output: 5, costUSD: 2 });
  assertEquals(w.costUSD, 2);
});

Deno.test("aggregateWeek: sessions count main sessions; context stats", () => {
  const long = Array.from({ length: 51 }, (_, i) =>
    call(`2026-10-06T10:${String(i).padStart(2, "0")}:00-07:00`, { input: 100 + i * 10, cacheRead: 0 }));
  const w = aggregateWeek([
    ...long,
    call("2026-10-06T11:00:00-07:00", { session: "s2", input: 300, cacheRead: 0 }),
    call("2026-10-06T11:05:00-07:00", { session: "agent-x", main: false, input: 1000, cacheRead: 0 }),
  ], W41, false)!;
  assertEquals([w.sessions, w.calls], [2, 53]);
  assertEquals(w.context, { avgLongSession: 350, p95: 590, peak: 1000 });
  assertEquals(w.sessionStartMedian, 100);
});
