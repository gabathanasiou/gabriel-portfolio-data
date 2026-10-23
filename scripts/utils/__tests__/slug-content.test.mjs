import { describe, it, expect } from 'vitest';
import { makeContentSlug } from '../../lib/airtable-helpers.mjs';
import { duplicateSlugs } from '../../lib/publish-gate.mjs';

describe('makeContentSlug', () => {
  it('makes two projects with the same title unique', () => {
    const used = new Set();

    const first = makeContentSlug('The Newspaper', used, 'recAAAAAAAAAAAAAA');
    const second = makeContentSlug('The Newspaper', used, 'recBBBBBBBBBBBBBB');

    expect(first).toBe('the-newspaper');
    expect(second).not.toBe(first);
    expect(second).toBe('the-newspaper-recbbb');
    expect(used.size).toBe(2);
  });

  it('gives a non-Latin title a stable, non-empty slug', () => {
    const used = new Set();

    const japanese = makeContentSlug('日本語のタイトル', used, 'recCJK1234567890');
    const hebrew = makeContentSlug('כותרת בעברית', used, 'recHEB1234567890');

    expect(japanese).not.toBe('untitled');
    expect(japanese).toBe('untitled-reccjk');
    expect(hebrew).not.toBe(japanese);
    expect(used.has(japanese)).toBe(true);
  });

  it('keeps a literal "Untitled" title as plain untitled', () => {
    const used = new Set();
    expect(makeContentSlug('Untitled', used, 'rec123')).toBe('untitled');
  });

  it('keeps the 80-character compatibility limit', () => {
    const used = new Set();
    const slug = makeContentSlug('A'.repeat(200), used, 'rec123');
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('never returns an empty slug', () => {
    const used = new Set();
    expect(makeContentSlug('', used, 'rec123')).toBe('untitled-rec123');
  });
});

describe('duplicateSlugs', () => {
  it('finds repeated slugs only', () => {
    expect(duplicateSlugs([
      { slug: 'a' },
      { slug: 'b' },
      { slug: 'a' },
      { slug: '' },
      {}
    ])).toEqual(['a']);
  });

  it('returns an empty list for unique slugs', () => {
    expect(duplicateSlugs([{ slug: 'a' }, { slug: 'b' }])).toEqual([]);
  });
});
