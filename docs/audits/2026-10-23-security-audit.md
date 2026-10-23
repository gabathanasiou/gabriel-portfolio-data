# Security & Production-Readiness Audit — gabriel-portfolio-data — 2026-10-23

> Agent-assisted audit of commit `713b6e6` (`main`). Read-only: no code in the
> target was modified by this audit. **This is not a penetration test** — findings
> come from source, configuration, git history, GitHub API metadata and tool
> output, not live exploitation. Standards referenced: OWASP ASVS 5.0.0, OWASP
> Top 10, NIST SSDF. Prior audit: none.

## 1. Summary

**Scoreboard:** ✅ 14 · 🟡 26 · ❌ 27 · ⬜ 81 (of 148 checklist items)

**Top findings**

| # | Finding | Severity | Priority | Blocks |
|---|---|---|---|---|
| F-01 | Public `cloudinary-mapping.json` exposes 117 project titles that appear in neither portfolio | Medium | P2 | next publish |
| F-02 | Journal rich text reaches `dangerouslySetInnerHTML` with no sanitization (stored XSS sink) | Medium | P2 | next publish |
| F-03 | Cloudinary failures silently publish expiring Airtable image URLs while the job stays green | Medium | P2 | next publish |
| F-04 | CI grants `contents: write` + CMS/CDN secrets to broad steps, with mutable action tags | Medium | P2 | client/security review |
| F-05 | The documented `git add .` hotfix on the ignore-less `data` branch can publish live credentials | Medium | P1 | next publish |
| F-06 | No publish gate: an empty/misconfigured Airtable read can blank the site and overwrite the last good data | Medium | P2 | next publish |
| F-07 | Cloudinary cache is keyed by gallery index — replaced/reordered images serve the old picture, permanently | Medium | P2 | next publish |
| F-08 | No automated sync has ever run; published data is 230 days stale, with no freshness alert | Medium | P2 | next publish |

**Verdict:** No Critical or High findings, and nothing here is exploitable by an
anonymous visitor — this is a static, single-tenant data pipeline with no accounts,
payments or customer PII. The real risks are (a) public artifacts leaking more than
intended, (b) a publish path with no validation and no safety net, and (c) a
documented hotfix procedure that can publish credentials. Fix F-01, F-02, F-03 and
F-05 before the next publish; none is larger than a day's work.

## 2. Scope & method

- **Mode:** full — the whole repository, all 148 checklist items.
- **Audited:** 41 tracked files at `713b6e6` (`main`), the sole workflow
  `.github/workflows/sync-data.yml`, all `scripts/**` and `docs/**`, full git
  history across all refs, the published `origin/data` branch, and GitHub
  repository settings via `gh api`. The sibling frontend
  `../gabriel-portfolio` (commit `a75c53a`) was read **only** to confirm the
  consumer-side impact of the data this pipeline publishes.
- **Excluded / not available:** Airtable and Cloudinary dashboards, GitHub
  organisation/enterprise settings, DNS/TLS configuration, the frontend's own
  code and deployment. `node_modules` was not audited. No live exploitation,
  no writes to any provider.
- **Tools run:** `npm audit --json` → 0 advisories across 3 prod deps;
  `npm outdated --json` → cloudinary 2.9.0 vs 2.11.0, dotenv 16.6.1 vs 18.0.9;
  `git rev-list --objects --all` + `git cat-file` (history/blob inventory);
  `git log --all -S '<token prefix>'` → 0 hits; `rg` sweeps for
  `eval(`, `new Function(`, `child_process`, `innerHTML`,
  `dangerouslySetInnerHTML`, token prefixes (`eyJ`, `sk-`, `AKIA`, `ghp_`,
  `pat…`, private-key headers) → no secret values in public history;
  `gh api` for workflow runs, branch protection, rulesets, secret-scanning
  alerts and repository features; `node -e` snippets to exercise slug and
  cache-decision logic.
- **Not available:** `gitleaks`, `trufflehog`, `osv-scanner` and `vitest` are
  not installed in the repo — see §6. Secret detection was therefore a manual
  pattern + history pass, not a dedicated scanner.
- **Method:** three parallel subagents swept the ten domains
  (AUTH+DATA, SEC, OPS, TEST+BILL+API+AI, UX+CODE); six independent parallel
  verifiers then attempted to disprove every Medium+ candidate, with the source
  lines and the claim rather than the finder's narrative. The lead re-read every
  cited line for each published finding and re-ran the GitHub API checks
  independently. No inline fallback was used for either phase.
- **Deployment reality:** public static-content pipeline for a personal
  portfolio. No user accounts, no database, no server/API, no money, no model
  calls. Severity is calibrated to that, not to a multi-tenant SaaS.

## 3. Domain scoreboard

| Domain | ✅ | 🟡 | ❌ | ⬜ | Notes |
|---|---|---|---|---|---|
| Identity & access (14) | 0 | 1 | 0 | 13 | No auth surface at all; Airtable/GitHub own identity |
| Data layer (21) | 5 | 4 | 2 | 10 | No DB; output correctness issues in F-06/F-07 |
| Application security (24) | 2 | 5 | 6 | 11 | Stored-XSS sink, secret-hygiene footguns, no disclosure policy |
| Infrastructure & ops (31) | 2 | 7 | 9 | 13 | No test gate, no rollback, no monitoring, EOL runtime |
| Testing & QA (8) | 0 | 1 | 3 | 4 | 103 tests that cannot run |
| Billing & commerce (8) | 0 | 0 | 0 | 8 | No billing surface |
| API & webhooks (8) | 0 | 1 | 2 | 5 | Consumer only; no retries/response validation |
| AI features (8) | 0 | 0 | 0 | 8 | No model calls |
| UX & product surface (10) | 1 | 1 | 1 | 7 | No UI in this repo; payload is tiny |
| Codebase & process (16) | 4 | 6 | 4 | 2 | Readable code; dead code and one-person bus factor |

## 4. Findings

Ordered by severity.

### F-01 — Public Cloudinary mapping exposes 117 unpublished project titles · Medium · P2 · verified

- **Where:** `scripts/lib/sync-logic.mjs:587-600` (mapping is built for every
  record), `:297-299` (visibility filter applied only to `portfolio-data.json`),
  `.github/workflows/sync-data.yml:101,111` (mapping pushed to `data`).
- **What:** `syncImagesToCloudinary` writes `{recordId, title, images}` for all
  216 Projects records before the `Display Status` filter runs, so the public
  `cloudinary-mapping.json` names every project in the base — including hidden
  and role-filtered work.
- **Reachability:** Anyone, unauthenticated. Both
  `raw.githubusercontent.com/.../data/cloudinary-mapping.json` and
  `cdn.jsdelivr.net/gh/...@data/cloudinary-mapping.json` return 200.
- **Impact:** 216 mapping records vs 89 unique published project IDs → **127
  mapping-only records / 120 unique titles**, of which **117 titles appear in
  neither portfolio**. The names include unreleased/NDA-shaped client and
  internal work (e.g. `Miss the Kiss - Prep/Week 1–5`, `LAIR Prep/Pickups`,
  `Talon IP licence`, grant records). One hidden record (`Bar Knights`) also has
  its Cloudinary image publicly served. Airtable record IDs are exposed too.
- **Evidence:** `git show origin/data:cloudinary-mapping.json` → 216 entries,
  all with `title`; `directing` 42 + `postproduction` 75 with 28 overlaps = 89
  unique IDs; set difference = 127. `run_log.txt:166` independently logs
  "Fetched: 216 projects".
- **Fix:** publish only published record IDs (filter the mapping with the same
  visibility/role rules), drop `title` from the public artifact, and keep the
  full cache in a private Actions artifact or secret store. If titles were
  confidential, purge the current `data` history and CDN cache.
- **Effort:** S (one filter + a regression test asserting mapping ⊆ published).
- **Verification:** independent verifier confirmed counts and public URLs,
  noting the "hidden" label is partly inferred because role-filtered records are
  also absent; 117 titles are absent from both portfolios regardless.
  Confidence 9/10.

### F-02 — Journal rich text reaches `dangerouslySetInnerHTML` unsanitized · Medium · P2 · verified

- **Where:** `scripts/lib/sync-logic.mjs:435` (`content = f['Content']`),
  `:461` (written to the public JSON); consumer:
  `../gabriel-portfolio/src/utils/markdown.ts:6,21` and
  `src/components/views/BlogPostView.tsx:144`.
- **What:** The pipeline treats Airtable `Content` (declared `richText`, "HTML/
  Markdown body" in `docs/SCHEMA.md:48`) as an opaque string. The frontend's
  `parseMarkdown` starts from the raw string, interpolates markdown link
  destinations unescaped into `href="…"`, and renders the result with
  `dangerouslySetInnerHTML`. `escapeHtml` exists at
  `scripts/utils/helpers/textHelpers.mjs:68` but has **zero callers**.
- **Reachability:** Requires Airtable base write (owner or a shared editor), the
  `AIRTABLE_TOKEN`, or write access to the public repo's `data` branch — not an
  anonymous visitor. The next sync publishes the payload to the CDN.
- **Impact:** Persistent same-origin JavaScript for every visitor: phishing
  overlays, redirects, crypto-drainer widgets, defacement. No session theft is
  possible (the site has no auth cookies; localStorage holds only a game high
  score), which is why this is Medium rather than High.
- **Evidence:** `markdown.ts:6` `let html = markdown;` and `:21`
  `<a href="$2" …>`; `BlogPostView.tsx:144`
  `<div dangerouslySetInnerHTML={{ __html: parseMarkdown(post.content) }} />`;
  no CSP or sanitizer in the frontend or `netlify.toml` (search → 0 hits).
- **Fix:** sanitize at the pipeline boundary (allowlist tags/attributes, reject
  `javascript:`/`data:` URLs) *and* render with a safe markdown parser or
  DOMPurify; add a CSP. Sanitizing only in the editor is insufficient because
  the `data` branch is a second writer.
- **Effort:** S–M (pipeline sanitizer + frontend render change + CSP).
- **Verification:** independent verifier confirmed the sink and the missing
  controls; rated "Medium as the upper bound, Medium-Low if the threat model
  excludes the owner". Confidence 9/10.

### F-03 — Cloudinary failures publish expiring Airtable URLs with a green job · Medium · P2 · verified

- **Where:** `scripts/utils/cloudinary/cloudinaryHelpers.mjs:87-92` (upload error
  swallowed), `:113-120` (any non-404 error is treated as "missing"),
  `scripts/lib/sync-logic.mjs:580-583` (empty URL on failure), `:367-372`
  (fallback to `att.url`), `:646-648` (only logs a count).
- **What:** A rotated/expired Cloudinary key, quota exhaustion, 429 or 5xx is
  indistinguishable from "image not in Cloudinary". The upload then also fails,
  the mapping entry is rewritten with an empty URL, and the gallery falls back to
  the raw Airtable attachment URL.
- **Reachability:** Any Cloudinary admin/upload failure during a sync. No
  attacker needed; a credential rotation is enough.
- **Impact:** Airtable attachment URLs expire in roughly two hours, so every
  image that missed on that run goes dead on the live site while the workflow
  reports success. The previous good mapping entry is overwritten, so the next
  run must re-upload from scratch.
- **Evidence:** `cloudinaryHelpers.mjs:115-120` returns `null` for 401/403/429/5xx;
  `sync-logic.mjs:581-582` returns `{cloudinaryUrl:''}`; `sync-data.mjs` exits 0
  regardless.
- **Fix:** treat only 404 as missing; retry/fail on 401/403/429/5xx; abort the
  publish when `failed > 0` (or hold the previous JSON); assert every emitted
  image URL host is `res.cloudinary.com`.
- **Effort:** S.
- **Verification:** independent verifier confirmed the control flow and the
  Airtable URL lifetime; suggested Medium (arguably High for a visual portfolio).
  Confidence 9/10.

### F-04 — CI over-privilege, mutable action tags and a lockfile fallback · Medium · P2 · verified

- **Where:** `.github/workflows/sync-data.yml:20-21` (`permissions: contents: write`
  workflow-wide), `:28` `actions/checkout@v4`, `:34` `actions/setup-node@v4`,
  `:40` `npm ci || npm install`, `:56-60`/`:69-73` secrets in broad steps,
  `:117` `git push -f`.
- **What:** The single job that installs npm dependencies and runs repository
  code also holds the Airtable PAT, the Cloudinary API secret and a
  `contents: write` token persisted in `.git/config` by checkout. Actions are
  pinned to mutable major tags; `npm ci || npm install` silently falls back to
  resolving fresh versions (within `^` ranges) when the lockfile is stale.
- **Reachability:** Requires a compromised/retagged upstream action, a malicious
  npm install script, or repo write. The token can push to `main` as well as
  `data` — **both branches are unprotected** (GitHub API: `protected:false`,
  rulesets `[]`).
- **Impact:** Exfiltration of the Airtable token (base read/write) and Cloudinary
  key/secret, plus persistent repo write. Blast radius, not likelihood, is the
  issue.
- **Evidence:** workflow lines above; `run_log.txt:39`
  `persist-credentials: true`; `gh api .../branches/main/protection` → 404;
  `gh api .../rulesets` → `[]`.
- **Fix:** pin actions to full commit SHAs; split build (read-only, no secrets)
  from deploy (write, minimal secrets); `persist-credentials: false`; `npm ci`
  alone; scope the Airtable token to read and the Cloudinary key to upload;
  protect `main` and `data`; use a deploy key or GitHub App for the `data` push.
- **Effort:** M (workflow split).
- **Verification:** independent verifier confirmed all mechanics and that
  `contents: write` is genuinely needed today for the force-push; rated Medium.
  Confidence 9/10.

### F-05 — The documented hotfix procedure can publish live credentials · Medium · P1 · verified (partial)

- **Where:** `docs/MAINTENANCE.md:9-26` (`git checkout data`, `git add .`,
  `git push origin data`); `origin/data` tracks **no `.gitignore`**
  (`git ls-tree -r origin/data` → 7 files); `.env.local` (305 bytes, mode 644)
  holds the live Airtable token and Cloudinary key/secret; `.gitignore:3-4`
  protects only `main`.
- **What:** Following the documented procedure leaves ignored files in the
  working tree (they are untracked). With `.gitignore` no longer present on the
  `data` branch, `git add .` stages `.env.local` and `node_modules` (reproduced
  in a scratch clone: `git add -n .` → `add '.env.local'`, `add 'node_modules/…'`).
- **Reachability:** A maintainer following the repo's own documentation after a
  normal checkout. No attacker required.
- **Impact:** Live Airtable and Cloudinary credentials in a public repo. GitHub
  secret-scanning push protection is enabled and recognises the Airtable PAT
  pattern, so that line is likely blocked — but the Cloudinary API key/secret has
  no supported provider pattern, so it would pass. If only that pair leaks, an
  attacker gets full Cloudinary account control (upload/overwrite/delete
  imagery). No leak exists today (`data/.env.local` → 404, 0 secret-scanning
  alerts).
- **Evidence:** `docs/MAINTENANCE.md:22` `git add .`;
  `git ls-tree -r origin/data` → no `.gitignore`; scratch-clone `git add -n .`
  output; `gh api .../secret-scanning/alerts` → `[]`;
  `security_and_analysis.secret_scanning_push_protection: enabled`.
- **Fix:** rewrite the hotfix section to edit Airtable (or apply a committed
  overrides file during sync); replace `git add .` with explicit artifact paths;
  do not keep `.env.local` in a checkout used for data pushes. Treat the
  Cloudinary secret as exposed-adjacent and rotate on the next convenient
  window.
- **Effort:** S (documentation + one command).
- **Verification:** verifier reproduced staging and confirmed push protection
  blocks the Airtable PAT but not Cloudinary; suggested Medium (High if
  bypassed). Confidence 9/10.

### F-06 — No publish gate for empty or misconfigured data · Medium · P2 · verified (latent)

- **Where:** `scripts/lib/sync-logic.mjs:298-299` (blank/Hidden status drops the
  project), `:146-155` (silently falls back to the first Settings row), `:259-273`
  (default config with `domain:''`), `scripts/generate-sitemap.mjs:42` and
  `scripts/generate-robots.mjs:71` (publish `example.com`);
  `.github/workflows/sync-data.yml:82-92` (change gate always true because
  `cloudinary-mapping.json` is always created at `:45-52`).
- **What:** Nothing validates the payload before publishing: no project/post
  count check, no required-field check, no `portfolioId` or domain validation,
  and the "Check for changes" step cannot fail because the mapping file always
  exists.
- **Reachability:** Owner-side misconfiguration: a renamed/cleared
  `Display Status` field, a blank Settings row, a typo in `Portfolio ID`, or a
  valid 200 response with zero records (Airtable returns `{records:[]}`, not an
  error). A wrong token/base returns non-2xx and fails loudly, so that path is
  safe.
- **Impact:** The site can publish `projects: []` (blank portfolio), or one mode
  can inherit the other's config/domain/roles, and the last good snapshot is
  overwritten. Recovery = fix Airtable and rerun; no permanent loss as long as
  Airtable is intact. Currently live data is valid (42/75 projects, correct
  domains), so this is latent.
- **Evidence:** code lines above; `git show origin/data:*/portfolio-data.json`
  shows 42/75 projects and `directedbygabriel.com` / `lemonpost.studio` today.
- **Fix:** compare against the previous published JSON and abort on zero
  projects or a large drop; require both Settings rows and a valid hostname;
  make the gate check content, not directory existence; keep a last-good tag.
- **Effort:** S–M.
- **Verification:** verifier confirmed the paths and rated Medium (not High:
  owner-triggered, low probability, self-healing). Confidence 8/10.

### F-07 — Index-keyed Cloudinary cache permanently serves stale images · Medium · P2 · verified

- **Where:** `scripts/lib/sync-logic.mjs:593-597` (`publicId =
  portfolio-projects-${record.id}-${i}`), `:547-567` (`resolveImage`: cache by
  `publicId::airtableId`, then `checkImageExists(publicId)` and reuse whatever
  exists), `cloudinaryHelpers.mjs:103-121`.
- **What:** Public IDs are positional. Replace an image at index 0 and the cache
  key misses (new `airtableId`), but `checkImageExists` finds the **old** asset
  at the same index-based public ID and returns it — stamping the new
  `airtableId` onto the old URL. `overwrite: true` never runs because the upload
  path is short-circuited.
- **Reachability:** The owner reorders, replaces or inserts a gallery image;
  the next sync.
- **Impact:** The wrong image is published and the mapping is rewritten to
  "confirm" it, so later runs keep serving it. Reorder → old order preserved;
  replace → old picture forever; insert in the middle → every later image stale.
  Appending still works.
- **Evidence:** decision logic traced line by line and simulated; the
  `airtableId` comparison only forces a cache miss, never a refresh.
- **Fix:** key public IDs by attachment ID or content hash (e.g.
  `portfolio-projects-${record.id}-${attachment.id}`); verify the `airtableId`
  on an exists-hit and re-upload when it differs; add a migration for existing
  assets.
- **Effort:** M (public-ID migration).
- **Verification:** independent verifier reproduced the decision path and rated
  Medium. Confidence 10/10.

### F-08 — No automated sync has ever run; data is 230 days stale · Medium · P2 · verified

- **Where:** `.github/workflows/sync-data.yml:10-18` (only
  `repository_dispatch` + `workflow_dispatch`; no `schedule`),
  `origin/data` = one commit dated 2026-03-07.
- **What:** The documented Airtable webhook has never fired. GitHub API:
  **13 runs, all `workflow_dispatch`**, last success 2026-03-07T01:04Z; the
  published `lastUpdated` is 2026-03-07T01:04:41Z. Because the deploy step
  force-pushes a fresh orphan commit every run, "content didn't change" cannot
  explain the stale branch — any successful run would have bumped it.
- **Reachability:** Operational, not adversarial. The Airtable automation lives
  outside this repo and is either unconfigured or broken.
- **Impact:** New Airtable content, sitemap dates and image changes never
  publish; a broken pipeline is invisible because no run occurs. SEO and
  portfolio freshness degrade silently.
- **Evidence:** `gh api .../actions/runs?per_page=50` → `total:13`, all
  `workflow_dispatch`, last `2026-03-07`; `git log origin/data` → `fd54dcf`,
  single root commit.
- **Fix:** add a weekly `schedule` fallback, verify/document the Airtable
  webhook, add a freshness check (`lastUpdated` older than N days → fail and
  alert), and a `concurrency` group.
- **Effort:** S.
- **Verification:** verifier confirmed triggers and the branch date; confidence
  7/10 only because whether the source content also changed is unknowable from
  the repo. The stale-publish fact itself is 10/10.

### F-09 — Instagram backup uploader would publish a token as a public asset · Low · P3 · verified (latent)

- **Where:** `scripts/upload-instagram-data.mjs:47` (reads
  `scripts/instagram-studio-data-backup.json`), `:63-76` (copies then uploads
  with `public_id:'instagram-studio-data'`, `resource_type:'raw'`,
  `type:'upload'`), `.github/workflows/sync-data.yml:75-80` (runs it when the
  file exists).
- **What:** The script uploads the studio backup as a world-readable Cloudinary
  raw asset. The sibling studio schema includes `instagram.accessToken`; its
  tracked sample backup contains a 159-char token (expired 2026-02-02). At HEAD
  the backup file is **absent**, so the step is skipped — this is a latent path,
  not a live exposure.
- **Reachability:** A maintainer restoring/enabling the file and triggering a
  sync. No remote attacker.
- **Impact:** If a fresh backup is ever committed, the access token, account
  identity, drafts and schedule become retrievable from a fixed public URL.
  Currently: no file, expired sample token.
- **Evidence:** script lines above; `git ls-tree -r HEAD` → no backup file;
  workflow guard `[ -f ... ]`.
- **Fix:** strip `instagram.accessToken` before upload; store the token in a
  secret manager; mark the asset `access_mode: 'authenticated'` or remove the
  step; gitignore both filenames; clean up the temp file in `finally`.
- **Effort:** S.
- **Verification:** verifier confirmed the code path and public delivery
  mechanics, and that the current file is absent with an expired sample token.
  Confidence 8/10.

### F-10 — Deleted Airtable business schema is still public in git history · Low · P3 · verified

- **Where:** `docs/airtable-schema.json` added in `53796f7`, deleted in
  `e4ca46f` ("security: remove raw Airtable schema (contains business fields)");
  still reachable at `53796f7` and `e4ca46f^`.
- **What:** The 59,583-byte blob lists 5 tables / 104 fields including `Rate`,
  `Days`, `Discount`, `Expenses`, `Per Diems`, `Invoice Date/ID/PDF`, `Paid`,
  `Tax Year Bracket`, `Client Address/City/Post Code/Email`, plus formulas and
  select choices. **No records, PII values, credentials or base ID** are present.
- **Reachability:** Anyone — `raw.githubusercontent.com/.../53796f7/docs/airtable-schema.json`
  returns 200; jsDelivr serves it at the same SHA; a normal clone carries it.
- **Impact:** Business-process metadata (rate/invoice workflow and client
  contact field design) useful for social engineering. Not credentials or PII.
- **Evidence:** verified public raw URL, 200 / 59,583 bytes; content inventory
  above.
- **Fix:** rewrite history with `git filter-repo`/BFG and force-push (0 forks),
  then ask GitHub Support to purge cached views; otherwise document the residual
  exposure.
- **Effort:** M (history rewrite).
- **Verification:** verifier rated Low/Informational, explicitly rejecting the
  finder's Medium. Confidence 10/10 on retrieval, 9/10 on impact.

### F-11 — Published data has no history, diff or one-click rollback · Low · P3 · verified

- **Where:** `.github/workflows/sync-data.yml:104` (`git checkout --orphan
  data-branch`), `:117` (`git push -f origin data-branch:data`).
- **What:** Every publish replaces the `data` branch with a single root commit,
  so there is no diff, no `git revert`, and no branch history. The previous head
  (`2dddfce`) is still resolvable by SHA from the local clone/GitHub API, but
  only if someone recorded the SHA; there are no tags or retained artifacts.
- **Impact:** A bad publish cannot be inspected or reverted from the branch;
  recovery is "fix the source and rerun", or a manual force-push of a remembered
  SHA. The documented manual hotfix is silently discarded by the next sync.
- **Fix:** commit normally on `data` (or tag each publish and retain N
  snapshots); add a `rollback` dispatch input; stop force-pushing production.
- **Effort:** S–M.
- **Verification:** verifier downgraded "no path at all" to Low: a known prior
  SHA is recoverable. Confidence 9/10.

### F-12 — CI runs an end-of-life Node runtime with no version pin · Low · P2 · verified

- **Where:** `.github/workflows/sync-data.yml:36` `node-version: '20'`;
  `run_log.txt:118` `node: v20.20.0`; no `engines` in `package.json`, no
  `.nvmrc`/`.node-version`; local dev is v26.8.1.
- **What:** Node 20 reached end-of-life on 2026-04-30. The build runtime that
  handles the Airtable/Cloudinary secrets and the write token is therefore
  unpatched. `actions/checkout@v4`/`setup-node@v4` also run on node20.
- **Impact:** No security patches for the engine after April 2026; latent
  breakage when GitHub drops the node20 action runtime; dev/CI divergence
  (26 vs 20).
- **Fix:** move CI to Node 24 (LTS) or 26, add `engines` + `.nvmrc`, and bump
  the actions.
- **Effort:** S.
- **Verification:** verifier rated Low (build-only, trusted inputs), confirmed
  the EOL date and the missing pins. Confidence 10/10.

### F-13 — The 103-case test suite cannot run and is not wired to CI · Low · P2 · verified

- **Where:** `scripts/utils/__tests__/*.test.mjs:1` (import `vitest`);
  `package.json:6-15` (no `test` script, no devDependencies);
  `package-lock.json` (no vitest); `.github/workflows/sync-data.yml:39-64`
  (install + sync, no test step; no PR/push trigger).
- **What:** 103 cases cover four helpers (`fileHelpers` 23, `networkHelpers` 22,
  `slugify` 26, `videoHelpers` 32). Nothing covers `sync-logic`,
  `airtable-helpers`, the sitemap/robots generators or the workflow. A fresh
  clone cannot run the suite through any declared path.
- **Impact:** No regression gate on the code that rewrites the public dataset;
  false assurance from a large-looking test directory.
- **Fix:** add `vitest` + `"test": "vitest run"`, a `pull_request`/`push` CI job,
  and run it before the sync; add tests for the publish path (F-01/F-06/F-07).
- **Effort:** S.
- **Verification:** verifier rated Low (no security impact, real quality gap)
  and counted the cases. Confidence 10/10.

### F-14 — Sitemap/robots interpolate unescaped CMS values; dates are fabricated · Low · P3 · verified

- **Where:** `scripts/generate-sitemap.mjs:43,51-62,72,77,84`;
  `scripts/generate-robots.mjs:39,46`; `escapeHtml` at
  `textHelpers.mjs:68` has no callers.
- **What:** The Airtable `Domain` setting and slugs are interpolated directly
  into XML/text. `lastmod` is "today" for every static page on every sync and
  `${year}-01-01` for every project. The sitemap log line reads
  `portfolioData.articles` while the JSON key is `posts`, so it always reports
  0 articles.
- **Impact:** Someone who can already rewrite all content could inject fake
  `<url>` entries or `Disallow` directives (SEO manipulation). Served as
  `application/xml`/`text/plain` with `nosniff`, so no script execution. The
  fabricated dates tell crawlers everything changed on every run.
- **Fix:** validate `domain` as a hostname, XML-escape every interpolated value,
  strip CR/LF from robots lines, and use real dates (or omit `lastmod`).
- **Effort:** S.
- **Verification:** verifier confirmed the mechanism and rated Low. Confidence
  8/10.

### F-15 — Local credential hygiene and no disclosure/incident path · Low · P3 · verified

- **Where:** `.env.local` (305 bytes, mode 644); `git stash list` → `stash@{1}`
  contains an identical `.env.local` blob `0f1f5c8` (untracked, not on any
  remote); no `SECURITY.md`; no rotation/incident runbook.
- **What:** Live credentials sit in plaintext on disk and survive in a local
  stash after the working file is deleted; there is no private vulnerability
  channel and no documented revocation procedure for a stolen laptop or a leaked
  token.
- **Impact:** Local/device compromise yields the CMS and media account; the
  stash copy defeats ordinary cleanup. Not publicly reachable.
- **Fix:** rotate the Airtable and Cloudinary credentials, `git stash clear`,
  move secrets to Keychain/1Password, add `SECURITY.md` with a contact, and
  write a one-page rotation runbook.
- **Effort:** S.
- **Verification:** verifier confirmed the stash contents and that no remote ref
  reaches them; rated Low/Hardening. Confidence 9/10.

### F-16 — Slug collisions and non-Latin titles are unhandled · Low · P3 · verified (latent)

- **Where:** `scripts/lib/airtable-helpers.mjs:136-140` (calls `slugify`, not
  `makeUniqueSlug`), `scripts/utils/generators/slugify.mjs:16,24`
  (`[^a-z0-9]+` → `-`, empty → `untitled`); `makeUniqueSlug` at `:27` is used
  only by tests.
- **What:** Two records with the same normalized title produce identical
  `/work/<slug>` URLs and duplicate sitemap entries; any CJK/Arabic/Hebrew title
  becomes `untitled`. Current published data has **0 duplicate slugs and 0
  `untitled`** (42 + 75 projects), so this is latent.
- **Impact:** One project becomes unreachable or ambiguous; duplicate `<loc>`
  entries. Low until a collision happens.
- **Fix:** call `makeUniqueSlug` with a per-run `Set` and the record ID as
  fallback; transliterate or suffix non-Latin slugs; assert uniqueness before
  writing.
- **Effort:** S.
- **Verification:** verifier reproduced the slug outputs and confirmed no live
  occurrence; rated Low. Confidence 9/10.

### F-17 — Overlapping dispatch runs can overwrite a newer publish · Low · P3 · verified

- **Where:** `.github/workflows/sync-data.yml:10-18` (no `concurrency:`),
  `:117` (`git push -f`, no `--force-with-lease`).
- **What:** Two runs (duplicate webhook, manual trigger during a run, retry) fetch
  Airtable independently and the last push wins. The slower/older run can
  replace a newer dataset. No run-order or `lastUpdated` comparison exists.
- **Impact:** Stale projects/config and a stale Cloudinary mapping until the next
  sync — which, per F-08, may be months away. Recoverable by rerunning.
- **Fix:** add `concurrency: {group: sync-data, cancel-in-progress: false}` and
  skip the push when the run's timestamp is older than the branch's
  `lastUpdated`; use `--force-with-lease`.
- **Effort:** S.
- **Verification:** verifier confirmed the missing guard and that no historical
  overlap occurred, but the window is real. Confidence 9/10.

### F-18 — No retry or timeout on third-party calls · Low · P3 · verified

- **Where:** `scripts/lib/airtable-helpers.mjs:27-47` (raw `fetch`, 429 throws);
  `scripts/utils/helpers/networkHelpers.mjs:108-126` (`retryWithBackoff` exists,
  no production call site); `scripts/utils/videoHelpers.mjs:67-82,152,168`
  (oEmbed fetches without timeout); `sync-data.yml:45` (`curl -sL` without
  `--max-time`).
- **What:** One Airtable 429/5xx or a hung oEmbed call aborts the run. The abort
  is loud and safe (no partial publish), but there is no retry and no failure
  notification.
- **Impact:** A transient upstream blip leaves the site stale until someone
  notices; five parallel table fetches sit exactly at Airtable's 5 req/s/base
  limit.
- **Fix:** wrap calls in `fetchWithTimeout` + `retryWithBackoff` with jitter and
  `Retry-After`; bound concurrency; add `--max-time` to curl; add an
  `if: failure()` notification.
- **Effort:** S.
- **Verification:** verifier rated Low (robustness, not integrity) and confirmed
  the helper is unused outside tests. Confidence 9/10.

## 5. Checklist verdicts

### A. Identity, accounts & access

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| AUTH-01 | 🟡 | `docs/SCHEMA.md:11-114` | Coherent 5-table model, but finance/client fields share the Projects table and there is no field allowlist |
| AUTH-02 | ⬜ | `scripts/lib/sync-logic.mjs:231`; `rg -i 'login\|password\|mfa\|sso\|saml\|scim' scripts` → 0 hits | No login; contact email is copied verbatim |
| AUTH-03 | ⬜ | no auth code | No passwords/reset flow |
| AUTH-04 | ⬜ | no auth code | No MFA |
| AUTH-05 | ⬜ | no auth code | No sessions |
| AUTH-06 | ⬜ | no auth code | No SSO |
| AUTH-07 | ⬜ | no auth code | No SAML |
| AUTH-08 | ⬜ | no auth code | No SCIM; GitHub/Airtable account management is platform-provided |
| AUTH-09 | ⬜ | `scripts/lib/sync-logic.mjs:303-307` | `Allowed Roles` is editorial filtering, not authorization |
| AUTH-10 | ⬜ | no user records | No per-user data |
| AUTH-11 | ⬜ | `scripts/lib/sync-logic.mjs:50` | Single-tenant by design |
| AUTH-12 | ⬜ | no impersonation code | Owner edits Airtable/`data` directly |
| AUTH-13 | ⬜ | no login endpoint | Provider-side limits |
| AUTH-14 | ⬜ | no login endpoint | No lockout policy |

### B. Data layer & correctness

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| DATA-01 | ⬜ | no migration files | Schema lives in Airtable; output is derived |
| DATA-02 | ⬜ | `package.json:13-16` | No database |
| DATA-03 | ⬜ | `airtable-helpers.mjs:20-49` | No DB indexes; full lookup tables fetched in memory |
| DATA-04 | ⬜ | `sync-logic.mjs:62-68` | No pool; 5 parallel Airtable calls (rate limit risk in OPS-11) |
| DATA-05 | ❌ | `.github/workflows/sync-data.yml:10-18`; `git log origin/data` → 1 commit | No backup of published snapshots |
| DATA-06 | ❌ | `rg -i 'backup\|restore' scripts docs` → no restore | No tested restore/runbook |
| DATA-07 | ⬜ | no DB | Airtable PITR is platform-provided |
| DATA-08 | 🟡 | `sync-logic.mjs:298-299` vs `:587-600` | Hidden filter hides JSON, but the mapping still exposes titles (F-01) |
| DATA-09 | 🟡 | `sync-logic.mjs:146-155,298-299`; `generate-sitemap.mjs:42` | No schema/count/domain validation before publish (F-06) |
| DATA-10 | ✅ | `sync-logic.mjs:58,312-315`; `generate-sitemap.mjs:45,72` | Date-only strings; UTC `lastUpdated`; no timezone bug |
| DATA-11 | ✅ | `textHelpers.mjs:26-63`; live data | Apostrophes and curly quotes round-trip |
| DATA-12 | 🟡 | `slugify.mjs:16`; `sync-logic.mjs:395,459` | JSON preserves Unicode; slugs drop non-ASCII; no RTL content today |
| DATA-13 | ⬜ | `docs/SCHEMA-FULL.local.md:37-53` | No money in output |
| DATA-14 | ⬜ | same | No currency/tax logic |
| DATA-15 | ⬜ | `sync-logic.mjs:63-67,184` | Single-tenant; hardcoded tables, exactly two modes |
| DATA-16 | ✅ | `sync-logic.mjs:547-583,656-674` | Deterministic public IDs + cache-first reruns |
| DATA-17 | ⬜ | no submit endpoint | Duplicate records are not deduped (F-16) |
| DATA-18 | ✅ | `airtable-helpers.mjs:27-47` | Airtable offset pagination implemented |
| DATA-19 | ✅ | `sync-logic.mjs:120-132`; `generate-sitemap.mjs:40-90` | Public JSON + sitemap is the export |
| DATA-20 | ⬜ | no CSV/import code | Ingestion is the Airtable API |
| DATA-21 | 🟡 | no `destroy`/delete calls in `scripts` | No retention/deletion; Cloudinary assets persist (SEC-22) |

### C. Application security & compliance

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| SEC-01 | 🟡 | `.gitignore:3-4`; `git log --all -S '<token>'` → 0; `.env.local` + local stash | No secret in public history; local plaintext + stash copy (F-15) |
| SEC-02 | ⬜ | no rotation record | Cannot verify AI-chat exposure or rotation |
| SEC-03 | ✅ | `package-lock.json:16-45` | 3 packages exist on npm; integrity hashes match |
| SEC-04 | 🟡 | `npm audit` → 0; `security_and_analysis.dependabot_security_updates: disabled` | Clean today, unmonitored tomorrow |
| SEC-05 | ❌ | `sync-logic.mjs:435`; `generate-sitemap.mjs:43`; `generate-robots.mjs:39` | CMS HTML/domain flow to artifacts unsanitized (F-02/F-14) |
| SEC-06 | ❌ | `sync-logic.mjs:435,461`; frontend `BlogPostView.tsx:144` | Stored XSS; no SQL/CSRF surface |
| SEC-07 | ⬜ | `cloudinaryHelpers.mjs:61-86` | No end-user uploads; operator-controlled attachments |
| SEC-08 | ✅ | jsDelivr `access-control-allow-origin: *` | Intentional; all artifacts are public and credential-free |
| SEC-09 | 🟡 | jsDelivr `nosniff`/HSTS; no CSP in frontend `netlify.toml` | CDN headers OK; consumer has no CSP |
| SEC-10 | 🟡 | `cloudinaryHelpers.mjs:142-147` (`secure:true`); live HSTS | HTTPS everywhere; local plaintext; provider at-rest unverified |
| SEC-11 | ❌ | `sync-data.yml:20-21,28,34,40,56-60,69-73` | Workflow-wide write token, broad secrets, tag-pinned actions (F-04) |
| SEC-12 | 🟡 | `run_log.txt:147-151` (masked `***`) | Secrets masked; no actor trail; raw run log committed |
| SEC-13 | ⬜ | no pen-test evidence | Not proportionate for a static pipeline; no server/auth surface |
| SEC-14 | ⬜ | no questionnaire/evidence pack | No enterprise customers |
| SEC-15 | ❌ | `find . -iname 'SECURITY*'` → none | No private disclosure channel (F-15) |
| SEC-16 | ❌ | `.env.local` mode 644; no runbook | No stolen-laptop/credential-revocation plan (F-15) |
| SEC-17 | ⬜ | no SOC 2 evidence | No multi-tenant service |
| SEC-18 | ⬜ | no PHI | Not applicable |
| SEC-19 | ⬜ | no model/PHI vendor | Not applicable |
| SEC-20 | ⬜ | public data only | Airtable audit logging is platform-provided |
| SEC-21 | ⬜ | no payment flow | No card data |
| SEC-22 | ❌ | `cloudinaryHelpers.mjs:61-86`; `sync-data.yml:117` | Deletion does not reach git history, Cloudinary or CDN caches |
| SEC-23 | ⬜ | public CDN artifacts | Residency is a provider term, not configured here |
| SEC-24 | ⬜ | single maintainer | No review process; token scopes unverified |

### D. Infrastructure, ops & supply chain

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| OPS-01 | 🟡 | `sync-data.yml:36`; `docs/MAINTENANCE.md:50-54` | No staging; local sync writes the production base/cloud; Node 20 vs local 26 |
| OPS-02 | 🟡 | `sync-data.yml:10-13`; `README.md:44` | Workflow is code; webhook + secrets setup is manual and undocumented |
| OPS-03 | ❌ | `sync-data.yml:39-64`; `package.json:6-11` | No test step, no PR CI (F-13) |
| OPS-04 | ❌ | `sync-data.yml:104,117`; `origin/data` = 1 root commit | No one-click rollback (F-11) |
| OPS-05 | ✅ | `sync-data.yml:117`; jsDelivr `s-maxage` | Ref update is atomic; CDN serves the old commit until the new one lands |
| OPS-06 | 🟡 | `sync-logic.mjs:206-224,284,297-299` | Airtable content toggles; no code-level flags |
| OPS-07 | ⬜ | `sync-data.yml:25` | GitHub-hosted runners + CDN scale; no origin fleet |
| OPS-08 | ✅ | `sync-data.yml:45,127-133`; `README.md:50-55` | jsDelivr serves both portfolios |
| OPS-09 | ⬜ | `rg -i 'dns\|certbot\|acme'` → none | DNS/TLS live with the frontend host/jsDelivr |
| OPS-10 | ⬜ | no queue code | Batch job off the request path |
| OPS-11 | ❌ | `airtable-helpers.mjs:31-47`; `retryWithBackoff` unused | No retry/timeout (F-18) |
| OPS-12 | ⬜ | no queue | No dead-letter surface; failed runs retained in Actions |
| OPS-13 | ⬜ | no `schedule`; no `concurrency` | No cron; overlapping dispatch is F-17 |
| OPS-14 | 🟡 | `sync-data.yml:45-52,120-134`; `max-age=604800` | Purge exists but can fail silently; mapping not purged; 7-day browser cache |
| OPS-15 | ⬜ | `rg -i 'smtp\|sendgrid\|mailgun\|ses'` → none | No transactional email |
| OPS-16 | ⬜ | same | No bounces/complaints |
| OPS-17 | 🟡 | `git count-objects -vH` → 890 KiB; no `destroy` | Repo history small; Cloudinary assets never pruned |
| OPS-18 | ⬜ | no provisioning | Provider-side budgets only |
| OPS-19 | ❌ | `rg -i 'disaster\|restore\|backup'` → no plan | No written/tested DR (DATA-05/06) |
| OPS-20 | ⬜ | no origin region | CDN is multi-POP |
| OPS-21 | ❌ | `sync-logic.mjs:57,69`; `sync-data.mjs:46-59` | Plain console logs; Actions retention only |
| OPS-22 | ❌ | no Sentry/Datadog/Rollbar | No error grouping or alert routing |
| OPS-23 | ❌ | no freshness/uptime check | Data 230 days stale; nobody noticed (F-08) |
| OPS-24 | ❌ | `sync-data.yml` has no `if: failure()` | A failed or missing sync pages no one |
| OPS-25 | 🟡 | Actions run list; `run_log.txt` | Pass/fail/duration only; no dashboard |
| OPS-26 | ⬜ | single Node process | No distributed path to trace |
| OPS-27 | ⬜ | single maintainer | No rotation exists |
| OPS-28 | 🟡 | `docs/MAINTENANCE.md:9-62` | Ops basics present; rollback advice wrong; no failure/rotation runbook |
| OPS-29 | ⬜ | no postmortems | Commit history is the only record |
| OPS-30 | ⬜ | no status page | No customers/SLA |
| OPS-31 | ❌ | `sync-data.yml:36`; `run_log.txt:118` | Node 20 is EOL; no engines/.nvmrc (F-12) |

### E. Testing & QA

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| TEST-01 | ❌ | `scripts/utils/__tests__/*.test.mjs`; `package.json:6-15` | 103 helper cases, unrunnable; core pipeline untested (F-13) |
| TEST-02 | ❌ | no nock/msw/supertest; live calls at `airtable-helpers.mjs:31`, `videoHelpers.mjs:152` | No integration tests |
| TEST-03 | ⬜ | no money flow | Not applicable |
| TEST-04 | ⬜ | no load tooling | No traffic surface here |
| TEST-05 | 🟡 | inline literals in tests; `fileHelpers.test.mjs:255-275` | No Airtable-shaped fixtures; one test writes `public/` |
| TEST-06 | ❌ | `git log --diff-filter=A -- scripts/utils/__tests__` → 1 commit | No regression tests on past fixes |
| TEST-07 | ⬜ | no browser code | Frontend concern |
| TEST-08 | ⬜ | no HTML/templates | No accessibility surface |

### F. Billing & commerce

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| BILL-01..08 | ⬜ | `rg -i 'stripe\|payment\|invoice\|billing\|subscription\|vat\|refund\|dunning\|proration\|revenue' scripts package.json` → only a test string | No billing surface; historical Airtable invoice fields were never read by this pipeline |

### G. API, integrations & webhooks

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| API-01 | ⬜ | `sync-data.yml:10-12`; no server code | No webhook receiver; GitHub dispatch is platform-authenticated |
| API-02 | ❌ | `retryWithBackoff` unused; no failure step | Consumer-side retries/notification absent (F-18) |
| API-03 | ⬜ | `sync-logic.mjs:126`; `README.md:59-62` | Not a provider; version string only, moving `@data` ref |
| API-04 | ⬜ | no key-management code | No customer keys |
| API-05 | 🟡 | `airtable-helpers.mjs:36-40` | 429 aborts; no `Retry-After` handling |
| API-06 | ❌ | `airtable-helpers.mjs:44-46`; `sync-logic.mjs:298-299` | No response validation; a renamed field publishes an empty site (F-06) |
| API-07 | ⬜ | static Bearer PAT / key+secret | No OAuth refresh flow |
| API-08 | ⬜ | `sync-data.yml:13-18` | No customer integrations; `skipFileWrites` has no caller |

### H. AI features

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| AI-01..08 | ⬜ | `rg -i 'openai\|anthropic\|langchain\|huggingface\|gpt\|claude\|gemini\|embedding' scripts package.json .github docs` → 0 hits | No model calls, prompts or agent actions in this repo |

### I. UX & product surface

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| UX-01 | ✅ | `origin/data` payloads ~17-20 KB gzipped behind jsDelivr | Tiny static payload |
| UX-02 | ⬜ | no `.tsx/.html/.css` tracked | No screens here |
| UX-03 | 🟡 | `sync-data.mjs:35-40` good; `sync-data.yml:40,127-133` masks CI failures | Local errors specific; CI can report success on masked failures |
| UX-04 | ⬜ | no forms | Content entry is Airtable |
| UX-05 | ⬜ | no email code | No transactional email |
| UX-06 | ⬜ | no notifications | Only GitHub's run email |
| UX-07 | ❌ | `sync-data.yml:104,117` | Published data has no undo/history (F-11) |
| UX-08 | ⬜ | no UI files | Frontend concern |
| UX-09 | ⬜ | no i18n code | Single-locale content |
| UX-10 | ⬜ | no router | Frontend concern |

### J. Codebase & process

| ID | Verdict | Evidence | Note |
|---|---|---|---|
| CODE-01 | ✅ | largest file 678 lines; 41 tracked files; clear `lib`/`utils` split | Readable |
| CODE-02 | ❌ | 0 merged PRs; `main` unprotected | Direct pushes, no review, no PR CI |
| CODE-03 | 🟡 | `README.md:15-39`; `sync-data.yml:104,117` | main/data split documented; `data` is rebuilt; stale local branch |
| CODE-04 | ❌ | cloudinary 2.9.0 vs 2.11.0; dotenv 16 vs 18; Dependabot disabled | Two majors behind on dotenv |
| CODE-05 | 🟡 | `sync-data.yml:36` | Node 20 EOL (F-12) |
| CODE-06 | ❌ | 11 unreferenced `.ts` files (2,225 lines); dead Instagram step; `run_log.txt` | Dead code and stale twins |
| CODE-07 | ✅ | max 678 lines; no project line rule | Not a monolith by the 2,000-line bar |
| CODE-08 | 🟡 | `README.md:7-13` | Pipeline rationale exists; no ADRs for load-bearing choices |
| CODE-09 | 🟡 | `README.md:46-55` | Accurate architecture; no `.env.example`, no Node pin; "main strictly source" false (`run_log.txt`, `.DS_Store`) |
| CODE-10 | 🟡 | `docs/SCHEMA.md` good; `docs/MAINTENANCE.md:9-26` wrong | Inheritance docs exist but the hotfix runbook is misleading |
| CODE-11 | ✅ | `docs/SCHEMA.md:1-8` | Airtable is the admin panel |
| CODE-12 | ⬜ | no support function | One-person portfolio |
| CODE-13 | ⬜ | no CHANGELOG | No customer-facing releases |
| CODE-14 | 🟡 | GA4 id published (`sync-logic.mjs:220`); no privacy route in frontend | Analytics enabled without a matching notice |
| CODE-15 | ✅ | repo/domain/CDN under the owner's identity | Ownership matches reality |
| CODE-16 | ❌ | `git shortlog -sne` → 27 owner, 2 bot | Bus factor 1 |

## 6. Could not verify

- **Airtable PAT scope, expiry and base sharing** — no provider console access.
  Credential liveness was confirmed only with read-only metadata calls; no
  writes and no scope probing.
- **Cloudinary key permissions, quotas, plan and at-rest encryption** —
  provider-side, not in the repo.
- **Whether the Airtable webhook automation is configured** — it lives outside
  this repo. GitHub shows 0 `repository_dispatch` runs, which proves it has
  never fired, not why.
- **Whether Airtable content changed after 2026-03-07** — staleness of the
  published artifact is proven; source drift is not visible here.
- **Airtable backups/PITR and audit-log retention** — plan-dependent.
- **Whether the 117 mapping-only titles are confidential/NDA material** — a
  business judgement; the report treats them as unintended disclosure because
  they bypass an explicit visibility control.
- **jsDelivr POP-by-POP purge propagation and purge success** — the API returned
  200 and cache headers were observed, but global propagation was not measured.
- **The deployed frontend's headers/CSP** — only the local `netlify.toml` was
  read; production headers were not scanned.
- **The current Instagram token state** — the studio backup is absent here; the
  sibling sample token is expired.
- **Whether any clone or fork retains the pre-rewrite schema history** — GitHub
  reports 0 forks, but existing clones are invisible.
- **The exact `ubuntu-latest` image at the next run** — mutable label.
- **`vitest` execution** — the package is not installed and installing is
  prohibited; the 103 cases were not run. Spot-checked slug assertions were
  reproduced manually and passed.
- **Dedicated secret scanners** — `gitleaks`, `trufflehog` and `osv-scanner` are
  not installed; the secret pass was manual (`rg` + `git log -S` + history
  inventory), so a novel secret format could have been missed.

## 7. Rejected / downgraded candidates

- `.env.local` committed to public git history → **false positive**: no
  `.env.local`/`.env` path in any public ref; the only copy is an untracked local
  `stash@{1}` (F-15).
- `VITE_AIRTABLE_TOKEN` fallback leaks the PAT via the frontend bundle →
  **not applicable today**: the frontend does not reference `VITE_AIRTABLE_TOKEN`
  (grep → 0 hits). Latent hardening note only.
- "No rollback path at all" → **downgraded** to Low/F-11: the previous head
  `2dddfce` is still resolvable by SHA, but there is no in-branch history and no
  one-click revert.
- Deleted Airtable schema = Medium business-data breach → **downgraded** to Low:
  metadata only, no records, no PII values, no credentials.
- Slug collisions = Medium → **downgraded** to Low: 0 duplicate slugs and 0
  `untitled` in the live data.
- No CDN integrity = Medium → **downgraded** to Low: SRI is not applicable to
  `fetch()` + JSON, and repo write already equals deploy write; the real fix is
  commit pinning plus a hash allowlist.
- "Empty sync publishes a blank site" = High → **downgraded** to Medium: owner-
  triggered, low probability, recoverable by rerunning.
- Deleted `docs/airtable-schema.json` still public = High → **downgraded** to Low
  (see above).
- Instagram uploader = High → **downgraded** to Low-latent: the input file is
  absent and the only sample token is expired.
- Node 20 EOL = Medium → **downgraded** to Low: build-only runtime, trusted
  inputs, no network listener.
- Inert test suite = Medium → **downgraded** to Low: real quality gap, no
  security impact.
- `lodash@4.18.1` looked like a phantom/typo-squat version → **false positive**:
  the official npm registry lists it as `latest` (published after the auditor's
  training cutoff); integrity hash matches.
- Sitemap/robots injection = Medium → **downgraded** to Low: served as XML/plain
  with `nosniff`; no HTML execution path.

## 8. Remediation plan

Tracked as roadmap items **#1–#13** in `docs/ROADMAP.md` (see the priority queue at the
top of that file; P1 items first).

There are no paying customers or enterprise contracts here, so the milestone
tiers are relabelled to the nearest real milestones.

### Before the next public publish

| Priority | Item | Finding(s) | Effort |
|---|---|---|---|
| P1 | Rewrite the `data`-branch hotfix procedure: edit Airtable, or use explicit artifact paths — never `git add .` | F-05 | S |
| P1 | Sanitize journal HTML at the pipeline boundary and in the frontend; reject `javascript:`/`data:` URLs; add a CSP | F-02 | S–M |
| P1 | Publish only published record IDs in `cloudinary-mapping.json`; drop titles from the public artifact | F-01 | S |
| P1 | Fail the sync (or hold the previous JSON) on any Cloudinary upload/check failure; never fall back to Airtable URLs | F-03 | S |
| P2 | Add a publish gate: zero-project/abrupt-drop abort, required Settings rows, valid domain | F-06 | S–M |
| P2 | Add a weekly schedule + freshness alert (`lastUpdated` older than N days) | F-08 | S |
| P2 | Key Cloudinary public IDs by attachment ID and migrate existing assets | F-07 | M |

### Before the site is promoted / handed to a client

| Priority | Item | Finding(s) | Effort |
|---|---|---|---|
| P2 | Split CI into read-only build and minimal-secret deploy; pin actions by SHA; `persist-credentials: false`; `npm ci` alone; protect `main`/`data` | F-04 | M |
| P2 | Move CI to Node 24/26 with `engines` + `.nvmrc` | F-12 | S |
| P2 | Add `vitest` + `npm test` + PR/push CI before the sync | F-13 | S |
| P2 | Retain `data` history/tags and add a rollback dispatch input | F-11 | S–M |
| P2 | Rotate the Airtable/Cloudinary credentials, clear the stash, add `SECURITY.md` and a rotation runbook | F-15 | S |
| P3 | Decide on the historical schema: rewrite history or document the residual exposure | F-10 | M |
| P3 | Fix sitemap/robots escaping and fabricated `lastmod` values | F-14 | S |

### Before scale / heavier automation

| Priority | Item | Finding(s) | Effort |
|---|---|---|---|
| P3 | Add `concurrency` and a `lastUpdated` compare-and-swap to the deploy | F-17 | S |
| P3 | Add timeouts + retry/backoff to Airtable, Cloudinary and oEmbed calls; alert on failure | F-18 | S |
| P3 | Call `makeUniqueSlug`; handle non-Latin titles | F-16 | S |
| P3 | Fix the Instagram uploader before enabling the feature: strip tokens, private asset, `finally` cleanup, gitignore | F-09 | S |

### Hardening notes (batch: do when nearby)

- Delete the 11 unreferenced `.ts` files (2,225 lines) and the dead Instagram
  step/script; keep one implementation of the shared helpers.
- `git rm --cached` the three tracked `.DS_Store` files; delete `run_log.txt`;
  add a `LICENSE` (package.json claims ISC, no file exists).
- Stop the unconditional title-casing in `normalizeTitle` (live: "Teddy"→"Teddy",
  but "TEDx"→"Tedx", "Gilley UK"→"Gilley Uk", "Spider-Man"→"Spider Man").
- Add `curl --fail --retry 3` and status checks to the jsDelivr purge; purge
  `cloudinary-mapping.json` too.
- Pin the CDN fetch to a commit + hash allowlist in the frontend rather than the
  moving `@data` branch.
- Make `skipFileWrites` reachable as a documented dry-run before production.

## 9. Re-audit guidance

- Fully re-verify every open P1/P2, plus anything whose cited files changed.
- Carry forward P3s not yet touched, marked "carried from 2026-10-23".
- Re-run the tool passes in §2 and diff the scoreboard: `npm audit`,
  `git log --all -S`, `rg` pattern sweep, `gh api` runs/protection/secret-scanning.
- If F-05, F-10 or F-15 result in a history rewrite or rotation, re-check the
  public refs and secret-scanning alerts afterwards.
- Suggested cadence: before each content-model change or frontend release that
  touches rendering; a full pass at the next milestone.
