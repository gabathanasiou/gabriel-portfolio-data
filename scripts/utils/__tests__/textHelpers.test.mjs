import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '../helpers/textHelpers.mjs';

describe('normalizeTitle', () => {
  it('capitalises lowercase titles', () => {
    expect(normalizeTitle('the newspaper')).toBe('The Newspaper');
    expect(normalizeTitle('  spaced   out  ')).toBe('Spaced Out');
    expect(normalizeTitle('hello_world')).toBe('Hello World');
    expect(normalizeTitle('film-review')).toBe('Film Review');
  });

  it('preserves author casing for brands and acronyms', () => {
    expect(normalizeTitle('TEDx')).toBe('TEDx');
    expect(normalizeTitle('Gilley UK')).toBe('Gilley UK');
    expect(normalizeTitle('iPhone app')).toBe('iPhone App');
    expect(normalizeTitle('McDonald')).toBe('McDonald');
    expect(normalizeTitle('BBC News')).toBe('BBC News');
  });

  it('falls back to Untitled', () => {
    expect(normalizeTitle('')).toBe('Untitled');
    expect(normalizeTitle(null)).toBe('Untitled');
  });
});
