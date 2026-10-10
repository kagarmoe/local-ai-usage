# Handoff — local-ai-usage dashboard (sub-project 2), updated 2026-10-10

Spec: `docs/superpowers/specs/2026-10-09-dashboard-design.md` (branch `dashboard`, worktree
`.claude/worktrees/dashboard`). Read it first; its Status notes record what has run.
Swamp notes: `~/obsidian/Resources/swamp/` (`swamp.md` index, `swamp-practice.md`,
`swamp-currency.md`). Load the `swamp` skill before any swamp work.

## Done

- Spec rewritten for the Blob design: render data → upload with `vercel blob put` → git-linked
  Vite site reads `/data/*` through a rewrite. All commits are on `dashboard`; nothing pushed.
- Vercel project `ai-usage` = `prj_EgYL9x4XYklFy2fVnxD9jhQJmSDH`, created by `dashboard-project`.
  It is git-linked to `kagarmoe/local-ai-usage` (production branch `main`), uses Vite on Node
  24.x, and has no deployments yet. Phase 1 config: no `rootDirectory`, and an ignore command
  `git diff --quiet HEAD^ HEAD -- site`.
- Vercel Blob store `ai-usage` = `store_RoFNqrEhQsDUqZ7m` (public, `iad1`), host
  `rofnqrehqsduqz7m.public.blob.vercel-storage.com`. Created by `dashboard-blob` with
  `projectId` (CEL from `dashboard-project`), so it is connected to the project in all three
  environments. The first store (`store_blBRxMbrxzEnI88l`) was deleted, empty, with the user's OK.
- The main checkout is `vercel link`ed to `ai-usage`. `.vercel/` and `.env*` are ignored there
  through `.git/info/exclude`, and through `.gitignore` on `dashboard`.
- No Blob token in the vault. `blob-upload` will get the store's read-write token from
  `vercel env pull` on each run (see spec).
- Spike done (spec Status 2026-10-10). Key finding: `--add-random-suffix` and
  `--allow-overwrite` are on/off flags, so `--add-random-suffix false` turns the suffix **on**.
  Omit it.
- Vault `secrets` (main checkout): `vercel-token` works.
- The audit hook is enabled in local-ai-usage (`.claude/settings.local.json`, gitignored).
- `rollbackOnFailure` works only on the TypeScript method; the definition-YAML form is ignored.
  This is recorded in `swamp-currency.md`. No Lab issue is filed.

## Blocked on the user

1. **Plan review.** The spec is approved (2026-10-10). The plan is
   `docs/superpowers/plans/2026-10-09-dashboard.md`. The user reviews it and picks an execution
   method (subagent-driven or native).

## Next (in order)

1. Execute the plan: build `dashboard-data`, `blob-upload`, `site/`
   and the workflow steps, test-first with `deno task test`. The `blob-upload` task first checks
   that `vercel env pull` authenticates from env `VERCEL_TOKEN` (spec Status).
2. When `site/` lands: set `dashboard-project` `rootDirectory: site` and
   `commandForIgnoringBuildStep: [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .`, then run
   `swamp model method run dashboard-project update`.
3. Domain: add a `dashboard-domain` (`@swamp/vercel/projects/domains`, project ID via CEL,
   `ai-usage.kimberlygarmoe.com`). This needs the user's OK. DNS is already on Vercel
   nameservers.
4. Write the `dashboard-setup` workflow (project, then blob, then domain), with guards. The blob
   step now needs the project's data, so it depends on the project step with
   `or(succeeded, skipped)`, as the domain step does.

## Gotchas

- **Run swamp from the main checkout** (`~/repos/local-ai-usage`). The worktree has its own
  empty `.swamp/`, so its vault has no tokens. Do not copy secrets.
- The main checkout holds **identical uncommitted copies** of
  `extensions/models/upstream_extensions.json` and `models/@swamp/vercel/{blob-storage,projects}/`.
  These are committed on `dashboard`. Right before merging, discard them:
  `git checkout -- extensions/models/upstream_extensions.json && rm -r models/@swamp`. Also
  remove the `vercel link` lines from `.git/info/exclude` once `.gitignore` covers them.
- **Your shell exports a `BLOB_READ_WRITE_TOKEN` for a different, private store**
  (`e5xfkavtfuaspfmn`). Any `vercel blob` command run by hand in this repo must override or
  unset it, or it will act on that store.
- `vercel blob` refuses to run from the repo root while `.env.local` holds `VERCEL_OIDC_TOKEN`
  (written by `vercel link`) without `BLOB_STORE_ID`. Run uploads from a temp directory.
- Never push to or merge into `main` yourself; the daily job pushes `main`. Never push tag
  `pre-public-history`. Pushing `dashboard`, deploys, and the domain all need the user's OK.
- `@swamp/vercel/projects` warns that `creator.via` is null and doesn't match its schema.
  This is harmless.
- The `generatedAt` in `meta.json` changes every run, so the upload hash leaves it out
  (see spec).
- The next 09:17 data push is the first real test of the ignore command. Check the project's
  deployments; expect "Canceled by Ignored Build Step" or none.
- Open beads: `localai-mdf` (full dashboard after v1), `localai-jao` (swamp serve via Tailscale).
  The beads↔GitHub sync offer is still pending.
