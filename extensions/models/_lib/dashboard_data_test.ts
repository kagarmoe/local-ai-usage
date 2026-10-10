import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { render } from "./dashboard_data.ts";

const pub = (o: Record<string, unknown> = {}) => ({
  schemaVersion: 1, generatedAt: "2026-10-09T10:00:00.000Z", costBasis: "api-list-price-estimate",
  baseline: { label: "b" }, events: [], weeks: [{ week: "2026-W40" }, { week: "2026-W39" }], ...o,
});
const file = (files: { pathname: string; content: string }[], p: string) => files.find((f) => f.pathname === p)!.content;

Deno.test("weeks.jsonl has one line per week, newest first; meta.json keeps generatedAt", async () => {
  const { files } = await render(pub());
  assertEquals(file(files, "data/weeks.jsonl").trim().split("\n").map((l) => JSON.parse(l).week), ["2026-W40", "2026-W39"]);
  assertEquals(JSON.parse(file(files, "data/meta.json")).generatedAt, "2026-10-09T10:00:00.000Z");
});

Deno.test("the hash ignores generatedAt and changes when a week changes", async () => {
  const { hash } = await render(pub());
  assertEquals((await render(pub({ generatedAt: "2026-10-10T16:17:00.000Z" }))).hash, hash);
  assertNotEquals((await render(pub({ weeks: [{ week: "2026-W40", calls: 1 }, { week: "2026-W39" }] }))).hash, hash);
});

Deno.test("a wrong schemaVersion throws", async () => {
  await assertRejects(() => render(pub({ schemaVersion: 2 })), Error, "schemaVersion");
});
