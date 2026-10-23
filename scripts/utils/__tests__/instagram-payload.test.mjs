import { describe, it, expect } from 'vitest';
import { stripInstagramSecrets, assertNoSecrets } from '../../upload-instagram-data.mjs';

const payload = {
  drafts: [
    {
      id: 'draft-1',
      caption: 'A post',
      instagram: { accessToken: 'IGAA-secret', userId: '17841400000' }
    }
  ],
  scheduleSlots: [{ id: 'slot-1', access_token: 'IGAA-secret-2' }],
  instagram: {
    connected: true,
    username: 'lemonpost',
    accessToken: 'IGAA-top-level-secret',
    refreshToken: 'refresh-secret',
    clientSecret: 'client-secret'
  }
};

describe('stripInstagramSecrets', () => {
  it('removes credentials at every depth', () => {
    const cleaned = stripInstagramSecrets(payload);

    expect(cleaned.instagram.accessToken).toBeUndefined();
    expect(cleaned.instagram.refreshToken).toBeUndefined();
    expect(cleaned.instagram.clientSecret).toBeUndefined();
    expect(cleaned.drafts[0].instagram.accessToken).toBeUndefined();
    expect(cleaned.scheduleSlots[0].access_token).toBeUndefined();
  });

  it('keeps non-secret fields intact', () => {
    const cleaned = stripInstagramSecrets(payload);

    expect(cleaned.instagram.connected).toBe(true);
    expect(cleaned.instagram.username).toBe('lemonpost');
    expect(cleaned.drafts[0].caption).toBe('A post');
    expect(cleaned.drafts[0].instagram.userId).toBe('17841400000');
    expect(cleaned.scheduleSlots[0].id).toBe('slot-1');
  });

  it('does not mutate the input', () => {
    stripInstagramSecrets(payload);
    expect(payload.instagram.accessToken).toBe('IGAA-top-level-secret');
  });
});

describe('assertNoSecrets', () => {
  it('passes a cleaned payload', () => {
    expect(() => assertNoSecrets(JSON.stringify(stripInstagramSecrets(payload)))).not.toThrow();
  });

  it('refuses a payload that still carries a token', () => {
    expect(() => assertNoSecrets(JSON.stringify(payload))).toThrow(/still contains a credential/);
  });
});
