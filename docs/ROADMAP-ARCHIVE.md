# gabriel-portfolio-data — Roadmap Archive (Completed Index)

Status: **index only** — the live backlog is `docs/ROADMAP.md`; consult this file
during triage (grep it before asking for or implementing anything). Full narrative
lives in git history (the commit that retired the item); canonical knowledge lives
in `AGENTS.md` / `docs/*.md` and the pointers below.

How to use: grep for a feature term before asking for or implementing anything. If it
hits, the work is done — read the pointers, don't re-implement. **Ids are stable:
never renumber or reuse.**

| # | Item | Knowledge / code pointers |
|---|---|---|

| # | Item | Knowledge / code pointers |
|---|---|---|
| 1 | Fix the data-branch hotfix procedure and credential exposure | docs/MAINTENANCE.md; scripts/guard-data-branch.mjs; .github/data-branch.gitignore; .github/workflows/sync-data.yml; package.json (guard:data) |
| 8 | Make the test suite runnable and gated | vitest.config.mjs; package.json (test scripts); .github/workflows/ci.yml; docs/TESTING.md; scripts/utils/__tests__/ (120 cases) |
| 3 | Stop leaking unpublished work in public artifacts | scripts/lib/sync-logic.mjs (buildPublishedMapping); scripts/utils/__tests__/mapping-filter.test.mjs; README.md |
| 2 | Sanitize CMS values at every output boundary | scripts/lib/sanitize.mjs; scripts/lib/sync-logic.mjs; scripts/generate-sitemap.mjs; scripts/generate-robots.mjs; scripts/utils/__tests__/sanitize.test.mjs; scripts/utils/__tests__/generator-output.test.mjs; ../gabriel-portfolio: src/utils/markdown.ts + src/components/views/BlogView.tsx + src/utils/__tests__/markdown.test.ts |
| 9 | Retain publish history and add rollback | scripts/publish-data.mjs; scripts/guard-data-branch.mjs; .github/workflows/sync-data.yml (rollback input/job); scripts/utils/__tests__/publish-data.test.mjs; docs/MAINTENANCE.md; package.json (publish:data) |
