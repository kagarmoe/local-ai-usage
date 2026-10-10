import { assertEquals } from "jsr:@std/assert@1.0.19";
import { completedWeeks, isoWeek, localDate, weekBounds } from "./week.ts";

// deno task test sets TZ=America/Los_Angeles.

Deno.test("isoWeek handles year boundaries (2026 has 53 weeks)", () => {
  assertEquals(isoWeek(new Date(2026, 0, 1)), "2026-W01");
  assertEquals(isoWeek(new Date(2027, 0, 2)), "2026-W53");
  assertEquals(isoWeek(new Date(2027, 0, 4)), "2027-W01");
});

Deno.test("isoWeek uses local time, not UTC", () => {
  // Sunday 22:00 PDT is already Monday in UTC.
  assertEquals(isoWeek(new Date("2026-10-11T22:00:00-07:00")), "2026-W41");
  assertEquals(isoWeek(new Date("2026-10-12T00:30:00-07:00")), "2026-W42");
});

Deno.test("weekBounds spans the DST fall-back week as 7 local days", () => {
  const { start, end } = weekBounds("2026-W44");
  assertEquals([localDate(start), localDate(end)], ["2026-10-26", "2026-11-02"]);
  assertEquals([start.getHours(), end.getHours()], [0, 0]);
  assertEquals((end.getTime() - start.getTime()) / 3_600_000, 169);
});

Deno.test("completedWeeks excludes the current, unfinished week", () => {
  assertEquals(completedWeeks(new Date(2026, 9, 7), new Date(2026, 9, 19, 9, 17)), ["2026-W41", "2026-W42"]);
});
