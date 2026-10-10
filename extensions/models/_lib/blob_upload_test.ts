import { assertEquals, assertFalse, assertStringIncludes, assertThrows } from "jsr:@std/assert@1.0.19";
import { blobPut } from "./blob_upload.ts";

const STUB = new URL("./testdata/vercel", import.meta.url).pathname;
const files = [
  { pathname: "data/meta.json", content: "{}\n" },
  { pathname: "data/weeks.jsonl", content: "{}\n" },
];

/** Run fn with the stub's env set; return the stub's log lines. */
function withStub(env: Record<string, string>, fn: () => void): string[] {
  const vars = { STUB_LOG: Deno.makeTempFileSync(), ...env };
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) Deno.env.delete(k);
  }
  return Deno.readTextFileSync(vars.STUB_LOG).trim().split("\n");
}

Deno.test("puts each file with the pulled token in env, never argv, then deletes the pulled file", () => {
  const lines = withStub({}, () => blobPut(Deno.cwd(), files, "vercel_tok", STUB));
  assertStringIncludes(lines[0], "VERCEL_TOKEN=vercel_tok");
  const puts = lines.filter((l) => l.startsWith("put:"));
  assertEquals(puts.length, 2);
  for (const p of puts) {
    const argv = p.split(" | ")[0];
    assertStringIncludes(p, "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_stub");
    assertFalse(argv.includes("vercel_blob_rw_stub"));
    assertFalse(argv.includes("--add-random-suffix")); // regression: the flag is on/off, so "false" turns it on
  }
  assertStringIncludes(puts[1], "--pathname data/weeks.jsonl --access public --allow-overwrite --cache-control-max-age 3600 --content-type application/x-ndjson");
  assertThrows(() => Deno.statSync(lines[0].split(" ")[1]), Deno.errors.NotFound);
});

Deno.test("a failed put throws with the CLI's stderr", () => {
  withStub({ STUB_FAIL: "1" }, () => assertThrows(() => blobPut(Deno.cwd(), files, "t", STUB), Error, "upload refused"));
});

Deno.test("no BLOB_READ_WRITE_TOKEN in the pulled env throws before any upload", () => {
  // Otherwise the CLI would fall back to a BLOB_READ_WRITE_TOKEN in the parent env, which may be another store's.
  const lines = withStub({ STUB_NO_TOKEN: "1" }, () => assertThrows(() => blobPut(Deno.cwd(), files, "t", STUB), Error, "BLOB_READ_WRITE_TOKEN"));
  assertEquals(lines.filter((l) => l.startsWith("put:")), []);
});
