#!/usr/bin/env node
/**
 * One-off migration: create the Brands table and link the existing Client text
 * to it, so the portfolio can render a brand wall and project-page brands.
 *
 * The `Client` text field is never modified or deleted — it stays as the
 * rollback and migration source until the frontend has been verified.
 *
 * Usage:
 *   node scripts/migrate-brands.mjs            # dry run, read-only
 *   node scripts/migrate-brands.mjs --apply    # writes, needs AIRTABLE_WRITE_TOKEN
 *
 * The write token needs, scoped to this base:
 *   - schema.bases:write   (create the Brands table and the new fields)
 *   - data.records:write   (create brands, link projects, update Settings)
 *
 * Keep AIRTABLE_TOKEN read-only. The script refuses to apply with only that.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import { config } from 'dotenv';
import { isProjectVisible } from './lib/sync-logic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env') });

const BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const READ_TOKEN = process.env.AIRTABLE_TOKEN || '';
const WRITE_TOKEN = process.env.AIRTABLE_WRITE_TOKEN || '';
const APPLY = process.argv.includes('--apply');

const PROJECTS_TABLE = 'Projects';
const SETTINGS_TABLE = 'Settings';
const BRANDS_TABLE = 'Brands';

const MODES = ['directing', 'postproduction'];
const STATUS_FIELD = {
  directing: 'Display Status',
  postproduction: 'Display Status (Post)'
};

/**
 * Display-name corrections confirmed for this migration. Everything not listed
 * keeps the Client string exactly as it is.
 *
 * `Kitt Medical, Medical Tracker` is the one genuine multi-brand credit and
 * maps to two records.
 */
const NAME_OVERRIDES = new Map([
  ['Mini Cooper', ['MINI']],
  ['Health Lottery', ['The Health Lottery']],
  ['Pepsi Nigeria', ['Pepsi']],
  ['ClientEarth In Asia', ['ClientEarth']],
  ['Neigbourly', ['Neighbourly']],
  ['Kitt Medical, Medical Tracker', ['Kitt Medical', 'Medical Tracker']]
]);

const WORDMARK_STYLES = ['Auto', 'Wide', 'Thin', 'Black', 'Serif', 'Editorial', 'Mono', 'Lower', 'Tight'];

const BRAND_FIELDS = [
  {
    name: 'Name',
    type: 'singleLineText',
    description: 'Brand or artist name. Used for alt text, export filenames and the typographic fallback.'
  },
  {
    name: 'Logo',
    type: 'multipleAttachments',
    description: 'Upload the mono (single-colour) logo as a transparent PNG or SVG. This is the base for Mono and Adaptive; do not upload the full-colour version here.'
  },
  {
    name: 'Logo Colour',
    type: 'multipleAttachments',
    description: 'Upload the full-colour original logo as a transparent PNG or SVG. Used only by the Colour treatment (and optional colour-on-hover); leave empty if the brand is always mono.'
  },
  {
    name: 'Colour Overlay',
    type: 'multipleAttachments',
    description: 'Upload the colour-only overlay: all non-colour areas transparent, aligned pixel-for-pixel with Logo. Used only by the Adaptive treatment, layered over the tinted mono logo.'
  },
  {
    name: 'Logo Treatment',
    type: 'singleSelect',
    description: 'How the wall renders the logo: Mono = one theme-tinted colour; Colour = original artwork; Adaptive = mono base with the Colour Overlay on top.',
    options: { choices: [{ name: 'Mono' }, { name: 'Colour' }, { name: 'Adaptive' }] }
  },
  {
    name: 'Website',
    type: 'url',
    description: 'Optional. Opens when the brand logo is clicked on the home wall or a project page.'
  },
  {
    name: 'Scale',
    type: 'number',
    description: 'Optional size multiplier on the 22px wall height. 1 = normal; use about 0.85–0.9 for very wide marks or 1.1–1.2 for small compact marks.',
    options: { precision: 2 }
  },
  {
    name: 'Wordmark Style',
    type: 'singleSelect',
    description: 'Only used when a brand has no usable logo: the typographic fallback style.',
    options: { choices: WORDMARK_STYLES.map((name) => ({ name })) }
  }
];

const SETTINGS_FIELDS = [
  {
    name: 'Show Brand Wall',
    type: 'checkbox',
    description: 'Show the curated Home Brands selection on the home page.',
    options: { icon: 'check', color: 'greenBright' }
  },
  {
    name: 'Brand Wall Label',
    type: 'singleLineText',
    description: 'Heading above the wall, e.g. “Brands I’ve worked with” or “Trusted by”.'
  },
  {
    name: 'Brand Wall Layout',
    type: 'singleSelect',
    description: 'Inline (default) = one centred row; Grid = 2/4-column cells; Marquee = continuous scroll.',
    options: { choices: [{ name: 'Inline' }, { name: 'Grid' }, { name: 'Marquee' }] }
  },
  {
    name: 'Brands Colour On Hover',
    type: 'checkbox',
    description: 'Mono brands that have a Logo Colour file switch to colour on hover. Adaptive brands already show colour, so this has no effect on them.',
    options: { icon: 'check', color: 'greenBright' }
  },
  {
    name: 'Brand Wall Logo Height',
    type: 'number',
    description: 'Base logo height in px for the home wall. Default 22. The wall still optically normalises individual logos.',
    options: { precision: 0 }
  },
  {
    name: 'Brand Wall Spacing',
    type: 'number',
    description: 'Spacing multiplier for the home wall: section padding and row/column gaps. 1 = default; 0.8 tighter, 1.2 looser.',
    options: { precision: 2 }
  }
];

const WALL_SETTINGS = {
  directing: "Brands I've worked with",
  postproduction: 'Trusted by'
};

// Airtable allows 5 requests/second per base. Leave headroom for retries.
let lastRequestAt = 0;

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

    if (res.ok) return res.json();

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

async function listTables(token) {
  const data = await api(`/meta/bases/${BASE_ID}/tables`, { token });
  return data.tables || [];
}

async function listRecords(tableIdOrName, fields = [], token) {
  const out = [];
  let offset;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    for (const field of fields) params.append('fields[]', field);
    if (offset) params.set('offset', offset);

    const data = await api(
      `/${BASE_ID}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`,
      { token }
    );

    out.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return out;
}

async function createRecords(tableId, records, token) {
  const created = [];

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const data = await api(`/${BASE_ID}/${tableId}`, {
      method: 'POST',
      token,
      body: { records: batch, typecast: true }
    });
    created.push(...(data.records || []));
    process.stdout.write(`  created ${Math.min(i + 10, records.length)}/${records.length}\r`);
  }

  process.stdout.write('\n');
  return created;
}

async function updateRecords(tableId, records, token) {
  const updated = [];

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const data = await api(`/${BASE_ID}/${tableId}`, {
      method: 'PATCH',
      token,
      body: { records: batch, typecast: true }
    });
    updated.push(...(data.records || []));
  }

  return updated;
}

function fieldNames(table) {
  return new Set((table?.fields || []).map((field) => field.name));
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function canonicalNames(client) {
  const value = clean(client);
  if (!value) return [];
  const override = NAME_OVERRIDES.get(value);
  if (override) return override;
  return [value];
}

function latestDate(fields) {
  return [fields['Release Date'], fields['Work Date']]
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function parseRoles(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

function brandKey(name) {
  return clean(name).toLowerCase();
}

async function main() {
  if (!BASE_ID || !READ_TOKEN) {
    throw new Error('Set AIRTABLE_BASE_ID and AIRTABLE_TOKEN in .env.local');
  }

  if (APPLY && !WRITE_TOKEN) {
    throw new Error(
      'Apply needs AIRTABLE_WRITE_TOKEN (schema.bases:write + data.records:write). ' +
      'Keep AIRTABLE_TOKEN read-only.'
    );
  }

  if (APPLY && WRITE_TOKEN === READ_TOKEN) {
    throw new Error('AIRTABLE_WRITE_TOKEN must be a separate write-scoped token, not the read token.');
  }

  console.log(`[brands] ${APPLY ? 'APPLY' : 'DRY RUN'} — base ${BASE_ID}`);

  const tables = await listTables(READ_TOKEN);
  const projectsTable = tables.find((table) => table.name === PROJECTS_TABLE);
  const settingsTable = tables.find((table) => table.name === SETTINGS_TABLE);
  let brandsTable = tables.find((table) => table.name === BRANDS_TABLE);

  if (!projectsTable) throw new Error(`Table "${PROJECTS_TABLE}" not found`);
  if (!settingsTable) throw new Error(`Table "${SETTINGS_TABLE}" not found`);

  const [projects, settings] = await Promise.all([
    listRecords(projectsTable.id, [
      'Name',
      'Client',
      'Project Type',
      'Role',
      'Display Status',
      'Display Status (Post)',
      'Release Date',
      'Work Date',
      ...(fieldNames(projectsTable).has('Brands') ? ['Brands'] : [])
    ], READ_TOKEN),
    listRecords(settingsTable.id, [
      'Portfolio ID',
      'Allowed Roles',
      ...(fieldNames(settingsTable).has('Home Brands') ? ['Home Brands'] : [])
    ], READ_TOKEN)
  ]);

  const allowedRoles = Object.fromEntries(
    MODES.map((mode) => {
      const row = settings.find(
        (record) => clean(record.fields['Portfolio ID']).toLowerCase() === mode
      );
      return [mode, parseRoles(row?.fields['Allowed Roles'])];
    })
  );

  const projectsWithClient = projects.filter((record) => clean(record.fields.Client));
  const existingLinks = new Map(
    projects.map((record) => [record.id, record.fields.Brands || []])
  );
  const brandStats = new Map();

  for (const record of projectsWithClient) {
    const names = canonicalNames(record.fields.Client);
    const visibleModes = MODES.filter((mode) =>
      isProjectVisible(record.fields, STATUS_FIELD[mode], allowedRoles[mode])
    );
    const featured = MODES.some((mode) =>
      visibleModes.includes(mode) &&
      ['Featured', 'Hero'].includes(record.fields[STATUS_FIELD[mode]])
    );
    const date = latestDate(record.fields);

    for (const name of names) {
      const key = brandKey(name);
      if (!brandStats.has(key)) {
        brandStats.set(key, {
          name,
          projectIds: new Set(),
          visibleProjectIds: new Set(),
          visibleIn: new Set(),
          featuredProjectIds: new Set(),
          latest: ''
        });
      }

      const stat = brandStats.get(key);
      stat.projectIds.add(record.id);
      if (visibleModes.length > 0) stat.visibleProjectIds.add(record.id);
      visibleModes.forEach((mode) => stat.visibleIn.add(mode));
      if (featured) stat.featuredProjectIds.add(record.id);
      if (date > stat.latest) stat.latest = date;
    }
  }

  const ranked = [...brandStats.values()]
    .map((stat) => ({
      ...stat,
      score: stat.featuredProjectIds.size * 3 + stat.visibleProjectIds.size
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.latest.localeCompare(a.latest) ||
      a.name.localeCompare(b.name)
    );

  const initialSelection = Object.fromEntries(
    MODES.map((mode) => [
      mode,
      ranked.filter((stat) => stat.visibleIn.has(mode)).slice(0, 12)
    ])
  );

  console.log('\nBrand records');
  console.log(['#', 'Name', 'Vis', 'Feat', 'Latest'].join('\t'));
  ranked.forEach((stat, index) => {
    console.log([
      index + 1,
      stat.name,
      stat.visibleProjectIds.size,
      stat.featuredProjectIds.size,
      stat.latest.slice(0, 10) || '—'
    ].join('\t'));
  });

  console.log(`\n${ranked.length} brand records from ${projectsWithClient.length} projects.`);

  const links = [];
  for (const record of projectsWithClient) {
    const names = canonicalNames(record.fields.Client);
    const ids = names.map((name) => brandKey(name));
    links.push({
      project: record.id,
      name: clean(record.fields.Name),
      client: clean(record.fields.Client),
      brands: names,
      keys: ids
    });
  }

  const multi = links.filter((link) => link.brands.length > 1);
  if (multi.length > 0) {
    console.log('\nMulti-brand links');
    for (const link of multi) console.log(`  ${link.name}: ${link.brands.join(' + ')}`);
  }

  const hiddenOnly = ranked.filter((stat) => stat.visibleProjectIds.size === 0);
  if (hiddenOnly.length > 0) {
    console.log('\nLinked only to hidden projects (never pre-selected)');
    for (const stat of hiddenOnly) console.log(`  ${stat.name}`);
  }

  const existingBrands = brandsTable
    ? await listRecords(brandsTable.id, ['Name'], READ_TOKEN)
    : [];
  const existingByName = new Map(
    existingBrands.map((record) => [brandKey(record.fields.Name), record.id])
  );

  const missingFields = brandsTable
    ? BRAND_FIELDS.filter((field) => !fieldNames(brandsTable).has(field.name))
    : BRAND_FIELDS;

  const missingSettingsFields = SETTINGS_FIELDS.filter(
    (field) => !fieldNames(settingsTable).has(field.name)
  );

  console.log('\nPlan');
  console.log(`  Brands table: ${brandsTable ? `exists (${brandsTable.id})` : 'create'}`);
  if (brandsTable) {
    console.log(`  Missing brand fields: ${missingFields.map((field) => field.name).join(', ') || 'none'}`);
  }
  console.log(`  Projects.Brands field: ${fieldNames(projectsTable).has('Brands') ? 'exists' : 'create'}`);
  console.log(`  Missing Settings fields: ${missingSettingsFields.map((field) => field.name).join(', ') || 'none'}`);
  console.log(`  Settings.Home Brands field: ${fieldNames(settingsTable).has('Home Brands') ? 'exists' : 'create'}`);
  console.log(`  Brand records to create: ${ranked.filter((stat) => !existingByName.has(brandKey(stat.name))).length}`);
  console.log(`  Project links to write: ${links.length}`);

  console.log('\nInitial Home Brands selection (first 12 per mode)');
  for (const mode of MODES) {
    console.log(`  ${mode}: ${initialSelection[mode].map((stat) => stat.name).join(' · ')}`);
  }

  if (!APPLY) {
    console.log('\nNo writes performed. Re-run with --apply once the write token is in .env.local.');
    return;
  }

  // ---------------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------------

  if (!brandsTable) {
    console.log('\nCreating Brands table…');
    brandsTable = await api(`/meta/bases/${BASE_ID}/tables`, {
      method: 'POST',
      token: WRITE_TOKEN,
      body: {
        name: BRANDS_TABLE,
        description: 'Brands and artists credited on projects, used for the home logo wall and project pages.',
        fields: BRAND_FIELDS
      }
    });
    console.log(`  created ${brandsTable.id}`);
  }

  const currentBrandFields = fieldNames(brandsTable);
  for (const field of BRAND_FIELDS) {
    if (currentBrandFields.has(field.name)) continue;
    console.log(`  adding Brands.${field.name}…`);
    await api(`/meta/bases/${BASE_ID}/tables/${brandsTable.id}/fields`, {
      method: 'POST',
      token: WRITE_TOKEN,
      body: field
    });
  }

  const currentProjectFields = fieldNames(projectsTable);
  if (!currentProjectFields.has('Brands')) {
    console.log('Adding Projects.Brands…');
    await api(`/meta/bases/${BASE_ID}/tables/${projectsTable.id}/fields`, {
      method: 'POST',
      token: WRITE_TOKEN,
      body: {
        name: 'Brands',
        type: 'multipleRecordLinks',
        description: 'Linked brands/artists shown on the project page instead of the legacy Client text. Add several for a multi-brand credit.',
        options: { linkedTableId: brandsTable.id }
      }
    });
  }

  const currentSettingsFields = fieldNames(settingsTable);
  for (const field of SETTINGS_FIELDS) {
    if (currentSettingsFields.has(field.name)) continue;
    console.log(`  adding Settings.${field.name}…`);
    await api(`/meta/bases/${BASE_ID}/tables/${settingsTable.id}/fields`, {
      method: 'POST',
      token: WRITE_TOKEN,
      body: field
    });
  }

  if (!currentSettingsFields.has('Home Brands')) {
    console.log('  adding Settings.Home Brands…');
    await api(`/meta/bases/${BASE_ID}/tables/${settingsTable.id}/fields`, {
      method: 'POST',
      token: WRITE_TOKEN,
      body: {
        name: 'Home Brands',
        type: 'multipleRecordLinks',
        description: 'The brands shown on the home wall, in this order. Drag to reorder; the site follows the order.',
        options: { linkedTableId: brandsTable.id }
      }
    });
  }

  const brandRecords = ranked
    .filter((stat) => !existingByName.has(brandKey(stat.name)))
    .map((stat) => ({
      fields: {
        Name: stat.name,
        Scale: 1,
        'Wordmark Style': 'Auto'
      }
    }));

  if (brandRecords.length > 0) {
    console.log(`\nCreating ${brandRecords.length} brand records…`);
    const created = await createRecords(brandsTable.id, brandRecords, WRITE_TOKEN);
    for (const record of created) {
      existingByName.set(brandKey(record.fields.Name), record.id);
    }
  }

  const projectUpdates = links
    .map((link) => {
      const ids = link.keys.map((key) => existingByName.get(key)).filter(Boolean);
      if (ids.length !== link.keys.length) {
        throw new Error(`Could not resolve every brand for project ${link.name}`);
      }
      const merged = [...new Set([...(existingLinks.get(link.project) || []), ...ids])];
      return {
        id: link.project,
        fields: { Brands: merged }
      };
    });

  console.log(`\nLinking ${projectUpdates.length} projects…`);
  await updateRecords(projectsTable.id, projectUpdates, WRITE_TOKEN);

  const settingsUpdates = MODES.map((mode) => {
    const row = settings.find(
      (record) => clean(record.fields['Portfolio ID']).toLowerCase() === mode
    );
    if (!row) throw new Error(`No Settings row for "${mode}"`);

    const fields = {
      'Show Brand Wall': true,
      'Brand Wall Label': WALL_SETTINGS[mode],
      'Brand Wall Layout': 'Inline',
      'Brands Colour On Hover': false
    };

    // Prefill once, in importance order. A re-run never overwrites a curated list.
    if ((row.fields['Home Brands'] || []).length === 0) {
      fields['Home Brands'] = initialSelection[mode]
        .map((stat) => existingByName.get(brandKey(stat.name)))
        .filter(Boolean);
    }

    return { id: row.id, fields };
  });

  console.log('\nUpdating Settings…');
  await updateRecords(settingsTable.id, settingsUpdates, WRITE_TOKEN);

  // Verify
  const [finalBrands, finalProjects, finalSettings] = await Promise.all([
    listRecords(brandsTable.id, ['Name'], READ_TOKEN),
    listRecords(projectsTable.id, ['Name', 'Brands'], READ_TOKEN),
    listRecords(settingsTable.id, ['Portfolio ID', 'Home Brands'], READ_TOKEN)
  ]);
  const linked = finalProjects.filter((record) => (record.fields.Brands || []).length > 0);

  console.log('\nDone');
  console.log(`  Brands: ${finalBrands.length}`);
  console.log(`  Projects with Brands: ${linked.length} / ${projectsWithClient.length}`);
  for (const mode of MODES) {
    const row = finalSettings.find(
      (record) => clean(record.fields['Portfolio ID']).toLowerCase() === mode
    );
    console.log(`  Home Brands (${mode}): ${(row?.fields['Home Brands'] || []).length}`);
  }
  console.log('  Client text field was not modified.');
}

main().catch((error) => {
  console.error(`\n[brands] ❌ ${error.message}`);
  process.exit(1);
});
