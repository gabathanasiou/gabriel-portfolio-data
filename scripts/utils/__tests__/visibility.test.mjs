import { describe, it, expect } from 'vitest';
import { isProjectVisible } from '../../lib/sync-logic.mjs';

const DIRECTING = 'Display Status';
const PP = 'Display Status (Post)';

describe('isProjectVisible', () => {
  it('hides records with no display status', () => {
    expect(isProjectVisible({}, DIRECTING)).toBe(false);
    expect(isProjectVisible({ [DIRECTING]: '' }, DIRECTING)).toBe(false);
  });

  it('hides explicitly hidden records', () => {
    expect(isProjectVisible({ [DIRECTING]: 'Hidden' }, DIRECTING)).toBe(false);
  });

  it('shows any published status when no role filter is configured', () => {
    expect(isProjectVisible({ [DIRECTING]: 'Featured' }, DIRECTING)).toBe(true);
    expect(isProjectVisible({ [DIRECTING]: 'Hero' }, DIRECTING)).toBe(true);
  });

  it('applies the per-portfolio display status field', () => {
    const fields = { [DIRECTING]: 'Hidden', [PP]: 'Featured' };
    expect(isProjectVisible(fields, DIRECTING)).toBe(false);
    expect(isProjectVisible(fields, PP)).toBe(true);
  });

  it('requires a matching role when the portfolio filters by role', () => {
    const roles = ['Director', 'Colourist'];
    expect(isProjectVisible({ [DIRECTING]: 'Featured', Role: 'Director' }, DIRECTING, roles)).toBe(true);
    expect(isProjectVisible({ [DIRECTING]: 'Featured', Role: ['Editor', 'Colourist'] }, DIRECTING, roles)).toBe(true);
    expect(isProjectVisible({ [DIRECTING]: 'Featured', Role: 'Editor' }, DIRECTING, roles)).toBe(false);
    expect(isProjectVisible({ [DIRECTING]: 'Featured' }, DIRECTING, roles)).toBe(false);
  });

  it('tolerates a missing fields object', () => {
    expect(isProjectVisible(undefined, DIRECTING)).toBe(false);
  });
});
