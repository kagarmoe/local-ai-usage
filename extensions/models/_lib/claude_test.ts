import { assertEquals } from "jsr:@std/assert@1.0.19";
import { parseClaude } from "./claude.ts";
import { listJsonl } from "./jsonl.ts";
import { writeFixture } from "./test_util.ts";

const T = "2026-10-06T16:00:00Z";
const asst = (id: string, extra: Record<string, unknown> = {}, model = "claude-opus-5-5", output = 50) => ({
  type: "assistant", timestamp: T, sessionId: "sess-1", isSidechain: false, cwd: "/Users/x/repos/secret-proj",
  message: { id, model, usage: { input_tokens: 6, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: output } },
  ...extra,
});

Deno.test("parseClaude counts a streamed message once, using its last line", async () => {
  const root = await writeFixture({
    "-Users-x-repos-secret-proj/sess-1.jsonl": [asst("msg_1", {}, "claude-opus-5-5", 3), asst("msg_1", {}, "claude-opus-5-5", 50)],
  });
  const { calls } = parseClaude(listJsonl(root), root);
  assertEquals(calls.length, 1);
  const c = calls[0];
  assertEquals([c.input, c.cacheRead, c.cacheWrite, c.output], [6, 100, 20, 50]);
  assertEquals([c.project, c.session, c.main], ["-Users-x-repos-secret-proj", "sess-1", true]);
});

Deno.test("parseClaude marks subagent calls by subagents/ path or isSidechain", async () => {
  const root = await writeFixture({
    "p/sess-1.jsonl": [asst("m1"), asst("m2", { isSidechain: true })],
    "p/sess-1/subagents/agent-a.jsonl": [asst("m3", { isSidechain: true }, "claude-sonnet-5-5")],
  });
  const { calls } = parseClaude(listJsonl(root), root);
  assertEquals(calls.filter((c) => c.main).length, 1);
  const sub = calls.find((c) => c.model === "claude-sonnet-5-5")!;
  assertEquals([sub.main, sub.session.endsWith("subagents/agent-a.jsonl")], [false, true]);
});

Deno.test("parseClaude skips malformed and half-written lines and synthetic messages; keeps the last cost-state", async () => {
  const root = await writeFixture({
    "p/s.jsonl": [
      "{not json",
      asst("m1"),
      asst("m2", {}, "<synthetic>"),
      { type: "cost-state", sessionId: "sess-1", startTime: 1, totalCostUSD: 1, modelUsage: {} },
      { type: "cost-state", sessionId: "sess-1", startTime: 1, totalCostUSD: 2, modelUsage: {} },
      '{"type":"assistant","message":{"id":"m3"',
    ],
  });
  const r = parseClaude(listJsonl(root), root);
  assertEquals([r.skipped, r.calls.length], [2, 1]);
  assertEquals(r.costStates.map((c) => c.totalCostUSD), [2]);
});
