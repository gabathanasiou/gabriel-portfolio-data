#!/usr/bin/env node
/**
 * Guard the `data` branch publish against credential leaks.
 *
 * The `data` branch is a public artifact page, not a workspace: it must only
 * ever contain the generated portfolio files. Running `git add .` in a
 * checkout of that branch used to stage `.env.local` (live Airtable and
 * Cloudinary credentials) and `node_modules/`, because the branch had no
 * `.gitignore` of its own and does not track the repository's source.
 *
 * This guard fails if any candidate path is outside the artifact allowlist or
 * matches a secret/dependency pattern. It is used twice:
 *
 *   - by the sync workflow, on the staged artifact directory before publish;
 *   - by scripts/publish-data.mjs, on the staged index before it commits.
 *
 * Usage:
 *   node scripts/guard-data-branch.mjs [dir]   # walk a directory (default: .)
 *   node scripts/guard-data-branch.mjs --staged  # inspect the git index
 *
 * Exit codes: 0 = clean, 1 = violation(s), 2 = usage/environment error.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/** Everything the published `data` branch is allowed to contain. */
const ALLOWED_FILES = new Set(['cloudinary-mapping.json', '.gitignore']);
const ALLOWED_DIRS = ['directing/', 'postproduction/'];

/** Patterns that must never be published, whatever the allowlist says. */
const FORBIDDEN = [
  { label: 'environment file', re: /(^|\/)\.env([.~]|$)/i },
  { label: 'environment file', re: /(^|\/)[^/]*\.env([.~]|$)/i },
  { label: 'schema dump', re: /(^|\/)SCHEMA-FULL\.local\.md$/i },
  { label: 'installed dependencies', re: /(^|\/)node_modules\// },
  { label: 'git internals', re: /(^|\/)\.git\// },
  { label: 'credential file', re: /(^|\/)(\.npmrc|\.netrc|id_rsa|id_ed25519|credentials)(\.|$)/i },
  { label: 'private key', re: /\.(pem|key|p12|pfx)$/i }
];

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isAllowed(file) {
  return ALLOWED_FILES.has(file) || ALLOWED_DIRS.some((dir) => file.startsWith(dir));
}

export function walk(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) {
    throw new Error(`Directory not found: ${root}`);
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(normalize(path.relative(root, full)));
      }
    }
  };
  visit(root);
  return files;
}

export function stagedFiles(cwd = process.cwd()) {
  // The full index, not just the diff: this answers "what would the next
  // commit contain", which is what matters before a push.
  const out = execFileSync('git', ['ls-files', '--cached', '-z'], {
    cwd,
    encoding: 'utf8'
  });
  return out.split('\0').filter(Boolean).map(normalize);
}

/** Every problem with a candidate file list; empty means safe to publish. */
export function findViolations(files) {
  const failures = [];

  for (const file of files) {
    const forbidden = FORBIDDEN.find(({ re }) => re.test(file));
    if (forbidden) {
      failures.push(`${file}  →  ${forbidden.label} must never be published`);
    } else if (!isAllowed(file)) {
      failures.push(`${file}  →  not a published artifact (allowed: directing/, postproduction/, cloudinary-mapping.json, .gitignore)`);
    }
  }

  return failures;
}

function main() {
  const [arg] = process.argv.slice(2);

  let files;
  let source;
  try {
    if (arg === '--staged') {
      files = stagedFiles();
      source = 'staged files';
    } else {
      const dir = arg || '.';
      files = walk(dir);
      source = `files under ${path.resolve(dir)}`;
    }
  } catch (error) {
    console.error(`[guard-data] ❌ ${error.message}`);
    process.exit(2);
  }

  const failures = findViolations(files);

  if (failures.length > 0) {
    console.error(`[guard-data] ❌ Refusing to publish: ${failures.length} unsafe path(s) in ${source}.`);
    for (const failure of failures) {
      console.error(`[guard-data]    ${failure}`);
    }
    console.error('[guard-data] Remove them, or stage explicit artifact paths only. Never `git add .`.');
    process.exit(1);
  }

  console.log(`[guard-data] ✅ ${files.length} path(s) in ${source} — artifacts only, no secrets.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
