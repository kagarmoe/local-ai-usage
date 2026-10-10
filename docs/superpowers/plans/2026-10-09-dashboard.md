# Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a one-page usage dashboard at `ai-usage.kimberlygarmoe.com` that shows whether Claude Code and Codex token use is going down against the 2026-10-09 baseline.

**Architecture:** The daily swamp workflow gains two steps. `dashboard-data.render` turns the public summary into `data/weeks.jsonl` and `data/meta.json`. `dashboard-upload.put` uploads them to a public Vercel Blob store with `vercel blob put`, skipped when the hash is unchanged. A Vite + React site in `site/` (git-linked Vercel project) reads `/data/*` through a rewrite to the Blob host and draws the charts in the browser.

**Tech Stack:** Deno + zod 4 swamp extension models (existing pattern), Vercel CLI 63.1.0, Vite, React 19, TypeScript, Tailwind 4, shadcn/ui (`Card`, `Chart`, `Table`), Recharts.

**Spec:** `docs/superpowers/specs/2026-10-09-dashboard-design.md` (approved 2026-10-10). Read it first; it is the authority.

## Global Constraints

- Work in the worktree `~/repos/local-ai-usage/.claude/worktrees/dashboard` (branch `dashboard`). Run any swamp command that needs the vault or existing data from the **main checkout** `~/repos/local-ai-usage`. The worktree's `.swamp/` is empty. Never copy secrets between them.
- Load the `swamp` skill before swamp work. Confirm flags with `swamp help <command>` before running a command for the first time.
- Swamp `20261009.202715.0`. Integrations are extension models, never `command/shell`. Logic lives in `extensions/models/_lib/*.ts` pure functions with tests; the model file only wires it.
- Pin imports: `npm:zod@4`, `jsr:@std/assert@1.0.19`. Add no new Deno dependencies.
- Exact upload command: `vercel blob put <file> --pathname <pathname> --access public --allow-overwrite --cache-control-max-age 3600 --content-type <type>`. **Never pass `--add-random-suffix`**: it is an on/off flag, so `--add-random-suffix false` turns the suffix on.
- Tokens never go in argv, logs, or committed files. Never print a secret. The user's shell exports a `BLOB_READ_WRITE_TOKEN` for a **different, private** store (`e5xfkavtfuaspfmn`): every `vercel blob` call must get the pulled token explicitly.
- IDs: team `team_SMACO8iOr6wPIGx5as56P468`, project `prj_EgYL9x4XYklFy2fVnxD9jhQJmSDH` (`ai-usage`), store `store_RoFNqrEhQsDUqZ7m`, Blob host `https://rofnqrehqsduqz7m.public.blob.vercel-storage.com`.
- Site: exact versions in `site/package.json` (no `^` or `~`), `site/package-lock.json` committed, build `tsc -b && vite build`. `site/src/lib/shape.ts` has **no imports**.
- Chart rules: bars start at zero; no pie, donut, or 3D; each title states the finding; the 7 models with the most input (per tool) get a color and the rest are "other"; the heatmap uses one hue; units "K/M/B tokens"; incomplete weeks are not plotted; a `null` tool shows "no data", not zero.
- Accessibility (WCAG 2.2 AA): each chart has a one-sentence summary and a `<details>` data table; Recharts `accessibilityLayer`; legends name each series; the heatmap is an HTML `<table>` with header row and column; `<noscript>` line; error state "Could not load usage data".
- Out of scope (bead `localai-mdf`): cost charts, subagent model mix, context chart, Codex rate-limit chart, `?by=`, combined view, KPI sparklines, week list, Week and Day views.
- Every test runs in CI through `deno task test` (`.github/workflows/test.yml`). No new test framework.
- Git: never `git reset --hard`, never force-push, never push to or merge into `main`, never push tag `pre-public-history`. Pushing `dashboard`, running the weekly workflow by hand (it pushes `main` through `publish`), uploading, the project update, and the domain each need the user's OK. Commit trailers:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318`.

## Review Focus

1. **The pulled env file has no `BLOB_READ_WRITE_TOKEN`** (store disconnected, wrong link). `put` must throw before any upload; otherwise the CLI falls back to the shell's token and writes to the other, private store. Test: Task 2.
2. **A tool is missing from the latest complete week, or `baseline.codex` is `null`.** The KPI shows "no data" and no change, never `NaN`, `Infinity`, or an older week presented as current. Test: Task 4.
3. **Codex reasoning tokens are already inside `output`.** The stacked tokens bar must not count them twice. Test: Task 4.
4. **An event dated in a week that is not plotted** (today's only event, 2026-10-09, falls in the current incomplete week). It gets no marker, not a marker on the last plotted week. Test: Task 4.
5. **A raw `"other"` model key in the data** (the summary publishes non-plain model ids as `"other"`). It merges into the grouped "other" series, not a second series. Test: Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `extensions/models/_lib/dashboard_data.ts` | Pure: public summary → two data files + hash that ignores `generatedAt`. |
| `extensions/models/dashboard_data.ts` | Model `@kagarmoe/local-ai-usage/dashboard-data`, method `render`. |
| `extensions/models/_lib/blob_upload.ts` | `vercel env pull` + `vercel blob put` via `Deno.Command`. |
| `extensions/models/_lib/testdata/vercel` | Stub Vercel CLI for the upload tests. |
| `extensions/models/blob_upload.ts` | Model `@kagarmoe/local-ai-usage/blob-upload`, method `put`. |
| `models/@kagarmoe/local-ai-usage/dashboard-data/dashboard-data.yaml` | Definition `dashboard-data`. |
| `models/@kagarmoe/local-ai-usage/blob-upload/dashboard-upload.yaml` | Definition `dashboard-upload` (path is whatever `swamp model create` writes). |
| `workflows/workflow-local-ai-usage-weekly.yaml` | Adds job `dashboard` (`render`, `upload`). |
| `site/` | Vite app. `src/lib/shape.ts` (pure shaping), `src/components/{Section,KpiCards,Charts,Heatmap}.tsx`, `src/App.tsx`, `vercel.json`, `vite.config.ts`. |
| `deno.json` | Test task adds the stub to `--allow-run` and `site/src/lib/` to the paths. |
| `models/@swamp/vercel/projects/domains/dashboard-domain.yaml`, `workflows/workflow-dashboard-setup.yaml` | Domain definition and setup workflow. |

---

### Task 1: `dashboard-data` model

**Files:**
- Create: `extensions/models/_lib/dashboard_data.ts`
- Test: `extensions/models/_lib/dashboard_data_test.ts`
- Create: `extensions/models/dashboard_data.ts`
- Create: `models/@kagarmoe/local-ai-usage/dashboard-data/dashboard-data.yaml`

**Interfaces:**
- Consumes: the public summary (`buildSummary` in `_lib/summary.ts`): `{ schemaVersion: 1, generatedAt, costBasis, baseline, events, weeks }`, weeks newest first.
- Produces: `export type DataFile = { pathname: string; content: string }`; `export async function render(pub: any): Promise<{ hash: string; files: DataFile[] }>`; resource `data` on model `dashboard-data` with attributes `{ hash, files }`. Files are sorted by pathname: `data/meta.json`, then `data/weeks.jsonl`.

- [ ] **Step 1: Write the failing test**

`extensions/models/_lib/dashboard_data_test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/repos/local-ai-usage/.claude/worktrees/dashboard && deno task test`
Expected: FAIL, `Module not found ".../_lib/dashboard_data.ts"`.

- [ ] **Step 3: Write the implementation**

`extensions/models/_lib/dashboard_data.ts`:

```ts
// The dashboard's two data files, rendered from the public summary.
export type DataFile = { pathname: string; content: string };

export async function render(pub: any): Promise<{ hash: string; files: DataFile[] }> {
  if (pub?.schemaVersion !== 1) throw new Error(`unsupported summary schemaVersion: ${pub?.schemaVersion}`);
  const { schemaVersion, generatedAt, costBasis, baseline, events, weeks } = pub;
  const meta = { schemaVersion, generatedAt, costBasis, baseline, events };
  const files = [
    { pathname: "data/meta.json", content: JSON.stringify(meta) + "\n" },
    { pathname: "data/weeks.jsonl", content: (weeks as unknown[]).map((w) => JSON.stringify(w) + "\n").join("") },
  ];
  // generatedAt is the latest scan time and changes every run; hashing it would defeat the upload guard.
  const hashed = [{ ...files[0], content: JSON.stringify({ ...meta, generatedAt: null }) }, files[1]];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashed)));
  return { hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""), files };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno task test`
Expected: PASS, all tests (the existing suite plus 3 new).

- [ ] **Step 5: Write the model**

`extensions/models/dashboard_data.ts`:

```ts
import { z } from "npm:zod@4";
import type { Ctx } from "./_lib/scan.ts";
import { render } from "./_lib/dashboard_data.ts";

const File = z.object({ pathname: z.string(), content: z.string() });

export const model = {
  type: "@kagarmoe/local-ai-usage/dashboard-data",
  version: "2026.10.09.1",
  globalArguments: z.object({ public: z.unknown() }),
  resources: {
    data: {
      description: "The dashboard's data files (data/weeks.jsonl, data/meta.json) and their hash, generatedAt excluded",
      schema: z.object({ hash: z.string(), files: z.array(File) }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    render: {
      description: "Render the public summary into the dashboard's data files",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        // One write, after all fallible work: a failed render records nothing.
        const data = await render(ctx.globalArgs.public);
        ctx.logger.info("Rendered {files} files, hash {hash}", { files: data.files.length, hash: data.hash });
        return { dataHandles: [await ctx.writeResource("data", "data", data)] };
      },
    },
  },
};
```

- [ ] **Step 6: Create the definition**

Run `swamp help model create` and confirm the arguments. Then, from the worktree:

```bash
cd ~/repos/local-ai-usage/.claude/worktrees/dashboard
swamp model create @kagarmoe/local-ai-usage/dashboard-data dashboard-data
```

Edit the generated YAML so that `tags` and `globalArguments` read as follows. Keep its `id` and `typeVersion`:

```yaml
tags:
  project: local-ai-usage
  component: dashboard
globalArguments:
  public: '${{ data.latest("summary", "summary").attributes.public }}'
methods: {}
```

Expected: `swamp model get dashboard-data --json` shows type `@kagarmoe/local-ai-usage/dashboard-data`.

- [ ] **Step 7: Type-check, then commit**

Run: `deno task check && deno task test`
Expected: both pass.

```bash
git add extensions/models/_lib/dashboard_data.ts extensions/models/_lib/dashboard_data_test.ts extensions/models/dashboard_data.ts models/@kagarmoe/local-ai-usage/dashboard-data
git commit -m "feat: dashboard-data model renders the site's data files" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318"
```

---

### Task 2: `blob-upload` model

**Files:**
- Create: `extensions/models/_lib/testdata/vercel` (executable)
- Test: `extensions/models/_lib/blob_upload_test.ts`
- Create: `extensions/models/_lib/blob_upload.ts`
- Create: `extensions/models/blob_upload.ts`
- Create: the `dashboard-upload` definition YAML
- Modify: `deno.json` (`test` task)

**Interfaces:**
- Consumes: `DataFile` from `_lib/dashboard_data.ts`.
- Produces: `export function blobPut(repoDir: string, files: DataFile[], token: string, bin = "vercel"): void`, which throws on any failure. Resource `upload` on model `dashboard-upload` with attributes `{ hash, pathnames, uploadedAt }`. Method `put` arguments: `{ files: DataFile[], hash: string }`.

**Note on the stub (deviates from the spec's "stub on `PATH`"):** the stub is committed and passed as `bin`. Deno's `--allow-run` names allowed programs, so finding `vercel` on a temp `PATH` would need a plain `--allow-run` for the whole test suite. The behaviors tested are the spec's.

**Note on auth (spec Status, "not yet verified"):** `env pull` gets `VERCEL_TOKEN` in env and an empty `--global-config` directory. So the CLI login can't mask whether the env token works. Task 3's first real run is the check. If that run fails with an auth error, record a ruling: remove `--global-config` and `VERCEL_TOKEN` from `blobPut`, and remove the `token` argument from the model and definition. The run then uses the CLI login, since the LaunchAgent runs as the user. Never move the token into argv.

- [ ] **Step 1: Write the stub CLI**

`extensions/models/_lib/testdata/vercel`:

```sh
#!/bin/sh
# Stand-in for the Vercel CLI in blob_upload_test.ts. Logs each call to $STUB_LOG.
case "$1 $2" in
  "env pull")
    echo "pull: $3 | VERCEL_TOKEN=$VERCEL_TOKEN" >> "$STUB_LOG"
    if [ -n "$STUB_NO_TOKEN" ]; then echo 'VERCEL_OIDC_TOKEN="oidc"' > "$3"; else echo 'BLOB_READ_WRITE_TOKEN="vercel_blob_rw_stub"' > "$3"; fi ;;
  "blob put")
    echo "put: $* | BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN" >> "$STUB_LOG"
    if [ -n "$STUB_FAIL" ]; then echo "stub: upload refused" >&2; exit 1; fi ;;
  *) echo "unexpected: $*" >&2; exit 2 ;;
esac
```

Run: `chmod +x extensions/models/_lib/testdata/vercel`

- [ ] **Step 2: Allow the stub in the test task**

In `deno.json`, change the `test` task to:

```json
"test": "TZ=America/Los_Angeles deno test --allow-read --allow-write --allow-env --allow-run=git,extensions/models/_lib/testdata/vercel extensions/"
```

(Task 4 appends `site/src/lib/`.)

- [ ] **Step 3: Write the failing tests**

`extensions/models/_lib/blob_upload_test.ts`:

```ts
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
```

- [ ] **Step 4: Run them to verify they fail**

Run: `deno task test`
Expected: FAIL, `Module not found ".../_lib/blob_upload.ts"`.

- [ ] **Step 5: Write the implementation**

`extensions/models/_lib/blob_upload.ts`:

```ts
// Upload files to the Blob store connected to the linked Vercel project, with the Vercel CLI.
import type { DataFile } from "./dashboard_data.ts";

const TYPES: Record<string, string> = { json: "application/json", jsonl: "application/x-ndjson" };

export function blobPut(repoDir: string, files: DataFile[], token: string, bin = "vercel"): void {
  const tmp = Deno.makeTempDirSync({ prefix: "blob-upload-" });
  const run = (args: string[], cwd: string, env: Record<string, string>) => {
    const r = new Deno.Command(bin, { args, cwd, env }).outputSync();
    if (!r.success) throw new Error(`vercel ${args[0]} ${args[1]} failed: ${new TextDecoder().decode(r.stderr).trim()}`);
  };
  try {
    // An empty global config, so a CLI login can't stand in for the token.
    const pulled = `${tmp}/.env.pulled`, config = `${tmp}/config`;
    Deno.mkdirSync(config);
    run(["env", "pull", pulled, "--environment", "development", "--yes", "--global-config", config], repoDir, { VERCEL_TOKEN: token });
    const rw = Deno.readTextFileSync(pulled).match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?$/m)?.[1];
    Deno.removeSync(pulled);
    // Without it the CLI falls back to any BLOB_READ_WRITE_TOKEN in the parent env, which may be another store's.
    if (!rw) throw new Error("vercel env pull returned no BLOB_READ_WRITE_TOKEN; is the Blob store connected to the project?");
    for (const f of files) {
      const local = `${tmp}/${f.pathname.replaceAll("/", "_")}`;
      Deno.writeTextFileSync(local, f.content);
      // cwd is tmp, not the repo: a .env.local there with VERCEL_OIDC_TOKEN makes the CLI refuse to run.
      run(["blob", "put", local, "--pathname", f.pathname, "--access", "public", "--allow-overwrite",
        "--cache-control-max-age", "3600", "--content-type", TYPES[f.pathname.split(".").pop()!] ?? "text/plain"], tmp, { BLOB_READ_WRITE_TOKEN: rw });
    }
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `deno task test`
Expected: PASS, all tests. If Deno denies running the stub, the relative `--allow-run` entry did not resolve. Record a ruling and use the stub's absolute path in `deno.json`: a `$(pwd)` prefix does not work there, so widen the flag to plain `--allow-run`. Note the cost in the ruling.

- [ ] **Step 7: Write the model**

`extensions/models/blob_upload.ts`:

```ts
import { z } from "npm:zod@4";
import type { Ctx } from "./_lib/scan.ts";
import { blobPut } from "./_lib/blob_upload.ts";
import type { DataFile } from "./_lib/dashboard_data.ts";

const File = z.object({ pathname: z.string(), content: z.string() });

export const model = {
  type: "@kagarmoe/local-ai-usage/blob-upload",
  version: "2026.10.09.1",
  globalArguments: z.object({ token: z.string().meta({ sensitive: true }) }),
  resources: {
    upload: {
      description: "Hash and pathnames of the last successful upload",
      schema: z.object({ hash: z.string(), pathnames: z.array(z.string()), uploadedAt: z.string() }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    put: {
      description: "Upload files to the Blob store connected to the linked Vercel project",
      arguments: z.object({ files: z.array(File).min(1), hash: z.string() }),
      execute: async (args: { files: DataFile[]; hash: string }, ctx: Ctx) => {
        blobPut(ctx.repoDir, args.files, ctx.globalArgs.token);
        // Written only after every upload succeeded, so a failed run records no hash and the next run retries.
        const r = { hash: args.hash, pathnames: args.files.map((f) => f.pathname), uploadedAt: new Date().toISOString() };
        ctx.logger.info("Uploaded {pathnames}", r);
        return { dataHandles: [await ctx.writeResource("upload", "upload", r)] };
      },
    },
  },
};
```

- [ ] **Step 8: Create the definition**

```bash
swamp model create @kagarmoe/local-ai-usage/blob-upload dashboard-upload
```

Edit the generated YAML. Keep its `id` and `typeVersion`:

```yaml
tags:
  project: local-ai-usage
  component: dashboard
globalArguments:
  token: '${{ vault.get("secrets", "vercel-token") }}'
methods: {}
```

- [ ] **Step 9: Type-check, then commit**

Run: `deno task check && deno task test`
Expected: both pass. Then check that the stub's mode is staged as executable: `git add` the files, then run `git ls-files -s extensions/models/_lib/testdata/vercel`. Expected: mode `100755`.

```bash
git add deno.json extensions/models/_lib/testdata/vercel extensions/models/_lib/blob_upload.ts extensions/models/_lib/blob_upload_test.ts extensions/models/blob_upload.ts models/@kagarmoe/local-ai-usage
git commit -m "feat: blob-upload model puts files with vercel blob put" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318"
```

---

### Task 3: Weekly workflow steps and the first real upload

**Files:**
- Modify: `workflows/workflow-local-ai-usage-weekly.yaml` (append a job)

**Interfaces:**
- Consumes: definitions `dashboard-data` (resource `data`: `{hash, files}`) and `dashboard-upload` (resource `upload`: `{hash, ...}`; method `put(files, hash)`).
- Produces: live `data/meta.json` and `data/weeks.jsonl` at the Blob host. Task 5 reads them.

- [ ] **Step 1: Add the `dashboard` job**

Append to `jobs:` in `workflows/workflow-local-ai-usage-weekly.yaml`, after the `publish` job:

```yaml
  - name: dashboard
    dependsOn:
      - job: build
        condition:
          type: succeeded
    steps:
      - name: render
        task:
          type: model_method
          modelIdOrName: dashboard-data
          methodName: render
          inputs: {}
      - name: upload
        dependsOn:
          - step: render
            condition:
              type: succeeded
        # Skips unchanged data (the workflow runs at login and at 09:17); works before the first upload.
        guard: '${{ data.latest("dashboard-upload", "upload").?attributes.?hash.orValue("") == data.latest("dashboard-data", "data").attributes.hash }}'
        task:
          type: model_method
          modelIdOrName: dashboard-upload
          methodName: put
          inputs:
            files: '${{ data.latest("dashboard-data", "data").attributes.files }}'
            hash: '${{ data.latest("dashboard-data", "data").attributes.hash }}'
```

`publish` stays independent of this job.

- [ ] **Step 2: Commit**

```bash
git add workflows/workflow-local-ai-usage-weekly.yaml
git commit -m "feat: weekly workflow renders and uploads dashboard data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318"
```

- [ ] **Step 3: Put the branch's files into the main checkout, uncommitted**

The vault and data live only in the main checkout. Put the files there from the branch, in the working tree only, with no index change:

```bash
git -C ~/repos/local-ai-usage restore --source=dashboard --worktree -- \
  extensions/models/_lib/dashboard_data.ts extensions/models/dashboard_data.ts \
  extensions/models/_lib/blob_upload.ts extensions/models/blob_upload.ts \
  models/@kagarmoe/local-ai-usage/dashboard-data models/@kagarmoe/local-ai-usage/blob-upload \
  workflows/workflow-local-ai-usage-weekly.yaml
git -C ~/repos/local-ai-usage status --short
```

Use the `dashboard-upload` directory that Task 2 actually created. Expected status: the new files show as `??`, the workflow as ` M`, and nothing is staged. `publish` commits only `public/summary.json` and `prices.yaml`, so these copies never reach `main`. Task 6 removes them before the merge.

- [ ] **Step 4: Validate**

```bash
cd ~/repos/local-ai-usage && swamp workflow validate local-ai-usage-weekly
```

Expected: valid. If it rejects `guard` or a step-level `dependsOn`, read `references/workflow/guide.md` in the swamp skill for the exact key names. Fix it in the worktree, commit, and repeat Step 3.

- [ ] **Step 5: STOP: ask the user before running the workflow**

Tell the user that running `local-ai-usage-weekly` by hand also runs `publish`, which commits `public/summary.json` and pushes `main`, as the daily job does. It also uploads the two files to the public Blob store. Proceed only on an explicit yes. The other choice is to wait for the next login or 09:17 run, which picks up the uncommitted copies.

- [ ] **Step 6: First run**

```bash
cd ~/repos/local-ai-usage && swamp workflow run local-ai-usage-weekly
```

Expected: `render` and `upload` succeed. If `upload` fails with an auth error from `vercel env pull`, apply the auth ruling in Task 2's note, commit, and repeat Steps 3–6.

Then check the live files:

```bash
curl -s https://rofnqrehqsduqz7m.public.blob.vercel-storage.com/data/meta.json | jq .schemaVersion
curl -sI https://rofnqrehqsduqz7m.public.blob.vercel-storage.com/data/weeks.jsonl | grep -iE '^(content-type|cache-control)'
```

Expected: `1`; `content-type: application/x-ndjson`; `cache-control: public, max-age=3600`.

- [ ] **Step 7: Second run checks the guard**

Run the workflow again (still under the user's yes). Check the flags first with `swamp help workflow history get` and `swamp help data query`. Then compare the two `dashboard-data` `data` hashes (the latest two versions), and the second run's `upload` status.

Expected: if the hashes are equal, `upload` is `skipped`; if they differ (AI sessions wrote new log lines), `upload` succeeded. Record which case occurred in the ledger.

---

### Task 4: Site scaffold and `shape.ts`

**Files:**
- Create: `site/` (Vite react-ts template, Tailwind, shadcn `card chart table`)
- Create: `site/vercel.json`
- Modify: `site/vite.config.ts`, `site/tsconfig.json`, `site/tsconfig.app.json`, `site/src/index.css`, `site/index.html`
- Create: `site/src/lib/shape.ts`
- Test: `site/src/lib/shape_test.ts`
- Modify: `deno.json` (`test` task)

**Interfaces:**
- Consumes: the data file shapes from Task 1. A `weeks.jsonl` line is the summary's week object. `meta.json` is `{schemaVersion, generatedAt, costBasis, baseline, events}`.
- Produces (all from `site/src/lib/shape.ts`). Types: `Tokens`, `ToolWeek`, `Week`, `Tool = "claudeCode" | "codex"`, `Meta`, `Row = Record<string, string | number | null>`, `Kpi`. Values and functions:
  - `TOOL_NAMES`, `DAYS`
  - `parseWeeks(text): Week[]`
  - `inputPerDay(t): number`
  - `trendRows(weeks, tool): {week, inputPerDay: number | null}[]`
  - `eventMarkers(weeks, tool, events): {week, label}[]`
  - `tokenRows(weeks, tool): {series: {key, label}[], rows: Row[]}`
  - `modelMix(weeks, tool): {series: {key, label}[], rows: Row[]}` (keys `m0`…`m7`)
  - `cacheReadPct(weeks, tool): number | null`
  - `kpis(weeks, meta): Kpi[]` (order: CC input/day, CC peak context, Codex input/day, Codex peak context, Codex weekly rate-limit peak)
  - `heatmap(weeks): number[][]` (7 × 24, Monday first)
  - `changeText(pct): string | null`
  - `fmt(n): string`

- [ ] **Step 1: Scaffold**

```bash
cd ~/repos/local-ai-usage/.claude/worktrees/dashboard
npm create vite@latest site -- --template react-ts --no-interactive
cd site
printf 'save-exact=true\n' > .npmrc
npm install
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

If `create-vite` asks to install and start anyway, answer No. Delete the template's demo files: `rm -r src/App.css src/assets public/vite.svg`. Then remove their imports from `src/App.tsx` (Task 5 replaces it) and from `index.html`.

- [ ] **Step 2: Configure Vite, the path alias, and Tailwind**

`site/vite.config.ts`:

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // Local dev reads the live data, as the deployed site does through vercel.json's rewrite.
  server: { proxy: { "/data": { target: "https://rofnqrehqsduqz7m.public.blob.vercel-storage.com", changeOrigin: true } } },
});
```

In both `site/tsconfig.json` and `site/tsconfig.app.json`, add to `compilerOptions`: `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }`. If `tsc` rejects `baseUrl`, drop it and keep `paths`. In `tsconfig.app.json`, also add `"exclude": ["src/**/*_test.ts"]`. Deno runs those tests, and their `jsr:` import would fail `tsc`.

Replace `site/src/index.css` with `@import "tailwindcss";`. Shadcn init adds the rest.

- [ ] **Step 3: shadcn**

```bash
npx shadcn@4.21.4 init -d
npx shadcn@4.21.4 add card chart table -y
```

Expected: the command creates `src/components/ui/{card,chart,table}.tsx` and `src/lib/utils.ts`, installs `recharts`, and writes the theme into `src/index.css`.

- [ ] **Step 4: Theme: Okabe-Ito chart colors, dark mode from the OS**

In `site/src/index.css`:
- Replace the `@custom-variant dark (...)` line with `@custom-variant dark (@media (prefers-color-scheme: dark));`.
- Change the `.dark { ... }` block to `@media (prefers-color-scheme: dark) { :root { ... } }`, keeping its contents.
- In `:root`, replace the `--chart-*` lines with:

```css
  /* Okabe-Ito, ordered for contrast on white: blue, orange, green, vermillion, sky blue, purple, yellow, black. */
  --chart-1: #0072b2;
  --chart-2: #e69f00;
  --chart-3: #009e73;
  --chart-4: #d55e00;
  --chart-5: #56b4e9;
  --chart-6: #cc79a7;
  --chart-7: #f0e442;
  --chart-8: #000000;
```

- In the dark `:root`, use the same lines, except `--chart-8: #bbbbbb;` (Okabe-Ito black is invisible on a dark background).

Expected: `grep -n '\.dark' src/index.css` prints nothing.

- [ ] **Step 5: `index.html`, `vercel.json`, exact versions**

In `site/index.html`: set `<html lang="en">` and `<title>AI usage: Claude Code and Codex</title>`, and add `<noscript>This dashboard needs JavaScript.</noscript>` inside `<body>`.

`site/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/data/:path*", "destination": "https://rofnqrehqsduqz7m.public.blob.vercel-storage.com/data/:path*" }
  ]
}
```

No `ignoreCommand` here. Task 6 sets the project-level ignore command, which the spec's project Status note says replaces it.

Pin exact versions (the template wrote ranges):

```bash
node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync("package.json"));for(const k of["dependencies","devDependencies"])for(const d in p[k])p[k][d]=p[k][d].replace(/^[\^~]/,"");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
npm install
node -e 'const p=require("./package.json");const bad=Object.entries({...p.dependencies,...p.devDependencies}).filter(([,v])=>/^[\^~]/.test(v));console.log(bad.length?bad:"exact")'
```

Expected: `exact`.

- [ ] **Step 6: Write the failing shape tests**

`site/src/lib/shape_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { eventMarkers, heatmap, kpis, modelMix, parseWeeks, tokenRows, trendRows, type Meta, type ToolWeek, type Week } from "./shape.ts";

/** A complete tool week with 100 input tokens per day. */
const tool = (o: Partial<ToolWeek> = {}): ToolWeek => ({
  complete: true, tokens: { input: 0, cacheRead: 700, cacheWrite: 0, output: 10 }, perHour: [], context: { peak: 1000 }, models: {}, ...o,
});
const week = (w: string, start: string, o: Partial<Week> = {}): Week => ({ week: w, start, status: "complete", claudeCode: tool(), codex: null, ...o });
const meta = (codex: Meta["baseline"]["codex"] = null): Meta => ({
  schemaVersion: 1, generatedAt: "", costBasis: "", events: [],
  baseline: { label: "b", claudeCode: { inputPerDay: 200, peakContext: 2000 }, codex },
});

Deno.test("trends skip incomplete weeks and show a missing tool as null", () => {
  const text = [
    week("2026-W41", "2026-10-05", { status: "incomplete" }),
    week("2026-W40", "2026-09-28", { claudeCode: null }),
    week("2026-W39", "2026-09-21"),
  ].map((w) => JSON.stringify(w) + "\n").join("");
  assertEquals(trendRows(parseWeeks(text), "claudeCode"), [
    { week: "2026-W39", inputPerDay: 100 },
    { week: "2026-W40", inputPerDay: null },
  ]);
});

Deno.test("model mix keeps the 7 models with the most input and groups the rest, and any raw other, as other", () => {
  const models: ToolWeek["models"] = Object.fromEntries([..."abcdefghi"].map((m, i) => [m, { calls: 1, input: 100 - i, output: 0, costUSD: null }]));
  models.other = { calls: 1, input: 5, output: 0, costUSD: null };
  const mix = modelMix([week("2026-W40", "2026-09-28", { claudeCode: tool({ models }) })], "claudeCode");
  assertEquals(mix.series.map((s) => s.label), ["a", "b", "c", "d", "e", "f", "g", "other"]);
  assertEquals(mix.rows[0].m7, 93 + 92 + 5);
});

Deno.test("KPIs compare the latest complete week with the baseline", () => {
  const busy = tool({ tokens: { input: 0, cacheRead: 7000, cacheWrite: 0, output: 0 } });
  const [cc] = kpis([week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: busy }), week("2026-W40", "2026-09-28")], meta());
  assertEquals(cc, { tool: "Claude Code", label: "Input per day", unit: "tokens", week: "2026-W40", latest: 100, baseline: 200, changePct: -50 });
});

Deno.test("KPIs show no data when the tool is missing from the latest complete week or has no baseline", () => {
  const k = kpis([week("2026-W40", "2026-09-28", { claudeCode: null, codex: tool() }), week("2026-W39", "2026-09-21")], meta(null));
  assertEquals([k[0].latest, k[0].changePct], [null, null]); // not W39's value passed off as current
  assertEquals([k[2].latest, k[2].baseline, k[2].changePct], [100, null, null]);
  assertEquals(k[4].latest, null); // no rate limits recorded
});

Deno.test("Codex token rows take reasoning out of output so the stack adds up", () => {
  const codex = tool({ tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 50, reasoning: 20 } });
  const { series, rows } = tokenRows([week("2026-W40", "2026-09-28", { codex })], "codex");
  assertEquals(series.map((s) => s.key), ["input", "cacheRead", "cacheWrite", "output", "reasoning"]);
  assertEquals([rows[0].output, rows[0].reasoning], [30, 20]);
});

Deno.test("an event marks the plotted week that contains it, and nothing when its week is not plotted", () => {
  const weeks = [week("2026-W41", "2026-10-05", { status: "incomplete" }), week("2026-W40", "2026-09-28")];
  const events = [{ date: "2026-10-04", label: "in W40" }, { date: "2026-10-09", label: "in W41" }];
  assertEquals(eventMarkers(weeks, "claudeCode", events), [{ week: "2026-W40", label: "in W40" }]);
});

Deno.test("the heatmap puts ISO weekday 7 on Sunday, sums both tools, and skips incomplete weeks", () => {
  const ph = (dow: number, hour: number, input: number) => [{ dow, hour, input }];
  const grid = heatmap([
    week("2026-W41", "2026-10-05", { status: "incomplete", claudeCode: tool({ perHour: ph(1, 9, 50) }) }),
    week("2026-W40", "2026-09-28", { claudeCode: tool({ perHour: ph(7, 23, 5) }), codex: tool({ perHour: ph(7, 23, 2) }) }),
  ]);
  assertEquals([grid[6][23], grid[0][9]], [7, 0]);
});
```

In `deno.json`, append ` site/src/lib/` to the end of the `test` task.

- [ ] **Step 7: Run them to verify they fail**

Run: `cd ~/repos/local-ai-usage/.claude/worktrees/dashboard && deno task test`
Expected: FAIL, `Module not found ".../site/src/lib/shape.ts"`.

- [ ] **Step 8: Write `shape.ts`**

`site/src/lib/shape.ts`:

```ts
// Pure data shaping: weeks in, chart rows out. No imports, so Deno tests it directly.

export type Tokens = { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning?: number };
export type ModelStat = { calls: number; input: number; output: number; costUSD: number | null };
export type ToolWeek = {
  complete: boolean;
  tokens: Tokens;
  perHour: { dow: number; hour: number; input: number }[];
  context: { peak: number };
  models: Record<string, ModelStat>;
  rateLimits?: { fiveHourPeakPct: number | null; weeklyPeakPct: number | null };
};
export type Week = { week: string; start: string; status: string; claudeCode: ToolWeek | null; codex: ToolWeek | null };
export type Tool = "claudeCode" | "codex";
export type Meta = {
  schemaVersion: number;
  generatedAt: string;
  costBasis: string;
  baseline: {
    label: string;
    claudeCode: { inputPerDay: number; peakContext: number };
    codex: { inputPerDay: number; peakContext: number; weeklyRateLimitPeakPct: number } | null;
  };
  events: { date: string; label: string }[];
};
export type Row = Record<string, string | number | null>;
export type Series = { key: string; label: string }[];
export type Kpi = { tool: string; label: string; unit: "tokens" | "%"; week: string | null; latest: number | null; baseline: number | null; changePct: number | null };

export const TOOL_NAMES: Record<Tool, string> = { claudeCode: "Claude Code", codex: "Codex" };
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** weeks.jsonl text → weeks, newest first. Blank lines (the trailing newline) are skipped. */
export const parseWeeks = (text: string): Week[] => text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** Same formula as the baseline: all input, cache included, over 7 days. */
export const inputPerDay = (t: ToolWeek) => Math.round((t.tokens.input + t.tokens.cacheRead + t.tokens.cacheWrite) / 7);

/** A tool's plotted weeks, oldest first: from its first week with data, incomplete weeks dropped. `data: null` = no data. */
function plotted(weeks: Week[], tool: Tool) {
  const rows = [...weeks].reverse().filter((w) => w.status !== "incomplete").map((w) => ({ week: w.week, start: w.start, data: w[tool] }));
  const first = rows.findIndex((r) => r.data);
  return first < 0 ? [] : rows.slice(first);
}

export const trendRows = (weeks: Week[], tool: Tool) =>
  plotted(weeks, tool).map((r) => ({ week: r.week, inputPerDay: r.data ? inputPerDay(r.data) : null }));

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Events inside a plotted week become a marker on that week; others get none. */
export function eventMarkers(weeks: Week[], tool: Tool, events: Meta["events"]) {
  const rows = plotted(weeks, tool);
  return events.flatMap((e) => {
    const r = rows.find((r) => r.start <= e.date && e.date < addDays(r.start, 7));
    return r ? [{ week: r.week, label: e.label }] : [];
  });
}

/** Tokens by type per plotted week. Codex reasoning is part of output, so output here excludes it and the stack adds up. */
export function tokenRows(weeks: Week[], tool: Tool): { series: Series; rows: Row[] } {
  const series: Series = [
    { key: "input", label: "Input (uncached)" },
    { key: "cacheRead", label: "Cache read" },
    { key: "cacheWrite", label: "Cache write" },
    ...(tool === "codex"
      ? [{ key: "output", label: "Output (excl. reasoning)" }, { key: "reasoning", label: "Reasoning" }]
      : [{ key: "output", label: "Output" }]),
  ];
  const value = (t: Tokens, key: string) => (key === "output" ? t.output - (t.reasoning ?? 0) : t[key as keyof Tokens] ?? 0);
  return {
    series,
    rows: plotted(weeks, tool).map((r) => Object.fromEntries([["week", r.week], ...series.map((s) => [s.key, r.data ? value(r.data.tokens, s.key) : null])])),
  };
}

/** Input per plotted week by model: the tool's 7 models with the most input, the rest (and any raw "other") as "other". */
export function modelMix(weeks: Week[], tool: Tool): { series: Series; rows: Row[] } {
  const rows = plotted(weeks, tool), totals: Record<string, number> = {};
  for (const r of rows) for (const [m, s] of Object.entries(r.data?.models ?? {})) totals[m] = (totals[m] ?? 0) + s.input;
  const top = Object.keys(totals).filter((m) => m !== "other").sort((a, b) => totals[b] - totals[a]).slice(0, 7);
  const labels = Object.keys(totals).length > top.length ? [...top, "other"] : top;
  // Model ids contain dots, which Recharts reads as paths: key the series m0…m7.
  const series = labels.map((label, i) => ({ key: `m${i}`, label }));
  const keyOf = (m: string) => series[top.includes(m) ? top.indexOf(m) : labels.length - 1].key;
  return {
    series,
    rows: rows.map((r) => {
      const row: Row = { week: r.week };
      for (const s of series) row[s.key] = r.data ? 0 : null;
      for (const [m, s] of Object.entries(r.data?.models ?? {})) row[keyOf(m)] = (row[keyOf(m)] as number) + s.input;
      return row;
    }),
  };
}

/** Cache reads as a percent of input in the newest plotted week with data, or null. */
export function cacheReadPct(weeks: Week[], tool: Tool): number | null {
  const t = plotted(weeks, tool).filter((r) => r.data).at(-1)?.data?.tokens;
  const all = t ? t.input + t.cacheRead + t.cacheWrite : 0;
  return t && all ? Math.round((t.cacheRead / all) * 100) : null;
}

/** The five KPI cards: the latest complete week against the baseline. A tool missing that week shows no data. */
export function kpis(weeks: Week[], meta: Meta): Kpi[] {
  const w = weeks.find((w) => w.status !== "incomplete"), b = meta.baseline;
  const card = (tool: Tool, label: string, unit: Kpi["unit"], value: (t: ToolWeek) => number | null, baseline: number | null): Kpi => {
    const t = w?.[tool], latest = t ? value(t) : null;
    const changePct = latest === null || !baseline ? null : Math.round(((latest - baseline) / baseline) * 100);
    return { tool: TOOL_NAMES[tool], label, unit, week: w?.week ?? null, latest, baseline, changePct };
  };
  return [
    card("claudeCode", "Input per day", "tokens", inputPerDay, b.claudeCode.inputPerDay),
    card("claudeCode", "Peak context", "tokens", (t) => t.context.peak, b.claudeCode.peakContext),
    card("codex", "Input per day", "tokens", inputPerDay, b.codex?.inputPerDay ?? null),
    card("codex", "Peak context", "tokens", (t) => t.context.peak, b.codex?.peakContext ?? null),
    card("codex", "Weekly rate-limit peak", "%", (t) => t.rateLimits?.weeklyPeakPct ?? null, b.codex?.weeklyRateLimitPeakPct ?? null),
  ];
}

/** 7 × 24 input by weekday (ISO dow 1 = Monday, first row) and hour, summed over both tools and all complete weeks. */
export function heatmap(weeks: Week[]): number[][] {
  const grid = DAYS.map(() => Array<number>(24).fill(0));
  for (const w of weeks) {
    if (w.status === "incomplete") continue;
    for (const t of [w.claudeCode, w.codex]) for (const h of t?.perHour ?? []) grid[h.dow - 1][h.hour] += h.input;
  }
  return grid;
}

/** "down 40% from baseline", "up 12% from baseline", "level with baseline", or null. */
export const changeText = (pct: number | null) =>
  pct === null ? null : pct === 0 ? "level with baseline" : `${pct < 0 ? "down" : "up"} ${Math.abs(pct)}% from baseline`;

/** 192000000 → "192M". */
export const fmt = (n: number) =>
  n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `deno task test`
Expected: PASS, all tests (7 new).

- [ ] **Step 10: Build the site**

Run: `cd site && npm run build`
Expected: `tsc -b` and `vite build` succeed, and `dist/` is written. `src/App.tsx` may still be the stripped template.

- [ ] **Step 11: Commit**

Check that `site/node_modules` and `site/dist` are ignored (`git status --short site` lists neither).

```bash
cd ~/repos/local-ai-usage/.claude/worktrees/dashboard
git add deno.json site
git commit -m "feat: site scaffold and chart data shaping" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318"
```

---

### Task 5: Overview page

**Files:**
- Create: `site/src/components/Section.tsx`, `site/src/components/KpiCards.tsx`, `site/src/components/Charts.tsx`, `site/src/components/Heatmap.tsx`
- Modify: `site/src/App.tsx`

**Interfaces:**
- Consumes: everything Task 4's `shape.ts` produces, plus shadcn `@/components/ui/{card,chart,table}`.
- Produces: the deployed page. Nothing else consumes it.

Components only display rows from `shape.ts`. Shaping logic belongs in `shape.ts` with a test.

- [ ] **Step 1: `Section.tsx`**

```tsx
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A chart card: the finding as its title, a one-sentence summary, the chart, and the chart's data as a table. */
export function Section({ title, summary, columns, rows, children }: {
  title: string;
  summary: string;
  columns?: string[];
  rows?: (string | number)[][];
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>{title}</h2></CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {columns && rows && (
          <details>
            <summary className="cursor-pointer text-sm">Table</summary>
            <Table>
              <TableHeader>
                <TableRow>{columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r[0]}>{r.map((v, j) => <TableCell key={j}>{v}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: `KpiCards.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeText, fmt, type Kpi } from "@/lib/shape";

const show = (k: Kpi, v: number | null) => (v === null ? "no data" : k.unit === "%" ? `${v}%` : `${fmt(v)} tokens`);

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((k) => (
        <Card key={k.tool + k.label}>
          <CardHeader>
            <CardDescription>{k.tool} · {k.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{show(k, k.latest)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{k.week ?? "No complete week"} · baseline {show(k, k.baseline)}</p>
            {k.changePct !== null && <p className="font-medium text-foreground">{changeText(k.changePct)}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `Charts.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Section } from "@/components/Section";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cacheReadPct, changeText, eventMarkers, fmt, modelMix, tokenRows, TOOL_NAMES, trendRows, type Kpi, type Meta, type Series, type Tool, type Week } from "@/lib/shape";

type Props = { weeks: Week[]; tool: Tool };
const cell = (v: string | number | null | undefined) => (v == null ? "no data" : typeof v === "number" ? `${fmt(v)} tokens` : v);
const span = (rows: { week: unknown }[]) =>
  rows.length ? `${rows.length} complete weeks, ${rows[0].week} to ${rows[rows.length - 1].week}` : "no complete weeks yet";
const colors = (series: Series): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.label === "other" ? "var(--chart-8)" : `var(--chart-${i + 1})` }]));

export function Trend({ weeks, tool, meta, kpi }: Props & { meta: Meta; kpi: Kpi }) {
  const rows = trendRows(weeks, tool), name = TOOL_NAMES[tool], change = changeText(kpi.changePct);
  const config: ChartConfig = { inputPerDay: { label: "Input per day", color: "var(--chart-1)" } };
  return (
    <Section
      title={change ? `${name} input per day ${change}` : `${name} input per day`}
      summary={`Line chart of ${name} input tokens per day for ${span(rows)}. ${kpi.baseline === null ? "There is no baseline for this tool." : `The dashed line is the baseline, ${fmt(kpi.baseline)} tokens.`}`}
      columns={["Week", "Input per day"]}
      rows={rows.map((r) => [r.week, cell(r.inputPerDay)])}
    >
      <ChartContainer config={config} className="h-64 w-full">
        <LineChart data={rows} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="week" tickLine={false} />
          <YAxis width={48} tickFormatter={fmt} domain={[0, (max: number) => Math.max(max, kpi.baseline ?? 0)]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="inputPerDay" stroke="var(--color-inputPerDay)" strokeWidth={2} />
          {kpi.baseline !== null && (
            <ReferenceLine y={kpi.baseline} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ value: "Baseline", position: "insideTopRight" }} />
          )}
          {eventMarkers(weeks, tool, meta.events).map((e) => (
            <ReferenceLine key={e.week + e.label} x={e.week} stroke="var(--foreground)" label={{ value: e.label, position: "insideTopLeft" }} />
          ))}
        </LineChart>
      </ChartContainer>
    </Section>
  );
}

function Stacked({ rows, series, stack }: { rows: Record<string, unknown>[]; series: Series; stack: string }) {
  const config = colors(series);
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={rows} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} />
        <YAxis width={48} tickFormatter={fmt} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => <Bar key={s.key} dataKey={s.key} stackId={stack} fill={`var(--color-${s.key})`} />)}
      </BarChart>
    </ChartContainer>
  );
}

export function TokensChart({ weeks, tool }: Props) {
  const { series, rows } = tokenRows(weeks, tool), name = TOOL_NAMES[tool], pct = cacheReadPct(weeks, tool);
  return (
    <Section
      title={pct === null ? `${name} tokens by type` : `${pct}% of ${name} input is cache reads`}
      summary={`Stacked bar chart of ${name} tokens per week by type for ${span(rows)}.`}
      columns={["Week", ...series.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...series.map((s) => cell(r[s.key]))])}
    >
      <Stacked rows={rows} series={series} stack="tokens" />
    </Section>
  );
}

export function ModelMix({ weeks, tool }: Props) {
  const { series, rows } = modelMix(weeks, tool), name = TOOL_NAMES[tool];
  return (
    <Section
      title={series.length ? `${series[0].label} has the most ${name} input` : `${name} input by model`}
      summary={`Stacked bar chart of ${name} input tokens per week by model for ${span(rows)}. Models outside the top 7 are grouped as other.`}
      columns={["Week", ...series.map((s) => s.label)]}
      rows={rows.map((r) => [String(r.week), ...series.map((s) => cell(r[s.key]))])}
    >
      <Stacked rows={rows} series={series} stack="models" />
    </Section>
  );
}
```

- [ ] **Step 4: `Heatmap.tsx`**

```tsx
import { Section } from "@/components/Section";
import { DAYS, fmt, heatmap, type Week } from "@/lib/shape";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/** 7 × 24 HTML table: one hue at increasing strength, and each cell prints its value. */
export function Heatmap({ weeks }: { weeks: Week[] }) {
  const grid = heatmap(weeks), max = Math.max(...grid.flat());
  const peak = grid.flatMap((r, d) => r.map((v, h) => ({ v, d, h }))).reduce((a, b) => (b.v > a.v ? b : a));
  return (
    <Section
      title={max ? `Busiest hour: ${DAYS[peak.d]} ${HOURS[peak.h]}:00` : "Input by weekday and hour"}
      summary="Input tokens by weekday and hour (Pacific time), summed over all complete weeks of Claude Code and Codex. Stronger color means more input."
    >
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px] tabular-nums">
          <caption className="sr-only">Input tokens by weekday and hour</caption>
          <thead>
            <tr>
              <td />
              {HOURS.map((h) => <th key={h} scope="col" className="font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={DAYS[d]}>
                <th scope="row" className="pr-1 text-left font-normal">{DAYS[d]}</th>
                {row.map((v, h) => {
                  const pct = max ? Math.round((v / max) * 100) : 0;
                  return (
                    <td key={h} className="h-7 min-w-8 px-0.5 text-center"
                      style={{ background: `color-mix(in oklch, var(--chart-1) ${pct}%, transparent)`, color: pct > 50 ? "white" : undefined }}>
                      {v ? fmt(v) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: `App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ModelMix, TokensChart, Trend } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { KpiCards } from "@/components/KpiCards";
import { kpis, parseWeeks, type Meta, type Tool, type Week } from "@/lib/shape";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; meta: Meta; weeks: Week[] };
const TOOLS: Tool[] = ["claudeCode", "codex"];

export default function App() {
  const [s, setS] = useState<State>({ status: "loading" });
  useEffect(() => {
    const get = (p: string) => fetch(p).then((r) => {
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.text();
    });
    Promise.all([get("/data/meta.json"), get("/data/weeks.jsonl")])
      .then(([m, w]) => setS({ status: "ok", meta: JSON.parse(m), weeks: parseWeeks(w) }))
      .catch(() => setS({ status: "error" }));
  }, []);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">AI usage: Claude Code and Codex</h1>
        {s.status === "ok" && (
          <p className="text-sm text-muted-foreground">
            Token use per week against the baseline ({s.meta.baseline.label}). Data as of {new Date(s.meta.generatedAt).toLocaleString()}.
          </p>
        )}
      </header>
      {s.status === "loading" && <p role="status">Loading usage data…</p>}
      {s.status === "error" && <p role="alert">Could not load usage data.</p>}
      {s.status === "ok" && <Overview meta={s.meta} weeks={s.weeks} />}
    </main>
  );
}

function Overview({ meta, weeks }: { meta: Meta; weeks: Week[] }) {
  const k = kpis(weeks, meta);
  return (
    <>
      <KpiCards items={k} />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* k[0] and k[2] are the two tools' input-per-day cards. */}
        {TOOLS.map((t, i) => <Trend key={t} weeks={weeks} meta={meta} tool={t} kpi={k[i * 2]} />)}
        {TOOLS.map((t) => <TokensChart key={t} weeks={weeks} tool={t} />)}
        {TOOLS.map((t) => <ModelMix key={t} weeks={weeks} tool={t} />)}
      </div>
      <Heatmap weeks={weeks} />
    </>
  );
}
```

- [ ] **Step 6: Build**

Run: `cd site && npm run build`
Expected: success, no type errors.

- [ ] **Step 7: Check in a browser (one-time, not CI)**

Task 3 put live data at the Blob host. Run `npm run dev`, then use the Playwright MCP tools:
1. Open `http://localhost:5173`. Expected: five KPI cards, two trend panels, two token charts, two model-mix charts and the heatmap. No console errors.
2. Expand one `Table` summary. Expected: rows with "no data" where a tool is `null`.
3. Take screenshots at a desktop viewport, light and then dark (`browser_emulate_media` colorScheme `dark`). Save them to `$CLAUDE_JOB_DIR/tmp`, not the repo.
4. Block `/data/weeks.jsonl` (or stop the proxy target with a wrong path) and reload. Expected: "Could not load usage data."

Fix anything wrong in the component that shows it. If the fix is shaping logic, it goes in `shape.ts`, with a test first.

- [ ] **Step 8: Commit**

```bash
cd ~/repos/local-ai-usage/.claude/worktrees/dashboard
deno task test
git add site
git commit -m "feat: dashboard overview page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318"
```

---

### Task 6: Setup workflow, project update, domain, and merge prep

**Files:**
- Create: `models/@swamp/vercel/projects/domains/dashboard-domain.yaml` (via `swamp model create`)
- Create: `workflows/workflow-dashboard-setup.yaml` (via `swamp workflow create`)
- Modify: `models/@swamp/vercel/projects/projects/dashboard-project.yaml`
- Modify: `docs/superpowers/handoffs/2026-10-09-dashboard-handoff.md`

**Interfaces:**
- Consumes: data `dashboard-project`/`ai-usage` (`attributes.id`), `dashboard-blob`/`ai-usage` (`attributes.id`). The domains extension names its data after `name`, so the domain's data is `dashboard-domain`/`ai-usage.kimberlygarmoe.com`.
- Produces: the live site at `https://ai-usage.kimberlygarmoe.com` after the user merges.

Steps 4–7 each need the user's OK. Ask for each one separately, at the time.

- [ ] **Step 1: Domain definition**

From the worktree, run `swamp model create @swamp/vercel/projects/domains dashboard-domain`. If the type is not found there, run the command from the main checkout and move the file into the worktree, as was done for `dashboard-blob`. Set:

```yaml
tags:
  project: local-ai-usage
  component: dashboard
globalArguments:
  teamId: team_SMACO8iOr6wPIGx5as56P468
  idOrName: '${{ data.latest("dashboard-project", "ai-usage").attributes.id }}'
  name: ai-usage.kimberlygarmoe.com
  token: '${{ vault.get("secrets", "vercel-token") }}'
methods: {}
```

- [ ] **Step 2: `dashboard-setup` workflow**

Run `swamp workflow create dashboard-setup` in the worktree. Keep the generated `id`, and set `jobs` to:

```yaml
jobs:
  - name: setup
    steps:
      - name: project
        guard: '${{ data.latest("dashboard-project", "ai-usage").?attributes.?id.orValue("") != "" }}'
        task:
          type: model_method
          modelIdOrName: dashboard-project
          methodName: create
          inputs: {}
      # A guarded skip cascades to plain succeeded/completed dependents, so these accept skipped too.
      - name: blob
        dependsOn:
          - step: project
            condition:
              type: or
              conditions: [{ type: succeeded }, { type: skipped }]
        guard: '${{ data.latest("dashboard-blob", "ai-usage").?attributes.?id.orValue("") != "" }}'
        task:
          type: model_method
          modelIdOrName: dashboard-blob
          methodName: create
          inputs: {}
      - name: domain
        dependsOn:
          - step: project
            condition:
              type: or
              conditions: [{ type: succeeded }, { type: skipped }]
        guard: '${{ data.latest("dashboard-domain", "ai-usage.kimberlygarmoe.com").?attributes.?name.orValue("") != "" }}'
        task:
          type: model_method
          modelIdOrName: dashboard-domain
          methodName: create
          inputs: {}
```

Commit both files. Then copy them to the main checkout, as in Task 3, Step 3:
`git -C ~/repos/local-ai-usage restore --source=dashboard --worktree -- models/@swamp/vercel/projects/domains workflows/workflow-dashboard-setup.yaml`.
Run `swamp workflow validate dashboard-setup` there. Expected: valid.

- [ ] **Step 3: Phase-2 project settings**

In `dashboard-project.yaml`, delete the two phase-1 comment lines and set:

```yaml
  rootDirectory: site
  commandForIgnoringBuildStep: git diff --quiet HEAD^ HEAD -- .
```

Commit it, then copy it to the main checkout with the same `restore` command.

- [ ] **Step 4: STOP: user OK, then update the project**

Tell the user what happens: with `rootDirectory: site` set, production builds of `main` fail ("root directory not found") until the merge lands. Daily data pushes in that window send Vercel failure emails, and there is no production deployment yet to break. On a yes, from the main checkout:

```bash
swamp model method run dashboard-project update
```

Expected: success. `swamp data query 'modelName == "dashboard-project" && name == "ai-usage"' --select content --json` shows `rootDirectory: "site"`.

- [ ] **Step 5: STOP: user OK, then push `dashboard`**

On a yes: `git push -u origin dashboard`. Vercel builds a preview. Expected: the preview build succeeds. Check it under the project's deployments, or with `swamp model type search deployments` and its `get`/`sync` method. Previews may sit behind Vercel login; the user views the preview.

- [ ] **Step 6: STOP: user OK, then attach the domain**

On a yes, from the main checkout: `swamp workflow run dashboard-setup`. Expected: `project` and `blob` are skipped (their data exists); `domain` succeeds. Run it a second time: all three are skipped.

- [ ] **Step 7: Merge prep (the user merges)**

The user merges `dashboard` into `main`. Before that, clear the main checkout's uncommitted copies, which would otherwise block the merge or pull. Preview the removal first:

```bash
cd ~/repos/local-ai-usage
git status --short
git clean -n -- extensions/models models workflows
```

Expected: the dry run lists only the copies from Tasks 3 and 6 plus `models/@swamp/`. Then:

```bash
git clean -f -- extensions/models models workflows
git checkout -- extensions/models/upstream_extensions.json workflows/workflow-local-ai-usage-weekly.yaml
git status --short
```

Expected: clean, apart from `.swamp`, which is ignored.

Give the user these commands to run after the merge:
- `git -C ~/repos/local-ai-usage pull --ff-only`. The daily `publish` pushes `main`, so the checkout must include the merge first.
- Remove the `vercel link` lines from `~/repos/local-ai-usage/.git/info/exclude`, since `.gitignore` covers them.

- [ ] **Step 8: After the merge: check the live site (one-time)**

Expected: the production build succeeds. Then take Playwright screenshots of `https://ai-usage.kimberlygarmoe.com`, light and dark, at a desktop viewport, saved to `$CLAUDE_JOB_DIR/tmp`. Check that the next 09:17 data push shows "Canceled by Ignored Build Step", or no deployment.

- [ ] **Step 9: Update the handoff**

Rewrite `docs/superpowers/handoffs/2026-10-09-dashboard-handoff.md`:
- **Done:** what shipped.
- **Next:** bead `localai-mdf` (the full dashboard), bead `localai-jao` (swamp serve), and the pending beads↔GitHub sync offer.
- **Gotchas:** keep the ones that still apply.

Commit it.
