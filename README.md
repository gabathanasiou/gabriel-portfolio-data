# Gabriel Athanasiou - Portfolio Data Repository

The data layer for Gabriel Athanasiou's portfolio ecosystem.

This repository is **not a frontend application**. It is a headless automated data pipeline that fetches content from Airtable, syncs images to Cloudinary, and generates layout-ready JSON and SEO artifacts (sitemaps, robots.txt) served via the jsDelivr CDN.

## 🏗️ Architecture

```
Airtable (CMS) → GitHub Actions (this repo) → jsDelivr (CDN) → Vite Frontend (gabriel-portfolio)
```

Instead of each frontend rebuild burning Airtable requests, the data is synced once to this repo and served statically.

### Output Structure
```
directing/
├── portfolio-data.json      # Directing portfolio data
├── sitemap.xml
└── robots.txt
postproduction/
├── portfolio-data.json      # Post-production portfolio data
├── sitemap.xml
└── robots.txt
cloudinary-mapping.json      # Shared image cache (publicId → URL)
```

### Sync Pipeline
1. **Fetch** all 5 Airtable tables in parallel (5 API calls total for both portfolios)
2. **Sync images** to Cloudinary using cache-first strategy (only uploads new/changed images)
3. **Process** both portfolio modes from the same raw data
4. **Generate** sitemaps and robots.txt from the processed data
5. **Commit** changes to `main` → jsDelivr CDN auto-updates

## 🚀 How to Trigger a Data Sync

1. **GitHub Actions**: Navigate to the "Actions" tab, click **"Sync Data & Static Files"**, and hit "Run Workflow".
2. **Airtable Webhook**: (If configured) Certain views in Airtable fire a POST payload to GitHub targeting `repository_dispatch: [airtable-webhook-sync]`.

### Local Development

```bash
npm install
# Configure .env.local with Airtable and Cloudinary credentials
npm run sync:all        # Full sync: data + sitemaps + robots
npm run sync:data       # Just the JSON data files
npm run sync:sitemap    # Just the sitemaps
npm run sync:robots     # Just the robots.txt files
```

## 📦 Consumption

The frontend fetches data from jsDelivr CDN:

```javascript
const response = await fetch('https://cdn.jsdelivr.net/gh/gabathanasiou/gabriel-portfolio-data@main/directing/portfolio-data.json');
const payload = await response.json();
```

## 📐 Schema Reference

See [`docs/SCHEMA.md`](docs/SCHEMA.md) for the complete Airtable → Output field mapping.
Raw Airtable base schema: [`docs/airtable-schema.json`](docs/airtable-schema.json).
