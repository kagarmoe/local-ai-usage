import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { calibrate, costCheck } from "./calibrate.ts";
import type { CostState } from "./claude.ts";

// Real cost-state record (Claude Code, 2026-09). Haiku 4.5 list price: $1 input, $5 output per million.
const haiku: CostState = {
  sessionId: "s", startTime: 1790034231871, totalCostUSD: 0.014424000000000001,
  modelUsage: {
    "claude-haiku-4-5-20251001": { inputTokens: 14349, outputTokens: 15, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.014424000000000001 },
  },
};

Deno.test("calibrate fits the list price from a real cost-state; costCheck is within 2%", () => {
  const rates = calibrate([haiku], {});
  assertEquals(rates["claude-haiku-4-5-20251001"], { input: 1, cacheRead: 0.1, cacheWrite: 1.25, output: 5 });
  const check = costCheck([haiku], rates);
  assertEquals(check.sessions, 1);
  assert(Math.abs(check.deltaPct) <= 2);
});

Deno.test("calibrate keeps existing rates; costCheck skips sessions with an unpriced model", () => {
  const existing = { "claude-haiku-4-5-20251001": { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 } };
  assertEquals(calibrate([haiku], existing), existing);
  assertEquals(costCheck([haiku], {}).sessions, 0);
});

Deno.test("calibrate and costCheck leave out web-search charges ($10 per 1,000 searches) included in cost-state costUSD", () => {
  const u = haiku.modelUsage["claude-haiku-4-5-20251001"];
  const withSearch: CostState = {
    ...haiku,
    modelUsage: { "claude-haiku-4-5-20251001": { ...u, webSearchRequests: 3, costUSD: u.costUSD + 0.03 } },
  };
  const rates = calibrate([withSearch], {});
  assertEquals(rates["claude-haiku-4-5-20251001"].input, 1);
  assertEquals(costCheck([withSearch], rates).deltaPct, 0);
});
