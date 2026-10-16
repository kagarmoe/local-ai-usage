import { assertEquals } from "jsr:@std/assert@1.0.19";
import { loadPrices } from "./_lib/prices.ts";
import { model } from "./prices_file.ts";

function fakeContext(repoDir: string, calibrations: unknown[]) {
  const written: { spec: string; name: string; data: any }[] = [];
  const ctx = {
    globalArgs: { pricesFile: "prices.yaml", calibrationSources: ["claude-code"] },
    definition: { name: "prices" },
    repoDir,
    logger: { info() {} },
    queryData: () => Promise.resolve(calibrations),
    writeResource: (spec: string, name: string, data: unknown) => {
      written.push({ spec, name, data });
      return Promise.resolve({ name });
    },
  };
  return { ctx, written };
}

const rate = (input: number) => ({ input, cacheRead: input / 10, cacheWrite: input * 1.25, output: input * 5 });

Deno.test("load writes prices.yaml as data", async () => {
  const repo = await Deno.makeTempDir();
  await Deno.writeTextFile(`${repo}/prices.yaml`, "claude:\n  a:\n    input: 1\n    cacheRead: 0.1\n    cacheWrite: 1.25\n    output: 5\n");
  const { ctx, written } = fakeContext(repo, []);
  await model.methods.load.execute({}, ctx);
  assertEquals(written, [{ spec: "prices", name: "prices", data: { claude: { a: rate(1) }, codex: {} } }]);
});

Deno.test("merge adds fitted rates only for models prices.yaml lacks, and leaves the file alone when nothing is new", async () => {
  const repo = await Deno.makeTempDir();
  await Deno.writeTextFile(`${repo}/prices.yaml`, "claude:\n  a:\n    input: 2\n    cacheRead: 0.2\n    cacheWrite: 2.5\n    output: 10\ncodex: {}\n");
  const fitted = { claude: { a: rate(1), b: rate(3) }, fittedAt: "2026-10-16T00:00:00Z" };

  const first = fakeContext(repo, [fitted]);
  await model.methods.merge.execute({}, first.ctx);
  assertEquals(loadPrices(`${repo}/prices.yaml`).claude, { a: { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 }, b: rate(3) });
  assertEquals(Object.keys(first.written[0].data.claude), ["a", "b"]);

  const before = await Deno.readTextFile(`${repo}/prices.yaml`);
  await model.methods.merge.execute({}, fakeContext(repo, [fitted]).ctx);
  assertEquals(await Deno.readTextFile(`${repo}/prices.yaml`), before);
});
