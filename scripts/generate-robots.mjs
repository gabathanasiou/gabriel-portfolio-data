#!/usr/bin/env node
/**
 * Generate robots-{mode}.txt for each portfolio
 * Portfolio-aware: reads domain from portfolio-data-{mode}.json
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
    console.error(`[robots] ❌ Portfolio data not found: ${dataPath}`);
    console.error(`[robots] ℹ️  Run 'PORTFOLIO_MODE=${PORTFOLIO_MODE} npm run build:data' first`);
    return null;
  }

  try {
    const content = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`[robots] ❌ Failed to parse portfolio data: ${e.message}`);
    return null;
  }
}

function generateRobots(domain) {
  const baseUrl = `https://${domain}`;

  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /.env

Sitemap: ${baseUrl}/sitemap.xml

# Specific rules for social media crawlers
User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /
`;
}

async function main() {
  try {
    console.log(`[robots] 🔄 Generating robots.txt for portfolio mode: ${PORTFOLIO_MODE}...`);

    const portfolioData = loadPortfolioData();

    if (!portfolioData) {
      console.error('[robots] ❌ Cannot generate robots.txt without portfolio data');
      process.exit(1);
    }

    const domain = portfolioData.config.domain || 'example.com';
    const robots = generateRobots(domain);
    const outputPath = path.join(OUTPUT_DIR, `robots.txt`);

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(outputPath, robots, 'utf-8');

    console.log(`[robots] ✅ Generated: ${outputPath}`);
    console.log(`[robots]    - Domain: ${domain}`);
    console.log(`[robots]    - Sitemap: https://${domain}/sitemap.xml`);
  } catch (error) {
    console.error('[robots] ❌ Failed to generate robots.txt:', error);
    process.exit(1);
  }
}

main();
