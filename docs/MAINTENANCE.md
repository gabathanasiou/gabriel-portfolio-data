# Portfolio Data Maintenance Guide

> **Read this before** touching the sync or the `data` branch. **Status:** current.
> The `data` branch is a build artifact: change Airtable, not the branch. If you must
> hotfix it, use the guarded worktree procedure below — never `git add .` in a checkout
> of `data`.

This guide explains how to perform maintenance tasks in the `gabriel-portfolio-data` repository, specifically manual data edits without triggering a full Airtable sync.

## 🛠️ Manual Data Edits (No Airtable Sync)

Sometimes you need to make a quick fix to the production JSON files (e.g., fixing a typo or updating a setting) without waiting for a full fetch from Airtable or triggering a complete CI run.

### Option 1: Fix the source in Airtable (recommended)

Everything on `data` is generated, so a hand-edited file survives only until the next
publish. Make the change in Airtable, then trigger the sync: **Actions → "Sync Data &
Static Files" → Run workflow**. That path includes the publish guard and the jsDelivr
purge.

### Option 2: Emergency hotfix on the `data` branch

Use this only when the live site is broken and the fix cannot wait for a sync. Treat
`data` as a page of JSON, not a workspace: work in a throwaway worktree so your
`.env.local` (live Airtable + Cloudinary credentials) and `node_modules/` are never in
the checkout, and stage explicit paths only. **Never `git add .`** — `data` carries no
application source, and its own `.gitignore` is a safety net, not a substitute for
careful staging.

`data` has ordinary append-only history: every publish is a commit with a `data-*` tag,
so a hotfix is a normal commit on top (no force-push).

1.  **Create a throwaway worktree** (from the main checkout on `main`):
    ```bash
    git fetch origin data
    git worktree add ../portfolio-data-hotfix origin/data
    cd ../portfolio-data-hotfix
    ```
2.  **Edit the target file(s)**:
    - `directing/portfolio-data.json`
    - `postproduction/portfolio-data.json`
    - `cloudinary-mapping.json`
3.  **Stage explicit paths** — never `.`:
    ```bash
    git add directing/ postproduction/ cloudinary-mapping.json
    ```
4.  **Run the guard** from the main checkout. It fails on anything that is not a
    published artifact and on any `.env*`, `node_modules/` or `SCHEMA-FULL.local.md`
    path:
    ```bash
    cd ../gabriel-portfolio-data
    npm run guard:data -- ../portfolio-data-hotfix
    ```
5.  **Commit, push, clean up**:
    ```bash
    cd ../portfolio-data-hotfix
    git commit -m "chore: manual data patch [ci skip]"
    git push origin data
    cd ../gabriel-portfolio-data
    git worktree remove ../portfolio-data-hotfix
    ```
6.  **Purge the CDN** (see [Cache Clearing](#-cache-clearing)) and **record the fix in
    Airtable** — the next sync overwrites a direct edit that has no Airtable source.

> [!WARNING]
> A direct push bypasses the workflow's publish guard, change check and CDN purge. The
> `.gitignore` committed on `data` and step 4's guard are the only local protection —
> read `git show --stat HEAD` before you push.

### Option 3: Push Logic Changes to `main`

Pushing to the `main` branch **never** triggers a data sync. Syncs are only triggered by:
- **Airtable Webhooks** (`repository_dispatch`)
- **Manual Triggers** (`workflow_dispatch` in GitHub Actions)

You can safely update scripts, documentation, or configuration in `main` without affecting the live production data.

---

## 🛡️ Publish Gate

Nothing reaches the `data` branch until `scripts/check-publish.mjs` approves the
generated payload. It refuses a publish when:

- a portfolio has **0 projects**, or its journal is enabled with no posts;
- the `Domain` is missing or not a bare hostname;
- a portfolio's Settings row is missing (which shows up as a `portfolioId` mismatch);
- an **expiring Airtable image URL** is still in the JSON (Cloudinary upload failed);
- the project/post count dropped by more than half against the last published JSON.

A red gate means **nothing was published** — the previous snapshot is intact. Fix the
Airtable base (or the Cloudinary credentials) and re-run the workflow.

---

## ⏪ Rolling Back a Publish

Every publish is tagged on the `data` branch as
`data-YYYYMMDD-HHMMSS-<short-sha>` (the commit also carries a readable message), so
there is no need to have saved a SHA by hand.

1.  **List the snapshots**:
    ```bash
    git fetch --tags origin data
    git tag --list 'data-*' --sort=-creatordate | head -20
    git log --oneline origin/data | head -20
    ```
2.  **Roll back from GitHub** (recommended): **Actions → "Sync Data & Static Files" →
    Run workflow**, put a tag or commit SHA in the **rollback** field, leave `reason`
    alone, and run it. The workflow restores the artifact files from that snapshot as a
    **new commit** on `data` and purges jsDelivr. Because history is append-only, the
    rollback can itself be rolled back or reverted.
3.  **Or from a checkout**: `git revert <sha> && git push origin HEAD:data` — a normal
    revert commit, no force-push.

The sync workflow never force-pushes; if another run published in the meantime the push
is rejected and the job fails rather than overwriting newer data.

---

## 🔔 Automation and Alerts

- **Triggers:** manual `workflow_dispatch` only (plus `repository_dispatch` if you
  ever wire the Airtable webhook). There is deliberately **no schedule** — each run
  spends Airtable API calls, so runs are deliberate.
- **Airtable webhook:** never fired historically. To wire it up, an Airtable
  automation must POST to
  `https://api.github.com/repos/gabathanasiou/gabriel-portfolio-data/dispatches` with
  `{"event_type":"airtable-webhook-sync"}` and a fine-grained token allowed to create
  repository dispatches. Verify by checking that a new run lists
  `repository_dispatch` as its trigger.
- **Failure alerts:** set the `SYNC_ALERT_WEBHOOK` repository secret to a
  Slack-compatible incoming webhook (any endpoint accepting `{"text": "..."}`). Failed
  syncs and rollbacks POST the run URL. Without the secret only GitHub's default
  failure email is sent.
- **Freshness:** after a sync, the workflow refuses to publish when `lastUpdated` is
  older than 2 days — `sync-data` preserves existing files when credentials are
  missing, and republishing them silently would hide the breakage.

---

## 🔄 Local Development & Testing

### Skip Syncing Locally
If you want to run the site locally using your current `directing/` or `postproduction/` folders without fetching fresh data from Airtable:

1.  Open `.env` or `.env.local` in this repository.
2.  Temporarily rename `AIRTABLE_TOKEN` to something else (e.g., `_HIDE_AIRTABLE_TOKEN`).
3.  Running `npm run sync:data` will now preserve your local files:
    ```bash
    [sync-data] ⚠️ Missing Airtable credentials. Preserving existing data.
    ```

### Testing a Full Sync Locally
To test exactly what the GitHub Action will do:
1. Ensure your `.env` has active `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID`.
2. Run `npm run sync:all`.
3. Verify the generated files in `directing/` and `postproduction/`.

---

## 🧹 Cache Clearing
If your manual edits are not appearing on the live site immediately:
1. The `sync-data.yml` workflow has a "Purge jsDelivr Cache" step. 
2. You can manually trigger a purge by hitting this URL in your browser:  
   `https://purge.jsdelivr.net/gh/gabathanasiou/gabriel-portfolio-data@data/directing/portfolio-data.json`
