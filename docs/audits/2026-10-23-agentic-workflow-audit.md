# Agentic Workflow Audit — Portfolio Ecosystem

> **Status:** point-in-time report, 2026-10-23. Reference artifact, not a living manual.
> **Remediation (same day):** the frontend now has `AGENTS.md`, the 1,551 lines of dead
> modules plus the legacy `.mjs` twins are removed, `npm test` runs once, and
> `npm run typecheck` passes with React 19 types. Remaining P1: frontend CI and branch
> protection. The frontend `AGENTS.md` is the current source of truth.
> **Scope:** `gabriel-portfolio-data` (this repo) and its frontend sibling
> `../gabriel-portfolio`.
> **Method:** static inspection plus running the real verify loop in both repos —
> `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm ci --dry-run`,
> an import-graph pass over `src/`, `gh api` branch-protection checks, and
> `opencode mcp list`.

## Verdict

**The data repo is close to a model agent workspace. The frontend is easy to edit and
hard to verify — the one combination that produces confident, unverified changes.**

| Question an agent asks | Data repo | Frontend |
|---|---|---|
| What is this and where do I start? | **9** — 89-line `AGENTS.md`, single entry point | **3** — no `AGENTS.md`, four competing guides |
| How do I run it? | **9** — every documented script exists | **2** — six documented scripts do not exist |
| How do I know it works? | **9** — 215 tests in 4 s, doc lint, CI gate | **2** — tests cover unused copies, `tsc` fails, no CI |
| What must I not break? | **9.5** — publish gate, guards, protected `main` | **4** — no CI, unprotected `main`, marker magic |
| Can I find the right file? | **8** — 62 tracked files, one 817-line core | **5** — dead twins, 116-file hidden sub-app |
| Can I trust the docs? | **8** — budgeted; one stale skill | **3** — false stack claims, broken links |
| Will it reproduce? | **9** — `.nvmrc` 24 + lockfile | **4** — no pin, global Netlify CLI required |
| Where is the work state? | **9.5** — roadmap + archive + CLI | **1** — 148 KB changelog, no backlog |
| Is tooling discoverable? | **8** — MCP connected, skills hidden | **4** — skills exist, two pointers broken |
| **Overall** | **8.8 / 10** | **3.1 / 10** |

Ecosystem score: **~5.9 / 10**. Weighted by change volume, lower — most edits happen in
the frontend.

### What this means in practice

- **Data repo:** clone → `npm test` (4 s) → `npm run lint` (0.2 s) → edit → verify. One
  pass, no guessing. An agent can own a change here.
- **Frontend:** `npm run build` succeeds in ~1 s, so every change *looks* fine. But
  `npm test` never returns, `tsc` reports 12 errors nobody runs, 4 of 5 test files
  import code the app does not ship, and no CI checks anything. The only honest signal
  is "the bundle built" — the weakest possible signal. Agents will appear productive
  here and be unverified.

## The rubric

Nine properties that determine whether an agent can change a codebase safely:

1. One canonical entry point that the harness loads automatically.
2. Every documented command exists and is deterministic.
3. A fast, honest verification loop that covers shipped code.
4. Guardrails that make the dangerous action harder than the safe one.
5. A codebase navigable without guessing — no dead twins, clear boundaries.
6. Docs that are true and cheap to keep true.
7. A reproducible environment (pinned runtime, lockfile, no global tools).
8. Work state an agent can query (roadmap, archive, stable ids).
9. Tool integration (MCP, skills) that is discoverable from the entry point.

## What is already good

- **Data repo `AGENTS.md`** is the best file in either repo: 89 lines, commands, MCP,
  roadmap contract, testing, security rules, and an explicit "there is no `dev` or
  `build` command".
- **Data repo feedback loop** is fast and honest: 215 tests / 17 files in 3.8 s, doc
  lint in 0.2 s, `npm ci --dry-run` clean, CI runs both on every PR, `main` is
  protected with a required `test` check and `enforce_admins: true`.
- **Data repo roadmap** is executable, not aspirational: stable ids, open-only live
  file, one-line archive, CLI (`list/add/close/check`), and a doc-budget checker that
  enforces the `AGENTS.md` limit.
- **Data repo security posture** is documented and enforced: publish gate, branch guard,
  pre-commit hook, least-privilege workflow, SHA-pinned actions, rollback path.
- **Frontend build** is genuinely fast (748 ms Vite), the module layout is sane (43
  TS/TSX files, no file over 714 lines), and route-level lazy loading is in place.
- **Both repos** have committed lockfiles, no tracked `node_modules`, no tracked
  `dist/`, and `.DS_Store` is ignored.

## Findings

### P1 — blocks a correct, verified change

#### AF-01 — The frontend has no `AGENTS.md`; four guides compete

Evidence: `AI_AGENT_GUIDE.md`, `copilot-instructions.md`, `COPILOT.md`,
`.github/copilot-instructions.md`. There is no `AGENTS.md`, `CLAUDE.md`, or
`.cursorrules`.

Why it hurts: OpenCode, Codex and Cursor load `AGENTS.md`; Claude Code loads
`CLAUDE.md`; only Copilot reads `.github/copilot-instructions.md`. An agent in the
frontend starts with no canonical instructions and must discover four files that
disagree. The security-relevant deploy-marker rule exists only in the Copilot file.

Fix: create `AGENTS.md` as the single source (≤150 lines), make the other four
one-line pointers, delete the duplicates (`COPILOT.md`, root `copilot-instructions.md`).
Effort: **S**.

#### AF-02 — Six documented commands do not exist

`.github/copilot-instructions.md` documents:

| Documented | Reality |
|---|---|
| `npm run dev:directing:full` | missing |
| `npm run dev:postprod:full` | missing |
| `npm run sync:directing` | missing |
| `npm run sync:postprod` | missing |
| `npm run sync:both` | missing |
| `npm run sync:all` | missing (the frontend has no sync scripts at all) |

Root `README.md` also links to `DOCUMENTATION_INDEX.md` and `DEPLOYMENT_GUIDE.md` at the
root; neither exists. `COPILOT.md` points at `INSTAGRAM_STUDIO.md`; missing.

Why it hurts: an agent's first move is to run the documented command. `ENOENT`/`Missing
script` costs a turn and erodes trust in every other claim.

Fix: generate the command table from `package.json`; add a `docs:check` script that
extracts `npm run <name>` from Markdown and fails if the script is absent. Effort:
**S–M**.

#### AF-03 — `npm test` never returns

`"test": "vitest"` starts watch mode. In an agent shell without `CI=1`, the command
blocks until the tool timeout. The working command is `npm run test:run`.

Fix: `"test": "vitest run"`, keep `"test:watch": "vitest"`. One line. Effort: **XS**.

#### AF-04 — 4 of 5 test files test code the app does not ship

`src/utils/__tests__/` imports `.mjs` twins:

| Test file | Imports | Shipped module |
|---|---|---|
| `videoHelpers.test.mjs` | `../videoHelpers.mjs` | `../videoHelpers.ts` |
| `slugify.test.mjs` | `../generators/slugify.mjs` | `../generators/slugify.ts` (dead) |
| `fileHelpers.test.mjs` | `../helpers/fileHelpers.mjs` | no TS twin — unused |
| `networkHelpers.test.mjs` | `../helpers/networkHelpers.mjs` | no TS twin — unused |
| `markdown.test.ts` | `../markdown` | shipped ✅ |

The twins have diverged. `videoHelpers.ts` parses Vimeo `?h=` hashes and extra URL
forms that `videoHelpers.mjs` does not; `slugify` uses a different diacritic regex. The
112 green tests are therefore not evidence about production behaviour. Nothing outside
the tests imports the `.mjs` files (one ad-hoc script does, and its path is broken).

Fix: point tests at the `.ts` modules and delete the `.mjs` twins, then reconcile any
behaviour the TS version gained. Effort: **M**.

#### AF-05 — The compiler is not a usable safety net

`npx tsc --noEmit` fails with 12 errors and nothing runs it: no `typecheck` script, no
CI step. `tsconfig.json` does not set `strict` (so it is off), though it does set
`allowJs`.

Errors include real defects, not just strictness:

- `src/components/views/BlogView.tsx` — `unknown` passed as a React `Key`/`ReactNode`.
- `src/components/ErrorBoundary.tsx` — class is not accepted as a JSX component.
- `src/utils/generators/sitemapGenerator.ts` — wrong relative import (`../services/...`).
- `src/utils/cloudinary/staticFilesCloudinary.ts` — wrong relative import (`../types`).
- `data/staticData.ts` — wrong relative import (`../types`).
- `src/components/ProceduralThumbnail.tsx` — `loading`/`fetchPriority` typed as `string`.
- `ImageCompressionView` — JSON import without `resolveJsonModule`.
- Three Deno/edge-function errors that need a separate tsconfig.

Fix: add `"typecheck": "tsc --noEmit"`, fix the 12 errors, enable `strict` in stages
(`strictNullChecks` first), gate CI. Effort: **M–L**.

#### AF-06 — The frontend has no CI and no branch protection

`.github/workflows/` contains only `manual-deploy.yml` and `scheduled-deploy.yml`; no
workflow runs install, typecheck, tests or build on a PR. `gh api` confirms
`main` is **not protected**, and the repo is **public**. Both deploy workflows hold
`contents: write` and push commits to `main`.

Additional workflow drift: `scheduled-deploy.yml` runs
`node scripts/generate-share-meta.mjs`; the file lives at
`scripts/tests/generate-share-meta.mjs`. That job cannot succeed as written.

Fix: add `.github/workflows/ci.yml` (`npm ci`, `typecheck`, `test`, `build`, doc-command
check), require the check on `main`, and fix or delete the broken deploy step. Effort:
**M**.

### P2 — slows every task or creates wrong turns

#### AF-07 — Frontend docs contradict the code

- `AI_AGENT_GUIDE.md` says "Tailwind CSS has been removed/phased out". `index.html`
  loads `cdn.tailwindcss.com/3.4.1` and defines `tailwind.config`; there are 434
  `className` usages across 23 components. The guide's styling advice is the opposite
  of reality.
- Same guide and root `README.md` say React Router 6; `package.json` has `7.18.4`.
- `scripts/lib/README.md` describes `sync-core.mjs`, `npm run build:data` and
  `netlify/functions/sync-now.mjs` — none exist. It is a leftover from the data-repo
  migration.
- `AI_AGENT_GUIDE.md` points at `_agents/skills/airtable-cms/SKILL.md` and
  `_agents/skills/cloudinary-maintenance/SKILL.md`; those skills live in the **data**
  repo, not the frontend.
- `_agents/workflows/data_repo_migration_plan.md` is a completed migration plan sitting
  in a folder agents are told to read before work.

Fix: rewrite the guide from the code, delete `scripts/lib/README.md` and the migration
plan (git history keeps them), add link checking and a "Last verified" date. Effort:
**M**.

#### AF-08 — 1,551 lines of dead code with broken imports

Dead/unrouted modules: `ImageCompressionView.tsx` (497), `ThumbnailPreviewView.tsx`
(259), `staticFilesCloudinary.ts` (254), `sharedTypes.ts` (203), `instagramService.ts`
(99), `sitemapGenerator.ts` (94), `generators/slugify.ts` (49), `data/staticData.ts`
(~96). Three of them contain broken imports, so an agent asked to "fix the type errors"
will spend time repairing code nothing uses.

Fix: delete them, or move to `archive/` with a README; rerun `tsc`. Effort: **S**.

#### AF-09 — A whole second application hides under `scripts/`

`scripts/instagram-studio/` is 116 tracked files / 10.6k LOC, with its own
`package.json` (React 18 vs root React 19), lockfile, `node_modules`, `dist`, Netlify
config and deploy. The root package.json reaches it via `cd scripts/instagram-studio &&
npm run …`, not workspaces. An agent scanning `scripts/` for build utilities finds a
product.

Fix: promote it to `apps/instagram-studio`, add workspaces (or split the repo), and give
it its own `AGENTS.md`/README. Effort: **L**.

#### AF-10 — Three Node versions, no pin, and a global CLI in the quickstart

No `.nvmrc`, no `engines` in the frontend. `scheduled-deploy.yml` pins Node 20; the data
repo pins 24 via `.nvmrc`; the machine here runs 26. Root `README.md` says `npm run dev`,
which is `netlify dev` — but `netlify` is not a dependency (it is installed globally on
this machine, so the breakage is invisible locally and fatal on a fresh clone/CI).

Fix: `.nvmrc` 24, `engines`, `node-version-file` in workflows, add `netlify-cli` as a
devDependency or document `dev:vite` as the default. Effort: **XS**.

#### AF-11 — `scripts/tests/` is not tests

11 tracked files / 1.5k lines of one-off debug tools (`fix-airtable-urls.mjs`,
`force-reupload-cloudinary.mjs`, …), plus `scripts/migrate.py` with hardcoded absolute
paths from the 2025 migration. One of them imports a path that does not exist. Agents
cannot distinguish "run this to verify" from "run this to mutate production".

Fix: rename to `scripts/tools/`, delete one-time scripts, add a README that states what
each does and which are destructive. Effort: **S**.

#### AF-12 — A committed `.env` in the sub-app

`scripts/instagram-studio/.env` is tracked even though its own `.gitignore` lists `.env`
and the file says "do not commit". Values are public `VITE_INSTAGRAM_APP_ID` /
redirect URI, so this is not a live secret leak — but it normalises committing env files
and will trip secret scanners and future agents.

Fix: `git rm --cached scripts/instagram-studio/.env`; keep `.env.example`. Effort:
**XS**.

#### AF-13 — No lint, no formatter, and inconsistent aliases

No ESLint or Prettier config in the frontend. Separately, the `@` alias resolves to
`./src` in `vite.config.ts` but to the repo root in `vitest.config.mjs`, and `@utils`
points at `./utils` while the code lives in `src/utils`. Nothing uses them today, so
they are traps rather than bugs.

Fix: add ESLint flat config + Prettier, one `lint` script, fix the aliases or remove
them. Effort: **M**.

#### AF-14 — Data repo: no single verify command

`npm test` and `npm run lint` are separate; `docs/TESTING.md` and CI both list the pair.
An agent that runs only one can miss half the gate.

Fix: `"verify": "npm test && npm run lint && npm run roadmap:check"`; point
`AGENTS.md`, `docs/TESTING.md` and CI at it. Effort: **XS**.

#### AF-15 — Data repo: skills exist but are invisible

`_agents/skills/airtable-cms` and `_agents/skills/cloudinary-maintenance` are tracked
and partly duplicate `AGENTS.md` / `docs/SCHEMA.md`, but `AGENTS.md` never mentions
them. One line is stale (sync is now `repository_dispatch`/`workflow_dispatch`, not a
schedule). Two sources of truth, neither authoritative.

Fix: either index them in `AGENTS.md` as the deep dives, or delete them and fold the
unique content into `docs/`. Effort: **XS**.

#### AF-16 — Data repo: duplicated roadmap archive header

`docs/ROADMAP-ARCHIVE.md` contains the table header twice (lines 10–16). Both
`roadmap:check` and `lint:docs` pass. Harmless to a human, confusing to an agent
parsing the table.

Fix: remove the duplicate; add a lint assertion that the header appears once. Effort:
**XS**.

#### AF-17 — Data repo: coverage is advertised but unavailable

`npx vitest run --coverage` fails: `@vitest/coverage-v8` is not installed. There is no
coverage signal for `sync-logic.mjs` (817 lines, the highest-risk module).

Fix: add the provider and a soft threshold; or state explicitly that coverage is not a
goal. Effort: **S**.

#### AF-18 — MCP is only configured in the data repo

`opencode.json` exists only in the data repo (`airtable` needs authentication,
`cloudinary` and `lemon` are connected). An agent working in the frontend has no
declared CMS/asset access and will not know the data repo owns it.

Fix: add the same project MCP config (or a pointer) to the frontend `AGENTS.md`. Effort:
**XS**.

### P3 — polish

- Frontend `README.md` repeats a bullet and mixes live and archived docs in one list.
- Frontend `CHANGELOG.md` is 148 KB; it is the only work-history artefact and is not
  queryable by item.
- Frontend deploy markers (`[deploy]`, `[force-deploy]`) are a load-bearing convention
  documented only in Copilot files.
- Data repo `package.json`: `"main": "index.js"` points at a file that does not exist;
  `description` is empty; `type: "commonjs"` while every script is `.mjs`.
- Leftover `deno.lock` files in the frontend (root and sub-app).
- `.DS_Store` files exist in the tree locally (untracked) — noisy for filesystem
  searches.
- Data repo local `__test_temp__/` and `.env.local` are untracked but visible to
  non-ignoring tools.

## Fix order

### First 60 minutes (frontend, four changes)

1. `package.json`: `"test": "vitest run"`, add `"test:watch": "vitest"`, add
   `"typecheck": "tsc --noEmit"`.
2. Create `AGENTS.md` (≤150 lines); reduce `AI_AGENT_GUIDE.md`, `COPILOT.md`,
   `copilot-instructions.md` and `.github/copilot-instructions.md` to pointers; delete
   duplicates.
3. Delete the eight dead modules/views (AF-08) — this also removes four of the twelve
   `tsc` errors.
4. Delete `scripts/lib/README.md` and `_agents/workflows/data_repo_migration_plan.md`.

### First day

5. Point the tests at `.ts`, delete the `.mjs` twins, restore the Vimeo hash coverage
   (AF-04).
6. Fix the remaining `tsc` errors; add `strictNullChecks`; run `typecheck` in CI.
7. Add the frontend `ci.yml`; protect `main` with a required `test` check (AF-06).
8. Add the doc-command checker and fix the command table (AF-02).

### First week

9. Move `scripts/instagram-studio` to `apps/` with workspaces and its own `AGENTS.md`.
10. Add ESLint + Prettier; fix or remove the aliases.
11. Pin Node (`.nvmrc`, `engines`, workflow `node-version-file`).
12. Bootstrap the roadmap/doc workflow in the frontend with the `repo-quality-kit`
    scaffold — it is the one repo without one.
13. Data repo: `verify` script, skills index, archive header, coverage decision.

## Appendix — measurements

| Metric | Data repo | Frontend |
|---|---|---|
| Tracked files | 62 | 236 (116 in `scripts/instagram-studio`) |
| Source size | 5,372 lines (`scripts/`) | ~9.5k lines TS/TSX in `src` + 10.6k sub-app |
| Largest source file | `scripts/lib/sync-logic.mjs` (817) | `ProjectDetailView.tsx` (714) |
| Tests | 215 in 17 files, 3.8 s | 112 in 5 files, 178 ms |
| Tests covering shipped code | all | 1 of 5 files |
| Typecheck | n/a (plain JS) | 12 errors, not gated |
| Lint | doc budget + roadmap, 0.2 s | none |
| Build | n/a | Vite, 748 ms |
| CI on PRs | yes (`test` + `lint`) | none |
| `main` protected | yes (`test`, admins enforced) | no |
| Agent entry point | `AGENTS.md` (89 lines) | none |
| Roadmap | live + archive + CLI | none (148 KB changelog) |
| Node pinned | 24 (`.nvmrc` + `engines`) | no |
| Lockfile in sync | yes (`npm ci --dry-run`) | yes (`npm ci --dry-run`) |
| Dead code found | none tracked | 1,551 lines |
| Stale command/doc claims | 2 (skills, archive header) | 12+ |

### Reproduce the key checks

```bash
# Data repo
npm test && npm run lint && npm run roadmap:check
npx vitest run --coverage        # currently fails: provider not installed

# Frontend
npx vitest run                   # 112 pass, but 4/5 files test .mjs copies
npx tsc --noEmit                 # 12 errors
npm run build                    # succeeds
npm ci --dry-run                 # lockfile in sync
gh api repos/gabathanasiou/gabriel-athanasiou-portfolio/branches/main/protection
                                 # 404: branch not protected
```
