import { describe, it, expect } from 'vitest';
import { evaluateFreshness } from '../../check-freshness.mjs';

const now = new Date('2026-10-23T12:00:00Z');

function isoDaysAgo(days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function payloads(lastUpdated = isoDaysAgo(0)) {
  return {
    directing: { lastUpdated },
    postproduction: { lastUpdated }
  };
}

describe('evaluateFreshness', () => {
  it('accepts data refreshed today', () => {
    expect(evaluateFreshness(payloads(isoDaysAgo(0)), { now, maxAgeDays: 2 })).toEqual([]);
  });

  it('accepts data within the allowance', () => {
    expect(evaluateFreshness(payloads(isoDaysAgo(1.5)), { now, maxAgeDays: 2 })).toEqual([]);
  });

  it('fails stale data (the preserved-files path)', () => {
    const errors = evaluateFreshness(payloads(isoDaysAgo(230)), { now, maxAgeDays: 2 });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/directing: lastUpdated is 230 day\(s\) old \(limit 2\)/);
  });

  it('fails a missing or invalid timestamp', () => {
    expect(evaluateFreshness({ directing: {}, postproduction: { lastUpdated: 'not-a-date' } }, { now })).toEqual([
      'directing: missing or invalid lastUpdated (null)',
      'postproduction: missing or invalid lastUpdated ("not-a-date")'
    ]);
  });

  it('fails a missing portfolio payload', () => {
    expect(evaluateFreshness({ directing: { lastUpdated: isoDaysAgo(0) } }, { now })).toContain(
      'postproduction: no payload to check'
    );
  });
});
