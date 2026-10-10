import { assertEquals } from "jsr:@std/assert@1.0.19";
import { parseCodex } from "./codex.ts";
import { listJsonl } from "./jsonl.ts";
import { writeFixture } from "./test_util.ts";

const T = "2026-10-06T01:35:23Z";
const meta = (source: unknown) => ({ timestamp: T, type: "session_meta", payload: { cwd: "/Users/x/repos/secret-proj", source } });
const turn = (model: string) => ({ timestamp: T, type: "turn_context", payload: { model } });
// Usage from a real 2026-10-06 token_usage_record.
const usage = { input_tokens: 28498, cached_input_tokens: 13056, cache_write_input_tokens: 0, output_tokens: 8, reasoning_output_tokens: 0, total_tokens: 28506 };
const record = (responseId: string) => ({ timestamp: T, type: "token_usage_record", payload: { response_id: responseId, usage } });
const tokenCount = (total: unknown, rateLimits?: unknown) => ({
  timestamp: T, type: "event_msg",
  payload: { type: "token_count", info: total ? { total_token_usage: total, last_token_usage: usage } : null, rate_limits: rateLimits },
});

Deno.test("parseCodex dedupes records by response_id; normalized tokens add up to total_tokens", async () => {
  const root = await writeFixture({ "2026/10/06/a.jsonl": [meta("vscode"), turn("gpt-5.5"), record("r1"), record("r1")] });
  const { calls } = parseCodex(listJsonl(root));
  assertEquals(calls.length, 1);
  const c = calls[0];
  assertEquals([c.input, c.cacheRead, c.cacheWrite, c.output, c.model, c.main], [15442, 13056, 0, 8, "gpt-5.5", true]);
  assertEquals(c.input + c.cacheRead + c.cacheWrite + c.output, usage.total_tokens);
});

Deno.test("parseCodex token_count fallback counts only changed totals and never mixes event types", async () => {
  const root = await writeFixture({
    "old.jsonl": [meta("cli"), turn("gpt-5.2-codex"), tokenCount({ total_tokens: 1 }), tokenCount({ total_tokens: 1 }), tokenCount({ total_tokens: 2 })],
    "new.jsonl": [meta("vscode"), turn("gpt-5.5"), tokenCount({ total_tokens: 1 }), record("r9")],
  });
  const { calls } = parseCodex(listJsonl(root));
  assertEquals(calls.filter((c) => c.model === "gpt-5.2-codex").length, 2);
  assertEquals(calls.filter((c) => c.model === "gpt-5.5").length, 1);
});

Deno.test("parseCodex attributes spawned and guardian sessions to subagents and reads both rate-limit windows", async () => {
  const root = await writeFixture({
    "s.jsonl": [meta({ subagent: { thread_spawn: { parent_thread_id: "p" } } }), turn("gpt-5.5"), record("a")],
    "g.jsonl": [
      meta({ subagent: { other: "guardian" } }), turn("codex-auto-review"), record("b"),
      tokenCount(null, { primary: { used_percent: 51, window_minutes: 300 }, secondary: { used_percent: 14, window_minutes: 10080 } }),
    ],
  });
  const { calls, rates } = parseCodex(listJsonl(root));
  assertEquals(calls.map((c) => c.main), [false, false]);
  assertEquals(rates.map((r) => [r.fiveHour, r.weekly]), [[51, 14]]);
});
