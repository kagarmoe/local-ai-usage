import { assertEquals } from "jsr:@std/assert@1.0.19";
import { buildSnapshots } from "./scan.ts";
import { call } from "./test_util.ts";

const NOW = new Date("2026-10-20T16:17:00Z");

Deno.test("buildSnapshots puts each call in its own local week; a session crossing Sunday midnight counts in both", () => {
  const snaps = buildSnapshots({
    tool: "claudeCode", weeks: ["2026-W41", "2026-W42"], oldest: new Date(2026, 8, 1), now: NOW, skipped: 0,
    calls: [call("2026-10-11T23:50:00-07:00"), call("2026-10-12T00:10:00-07:00")],
  });
  assertEquals(snaps.map((s) => [s.week, s.summary?.calls, s.summary?.sessions]), [["2026-W41", 1, 1], ["2026-W42", 1, 1]]);
});

Deno.test("buildSnapshots marks the week holding the oldest log incomplete and keeps projects in the private block", () => {
  const [s] = buildSnapshots({
    tool: "claudeCode", weeks: ["2026-W41"], oldest: new Date(2026, 9, 7), now: NOW, skipped: 3,
    calls: [call("2026-10-07T09:00:00-07:00", { project: "secret-proj", main: false, costUSD: null })],
  });
  assertEquals(s.complete, false);
  assertEquals(s.private.projects["secret-proj"].calls, 1);
  assertEquals(s.private.subagentModelsByProject, { "secret-proj": { "claude-opus-5-5": 1 } });
  assertEquals([s.private.skippedLines, s.private.unpricedModels], [3, ["claude-opus-5-5"]]);
});
