# gabriel-portfolio-data — Agent Guide

## What this repo is

The headless data layer for the portfolio ecosystem: Airtable (CMS) → GitHub Actions →
`portfolio-data.json` + `sitemap.xml` + `robots.txt` on the `data` branch → jsDelivr CDN
→ the separate Vite frontend at `../gabriel-portfolio`. It is **not** a frontend app and
has no server, auth, database or billing. Read `README.md` and `docs/SCHEMA.md` before
changing the pipeline.

## Commands

- `npm run sync:data` — fetch Airtable, sync images, write both portfolio JSON files
- `npm run sync:sitemap` / `npm run sync:robots` — regenerate the per-mode static files
- `npm run sync:all` — data + sitemap + robots
- `npm run guard:data -- <dir>` — reject secrets/non-artifact paths before a `data` publish
- `npm run roadmap -- list|add|close|check`
- `npm run lint:docs` — doc-budget + roadmap hygiene (`npm run lint` runs it)
- There is no `dev` or `build` command. Do not invent one.

## MCP servers (project)

`opencode.json` configures two remote MCP servers, both OAuth (no secrets in the file):

- `airtable` — official Airtable MCP (bases and records).
- `cloudinary` — official Cloudinary asset-management MCP.

After a fresh setup, run `/mcps`, pick each server and sign in; `opencode mcp list`
should then report `connected`. Keep the Airtable grant read-only unless a task needs
writes. These are for content/asset work — they cannot rotate API credentials.

## Roadmap — the required workflow

- `docs/ROADMAP.md` holds **open items only** (`[ ]` / `[~]`), led by a priority queue.
- Completed work moves to `docs/ROADMAP-ARCHIVE.md` as **one line** (id, title,
  doc/code pointers). Git history keeps the narrative.
- Ids are **stable and unique forever**. The CLI assigns the next free id.
- Every new ask goes through triage first: headings in the roadmap → archive →
  `AGENTS.md` + `docs/*.md` → `git log --oneline --grep=<term>` → source. Open item →
  do it; in-progress → don't parallel it; done → use the pointer; overlaps → merge into
  one item.
- Close in one commit: `npm run roadmap -- close <id> --points "docs/...; path/..."`,
  then `npm run roadmap:check`.
- The full contract is the header of `docs/ROADMAP.md`.

## Docs hygiene

- `AGENTS.md` is the always-loaded hub: ≤200 lines / 36 KB. Detail goes in `docs/*.md`.
- Each `docs/*.md` manual is ≤400 lines / 50 KB and must open with a `# Title` and a
  read-first/`Status:` line in its first 8 lines.
- `docs/audits/` holds dated, point-in-time audit reports; they are reference artifacts,
  not living manuals. The current one is `docs/audits/2026-10-23-security-audit.md`.
- Run `npm run lint:docs` before committing doc changes.

## Testing

- `npm test` runs the Vitest unit suite (Node, no browser); `npm run test:watch` for
  TDD. CI runs it on every push/PR to `main` (`.github/workflows/ci.yml`).
- Tests live in `scripts/**/__tests__/*.test.mjs` and must run with no network and no
  credentials. Anything needing Airtable/Cloudinary is a manual check, not a test.
- Policy, conventions and the manual-verification list: `docs/TESTING.md`.

## Security rules

- Never commit `.env*`, `docs/SCHEMA-FULL.local.md`, `cloudinary-mapping.json`, or the
  generated `directing/`/`postproduction/` output. They are gitignored on `main`.
- **Never run `git add .` on the `data` branch.** Publishes go through the workflow,
  whose `scripts/guard-data-branch.mjs` step rejects `.env*`, `node_modules/` and any
  non-artifact path; a manual hotfix uses a throwaway worktree per
  `docs/MAINTENANCE.md` and stages explicit artifact paths only.
- Secrets live in GitHub Actions secrets (CI) and `.env.local` (local only). Never log
  them, and do not put a provider token in a `VITE_`-prefixed variable.
- The published `data` branch is the live site: treat a change to the workflow as a
  production change. Publishes are append-only commits tagged `data-*`; restore one with
  the workflow's `rollback` input (`docs/MAINTENANCE.md`).
- Do not hand-edit the `data` branch; the guarded worktree procedure in
  `docs/MAINTENANCE.md` is the only exception.
- `main` is protected: land changes through a PR (the CI `test` check must pass; no
  direct pushes, force-pushes or deletions). `data` accepts fast-forward publishes
  only — no force-push, no deletion.
- Run `npm run hooks:install` once per clone: the pre-commit hook blocks business-schema
  dumps, `SCHEMA-FULL.local.md` and env files (see `docs/SCHEMA.md`).

## Rules

- Small, revertible commits; imperative messages.
- Code is truth; docs are claims — verify a claim before repeating it.
- Ask a blocking question instead of guessing about provider permissions, billing or
  anything that touches production credentials.
