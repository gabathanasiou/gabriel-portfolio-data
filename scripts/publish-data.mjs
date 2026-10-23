#!/usr/bin/env node
/**
 * Publish the generated artifacts to the `data` branch — append-only.
 *
 * Every publish used to be a fresh orphan commit force-pushed over `data`,
 * so the previous state was unrecoverable unless someone had written down the
 * SHA (audit F-11). This script instead:
 *
 *   - fetches `origin/data` and builds the publish in a throwaway worktree;
 *   - copies the staged artifacts in, drops anything else, and runs the
 *     secret/artifact guard on the index;
 *   - commits on top of the existing history (fast-forward push, no -f);
 *   - tags the commit `data-<UTC timestamp>-<sha>` and pushes the tag.
 *
 * `rollback --ref <tag|sha>` restores those files from an earlier publish as
 * a new commit on top: history stays append-only, so the rollback is itself
 * revertible.
 *
 * Usage:
 *   node scripts/publish-data.mjs publish --stage <dir>
 *   node scripts/publish-data.mjs rollback --ref <tag-or-sha>
 *   (--branch <name>, --remote <name>; defaults: data, origin)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { findViolations, stagedFiles, walk } from './guard-data-branch.mjs';

const __filename = fileURLToPath(import.meta.url);

/** The only paths the published branch may contain. */
export const ARTIFACTS = ['directing', 'postproduction', 'cloudinary-mapping.json', '.gitignore'];

const IDENTITY = [
  '-c', 'user.name=github-actions',
  '-c', 'user.email=github-actions@users.noreply.github.com'
];

function git(cwd, args) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return (output || '').trim();
  } catch (error) {
    const detail = (error.stderr || '').toString().trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `:\n${detail}` : `: ${error.message}`}`);
  }
}

function log(message) {
  console.log(`[publish] ${message}`);
}

/** `data-20261023-142530-abc1234` — sortable, unique, readable in `git tag`. */
export function publishTagName(prefix, date, sha) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + '-' + [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('');
  return `${prefix}-${stamp}-${sha.slice(0, 7)}`;
}

function fetchData({ cwd, remote, branch }) {
  log(`fetching ${remote}/${branch} (with tags)`);
  git(cwd, ['fetch', '--tags', remote, branch]);
}

function withWorktree({ cwd, remote, branch }, fn) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-data-'));
  const worktree = path.join(parent, 'wt');

  try {
    git(cwd, ['worktree', 'add', '--detach', worktree, `${remote}/${branch}`]);
    return fn(worktree);
  } finally {
    try {
      git(cwd, ['worktree', 'remove', '--force', worktree]);
    } catch {
      // The worktree may never have been created; temp cleanup below is best-effort.
    }
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

/** Replace the artifact paths in the worktree with exactly what is staged. */
function replaceArtifacts(worktree, stageDir) {
  for (const artifact of ARTIFACTS) {
    fs.rmSync(path.join(worktree, artifact), { recursive: true, force: true });
  }
  fs.cpSync(stageDir, worktree, { recursive: true, force: true });
}

/** Stage the artifact paths, then refuse to continue if anything unsafe is in the index. */
function stageArtifacts(worktree) {
  git(worktree, ['add', '-A', '--', ...ARTIFACTS]);

  const staged = stagedFiles(worktree);
  const violations = findViolations(staged);
  if (violations.length > 0) {
    throw new Error(`refusing to publish unsafe paths:\n  ${violations.join('\n  ')}`);
  }

  return staged;
}

function hasStagedChanges(worktree) {
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: worktree, stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
}

export function publishData({ cwd = process.cwd(), stageDir, remote = 'origin', branch = 'data', date = new Date() } = {}) {
  if (!stageDir || !fs.existsSync(stageDir)) {
    throw new Error(`Stage directory not found: ${stageDir}`);
  }

  // The workflow guards the stage directory too; repeat it here so the script
  // is safe on its own (and so a secret never even reaches the worktree).
  const stageViolations = findViolations(walk(stageDir));
  if (stageViolations.length > 0) {
    throw new Error(`refusing to publish unsafe paths:\n  ${stageViolations.join('\n  ')}`);
  }

  fetchData({ cwd, remote, branch });

  return withWorktree({ cwd, remote, branch }, (worktree) => {
    replaceArtifacts(worktree, stageDir);

    const staged = stageArtifacts(worktree);

    if (!hasStagedChanges(worktree)) {
      log('no changes — nothing to publish');
      return { changed: false, commit: null, tag: null, files: staged.length };
    }

    git(worktree, [...IDENTITY, 'commit', '-m', `chore: data sync ${date.toISOString()} [ci skip]`]);
    const commit = git(worktree, ['rev-parse', 'HEAD']);
    const tag = publishTagName('data', date, commit);

    git(worktree, ['tag', tag]);
    log(`pushing ${commit.slice(0, 7)} to ${remote}/${branch} (append-only)`);
    git(worktree, ['push', remote, `HEAD:refs/heads/${branch}`]);
    git(worktree, ['push', remote, tag]);
    log(`published ${tag}`);

    return { changed: true, commit, tag, files: staged.length };
  });
}

export function rollbackData({ cwd = process.cwd(), ref, remote = 'origin', branch = 'data', date = new Date() } = {}) {
  if (!ref) throw new Error('rollback needs --ref <tag-or-sha>');

  fetchData({ cwd, remote, branch });

  const sha = git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!sha) throw new Error(`cannot resolve ref: ${ref}`);

  return withWorktree({ cwd, remote, branch }, (worktree) => {
    let restored = 0;
    for (const artifact of ARTIFACTS) {
      try {
        git(worktree, ['cat-file', '-e', `${sha}:${artifact}`]);
      } catch {
        log(`skip ${artifact} (absent in ${ref})`);
        continue;
      }
      git(worktree, ['checkout', sha, '--', artifact]);
      restored++;
    }

    stageArtifacts(worktree);

    if (!hasStagedChanges(worktree)) {
      log(`data already matches ${ref} — nothing to roll back`);
      return { changed: false, commit: null, tag: null, restored: 0 };
    }

    git(worktree, [...IDENTITY, 'commit', '-m', `chore: roll back data to ${ref} [ci skip]`]);
    const commit = git(worktree, ['rev-parse', 'HEAD']);
    const tag = publishTagName('data-rollback', date, commit);

    git(worktree, ['tag', tag]);
    git(worktree, ['push', remote, `HEAD:refs/heads/${branch}`]);
    git(worktree, ['push', remote, tag]);
    log(`rolled back to ${ref} as ${commit.slice(0, 7)} (${restored} artifact path(s))`);

    return { changed: true, commit, tag, restored };
  });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--stage') options.stageDir = rest[++i];
    else if (arg === '--ref') options.ref = rest[++i];
    else if (arg === '--remote') options.remote = rest[++i];
    else if (arg === '--branch') options.branch = rest[++i];
    else if (arg === '--github-output') options.githubOutput = rest[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[publish] ❌ ${error.message}`);
    process.exit(2);
  }

  try {
    const result = options.command === 'publish'
      ? publishData({ stageDir: options.stageDir, remote: options.remote, branch: options.branch })
      : options.command === 'rollback'
        ? rollbackData({ ref: options.ref, remote: options.remote, branch: options.branch })
        : (() => { throw new Error('usage: publish-data.mjs <publish --stage DIR | rollback --ref REF>'); })();

    if (options.githubOutput && typeof result.changed === 'boolean') {
      fs.appendFileSync(options.githubOutput, `changed=${result.changed}\ntag=${result.tag || ''}\n`);
    }

    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`[publish] ❌ ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
