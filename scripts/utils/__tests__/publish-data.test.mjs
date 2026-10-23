import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { publishData, rollbackData, publishTagName } from '../../publish-data.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function writeArtifacts(dir, marker) {
  fs.mkdirSync(path.join(dir, 'directing'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'postproduction'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'directing', 'portfolio-data.json'), `{"marker":"${marker}-directing"}`);
  fs.writeFileSync(path.join(dir, 'postproduction', 'portfolio-data.json'), `{"marker":"${marker}-pp"}`);
  fs.writeFileSync(path.join(dir, 'cloudinary-mapping.json'), `{"marker":"${marker}-mapping"}`);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env*\n');
}

describe('publishTagName', () => {
  it('is sortable, prefixed and unique per commit', () => {
    const date = new Date('2026-10-23T14:25:30Z');
    expect(publishTagName('data', date, 'abcdef1234567')).toBe('data-20261023-142530-abcdef1');
    expect(publishTagName('data-rollback', date, 'abcdef1234567')).toBe('data-rollback-20261023-142530-abcdef1');
  });
});

describe('publish-data', () => {
  let root;
  let remote;
  let repo;
  let commits;

  const remoteCount = () => Number(git(remote, 'rev-list', '--count', 'data'));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-test-'));
    remote = path.join(root, 'remote.git');
    repo = path.join(root, 'repo');

    git(root, 'init', '--bare', remote);
    git(root, 'clone', '--quiet', remote, repo);
    git(repo, 'checkout', '-b', 'data');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'user.email', 'test@example.com');

    writeArtifacts(repo, 'v1');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', 'seed');
    git(repo, 'push', 'origin', 'HEAD:refs/heads/data');
    commits = 1;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('appends a commit instead of orphaning the branch, and tags it', () => {
    const stage = path.join(root, 'stage-v2');
    writeArtifacts(stage, 'v2');

    const result = publishData({
      cwd: repo,
      stageDir: stage,
      date: new Date('2026-10-23T14:25:30Z')
    });

    expect(result.changed).toBe(true);
    expect(result.tag).toBe(`data-20261023-142530-${result.commit.slice(0, 7)}`);
    expect(remoteCount()).toBe(commits + 1);
    expect(git(repo, 'show', 'origin/data:directing/portfolio-data.json')).toContain('v2-directing');
    expect(git(remote, 'tag', '--list')).toContain(result.tag);
    expect(git(repo, 'log', '--format=%s', '-1', 'origin/data')).toContain('data sync');
  });

  it('publishes nothing when the staged artifacts are unchanged', () => {
    const stage = path.join(root, 'stage-same');
    fs.cpSync(repo, stage, {
      recursive: true,
      filter: (src) => path.basename(src) !== '.git'
    });

    const result = publishData({ cwd: repo, stageDir: stage });

    expect(result.changed).toBe(false);
    expect(remoteCount()).toBe(commits);
  });

  it('rolls back to an earlier tag as a new commit', () => {
    const stage = path.join(root, 'stage-v2');
    writeArtifacts(stage, 'v2');
    const first = publishData({ cwd: repo, stageDir: stage, date: new Date('2026-10-23T14:25:30Z') });

    const stage3 = path.join(root, 'stage-v3');
    writeArtifacts(stage3, 'v3');
    publishData({ cwd: repo, stageDir: stage3, date: new Date('2026-10-24T09:00:00Z') });
    expect(remoteCount()).toBe(3);

    const result = rollbackData({ cwd: repo, ref: first.tag, date: new Date('2026-10-25T10:00:00Z') });

    expect(result.changed).toBe(true);
    expect(remoteCount()).toBe(4);
    expect(git(repo, 'show', 'origin/data:directing/portfolio-data.json')).toContain('v2-directing');
    expect(git(repo, 'log', '--format=%s', '-1', 'origin/data')).toContain(`roll back data to ${first.tag}`);
    expect(git(remote, 'tag', '--list')).toContain(result.tag);
  });

  it('reports no change when rolling back to the current state', () => {
    const result = rollbackData({ cwd: repo, ref: 'origin/data' });
    expect(result.changed).toBe(false);
    expect(remoteCount()).toBe(commits);
  });

  it('refuses a stage directory that carries a secret', () => {
    const stage = path.join(root, 'stage-bad');
    writeArtifacts(stage, 'bad');
    fs.writeFileSync(path.join(stage, '.env.local'), 'AIRTABLE_TOKEN=patSECRET\n');

    expect(() => publishData({ cwd: repo, stageDir: stage })).toThrow(/refusing to publish unsafe paths/);
    expect(remoteCount()).toBe(commits);
  });
});
