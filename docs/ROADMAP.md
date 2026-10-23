# gabriel-portfolio-data — Roadmap (Open Work Only)

This is the **live backlog**: `[ ]` not started, `[~]` in progress. Completed work is
retired to `docs/ROADMAP-ARCHIVE.md` as **one line**; git history keeps the narrative.

**How this file works — the whole workflow lives here, so no custom skill is required:**

- **Query, don't read it all:** `grep '^## ' docs/ROADMAP.md` lists every item with its
  flags. Read only the matched line range.
- **Every new ask goes through triage first.** Dedupe in this order: headings here →
  `docs/ROADMAP-ARCHIVE.md` → `AGENTS.md` + `docs/*.md` → `git log --oneline --grep=<term>`
  → source. Open item → do it; in-progress → never parallel; done → use the pointer;
  overlaps several → merge into ONE item; nothing → add one.
- **Ids are stable and unique forever.** Never renumber or reuse. Next id =
  `max(live ∪ archive) + 1`. The CLI does this.
- **Shape:** request → approach/files → verify → `Relations:` (depends on / merges /
  supersedes / blocked by).
- **Close in one commit:** flip `[x]`, add ONE archive row
  (`| id | title | doc + code + test pointers |`), delete the live section, then
  `npm run roadmap:check`.
- **CLI:** `npm run roadmap -- list | add "title" | close <id> --points "..." | check`.
- **Portable kit for other repos:** `docs/ROADMAP-KIT.md`.

---

### Priority queue

Every audit finding from `docs/audits/2026-10-23-security-audit.md` is covered by an
item below. Work top-down; P1 before the next publish.

| Priority | # | Item | Audit findings | Effort |
|---|---|---|---|---|
| **P1** | 1 | Fix the data-branch hotfix procedure and credential exposure | F-05 | S |
| **P1** | 2 | Sanitize CMS values at every output boundary | F-02, F-14 | M |
| **P2** | 3 | Stop leaking unpublished work in public artifacts | F-01 | S |
| **P2** | 4 | Make the publish path fail-safe | F-03, F-06, F-17 | M |
| **P2** | 5 | Key the Cloudinary cache by attachment identity | F-07 | M |
| **P2** | 6 | Restore automated sync and add freshness/alerting | F-08, F-18 | M |
| **P2** | 7 | Harden CI supply chain and protect branches | F-04, F-12 | M |
| **P2** | 8 | Make the test suite runnable and gated | F-13 | S |
| **P2** | 9 | Retain publish history and add rollback | F-11 | S–M |
| **P2** | 10 | Credential hygiene and disclosure process | F-15, F-09 | S |
| **P3** | 11 | Slug uniqueness and non-Latin titles | F-16 | S |
| **P3** | 12 | Repo hygiene batch | CODE-06, CODE-09, hardening | S |
| **P3** | 13 | Decide and document the historical schema exposure | F-10 | M |

## 2. Sanitize CMS values at every output boundary (`[ ]`)

- **Priority:** P1 — before the next publish
- **Request:** Airtable journal `Content` flows verbatim into `portfolio-data.json`
  (`scripts/lib/sync-logic.mjs:435,461`) and the frontend renders it with
  `dangerouslySetInnerHTML` (`../gabriel-portfolio/src/components/views/BlogPostView.tsx:144`);
  `parseMarkdown` also interpolates link destinations unescaped
  (`../gabriel-portfolio/src/utils/markdown.ts:21`). The Airtable `Domain` setting is
  interpolated unescaped into `sitemap.xml`/`robots.txt`
  (`scripts/generate-sitemap.mjs:43`, `scripts/generate-robots.mjs:39`).
- **Approach:**
  - Add an allowlist sanitizer for journal HTML in the pipeline (tags/attributes,
    `javascript:`/`data:` rejection) and unit-test it; `escapeHtml` in
    `scripts/utils/helpers/textHelpers.mjs:68` currently has no callers.
  - Escape all interpolated values in the sitemap/robots generators; validate `Domain`
    as a hostname and strip CR/LF from robots directives.
  - Frontend (separate repo): render with DOMPurify or a safe markdown renderer and add
    a CSP. Keep the pipeline sanitizer even after the frontend fix — the `data` branch is
    a second writer.
- **Verify:** Unit tests with `<img src=x onerror=…>`, `[click](javascript:…)`,
  `</loc>` and a newline in `Domain` → no script/XML survives. Manual frontend check:
  a hostile payload in a draft post renders as text.
- **Audit:** F-02, F-14 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: depends on #8 for the automated test runner; the frontend half lives in
`../gabriel-portfolio`.

## 4. Make the publish path fail-safe (`[ ]`)

- **Priority:** P2 — before the next publish
- **Request:** Three ways the last good publish can be overwritten: (a) Cloudinary
  failures are swallowed and the gallery falls back to expiring Airtable URLs
  (`scripts/utils/cloudinary/cloudinaryHelpers.mjs:87-120`,
  `scripts/lib/sync-logic.mjs:367-372,580-583`); (b) the "Check for changes" gate is
  always true and nothing validates an empty/misconfigured payload
  (`.github/workflows/sync-data.yml:82-92`, `sync-logic.mjs:146-155,259-273`); (c) two
  runs can overlap and the older one can win (no `concurrency`, `git push -f` at `:117`).
- **Approach:**
  - Treat only 404 as "image missing"; fail (or hold the previous JSON) on
    401/403/429/5xx and on any upload failure; never emit an Airtable attachment URL.
  - Add a publish gate: non-zero projects/posts, both Settings rows present, valid
    hostname, and abort on an abrupt count drop vs the previous JSON.
  - Replace the vacuous change check with a real content check.
  - Add `concurrency: {group: sync-data, cancel-in-progress: false}` and use
    `--force-with-lease` plus a `lastUpdated` compare-and-swap.
- **Verify:** Simulate an empty Airtable response and a revoked Cloudinary key in a dry
  run → job fails and the `data` branch is unchanged. Two overlapping dispatches → the
  second waits/aborts instead of overwriting a newer publish.
- **Audit:** F-03, F-06, F-17 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: depends on #9 for the last-good snapshot it compares against.

## 5. Key the Cloudinary cache by attachment identity (`[ ]`)

- **Priority:** P2 — before the next publish
- **Request:** Public IDs are positional (`portfolio-projects-${record.id}-${i}`,
  `scripts/lib/sync-logic.mjs:593-597`). Replacing or reordering a gallery image makes
  the cache key miss, but `checkImageExists(publicId)` finds the old asset and reuses it,
  stamping the new `airtableId` onto the old URL (`:547-567`).
- **Approach:** Include the attachment ID (or a content hash) in the public ID; on an
  exists-hit, compare `airtableId` and re-upload when it differs; migrate existing assets
  or accept one re-upload pass.
- **Verify:** Fixture that reorders and replaces a gallery image → the published URL
  changes and the mapping records the new attachment ID. Append-only still works.
- **Audit:** F-07 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: none.

## 6. Restore automated sync and add freshness/alerting (`[ ]`)

- **Priority:** P2 — before the next publish
- **Request:** The Airtable webhook has never fired (13/13 runs are manual; last publish
  2026-03-07, 230 days stale), and there is no schedule, freshness check or failure
  notification. Third-party calls have no timeout or retry
  (`airtable-helpers.mjs:27-47`; `retryWithBackoff` is unused outside tests).
- **Approach:**
  - Add a weekly `schedule` fallback; verify and document the Airtable webhook.
  - Add a freshness check (`lastUpdated` older than N days → fail + alert) and an
    `if: failure()` notification step.
  - Wrap Airtable, Cloudinary and oEmbed calls in `fetchWithTimeout` +
    `retryWithBackoff` with jitter and `Retry-After`; add `--max-time` to the
    mapping-download/purge `curl` calls.
- **Verify:** A scheduled run lands without manual dispatch; a forced 429 is retried;
  a stale `lastUpdated` fails the check; a failed run produces a notification.
- **Audit:** F-08, F-18 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: shares the workflow with #4; do them in the same pass.

## 7. Harden CI supply chain and protect branches (`[ ]`)

- **Priority:** P2
- **Request:** One job holds `contents: write`, the Airtable PAT and the Cloudinary
  secret while running `npm ci || npm install`; actions are pinned to mutable major tags;
  `main` and `data` are unprotected
  (`.github/workflows/sync-data.yml:20-21,28,34,40,56-60,69-73`). CI runs EOL Node 20
  with no `engines`/`.nvmrc` (`:36`).
- **Approach:** Pin actions to commit SHAs; split read-only build from a minimal-secret
  deploy; `persist-credentials: false`; use `npm ci` alone; protect `main` and `data`
  with rulesets; move to Node 24/26 with `engines` + `.nvmrc`; make the Airtable token
  read-only and scope the Cloudinary key to upload.
- **Verify:** `gh api .../branches/main/protection` is no longer 404; a direct push to
  `main` is rejected; the workflow diff shows SHA pins; CI `node -v` is 24/26; a
  dependency install without a lockfile fails.
- **Audit:** F-04, F-12 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: none.

## 9. Retain publish history and add rollback (`[ ]`)

- **Priority:** P2
- **Request:** Every publish is a new orphan commit force-pushed to `data`
  (`.github/workflows/sync-data.yml:104,117`); there is no diff, no `git revert`, no
  retained snapshot and no one-click rollback. The previous head is recoverable only if
  someone recorded its SHA.
- **Approach:** Commit on top of `data` instead of orphaning it, or tag each publish and
  retain N snapshots as artifacts; add a `rollback` `workflow_dispatch` input; update
  `docs/MAINTENANCE.md` to match.
- **Verify:** `git log origin/data` has more than one commit; a rollback dispatch
  restores a prior tag in a scratch test; the audit's "no in-branch history" note no
  longer applies.
- **Audit:** F-11 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** S–M

**Relations**: supersedes the rollback half of #1.

## 10. Credential hygiene and disclosure process (`[ ]`)

- **Priority:** P2
- **Request:** Live credentials sit in `.env.local` (mode 644) and an identical copy in
  a local `stash@{1}`; there is no `SECURITY.md`, rotation/incident runbook, or private
  disclosure channel. The dormant Instagram uploader would publish a raw asset
  containing an `accessToken` if its input file were restored
  (`scripts/upload-instagram-data.mjs:47-76`).
- **Approach:** Rotate the Airtable and Cloudinary credentials; `git stash clear`; move
  secrets to Keychain/1Password; add `SECURITY.md` with a contact and response
  commitment; write a one-page stolen-laptop/rotation runbook. Fix or remove the
  Instagram uploader: strip `instagram.accessToken`, use `access_mode: 'authenticated'`,
  clean up in `finally`, gitignore both filenames.
- **Verify:** `git stash list` is empty; no `.env*` blob is reachable from any ref;
  `SECURITY.md` exists; the Instagram script refuses a payload containing
  `accessToken` (unit test).
- **Audit:** F-15, F-09 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** S

**Relations**: none.

## 11. Slug uniqueness and non-Latin titles (`[ ]`)

- **Priority:** P3
- **Request:** `makeSlug` calls `slugify` only (`scripts/lib/airtable-helpers.mjs:136-140`);
  `makeUniqueSlug` exists but is used only by tests. Duplicate titles produce duplicate
  `/work/<slug>` URLs and duplicate sitemap entries; CJK/Arabic/Hebrew titles all become
  `untitled` (`scripts/utils/generators/slugify.mjs:16,24`). Current data has 0 collisions.
- **Approach:** Call `makeUniqueSlug` with a per-run `Set` and the record ID as fallback;
  transliterate or suffix non-Latin slugs; assert uniqueness before writing.
- **Verify:** Fixture with two identical titles and a Japanese title → unique, non-empty
  slugs; sitemap has no duplicate `<loc>`.
- **Audit:** F-16 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** S

**Relations**: relates to #8 (add the fixture there).

## 12. Repo hygiene batch (`[ ]`)

- **Priority:** P3
- **Request:** 11 unreferenced TypeScript files (2,225 lines), three tracked `.DS_Store`
  files, a 466-line `run_log.txt`, no `LICENSE` despite `"license": "ISC"`, and
  `normalizeTitle` mangling acronyms/brands ("TEDx"→"Tedx", "Gilley UK"→"Gilley Uk").
- **Approach:** Delete the `.ts` twins and the dead Instagram step/script; `git rm
  --cached` the `.DS_Store` files; delete `run_log.txt`; add a `LICENSE`; stop
  lower-casing the whole title (trim only, or a smart title-case with exceptions).
- **Verify:** `git ls-files | rg 'DS_Store|run_log'` → 0; `rg` finds no imports of the
  deleted `.ts` files; `npm run sync:data` still produces the same project set; titles
  keep their casing.
- **Audit:** CODE-06, CODE-09 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** S

**Relations**: none.

## 13. Decide and document the historical schema exposure (`[ ]`)

- **Priority:** P3
- **Request:** `docs/airtable-schema.json` was deleted in `e4ca46f` ("contains business
  fields") but remains public at `53796f7`/`e4ca46f^`: 59,583 bytes of field names,
  formulas and select choices including rate, invoice and client-contact fields. No
  records, PII values or credentials.
- **Approach:** Choose one: rewrite history with `git filter-repo` (0 forks) and ask
  GitHub Support to purge cached views; or accept and document the residual exposure in
  `docs/SCHEMA.md`. Either way, add a pre-commit guard for business-schema files.
- **Verify:** The decision is recorded; `git log --all -- docs/airtable-schema.json`
  either finds nothing or the documented acceptance note exists; a commit attempting to
  add the file is blocked.
- **Audit:** F-10 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** M

**Relations**: none.
