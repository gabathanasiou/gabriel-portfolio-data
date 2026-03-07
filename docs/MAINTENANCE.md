# Portfolio Data Maintenance Guide

This guide explains how to perform maintenance tasks in the `gabriel-portfolio-data` repository, specifically manual data edits without triggering a full Airtable sync.

## 🛠️ Manual Data Edits (No Airtable Sync)

Sometimes you need to make a quick fix to the production JSON files (e.g., fixing a typo or updating a setting) without waiting for a full fetch from Airtable or triggering a complete CI run.

### Option 1: Edit the `data` Branch Directly (Production)

The production website fetches data from the `data` branch via the jsDelivr CDN. You can push direct changes here to bypass the sync script.

1.  **Checkout the `data` branch**:
    ```bash
    git checkout data
    ```
2.  **Edit the target JSON file**:
    - `directing/portfolio-data.json`
    - `postproduction/portfolio-data.json`
3.  **Commit with `[ci skip]`**:
    ```bash
    git add .
    git commit -m "chore: manual data patch [ci skip]"
    git push origin data
    ```
    *Note: Using `[ci skip]` is a best practice to ensure no automated logic is accidentally triggered.*

### Option 2: Push Logic Changes to `main`

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
