---
name: Airtable CMS Management
description: Make sure to use this skill whenever you need to fetch from Airtable, update data pipeline logic, view live JSON portfolios, map new fields, or troubleshoot static data generation!
---

# Airtable CMS Management Skill

This repository (`gabriel-portfolio-data`) is the central source of truth for generating portfolio data. Use this skill to understand how data moves from Airtable to the static `portfolio-data.json`.

## Architecture & Data Flow
1. Fetching: `sync-data.yml` triggers the sync script. It makes a single batch of 5 API calls to Airtable, fetching all tables in parallel.
2. Building: It produces JSON files for both portfolio modes (`directing` and `postproduction`).
3. Serving: The generated files are pushed to the `data` branch. The frontend client (`gabriel-portfolio`) dynamically fetches these URLs via the **jsDelivr CDN**. There is **no live fetching** from Airtable in the browser client.
4. CDN Caching: jsDelivr caches files aggressively. The sync GitHub Action manually purges the jsDelivr cache for the generated JSON files after every sync.
5. Typings: Type definitions live in the frontend `src/types.ts` for consistency.

**IMPORTANT:** Always curl the jsDelivr URL (e.g., `https://cdn.jsdelivr.net/gh/gabathanasiou/gabriel-portfolio-data@data/directing/portfolio-data.json`) when you need to view the live JSON portfolio state. Do not read local data files to avoid inspecting stale data.

## Modifying Data Models
When the user asks you to map a new Airtable field, follow these steps sequentially:
1. Update `docs/SCHEMA.md` to document the new field. (Schema metadata is kept private).
2. Update `scripts/lib/sync-logic.mjs` to map the new Airtable field to the output JSON structure.
3. Update `src/types.ts` in the main `gabriel-portfolio` frontend to declare the new field types.
4. Update the relevant React views (`src/components/views/*`) to render the field.

## Advanced Field Formatting
Use these conventions parsing complex long-text fields from Airtable:
- **Video URL**: Supports `[Subtitle Text] https://vimeo.com/...`. The text inside brackets renders below videos.
- **External Links**: Supports `[Review] https://variety.com/...`. Displays as "Review → Variety".
- **Credits**: Supports `Role: Name` and `Role by Name` (e.g., "Directed by Craig Capone"). 

These fields split natively on commas, newlines, and vertical pipes (`|`). Explain this to the user when they ask how to add new links or videos in Airtable.

## Running the Sync Locally
Data syncing targets Airtable which has strict API limits. Only run manual syncs when necessary context has changed.
- `npm run sync:data` — Fetch from Airtable + write both portfolio JSON files.
- `npm run sync:sitemap` — Generate sitemaps for both modes.
- `npm run sync:robots` — Generate robots.txt files.
- `npm run sync:all` — Run all steps sequentially.
