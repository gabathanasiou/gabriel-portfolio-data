# Testing — gabriel-portfolio-data

> Read this before adding a test. **Status:** current; the suite is Vitest (Node), with
> no browser layer — this repo has no UI.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Run every unit test once (`vitest run`) |
| `npm run test:watch` | Watch mode while editing |
| `npm run lint` | Doc budget + roadmap hygiene |

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test` and `npm run lint` on every
push and pull request to `main`. The sync workflow is separate and never runs tests.

## The suite

- Tests live in `scripts/**/__tests__/*.test.mjs`, next to the code they cover.
  `vitest.config.mjs` sets the Node environment and that include glob.
- Only pure logic is tested: sanitizers, slug generation, helpers, generators, publish
  gates, mapping filters, cache identity. A test must run with no Airtable token, no
  Cloudinary key and no network.
- Never assert the same behaviour in two layers — there is no second layer here.
  Anything that needs a real Airtable base or Cloudinary account is a **manual check**
  in `docs/MAINTENANCE.md`, not a test.
- A red run that might predate your change is checked against a clean `git worktree`
  at `HEAD`; never `git checkout`/`git stash` in the working tree to compare.

## When to add a test

Add one when a function can produce a wrong value, leak data, or accept hostile input:
sanitizers, URL/scheme checks, slug uniqueness, publish-gate thresholds, visibility
filters, Cloudinary cache keys, XML/robots output.

Do not add a test for: console output, file-write plumbing that only calls `fs`, or
anything already covered by an existing case. Keep each new test in the file that owns
the module.

## Writing a test

```js
import { describe, it, expect } from 'vitest';
import { sanitizeDomain } from '../../lib/sanitize.mjs';

describe('sanitizeDomain', () => {
  it('rejects a newline', () => {
    expect(sanitizeDomain('a.com\nDisallow: /x')).toBe('');
  });
});
```

Generators (`generate-sitemap.mjs`, `generate-robots.mjs`) export their pure functions
and only run `main()` when the file is executed directly, so they are importable from a
test without writing files. Keep that shape when adding new scripts.

## Manual verification (not automatable here)

- Full sync against a scratch Airtable base, then a `data`-branch publish.
- A hostile draft post renders as text in the frontend (separate repo).
- jsDelivr serves the new artifacts after a publish and purge.
