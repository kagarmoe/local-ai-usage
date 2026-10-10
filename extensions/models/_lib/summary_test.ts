import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { buildSnapshots } from "./scan.ts";
import { buildSummary, renderMarkdown } from "./summary.ts";
import { call } from "./test_util.ts";

const NOW = new Date("2026-10-20T16:17:00Z");
const cc = buildSnapshots({
  tool: "claudeCode", weeks: ["2026-W40", "2026-W41"], oldest: new Date(2026, 8, 1), now: NOW, skipped: 0,
  calls: [call("2026-10-06T09:00:00-07:00", { project: "private-app", session: "0f9c1a2e-sess" })],
}).map((s) => ({ ...s, costCheck: { sessions: 1, deltaPct: 5 } }));
const cx = buildSnapshots({
  tool: "codex", weeks: ["2026-W41"], oldest: new Date(2026, 9, 7), now: NOW, skipped: 0,
  calls: [call("2026-10-07T10:00:00-07:00", { model: "gpt-5.5", project: "secret-proj", session: "/Users/x/.codex/sessions/rollout-1.jsonl", costUSD: null })],
}).map((s) => ({ ...s, rateLimits: { fiveHourPeakPct: 51, weeklyPeakPct: 14 } }));
const events = [{ date: "2026-10-09", label: "Plugins and skills pruned" }];

Deno.test("buildSummary redacts project names, paths, and session ids", () => {
  const json = JSON.stringify(buildSummary([...cc, ...cx], events));
  for (const secret of ["private-app", "secret-proj", "/Users/", "0f9c1a2e", "rollout"]) assert(!json.includes(secret), secret);
});

Deno.test("buildSummary: weeks newest first, null for no data, incomplete status, per-tool extras", () => {
  const s = buildSummary([...cc, ...cx], events);
  assertEquals(s.weeks.map((w) => [w.week, w.status]), [["2026-W41", "incomplete"], ["2026-W40", "complete"]]);
  assertEquals([s.weeks[1].claudeCode, s.weeks[1].codex], [null, null]);
  assertEquals(s.weeks[0].claudeCode?.costCheck, { sessions: 1, deltaPct: 5 });
  assertEquals(s.weeks[0].codex?.rateLimits?.weeklyPeakPct, 14);
  assertEquals(s.baseline.codex, { inputPerDay: 6, peakContext: 110, weeklyRateLimitPeakPct: 14 });
  assertEquals(s.events, events);
});

Deno.test("buildSummary is deterministic: same snapshots in any order give identical JSON", () => {
  const a = JSON.stringify(buildSummary([...cc, ...cx], events));
  const b = JSON.stringify(buildSummary([...cx, ...cc].reverse(), events));
  assertEquals(a, b);
  assertEquals(JSON.parse(a).generatedAt, NOW.toISOString());
});

Deno.test("renderMarkdown flags price drift and unpriced models, with private project detail", () => {
  const md = renderMarkdown([...cc, ...cx]);
  assert(md.includes("Price drift"));
  assert(md.includes("Unpriced models:** gpt-5.5"));
  assert(md.includes("private-app"));
});

Deno.test("buildSummary publishes only contract fields, whatever else a snapshot carries", () => {
  const leaky = cc.map((s) => s.summary
    ? { ...s, summary: { ...s.summary, cwd: "/Users/x/leak", perDay: s.summary.perDay.map((d) => ({ ...d, project: "leak-proj" })) } }
    : s);
  assert(!JSON.stringify(buildSummary([...leaky, ...cx], events)).includes("leak"));
});

Deno.test("buildSummary publishes non-plain model ids (ARNs, fine-tune ids) as other", () => {
  const arn = buildSnapshots({
    tool: "claudeCode", weeks: ["2026-W41"], oldest: new Date(2026, 8, 1), now: NOW, skipped: 0,
    calls: [call("2026-10-06T09:00:00-07:00", { model: "arn:aws:bedrock:us-west-2:123456789012:inference-profile/x" })],
  });
  const json = JSON.stringify(buildSummary(arn, []));
  assert(!json.includes("123456789012"));
  assertEquals(Object.keys(buildSummary(arn, []).weeks[0].claudeCode!.models), ["other"]);
});

Deno.test("buildSummary marks each tool complete or not, separately from the week status", () => {
  const w = buildSummary([...cc, ...cx], events).weeks[0];
  assertEquals([w.status, w.claudeCode?.complete, w.codex?.complete], ["incomplete", true, false]);
});
