#!/usr/bin/env node

/**
 * Script to generate sitemap-{mode}.xml from portfolio data
 * Portfolio-aware: reads from portfolio-data-{mode}.json
 * Run this during build time: `PORTFOLIO_MODE=directing npm run build:sitemap`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTFOLIO_MODE = process.env.PORTFOLIO_MODE || 'directing';
const OUTPUT_DIR = path.resolve(__dirname, '..', PORTFOLIO_MODE);

/**
 * Load portfolio data from the pre-generated JSON file
 */
function loadPortfolioData() {
  const dataPath = path.join(OUTPUT_DIR, `portfolio-data.json`);

  if (!fs.existsSync(dataPath)) {
    console.error(`[sitemap] ❌ Portfolio data not found: ${dataPath}`);
    console.error(`[sitemap] ℹ️  Run 'PORTFOLIO_MODE=${PORTFOLIO_MODE} npm run build:data' first`);
    return null;
  }

  try {
    const content = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`[sitemap] ❌ Failed to parse portfolio data: ${e.message}`);
    return null;
  }
}

function generateSitemap(portfolioData) {
  const { config, projects, articles } = portfolioData;
  const domain = config.domain || 'example.com';
  const baseUrl = `https://${domain}`;
  const hasJournal = config.hasJournal !== false;
  const currentDate = new Date().toISOString().split('T')[0];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Home page
  xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  // Work page
  xml += `  <url>\n    <loc>${baseUrl}/work</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

  // Journal page (only if enabled)
  if (hasJournal) {
    xml += `  <url>\n    <loc>${baseUrl}/journal</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }

  // About page
  xml += `  <url>\n    <loc>${baseUrl}/about</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;

  // Game page (only for directing portfolio)
  if (PORTFOLIO_MODE === 'directing') {
    xml += `  <url>\n    <loc>${baseUrl}/game</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  }

  // Projects
  projects.forEach(project => {
    const year = project.year || '';
    const lastmod = year ? `${year}-01-01` : currentDate;
    const isNarrative = project.type === 'Narrative';
    const isFeatured = project.isFeatured;
    const priority = isNarrative ? '0.9' : (isFeatured ? '0.8' : '0.7');

    xml += `  <url>\n    <loc>${baseUrl}/work/${project.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
  });

  // Journal posts (only if enabled and articles exist)
  if (hasJournal && articles && articles.length > 0) {
    articles.forEach(article => {
      const lastmod = article.date ? article.date.substring(0, 10) : currentDate;
      xml += `  <url>\n    <loc>${baseUrl}/journal/${article.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    });
  }

  xml += '</urlset>';
  return xml;
}

function generateMinimalSitemap(domain, hasJournal) {
  const baseUrl = `https://${domain}`;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/work</loc>
    <priority>0.9</priority>
  </url>`;

  if (hasJournal) {
    xml += `
  <url>
    <loc>${baseUrl}/journal</loc>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
  <url>
    <loc>${baseUrl}/about</loc>
    <priority>0.7</priority>
  </url>
</urlset>`;

  return xml;
}

async function main() {
  try {
    console.log(`[sitemap] 🔄 Generating sitemap for portfolio mode: ${PORTFOLIO_MODE}...`);

    const portfolioData = loadPortfolioData();

    if (!portfolioData) {
      console.error('[sitemap] ❌ Cannot generate sitemap without portfolio data');
      process.exit(1);
    }

    const sitemap = generateSitemap(portfolioData);
    const outputPath = path.join(OUTPUT_DIR, `sitemap.xml`);

    // Ensure public directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(outputPath, sitemap, 'utf-8');

    console.log(`[sitemap] ✅ Generated: ${outputPath}`);
    console.log(`[sitemap]    - Domain: ${portfolioData.config.domain}`);
    console.log(`[sitemap]    - Projects: ${portfolioData.projects.length}`);
    console.log(`[sitemap]    - Journal: ${portfolioData.config.hasJournal ? (portfolioData.articles?.length || 0) + ' articles' : 'disabled'}`);
  } catch (error) {
    console.error('[sitemap] ❌ Failed to generate sitemap:', error);
    process.exit(1);
  }
}

main();
