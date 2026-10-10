import type { Call } from "./aggregate.ts";

/** A Call with test defaults: main session s1, Opus, context 110, output 5, cost $1. */
export const call = (iso: string, o: Partial<Call> = {}): Call => ({
  ts: new Date(iso), session: "s1", main: true, model: "claude-opus-5-5", project: "p",
  input: 10, cacheRead: 100, cacheWrite: 0, output: 5, reasoning: 0, costUSD: 1, ...o,
});

/** Write JSONL files (relative path → rows; strings are written raw) under a new temp dir. Returns the dir. */
export async function writeFixture(files: Record<string, unknown[]>): Promise<string> {
  const root = await Deno.makeTempDir();
  for (const [rel, rows] of Object.entries(files)) {
    const path = `${root}/${rel}`;
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(path, rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n") + "\n");
  }
  return root;
}
