import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  retryWithBackoff,
  isRateLimitError,
  isNetworkError
} from '../helpers/networkHelpers.mjs';
import { fetchAirtableTable, isRetryableAirtableError } from '../../lib/airtable-helpers.mjs';

describe('retryWithBackoff options', () => {
  it('stops immediately for a non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    await expect(
      retryWithBackoff(fn, 4, 1, { shouldRetry: isRetryableAirtableError })
    ).rejects.toThrow('forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit Retry-After delay', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('slow down'), { status: 429, retryAfterMs: 7 }))
      .mockResolvedValue('ok');

    await expect(
      retryWithBackoff(fn, 3, 1000, { shouldRetry: isRateLimitError })
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/retrying in \d+ms/);
    warn.mockRestore();
  });
});

describe('isRetryableAirtableError', () => {
  it('retries rate limits, network errors and 5xx only', () => {
    expect(isRetryableAirtableError({ status: 429 })).toBe(true);
    expect(isRetryableAirtableError({ status: 500 })).toBe(true);
    expect(isRetryableAirtableError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableAirtableError({ name: 'AbortError' })).toBe(true);
    expect(isRetryableAirtableError({ status: 401 })).toBe(false);
    expect(isRetryableAirtableError({ status: 403 })).toBe(false);
    expect(isRetryableAirtableError({ status: 404 })).toBe(false);
  });
});

describe('fetchAirtableTable retry behaviour', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries a 429 and succeeds on the next attempt', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 429,
        headers: { 'retry-after': '0.001' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: [{ id: 'rec1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    const records = await fetchAirtableTable('Projects', null, 'token', 'base');

    expect(records).toEqual([{ id: 'rec1' }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry an auth failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }));

    await expect(fetchAirtableTable('Projects', null, 'token', 'base')).rejects.toThrow(/403/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
