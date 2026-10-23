# Airtable → Portfolio Data Schema Reference

> **Read this before** mapping a new Airtable field or changing the output shape.
> **Status:** current — auto-generated from the live Airtable Metadata API on 2026-03-06.
> Base ID: `appLKDqYcLzFsfafU`

This document maps every Airtable field to its corresponding output in `portfolio-data.json`.
Fields marked with 🚫 are business/finance fields **not used** by the portfolio sync.

---

## Table: Projects (`tblqZvYhmZ8H81poY`)

### Portfolio Fields (used by sync)

| Airtable Field | Type | Output Property | Notes |
|---|---|---|---|
| `Name` | singleLineText | `title` | Primary field. Normalized via `normalizeTitle()` (title case) |
| `Project Type` | singleSelect | `type` | Choices: Narrative, Commercial, Music Video, Documentary. Normalized via `normalizeProjectType()` |
| `Kind` | singleSelect | `kinds[]` | Wrapped in array. 34 choices (Music Video, Campaign, Short Film, TVC, Feature Film, etc.) |
| `Genre` | multipleSelects | `genre[]` | Choices: Art House, Drama, Comedy, Crime, Horror, Dance Film, Coming of Age, UGC, Animation, Mystery, Period, Documentary |
| `Role` | multipleSelects | (filtering + credits) | Choices: Director, DIT, 1st AD, Colourist, Editor, VFX, Beauty Work, etc. Used to filter projects per portfolio and generate owner/cross-site credits |
| `Release Date` | date | `releaseDate`, `year` | Primary sort field. YYYY-MM-DD |
| `Work Date` | date | `workDate` | Fallback date when Release Date is empty |
| `About` | singleLineText | `description` | Project description text |
| `Video URL` | multilineText | `videoUrl` | Comma/Newline-separated URLs. Supports `[Label] URL` syntax. |
| `Gallery` | multipleAttachments | `gallery[]` | Images uploaded to Cloudinary, URLs resolved from mapping |
| `Credits` | multilineText | `credits[]` | Parsed via `parseCreditsText()`. Supports `Role: Name`, `Role by Name`, or `Name`. |
| `External Links` | multilineText | `externalLinks[]` | Parsed into `{label, url}`. Supports `[Label] URL` and auto-domain labeling. |
| `Display Status` | singleSelect | `isFeatured`, `isHero` | Choices: Hidden, Portfolio Only, Featured, Hero. **Used for Directing portfolio** |
| `Display Status (Post)` | singleSelect | `isFeatured`, `isHero` | Same choices. **Used for Post-Production portfolio** |
| `Production Company` | multipleRecordLinks → Client Book | `productionCompany` | Record ID resolved via clientsMap |
| `Festivals` | multipleRecordLinks → Festivals | `awards[]` | Record IDs resolved via festivalsMap |
| `Journal` | multipleRecordLinks → Journal | `relatedArticleId` | First linked record ID (if any) |
| `Client` | singleLineText | `client` | Direct text field |
| `Last Modified` | lastModifiedTime | — | Not exposed in output, but tracked by Airtable |

> Additional business/finance fields exist in Airtable but are **not used** by the portfolio sync and are omitted from this public document.

---

## Table: Journal (`tblISFDv21C0PkgEv`)

| Airtable Field | Type | Output Property | Notes |
|---|---|---|---|
| `Title` | singleLineText | `title` | Primary field. Normalized |
| `Status` | singleSelect | (filtering) | Choices: Draft, Published, Scheduled. Only `Published` posts sync |
| `Date` | date | `date` | Sort field |
| `Content` | richText | `content` | HTML/Markdown body |
| `Tags` | multipleSelects | `tags[]` | Choices: Personal, Announcement |
| `Cover Image` | multipleAttachments | `imageUrl` | First attachment → Cloudinary |
| `Related Project` | multipleRecordLinks → Projects | `relatedProjectId` | First linked record ID |
| `Links` | url | `relatedLinks[]` | Comma-separated URLs |
| `Last Modified` | lastModifiedTime | — | |

---

## Table: Client Book (`tblv9PEHYyMy2EuqJ`) — Lookup Table

| Airtable Field | Type | Used As |
|---|---|---|
| `Company` | singleLineText | **Primary**. Display name in `productionCompany` |
| `Name` | singleLineText | Fallback for company name |
| `Projects` | multipleRecordLinks → Projects | Reverse link |


---

## Table: Festivals (`tblGdWlTVC06ZT60H`) — Lookup Table

| Airtable Field | Type | Used As |
|---|---|---|
| `Name` | singleLineText | **Primary**. Fallback display name |
| `Display Name` | singleLineText | Preferred display name for `awards[]` |
| `Projects` | multipleRecordLinks → Projects | Reverse link |

---

## Table: Settings (`tbl37Kj4J5zPK74oN`)

Each row represents one portfolio mode. The `Portfolio ID` field selects the row.

| Airtable Field | Type | Output Property | Notes |
|---|---|---|---|
| `Portfolio ID` | singleLineText | `portfolioId` | **Primary**. `"directing"` or `"postproduction"` |
| `Site Title` | singleLineText | `siteTitle` | |
| `Nav Title` | singleLineText | `navTitle` | |
| `SEO Title` | singleLineText | `seoTitle` | |
| `SEO Description` | multilineText | `seoDescription` | |
| `Domain` | singleLineText | `domain` | Used for sitemap/robots |
| `Work Section Label` | singleLineText | `workSectionLabel` | Default: "Filmography" |
| `Has Journal` | checkbox | `hasJournal` | |
| `Show Role Filter` | checkbox | `showRoleFilter` | |
| `Show Other Portfolio Link` | checkbox | `showOtherPortfolioLink` | |
| `Other Portfolio URL` | url | `otherPortfolioUrl` | |
| `Other Portfolio Label` | singleLineText | `otherPortfolioLabel` | |
| `Allowed Roles` | multipleSelects | `allowedRoles[]` | Choices: Director, Colourist, Editor, Beauty & VFX Work, VFX, Beauty Work. Filters which projects appear |
| `Showreel Enabled` | checkbox | `showreel.enabled` | |
| `Showreel URL` | url | `showreel.videoUrl` | |
| `Showreel Placeholder` | multipleAttachments | `showreel.placeholderImage` | → Cloudinary |
| `Contact Email` | singleLineText | `contact.email` | |
| `Contact Phone` | singleLineText | `contact.phone` | |
| `Rep UK` | singleLineText | `contact.repUK` | |
| `Rep USA` | singleLineText | `contact.repUSA` | |
| `Instagram URL` | singleLineText | `contact.instagram` | |
| `Vimeo URL` | singleLineText | `contact.vimeo` | |
| `LinkedIn URL` | singleLineText | `contact.linkedin` | |
| `IMDb URL` | singleLineText | `contact.imdb` | |
| `Bio` | multilineText | `about.bio` | |
| `About Image` | multipleAttachments | `about.profileImage` | → Cloudinary |
| `Default OG Image` | multipleAttachments | `defaultOgImage` | → Cloudinary |
| `Trading Name Disclosure` | singleLineText | `tradingNameDisclosure` | UK sole trader legal text |
| `GA Measurement ID` | singleLineText | `gaMeasurementId` | Google Analytics 4 |
| `Last Modified` | lastModifiedTime | `lastModified` | |
| 🚫 `Use Cloudinary` | checkbox | — | Legacy flag, now controlled by env var |

### Fields referenced in code but NOT in current schema

These fields have graceful fallbacks and may be added to Airtable later:

| Referenced Field | Fallback | Used For |
|---|---|---|
| `Logo` | `''` | Portfolio logo image |
| `Favicon` | `''` | Browser favicon |
| `Font Family` | `''` | Google Font name |
| `About Layout` | `'standard'` | Layout variant |
| `Theme Mode` | `'dark'` | Dark/light theme |
| `Owner Name` / `Portfolio Owner` | `Site Title` → `'Gabriel Athanasiou'` | Auto-credit name |
| `Excerpt` (Journal) | `''` | Post excerpt |
| `Publish Date` (Journal) | `Date` | Post date |
| `Credits (new)` (Projects) | `Credits` | Credits text |

---

## Output JSON Schema

Each `{mode}/portfolio-data.json` file (on the **`data` branch**):

```json
{
  "projects": [Project],
  "posts": [BlogPost],
  "config": HomeConfig,
  "portfolioMode": "directing" | "postproduction",
  "lastUpdated": "2026-03-06T17:00:00.000Z",
  "version": "2.0",
  "source": "sync-logic"
}
```

TypeScript interfaces: [`src/types.ts`](../../gabriel-portfolio/src/types.ts) (`Project`, `BlogPost`, `HomeConfig`)

---

## Cloudinary Image Sync

Images are synced to Cloudinary using a **check-then-upload** strategy:

1. Public ID convention:
   - Projects: `portfolio-projects-{recordId}-{galleryIndex}`
   - Journal: `portfolio-journal-{recordId}`
   - Settings: `portfolio-config-{portfolioId}-{type}` (types: logo, favicon, showreel, profile, defaultOg)
2. Uploads store the Airtable attachment id in the asset's Cloudinary context.
3. For each image, `checkImageExists(publicId)` queries the Cloudinary API.
4. If found **and** the stored attachment id matches → use the existing URL (skip upload).
   A different attachment id — or no metadata on a pre-migration asset — re-uploads
   over the same public id with `invalidate: true`, so a replaced or reordered gallery
   image can never serve the old picture.
5. Mapping saved to `cloudinary-mapping.json` at repo root (published copy contains
   published records only and no titles).

---

## Historical exposure (accepted — roadmap #13)

`docs/airtable-schema.json` was deleted in `e4ca46f`, but the blob is still readable at
`53796f7` / `e4ca46f^`: 59,583 bytes of field names, formulas and select choices,
including rate, invoice and client-contact **field names**. It contains no records, no
PII values and no credentials.

This is **accepted** rather than rewritten: a `git filter-repo` rewrite would change
every commit SHA, break every clone and require force-pushing protected `main` for a
low-severity exposure with no live data. The mitigation is a pre-commit hook that
refuses to stage the file again — install it once per clone with
`npm run hooks:install` (`.githooks/pre-commit`). Public documentation keeps field
semantics here; the full dump stays local (`docs/SCHEMA-FULL.local.md`, gitignored).

