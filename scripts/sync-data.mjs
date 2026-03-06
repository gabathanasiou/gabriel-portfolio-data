#!/usr/bin/env node
/**
 * Entry point for data sync.
 * Fetches from Airtable ONCE and writes both portfolio JSON files.
 *
 * Usage:
 *   node scripts/sync-data.mjs           # Syncs both portfolios
 *   npm run sync:data                     # Same via npm
 *   npm run sync:all                      # Data + sitemap + robots
 */

import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { syncPortfolios } from './lib/sync-logic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env') });

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.VITE_AIRTABLE_TOKEN || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID || '';
const OUTPUT_DIR = path.resolve(__dirname, '..');

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
  // Check if existing data files are present before failing
  const hasExistingData =
    fs.existsSync(path.join(OUTPUT_DIR, 'directing', 'portfolio-data.json')) ||
    fs.existsSync(path.join(OUTPUT_DIR, 'postproduction', 'portfolio-data.json'));

  if (hasExistingData) {
    console.warn('[sync-data] ⚠️ Missing Airtable credentials. Preserving existing data.');
    console.log('[sync-data] ℹ️  Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID to sync.');
    process.exit(0);
  } else {
    console.error('[sync-data] ❌ Missing Airtable credentials and no existing data found.');
    process.exit(1);
  }
}

(async () => {
  try {
    console.log('[sync-data] 🔄 Starting unified portfolio sync...\n');

    const results = await syncPortfolios({
      airtableToken: AIRTABLE_TOKEN,
      airtableBaseId: AIRTABLE_BASE_ID,
      outputDir: OUTPUT_DIR,
      verbose: true,
    });

    console.log('\n[sync-data] ✅ Sync complete!');
    for (const [mode, data] of Object.entries(results.portfolios)) {
      console.log(`[sync-data]    ${mode}: ${data.projects.length} projects, ${data.journal.length} journal posts`);
    }
    console.log(`[sync-data]    API calls: ${results.apiCalls}`);

    process.exit(0);
  } catch (error) {
    console.error('[sync-data] ❌ Sync failed:', error.message);
    if (error.isRateLimit || error.message?.includes('Rate limit')) {
      console.warn('[sync-data] ⚠️ Airtable rate limit hit. Try again later.');
    }
    process.exit(1);
  }
})();
