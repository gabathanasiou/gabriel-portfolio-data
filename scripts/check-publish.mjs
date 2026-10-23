#!/usr/bin/env node
/**
 * Fail the sync before it can publish an empty or misconfigured portfolio.
 *
 * Reads the generated `directing/portfolio-data.json` and
 * `postproduction/portfolio-data.json`, optionally compares them with the last
 * published copies, and exits 1 with a list of problems. See
 * `scripts/lib/publish-gate.mjs` for the rules.
 *
 * Usage:
 *   node scripts/check-publish.mjs [--dir .] [--previous ../previous]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validatePublish } from './lib/publish-gate.mjs';

const __filename = fileURLToPath(import.meta.url);
const MODES = ['directing', 'postproduction'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const options = { dir: '.', previous: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '--previous') options.previous = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[publish-gate] ❌ ${error.message}`);
    process.exit(2);
  }

  const payloads = {};
  const previousByMode = {};

  try {
    for (const mode of MODES) {
      payloads[mode] = readJson(path.join(options.dir, mode, 'portfolio-data.json'));

      if (options.previous) {
        const previousFile = path.join(options.previous, mode, 'portfolio-data.json');
        if (fs.existsSync(previousFile) && fs.statSync(previousFile).size > 0) {
          try {
            previousByMode[mode] = readJson(previousFile);
          } catch {
            console.warn(`[publish-gate] ⚠️ ignoring unreadable previous snapshot: ${previousFile}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[publish-gate] ❌ ${error.message}`);
    process.exit(1);
  }

  const errors = validatePublish(payloads, previousByMode);

  if (errors.length > 0) {
    console.error(`[publish-gate] ❌ refusing to publish — ${errors.length} problem(s):`);
    for (const error of errors) console.error(`[publish-gate]    ${error}`);
    process.exit(1);
  }

  console.log('[publish-gate] ✅ payloads are publishable');
  for (const mode of MODES) {
    const payload = payloads[mode];
    console.log(`[publish-gate]    ${mode}: ${payload.projects.length} projects, ${(payload.posts || []).length} posts, domain ${payload.config.domain}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
