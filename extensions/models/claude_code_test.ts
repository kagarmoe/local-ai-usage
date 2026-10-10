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
    queryData: () => Promise.resolve(stored.map((w) => `weekly-${w}`)),
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
