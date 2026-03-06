# Gabriel Athanasiou - Portfolio Data Repository

Welcome to the central nervous system of Gabriel Athanasiou's portfolio ecosystem. 

This repository is **not a frontend application**. It is exclusively a headless automated data layer. It fetches underlying content from Airtable, processes the media payload by securely linking to Cloudinary, and statically precompiles layout-ready JSON maps and SEO artifacts (Sitemaps, Robots.txt) to be consumed statically via the jsDelivr CDN.

## 🏗️ Architecture

1. **Airtable (CMS)** -> 2. **GitHub Actions (gabriel-portfolio-data)** -> 3. **jsDelivr (CDN)** -> 4. **Vite Frontend (gabriel-portfolio)**

Instead of each frontend rebuild burning Airtable requests, the underlying content structure is strictly versioned in this repository.

### Output Structure
This repository generates folders for multiple domain configurations:
- `/directing/portfolio-data.json` 
- `/directing/sitemap.xml`
- `/postproduction/portfolio-data.json`
- `/postproduction/sitemap.xml`

## 🚀 How to Trigger a Data Sync

Since this repository tracks changes incrementally, automatic polling is turned off to save API limits. When new work is published in Airtable, you can trigger a deployment cycle in one of two ways:

1. **GitHub Actions**: Navigate to the "Actions" tab of this repository, click **"Sync Data & Static Files"**, and hit "Run Workflow".
2. **Airtable Webhook**: (If configured) Certain views in Airtable can fire a POST payload to GitHub targeting `repository_dispatch: [airtable-webhook-sync]`.

### Manual Testing

If you are developing locally within this repository:

1. `npm install`
2. Make sure you have `.env.local` configured with the Airtable and Cloudinary API keys.
3. Run `npm run sync:all` to run a localized sync procedure across all portfolio modes.

## 📦 Consumption

The isolated JS payloads generated in this repository can be fetched from the `main` branch immediately upon completion using standard Github Pages CDN integrations:

```javascript
const response = await fetch('https://cdn.jsdelivr.net/gh/gabathanasiou/gabriel-portfolio-data@main/directing/portfolio-data.json');
const payload = await response.json();
```
