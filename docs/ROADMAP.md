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
| **P1** | 1 | ✔ Fix the data-branch hotfix procedure and credential exposure | F-05 | S |
| **P1** | 2 | ✔ Sanitize CMS values at every output boundary | F-02, F-14 | M |
| **P2** | 3 | ✔ Stop leaking unpublished work in public artifacts | F-01 | S |
| **P2** | 4 | ✔ Make the publish path fail-safe | F-03, F-06, F-17 | M |
| **P2** | 5 | ✔ Key the Cloudinary cache by attachment identity | F-07 | M |
| **P2** | 6 | ✔ Restore automated sync and add freshness/alerting | F-08, F-18 | M |
| **P2** | 7 | ✔ Harden CI supply chain and protect branches | F-04, F-12 | M |
| **P2** | 8 | ✔ Make the test suite runnable and gated | F-13 | S |
| **P2** | 9 | ✔ Retain publish history and add rollback | F-11 | S–M |
| **P2** | 10 | Credential hygiene and disclosure process | F-15, F-09 | S |
| **P3** | 11 | ✔ Slug uniqueness and non-Latin titles | F-16 | S |
| **P3** | 12 | ✔ Repo hygiene batch | CODE-06, CODE-09, hardening | S |
| **P3** | 13 | ✔ Decide and document the historical schema exposure | F-10 | M |

✔ = closed; the row stays here as the audit-coverage map, details in
`docs/ROADMAP-ARCHIVE.md`.

## 10. Credential hygiene and disclosure process (`[~]`)

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
- **Done:** `SECURITY.md` + `docs/SECURITY-RUNBOOK.md`; the secret-bearing stash was
  dropped and `.env.local` is mode 600; the dormant Instagram uploader (and its always-
  skipped workflow step) was removed as dead code under #12; no `.env*` is reachable
  from any ref.
- **Rotation:** new Airtable PAT and Cloudinary key verified (read, upload, CDN
  invalidate), pushed to the Actions secrets on 2026-10-23; the legacy
  `AIRTABLE_API_KEY` secret was deleted; secret scanning is still `0`. A local sync
  then published the artifacts to `data` (`data-20261023-153040-bfadd6d`) to prove the
  whole path.
- **Remaining (owner):** delete the old Airtable token and the old Cloudinary key in
  the two consoles, then close this item.
- **Verify:** `git stash list` is empty; no `.env*` blob is reachable from any ref;
  `SECURITY.md` exists; the Instagram script refuses a payload containing
  `accessToken` (unit test).
- **Audit:** F-15, F-09 — `docs/audits/2026-10-23-security-audit.md`
- **Effort:** S

**Relations**: none.

## 14. Evaluate Cloudflare R2 + Images as the image delivery upgrade (`[ ]`)

- **Priority:** P3 — opportunistic, decision-only; not scheduled. Do not start until
  the trigger below is met.
- **Request:** Cloudinary's free plan is 25 credits/month (~25 GB bandwidth); the next
  tier is $99/mo (Plus, 225 credits) with no metered middle step. The site stores only
  ~200 images / 42.6 MB and embeds video from YouTube/Vimeo, so storage and
  transformations are negligible and bandwidth is the only meter that scales. At ~6 MB
  per visit the free tier lasts ~4,000 visits/month. Cloudflare R2 charges $0 egress,
  has a 10 GB-month free tier (account-wide), and image transformations include 5,000
  unique/month free (account-wide). Decide whether R2 + Image Transformations replaces
  Cloudinary before paying $99/mo, and record the decision either way.
- **Trigger:** Cloudinary free-tier headroom is under ~50% for two consecutive months
  (check the Cloudinary Console usage dashboard), or the site is expected to pass
  ~2,000 visits/month.
- **Approach:** (a) Spike only: one R2 bucket on the existing Cloudflare account, one
  custom-domain zone for delivery, 10 images through
  `/cdn-cgi/image/width=…,format=auto/`, measure latency and quality. (b) If kept: add
  an S3-compatible upload step (`@aws-sdk/client-s3`) behind the existing
  `uploadToCloudinary`/`checkImageExists` seam in
  `scripts/utils/cloudinary/cloudinaryHelpers.mjs`, keep the mapping file as the
  content-addressed cache (see #5 — the new key must include the Airtable attachment
  id), and rewrite the two URL builders (`scripts/lib/sync-logic.mjs`,
  `../gabriel-portfolio/src/utils/imageOptimization.ts`). (c) Decide explicitly whether
  `../gabriel-portfolio/scripts/instagram-studio/` follows, or stays on Cloudinary —
  do not run two image hosts by accident.
- **Verify:** A full `npm run sync:all` under R2 is idempotent; every published gallery
  URL returns 200 with an image content-type and no Cloudinary host; total stored bytes
  stay under the 10 GB free tier and the unique-transformation count under 5,000/month;
  the Instagram Studio still produces a valid post; rollback is a re-run with the
  Cloudinary credentials restored (the mapping is regenerable).
- **Cost model to record:** R2 storage ≈ $0 at 43 MB, transformations ≤800/month at
  200 images × 4 presets (free), delivery $0 egress. Paid Cloudflare Images would be
  $5/100k stored + $1/100k delivered. Supabase is not a candidate: 5 GB egress free,
  no free transformations, 1 GB storage.
- **Effort:** M

**Relations**: subsumes #5 if it lands first (the new key must include the attachment
id); otherwise #5 stands alone. Supersedes the earlier Cloudinary-vs-Supabase question —
Supabase was rejected on price and shape (no transformation CDN, runtime dependency for
a static site).
