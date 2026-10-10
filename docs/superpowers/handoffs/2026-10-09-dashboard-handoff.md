# Handoff — local-ai-usage dashboard (sub-project 2), updated 2026-10-10 (full chart set built)

Read first:
- the spec, `docs/superpowers/specs/2026-10-09-dashboard-design.md`;
- the plan, `docs/superpowers/plans/2026-10-09-dashboard.md`.

Both are on branch `dashboard`, in worktree `.claude/worktrees/dashboard`.

SDD ledger (git-ignored, keep it until merge): `.superpowers/sdd/2026-10-09-dashboard/progress.md`. Its
`Ruling:` and `minor (deferred)` lines are the decision record.

## State

- **Full chart set built (bead `localai-mdf`, 2026-10-10).**
  - Spec: `docs/superpowers/specs/2026-10-10-dashboard-full-design.md`.
  - Plan: `docs/superpowers/plans/2026-10-10-dashboard-full.md`.
  - Ledger: `.superpowers/sdd/2026-10-10-dashboard-full/progress.md`.
  - Every deferred chart plus the Week and Day views is built. The work went through task reviews, the
    opus whole-branch review (0 Critical, 2 Important, both fixed) and a fix pass.
  - Commits: b916419, 6e136e5, 0c59593. Head is the handoff commit after them. **Nothing pushed.**
  - Checks: `deno task test` → 56 passed; `npm run build` → OK.
  - Headless Chromium on real data: overview, `?week=2026-W40` and a day view, light and dark, 0 console
    errors. Bar clicks and week links open the clicked week or day.
    Shots: `~/.claude/jobs/1c5e0728/tmp/shots/`.
  - Deferred minors from the final review:
    - The rate-limit title garbles when one window is null.
    - An unpriced model drops from the cost mix without a note.
    - `span` overstates sparse Codex coverage.
    - `document.title` doesn't change per view.
- **v1 (before the full chart set):** all six plan tasks are built, reviewed per task, and have been
  through the opus whole-branch review and its fix pass (head was 807bacc).
- **v1 checks passing in the worktree:**
  - `PATH=$HOME/.swamp/deno:$PATH deno task test` → 44 passed (56 after the full chart set).
  - `cd site && npm run build` → OK (a 597 kB chunk warning).
  - `swamp model validate` passes for all four models.
  - `swamp workflow validate` passes for `local-ai-usage-weekly` (28) and `dashboard-setup` (13).
- **Not yet counted.** The user's rule is: "It only counts when swamp runs it." Tasks 1–3
  (render, put, the weekly job) have not run on real data, so they are not done. Unit tests and
  `validate` don't count.

## Next: the user-gate steps

Ask about each step separately, one question at a time, and wait for an explicit OK on each.

1. **Copy, then run the weekly workflow.**
   - Copy the branch into the main checkout:
     `git -C ~/repos/local-ai-usage restore --source=dashboard --worktree -- <paths>`.
     The paths are the extension models (`dashboard_data`, `blob_upload`), their definitions, the
     weekly workflow, `models/@swamp/vercel/projects/domains/dashboard-domain.yaml`, and
     `workflows/workflow-dashboard-setup.yaml`.
   - The safety classifier blocked this copy once. Don't work around it; it needs the user's yes.
   - Then run `swamp workflow run local-ai-usage-weekly` there. This pushes `main` (normal
     daily behaviour) and makes the **first public Blob upload**. From then on, the LaunchAgent's
     login and 09:17 runs also upload.
   - Verify:
     - `render` wrote `dashboard-data` with a `hash` attribute.
     - `put` ran and recorded the same hash.
     - A **second run skips** the upload (the guard).
     - `weeks.jsonl` matches the same run's summary, which proves inputs resolve at step time
       and not at run start.
     - No BigInt `schemaVersion` error from CEL object typing.
2. **Browser check** (plan Task 5 Step 7): load the site against the uploaded data (Vite dev
   server with the rewrite, or a preview). Look for overlapping event-marker labels.
3. **Update the project.** Run `swamp model method run dashboard-project update` from the main
   checkout, before any push. It applies `rootDirectory: site` and the new ignore command. Builds of
   `main` fail until the merge; that's accepted.
4. **Push and preview.** Run `git push -u origin dashboard`, then check that the preview deploy builds.
5. **Domain.** Run `swamp workflow run dashboard-setup`. Expect project and blob **skipped** and domain
   **succeeded**. A second run skips all three steps.
6. **Merge prep** (plan Task 6 Steps 7–9):
   - Discard the main-checkout copies.
   - Give the user the merge commands. The user merges; never merge into `main` yourself.
   - Check the live site at ai-usage.kimberlygarmoe.com.
   - Rewrite this handoff.
7. Then delete the SDD workspace and use `superpowers:finishing-a-development-branch`.

The same-run guard finding below is recorded in `~/obsidian/Resources/swamp/swamp-currency.md`
("Skill vs manual").

## Swamp: verified facts (don't relearn)

- **Load the `swamp` skill** before swamp work. Run `swamp help <cmd>` to check flags.
- **Run swamp from the main checkout** (`~/repos/local-ai-usage`). The worktree's `.swamp/` is
  empty, so it has no vault tokens. Don't copy secrets into it. The worktree is fine for
  `swamp model validate` and `swamp workflow validate`.
- **Deno:** not on PATH. Use swamp's bundled 2.9.7: `PATH=$HOME/.swamp/deno:$PATH deno ...`.
  `deno task test` covers `extensions/` and `site/src/lib/`.
- **Same-run CEL reads work.** A guard or input such as
  `data.latest("m","d").attributes.x` (not null-safe) resolves **at step time** and sees data
  written earlier in the same run.
  - Proven with a real run in scratch repo `~/.claude/jobs/1c5e0728/tmp/scratch-repo`
    (swamp 20261009.202715.0, workflow `samerun-wf`).
  - The swamp skill's `references/workflow/reference.md:1175` says otherwise. **The binary wins.**
  - The upload guard handles the never-uploaded case with null-safe access:
    `data.latest("dashboard-upload","upload").?attributes.?hash.orValue("") == data.latest("dashboard-data","data").attributes.hash`.
  - The opus reviewer predicted the first run would fail. The scratch run refuted that. If it fails
    anyway, the fix is `.?` and `orValue` on the inputs too.
- **`rollbackOnFailure`** works only on the TypeScript method; the YAML definition form is ignored.
  This is already in `swamp-currency.md`.
- **`dashboard-setup` workflow:** steps run project, then blob, then domain. Each step is guarded;
  later steps depend on earlier ones with `or(succeeded, skipped)`. The project ID reaches blob
  and domain through CEL from `dashboard-project` data.
- **Harmless warnings:**
  - `@swamp/vercel/projects` reports that `creator.via` is null and doesn't match its schema.
  - The pulled `@swamp/vercel/deployments` extension reports missing source files.
- **Vault:** the vault `secrets` in the main checkout holds `vercel-token`, which works. No Blob token
  is stored.

## Vercel: verified facts (don't relearn)

- **IDs:**
  - team `team_SMACO8iOr6wPIGx5as56P468`;
  - project `ai-usage` = `prj_EgYL9x4XYklFy2fVnxD9jhQJmSDH`;
  - Blob store `ai-usage` = `store_RoFNqrEhQsDUqZ7m` (public, `iad1`);
  - Blob host `https://rofnqrehqsduqz7m.public.blob.vercel-storage.com`.
- **Project setup:**
  - The project is git-linked to `kagarmoe/local-ai-usage`, with production branch `main`.
  - Framework Vite, Node 24.x.
  - **No deployments yet.**
  - The Blob store is connected to the project in all three environments.
- **Phase-2 config is on the branch, not yet applied.** `dashboard-project.yaml` sets `rootDirectory: site` and
  `commandForIgnoringBuildStep: '[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .'`.
  - `VERCEL_GIT_PREVIOUS_SHA` is the last *successful* deploy's SHA for that branch.
  - It is set only when an Ignored Build Step is configured, and is empty on a branch's first
    deploy, so the command fails open and the build runs.
  - Exit 0 skips the build; non-zero builds. With `rootDirectory: site`, `-- .` means `site/`.
  - The old `HEAD^` form missed site changes when several commits landed between deploys.
  - Sources: Vercel's system-environment-variables docs, and community thread 39835.
- **How the site gets its data:** `site/vercel.json` rewrites `/data/:path*` to the Blob host,
  so the site is static and fetches `/data/weeks.jsonl` and `/data/meta.json`.
- **Uploading with `vercel blob put`:**
  - The `blob-upload` model gets the store's read-write token by running `vercel env pull` (with
    env `VERCEL_TOKEN`) into a temp dir on each call. It sets the token per call, so it never
    inherits the shell's.
  - **The shell's own `BLOB_READ_WRITE_TOKEN` belongs to a different, private store**
    (`e5xfkavtfuaspfmn`). Any manual `vercel blob` command must override or unset it.
  - `--add-random-suffix` and `--allow-overwrite` are on/off flags. Passing `false` turns the
    option **on**. Omit `--add-random-suffix`.
  - `vercel blob` refuses to run from the repo root while `.env.local` holds `VERCEL_OIDC_TOKEN`
    without `BLOB_STORE_ID`. Run it from a temp dir.
- The upload hash leaves out `meta.json`'s `generatedAt`, which changes on every run.
- The main checkout is `vercel link`ed. `.vercel/` and `.env*` are ignored through `.git/info/exclude`
  there, and through `.gitignore` on `dashboard`. At merge prep, remove the exclude lines.
- DNS for kimberlygarmoe.com is already on Vercel nameservers.

## Repo gotchas

- **The global gitignore (`~/.gitignore_python`) ignores `/site` and `lib/`.** The repo
  `.gitignore` has `!/site` and `!site/src/lib/` to undo that. Check new files under `site/` with
  `git status`; a dirty tree once hid that `site/src/lib` was missing.
- **The main checkout holds identical uncommitted copies** of `extensions/models/upstream_extensions.json`
  and `models/@swamp/vercel/{blob-storage,projects}/`. Step 1 adds more. Discard them all
  right before the merge, e.g. `git checkout -- extensions/models/upstream_extensions.json && rm -r models/@swamp`
  plus any restored paths. **Look before deleting.**
- **Hard rules:**
  - Never push to or merge into `main`; the daily job pushes `main`.
  - Never push tag `pre-public-history`.
  - No `git reset --hard` and no force-push.
  - Pushes, deploys, the domain, and uploads need the user's OK.
- **Commit trailers:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01KYWSCv6e2HngoSJyzdx318`.
- **Open beads:**
  - `localai-mdf`: the full dashboard after v1.
  - `localai-jao`: swamp serve over Tailscale.
  - The beads↔GitHub sync offer is still pending.

## Decisions

- **No Claude Code backfill (user, 2026-10-09).** Transcripts on disk cover W35 (partial), W39 and
  later; W36–W38 are gone. `stats-cache.json` (2026-06-08 – 07-16) leaves out cache reads, so it
  isn't comparable to the tracked data. History accumulates going forward in swamp data.
- **Local preview done (2026-10-09).** Real `public/summary.json` was rendered by `render()` into a scratch
  build and checked in headless Chrome at 1280px: 0 console errors. That run found the Codex chart's "Baseline"
  label overlapping the `2026-W40` tick; fixed in 6e136e5. Use viewport screenshots; full-page shots catch Recharts
  mid-animation.

## Deferred minors

Full list in the ledger. Highlights:
- **Upload and Blob:** upload `meta.json` last; a stale or cleared Blob goes undetected.
- **Template leftovers:** `button.tsx` and its dependencies (`@base-ui/react`, `lucide-react`,
  `class-variance-authority`), `site/README.md`, `.oxlintrc.json`.
- **Page robustness:** no shape check on `meta.json`, no fetch abort. (The empty-chart message and `fmt(999_999)` were fixed in the full chart set.)
- **Bundle size:** one 597 kB chunk.
- **Workflow tags:** `dashboard-setup` has `tags: {}`.
- **Missing test:** no test for temp-dir cleanup in `blob_upload`.
