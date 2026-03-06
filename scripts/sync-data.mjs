#!/usr/bin/env node
// Build-time data generator - creates static portfolio-data.json
// Uses shared sync-core for consistency with Netlify functions

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { syncAllData } from './lib/sync-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local first, then .env
config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env') });

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.VITE_AIRTABLE_TOKEN || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID || '';
const FORCE_FULL_SYNC = process.env.FORCE_FULL_SYNC === 'true';
const PORTFOLIO_MODE = process.env.PORTFOLIO_MODE || 'directing';

const OUTPUT_DIR = path.resolve(PORTFOLIO_MODE);

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
  const portfolioDataPath = path.resolve(OUTPUT_DIR, 'portfolio-data.json');
  if (fs.existsSync(portfolioDataPath)) {
    console.warn('[sync-data] ⚠️  Missing Airtable credentials. Preserving existing portfolio-data.json');
    console.log('[sync-data] ℹ️  To sync, ensure AIRTABLE_TOKEN and AIRTABLE_BASE_ID are set.');
    process.exit(0); // Don't fail build, keep existing data
  } else {
    console.error('[sync-data] ❌ Missing Airtable credentials and no existing data found');
    process.exit(1);
  }
}

console.log(`[sync-data] 🔄 Starting data sync for portfolio mode: ${PORTFOLIO_MODE}...`);

// Run the sync using shared core logic
(async () => {
  try {
    const results = await syncAllData({
      airtableToken: AIRTABLE_TOKEN,
      airtableBaseId: AIRTABLE_BASE_ID,
      outputDir: OUTPUT_DIR,
      verbose: true,
      forceFullSync: FORCE_FULL_SYNC,
      portfolioMode: PORTFOLIO_MODE
    });

    console.log('[sync-data] ✅ Sync complete!');
    console.log(`[sync-data]    - Portfolio mode: ${PORTFOLIO_MODE}`);
    console.log(`[sync-data]    - ${results.projects.length} projects`);
    console.log(`[sync-data]    - ${results.journal.length} journal posts`);
    console.log(`[sync-data]    - Generated at: ${results.timestamp}`);

    if (results.syncStats) {
      console.log(`[sync-data]    - Sync mode: ${results.syncStats.mode}`);
      console.log(`[sync-data]    - API calls: ${results.syncStats.apiCalls}`);
      if (results.syncStats.mode !== 'full') {
        console.log(`[sync-data]    - API calls saved: ${results.syncStats.apiCallsSaved}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('[sync-data] ❌ Sync failed:', error.message);

    // Preserve existing data on rate limit or other recoverable errors
    if (error.isRateLimit || error.message?.includes('Rate limit')) {
      console.warn('[sync-data] ⚠️  Airtable rate limit hit. Preserving existing data.');
      const portfolioDataPath = path.resolve(OUTPUT_DIR, 'portfolio-data.json');
      if (fs.existsSync(portfolioDataPath)) {
        console.log('[sync-data] ℹ️  Existing portfolio-data.json preserved.');
        process.exit(0); // Don't fail build
      }
    }

    process.exit(1);
  }
})();
