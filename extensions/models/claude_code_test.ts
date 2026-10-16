import { assertEquals } from "jsr:@std/assert@1.0.19";
import { model } from "./claude_code.ts";
import { writeFixture } from "./_lib/test_util.ts";
import { isoWeek } from "./_lib/week.ts";

const DAY = 86_400_000;

function fakeContext(projectsDir: string, repoDir: string, stored: string[]) {
  const written: { spec: string; name: string; data: any }[] = [];
  const ctx = {
    globalArgs: { projectsDir, pricesFile: "prices.yaml" },
    definition: { name: "claude-code" },
    repoDir,
    logger: { info() {} },
    queryData: () => Promise.resolve(stored.map((w) => ({ name: `weekly-${w}` }))),
    writeResource: (spec: string, name: string, data: unknown) => {
      written.push({ spec, name, data });
      return Promise.resolve({ name });
    },
  };
  return { ctx, written };
}

Deno.test("scanMissing writes only completed weeks without a snapshot, and nothing on a re-run", async () => {
  const now = Date.now();
  const msg = (id: string, daysAgo: number) => ({
    type: "assistant", timestamp: new Date(now - daysAgo * DAY).toISOString(), sessionId: "s",
    message: { id, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } },
  });
  const projects = await writeFixture({ "p/old.jsonl": [msg("m1", 14)], "p/new.jsonl": [msg("m2", 7)] });
  Deno.utimeSync(`${projects}/p/old.jsonl`, new Date(now - 14 * DAY), new Date(now - 14 * DAY));
  Deno.utimeSync(`${projects}/p/new.jsonl`, new Date(now - 7 * DAY), new Date(now - 7 * DAY));
  const repo = await Deno.makeTempDir();
  await Deno.writeTextFile(`${repo}/prices.yaml`, "claude: {}\ncodex: {}\n");
  const twoAgo = isoWeek(new Date(now - 14 * DAY)), oneAgo = isoWeek(new Date(now - 7 * DAY));

  const first = fakeContext(projects, repo, [twoAgo]);
  await model.methods.scanMissing.execute({}, first.ctx);
  assertEquals(first.written.map((w) => [w.spec, w.name, w.data.summary.calls]), [["weekly", `weekly-${oneAgo}`, 1]]);

  const rerun = fakeContext(projects, repo, [twoAgo, oneAgo]);
  await model.methods.scanMissing.execute({}, rerun.ctx);
  assertEquals(rerun.written, []);
});

Deno.test("with prices as an argument (a worker run) the scan reads no checkout and records fitted rates as calibration", async () => {
  const now = Date.now();
  const haiku = "claude-haiku-4-5-20251001";
  const projects = await writeFixture({
    "p/s.jsonl": [
      {
        type: "assistant", timestamp: new Date(now - 7 * DAY).toISOString(), sessionId: "s",
        message: { id: "m1", model: haiku, usage: { input_tokens: 14349, output_tokens: 15 } },
      },
      {
        type: "cost-state", sessionId: "s", startTime: now - 7 * DAY, totalCostUSD: 0.014424,
        modelUsage: { [haiku]: { inputTokens: 14349, outputTokens: 15, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.014424 } },
      },
    ],
  });
  Deno.utimeSync(`${projects}/p/s.jsonl`, new Date(now - 7 * DAY), new Date(now - 7 * DAY));
  const week = isoWeek(new Date(now - 7 * DAY));

  const run = fakeContext(projects, "/nonexistent-checkout", []);
  await model.methods.scanMissing.execute({ prices: { claude: {}, codex: {} } }, run.ctx);
  const weekly = run.written.find((w) => w.name === `weekly-${week}`)!;
  assertEquals(weekly.data.summary.costUSD > 0, true);
  const cal = run.written.find((w) => w.spec === "calibration")!;
  assertEquals(cal.data.claude[haiku], { input: 1, cacheRead: 0.1, cacheWrite: 1.25, output: 5 });
});
