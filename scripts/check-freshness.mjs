#!/usr/bin/env node
/**
 * Refuse to publish data the sync did not actually refresh.
 *
 * If Airtable credentials are missing, `sync-data` preserves the existing
 * files instead of failing — which is convenient locally and dangerous in CI:
 * a broken secret would otherwise republish months-old data. This check runs
 * after the sync and before the publish gate, and fails when `lastUpdated` is
 * older than the allowance.
 *
 * Usage:
 *   node scripts/check-freshness.mjs [--dir .] [--max-age-days 2] [--warn-only]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const MODES = ['directing', 'postproduction'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Record<string, object>} payloads - mode → portfolio-data.json
 * @param {{ now?: Date, maxAgeDays?: number }} options
 * @returns {string[]} problems; empty means fresh enough
 */
export function evaluateFreshness(payloads, { now = new Date(), maxAgeDays = 2 } = {}) {
  const errors = [];
  const allowanceMs = maxAgeDays * DAY_MS;

  for (const mode of MODES) {
    const payload = payloads[mode];
    if (!payload) {
      errors.push(`${mode}: no payload to check`);
      continue;
    }

    const timestamp = Date.parse(payload.lastUpdated || '');
    if (Number.isNaN(timestamp)) {
      errors.push(`${mode}: missing or invalid lastUpdated (${JSON.stringify(payload.lastUpdated ?? null)})`);
      continue;
    }

    const ageMs = now.getTime() - timestamp;
    if (ageMs > allowanceMs) {
      const ageDays = Math.floor(ageMs / DAY_MS);
      errors.push(`${mode}: lastUpdated is ${ageDays} day(s) old (limit ${maxAgeDays}) — the sync did not refresh it`);
    }
  }

  return errors;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const options = { dir: '.', maxAgeDays: 2, warnOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '--max-age-days') options.maxAgeDays = Number(argv[++i]);
    else if (arg === '--warn-only') options.warnOnly = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.maxAgeDays) || options.maxAgeDays <= 0) {
    throw new Error('--max-age-days must be a positive number');
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[freshness] ❌ ${error.message}`);
    process.exit(2);
  }

  const payloads = {};
  const unreadable = [];

  for (const mode of MODES) {
    const file = path.join(options.dir, mode, 'portfolio-data.json');
    if (fs.existsSync(file)) {
      try {
        payloads[mode] = readJson(file);
      } catch (error) {
        unreadable.push(`${mode}: ${error.message}`);
      }
    }
  }

  const errors = [...unreadable, ...evaluateFreshness(payloads, options)];

  if (errors.length > 0 && !options.warnOnly) {
    console.error(`[freshness] ❌ stale data — ${errors.length} problem(s):`);
    for (const error of errors) console.error(`[freshness]    ${error}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    for (const error of errors) console.warn(`[freshness] ⚠️ ${error}`);
    return;
  }

  console.log(`[freshness] ✅ data is at most ${options.maxAgeDays} day(s) old`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
