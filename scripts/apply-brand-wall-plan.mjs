#!/usr/bin/env node
/**
 * Apply a Brand Wall Editor plan to Airtable.
 *
 * The editor only reads published JSON and exports a plan. This script is the
 * write step: it validates record IDs and updates only the wall settings and
 * per-brand Scale values, leaving every other field alone.
 *
 * Usage:
 *   node scripts/apply-brand-wall-plan.mjs --plan brand-wall-plan.json
 *   node scripts/apply-brand-wall-plan.mjs --plan brand-wall-plan.json --apply
 *
 * Without --apply it prints the changes and writes nothing.
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env') });

const BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const READ_TOKEN = process.env.AIRTABLE_TOKEN || '';
const WRITE_TOKEN = process.env.AIRTABLE_WRITE_TOKEN || '';
const SETTINGS_TABLE = 'tbl37Kj4J5zPK74oN';
const BRANDS_TABLE = 'tbl60t7fcrXQMmTYA';
const APPLY = process.argv.includes('--apply');

const ALLOWED_SETTINGS = new Set([
  'Show Brand Wall',
  'Brand Wall Label',
  'Brand Wall Layout',
  'Brands Colour On Hover',
  'Brand Wall Logo Height',
  'Brand Wall Spacing',
  'Home Brands'
]);

let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const wait = 230 - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function api(pathname, { method = 'GET', body, token } = {}) {
  if (!token) throw new Error('Missing Airtable token');
  const url = `https://api.airtable.com/v0${pathname}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await throttle();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.ok) return res.status === 204 ? null : res.json();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }

    const text = await res.text();
    throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 400)}`);
  }

  throw new Error(`Retries exhausted: ${method} ${pathname}`);
}

async function listRecords(table, fields = [], token = READ_TOKEN) {
  const out = [];
  let offset;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    for (const field of fields) params.append('fields[]', field);
    if (offset) params.set('offset', offset);
    const data = await api(`/${BASE_ID}/${table}?${params.toString()}`, { token });
    out.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return out;
}

function readPlan(file) {
  if (!file) throw new Error('Usage: --plan <brand-wall-plan.json> [--apply]');
  if (!fs.existsSync(file)) throw new Error(`Plan not found: ${file}`);
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!['directing', 'postproduction'].includes(plan.mode)) {
    throw new Error(`Plan mode must be directing or postproduction (got ${plan.mode})`);
  }
  if (!plan.settings || typeof plan.settings !== 'object') {
    throw new Error('Plan is missing settings');
  }
  if (!Array.isArray(plan.settings['Home Brands'])) {
    throw new Error('Plan settings must include Home Brands as an array of record IDs');
  }
  if (!plan.brandScale || typeof plan.brandScale !== 'object') {
    throw new Error('Plan is missing brandScale');
  }

  for (const key of Object.keys(plan.settings)) {
    if (!ALLOWED_SETTINGS.has(key)) {
      throw new Error(`Refusing unknown Settings field: ${key}`);
    }
  }

  const layout = plan.settings['Brand Wall Layout'];
  if (!['Inline', 'Grid', 'Marquee'].includes(layout)) {
    throw new Error(`Invalid Brand Wall Layout: ${layout}`);
  }

  const height = Number(plan.settings['Brand Wall Logo Height']);
  const spacing = Number(plan.settings['Brand Wall Spacing']);
  if (!Number.isFinite(height) || height < 14 || height > 40) {
    throw new Error(`Brand Wall Logo Height must be 14–40 (got ${height})`);
  }
  if (!Number.isFinite(spacing) || spacing < 0.5 || spacing > 2) {
    throw new Error(`Brand Wall Spacing must be 0.5–2 (got ${spacing})`);
  }

  for (const [id, value] of Object.entries(plan.brandScale)) {
    const scale = Number(value);
    if (!id.startsWith('rec')) throw new Error(`Invalid brand record ID: ${id}`);
    if (!Number.isFinite(scale) || scale < 0.25 || scale > 2) {
      throw new Error(`Scale for ${id} must be 0.25–2 (got ${value})`);
    }
  }

  return plan;
}

async function main() {
  if (!BASE_ID || !READ_TOKEN) {
    throw new Error('Set AIRTABLE_BASE_ID and AIRTABLE_TOKEN in .env.local');
  }
  if (APPLY && !WRITE_TOKEN) {
    throw new Error('Apply needs AIRTABLE_WRITE_TOKEN (data.records:write)');
  }

  const planArgIndex = process.argv.indexOf('--plan');
  const planFile = planArgIndex >= 0 ? process.argv[planArgIndex + 1] : '';
  const plan = readPlan(planFile);

  const [settings, brands] = await Promise.all([
    listRecords(SETTINGS_TABLE, [
      'Portfolio ID',
      'Show Brand Wall',
      'Brand Wall Label',
      'Brand Wall Layout',
      'Brands Colour On Hover',
      'Brand Wall Logo Height',
      'Brand Wall Spacing',
      'Home Brands'
    ]),
    listRecords(BRANDS_TABLE, ['Name', 'Scale'])
  ]);

  const settingsRow = settings.find(
    (record) => String(record.fields['Portfolio ID'] || '').toLowerCase() === plan.mode
  );
  if (!settingsRow) throw new Error(`No Settings row for ${plan.mode}`);

  const brandById = new Map(brands.map((record) => [record.id, record]));
  const nextHomeBrands = plan.settings['Home Brands'];
  const missing = nextHomeBrands.filter((id) => !brandById.has(id));
  if (missing.length) throw new Error(`Home Brands contains unknown record IDs: ${missing.join(', ')}`);

  const currentFields = settingsRow.fields;
  const nextFields = {
    'Show Brand Wall': Boolean(plan.settings['Show Brand Wall']),
    'Brand Wall Label': String(plan.settings['Brand Wall Label'] || ''),
    'Brand Wall Layout': plan.settings['Brand Wall Layout'],
    'Brands Colour On Hover': Boolean(plan.settings['Brands Colour On Hover']),
    'Brand Wall Logo Height': Number(plan.settings['Brand Wall Logo Height']),
    'Brand Wall Spacing': Number(plan.settings['Brand Wall Spacing']),
    'Home Brands': nextHomeBrands
  };

  const settingsChanges = Object.entries(nextFields).filter(([key, value]) => {
    if (key === 'Home Brands') {
      return JSON.stringify(value) !== JSON.stringify(currentFields[key] || []);
    }
    if (typeof value === 'boolean') {
      return Boolean(currentFields[key]) !== value;
    }
    return value !== currentFields[key];
  });

  const scaleChanges = Object.entries(plan.brandScale)
    .map(([id, value]) => {
      const current = Number(brandById.get(id)?.fields.Scale ?? 1);
      return { id, name: brandById.get(id)?.fields.Name || id, current, next: Number(value) };
    })
    .filter(({ current, next }) => current !== next);

  console.log(`[plan] ${APPLY ? 'APPLY' : 'DRY RUN'} — ${plan.mode}`);
  console.log(`[plan] Settings changes: ${settingsChanges.length}`);
  for (const [key, value] of settingsChanges) {
    if (key === 'Home Brands') {
      const names = value.map((id) => brandById.get(id)?.fields.Name || id);
      console.log(`  ${key}: ${names.length} brands -> ${names.join(' | ')}`);
    } else {
      console.log(`  ${key}: ${JSON.stringify(currentFields[key])} -> ${JSON.stringify(value)}`);
    }
  }
  console.log(`[plan] Scale changes: ${scaleChanges.length}`);
  for (const change of scaleChanges) {
    console.log(`  ${change.name} (${change.id}): ${change.current} -> ${change.next}`);
  }

  if (!APPLY) {
    console.log('\n[plan] No writes performed. Re-run with --apply to update Airtable.');
    return;
  }

  if (settingsChanges.length > 0) {
    const fields = Object.fromEntries(settingsChanges);
    await api(`/${BASE_ID}/${SETTINGS_TABLE}/${settingsRow.id}`, {
      method: 'PATCH',
      token: WRITE_TOKEN,
      body: { fields }
    });
    console.log('[plan] Settings updated');
  }

  for (let i = 0; i < scaleChanges.length; i += 10) {
    const batch = scaleChanges.slice(i, i + 10).map((change) => ({
      id: change.id,
      fields: { Scale: change.next }
    }));
    await api(`/${BASE_ID}/${BRANDS_TABLE}`, {
      method: 'PATCH',
      token: WRITE_TOKEN,
      body: { records: batch }
    });
    console.log(`[plan] Brand scales updated ${Math.min(i + 10, scaleChanges.length)}/${scaleChanges.length}`);
  }

  console.log('\n[plan] ✅ Applied. Run the normal data sync to publish the wall.');
}

main().catch((error) => {
  console.error(`\n[plan] ❌ ${error.message}`);
  process.exit(1);
});
