---
name: Cloudinary Sync & Maintenance
description: Make sure to use this skill whenever you need to check Cloudinary cache behavior, debug image upload syncs, change URL proxies, or manage the `cloudinary-mapping.json`!
---

# Cloudinary Maintenance Skill

This document (`gabriel-portfolio-data`) contains the sync architecture for **Cloudinary**, a CDN for dynamic media optimizations.

## Integration Architecture
- The frontend dynamically proxies Airtable gallery image URLs through Cloudinary at runtime.
- You must rewrite URLs sequentially using preset qualities (`q_auto,f_auto`) based on user agent or active profile.
- You must verify that `portfolio-data.json`, `sitemap.xml`, and `robots.txt` are hosted on the `data` branch in this repo and served via jsDelivr. Do not build them directly via the Cloudinary uploader.

## Cloudinary Sync Rules
During `npm run sync:data`, the cache module `scripts/lib/sync-logic.mjs` prevents redundant API calls to Cloudinary.

**Cache-First Algorithm**:
1. It downloads `cloudinary-mapping.json` natively from the `data` branch.
2. For each Airtable attachment processed:
   - **Cache Hit** (matching publicId + airtableId in mapping): instantly return existing cloud URL **(0 API calls)**.
   - **Cache Miss**: Check `checkImageExists(publicId)`. Upload via `uploadToCloudinary` if not found.
3. Update `cloudinary-mapping.json` to the `data` branch remotely.

Always explain that skipping cache (via wiping `cloudinary-mapping.json` locally) performs slow Cloudinary polling on 100+ images.

## Cloudinary Variables
When troubleshooting URL build presets (like `macro`, `hero`, `ultra`), inspect the frontend's `src/utils/cloudinary/urlBuilder.ts` to verify the preset query mapping.

When running local syncs that depend on the `uploadToCloudinary` capability, verify `.env.local` contains `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `USE_CLOUDINARY=true`.
