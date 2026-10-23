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
