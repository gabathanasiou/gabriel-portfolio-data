import { describe, it, expect } from 'vitest';
import { validatePayload, validatePublish, findAirtableUrls } from '../../lib/publish-gate.mjs';

function makePayload(mode, count = 10, overrides = {}) {
  return {
    config: {
      portfolioId: mode,
      domain: mode === 'directing' ? 'directedbygabriel.com' : 'lemonpost.studio',
      hasJournal: mode === 'directing',
      ...(overrides.config || {})
    },
    projects: Array.from({ length: count }, (_, i) => ({
      id: `rec${mode}${i}`,
      heroImage: 'https://res.cloudinary.com/demo/image/upload/v1/p.jpg',
      gallery: ['https://res.cloudinary.com/demo/image/upload/v1/g.jpg']
    })),
    posts: mode === 'directing'
      ? [{ id: 'recPost', imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/c.jpg' }]
      : [],
    ...overrides,
    config: {
      portfolioId: mode,
      domain: mode === 'directing' ? 'directedbygabriel.com' : 'lemonpost.studio',
      hasJournal: mode === 'directing',
      ...(overrides.config || {})
    }
  };
}

const valid = () => ({
  directing: makePayload('directing'),
  postproduction: makePayload('postproduction')
});

describe('validatePayload', () => {
  it('accepts a well-formed payload', () => {
    expect(validatePayload('directing', makePayload('directing'))).toEqual([]);
  });

  it('refuses an empty portfolio', () => {
    const errors = validatePayload('directing', makePayload('directing', 0));
    expect(errors.join('\n')).toMatch(/0 projects/);
  });

  it('refuses a missing or invalid domain', () => {
    expect(validatePayload('directing', makePayload('directing', 10, { config: { domain: '' } })).join('\n')).toMatch(/domain/);
    expect(validatePayload('directing', makePayload('directing', 10, { config: { domain: 'not a domain' } })).join('\n')).toMatch(/domain/);
    expect(validatePayload('directing', makePayload('directing', 10, { config: { domain: 'evil.com\n</loc>' } })).join('\n')).toMatch(/domain/);
  });

  it('refuses a missing Settings row', () => {
    // processConfig falls back to the first row, so the mode/portfolioId mismatch is the signal.
    const errors = validatePayload('postproduction', makePayload('postproduction', 10, { config: { portfolioId: 'directing' } }));
    expect(errors.join('\n')).toMatch(/Settings row/);
  });

  it('refuses an enabled journal with no posts', () => {
    const errors = validatePayload('directing', makePayload('directing', 10, { posts: [] }));
    expect(errors.join('\n')).toMatch(/journal is enabled/);
  });

  it('does not require posts when the journal is disabled', () => {
    expect(validatePayload('postproduction', makePayload('postproduction'))).toEqual([]);
  });

  it('refuses expiring Airtable image URLs', () => {
    const payload = makePayload('directing');
    payload.projects[0].heroImage = 'https://v5.airtableusercontent.com/att123/expiring';
    const errors = validatePayload('directing', payload);
    expect(errors.join('\n')).toMatch(/Airtable image URL at projects\[0\]\.heroImage/);
  });

  it('refuses an abrupt project count drop', () => {
    const previous = makePayload('directing', 20);
    const current = makePayload('directing', 6);
    expect(validatePayload('directing', current, previous).join('\n')).toMatch(/projects dropped from 20 to 6/);

    const okay = makePayload('directing', 12);
    expect(validatePayload('directing', okay, previous)).toEqual([]);
  });

  it('ignores the drop rule for small portfolios', () => {
    const previous = makePayload('directing', 3);
    const current = makePayload('directing', 1);
    expect(validatePayload('directing', current, previous)).toEqual([]);
  });
});

describe('findAirtableUrls', () => {
  it('finds only image-typed values', () => {
    const payload = makePayload('directing');
    payload.projects[1].gallery = ['https://v5.airtableusercontent.com/att/1'];
    payload.config.about = { bio: 'see https://airtable.com/app123 for the base' };

    const hits = findAirtableUrls(payload);
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe('projects[1].gallery[0]');
  });
});

describe('validatePublish', () => {
  it('accepts both valid portfolios', () => {
    expect(validatePublish(valid())).toEqual([]);
  });

  it('requires both portfolios', () => {
    const errors = validatePublish({ directing: makePayload('directing') });
    expect(errors.join('\n')).toMatch(/postproduction: no generated payload/);
  });

  it('refuses two portfolios sharing a domain', () => {
    const payloads = valid();
    payloads.postproduction.config.domain = payloads.directing.config.domain;
    expect(validatePublish(payloads).join('\n')).toMatch(/same domain/);
  });

  it('compares against previous snapshots per mode', () => {
    const payloads = valid();
    const previous = {
      directing: makePayload('directing', 40),
      postproduction: makePayload('postproduction', 40)
    };
    payloads.directing = makePayload('directing', 10);
    expect(validatePublish(payloads, previous).join('\n')).toMatch(/directing: projects dropped from 40 to 10/);
  });
});
