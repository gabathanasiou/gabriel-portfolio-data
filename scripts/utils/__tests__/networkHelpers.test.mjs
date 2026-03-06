import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  fetchWithTimeout, 
  parseExternalLinksData, 
  getLabelFromUrl,
  retryWithBackoff,
  isRateLimitError,
  isNetworkError 
} from '../helpers/networkHelpers.mjs';

// Mock getVideoId for testing parseExternalLinksData
const mockGetVideoId = (url) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return { type: 'youtube', id: 'test123' };
  }
  if (url.includes('vimeo.com')) {
    return { type: 'vimeo', id: '123456' };
  }
  return { type: null, id: null };
};

describe('networkHelpers', () => {
  describe('fetchWithTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should fetch successfully within timeout', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const promise = fetchWithTimeout('https://example.com', {}, 5000);
      vi.runAllTimers();
      const result = await promise;

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
        signal: expect.any(AbortSignal)
      }));
    });

    it('should abort request on timeout', async () => {
      let abortCalled = false;
      
      global.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            abortCalled = true;
            reject(new Error('AbortError'));
          });
        });
      });

      const promise = fetchWithTimeout('https://example.com', {}, 100);
      
      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(150);
      
      await expect(promise).rejects.toThrow();
      expect(abortCalled).toBe(true);
    });
  });

  describe('parseExternalLinksData', () => {
    it('should handle empty input', () => {
      expect(parseExternalLinksData('', mockGetVideoId)).toEqual({ links: [], videos: [] });
      expect(parseExternalLinksData(null, mockGetVideoId)).toEqual({ links: [], videos: [] });
      expect(parseExternalLinksData(undefined, mockGetVideoId)).toEqual({ links: [], videos: [] });
    });

    it('should parse comma-separated URLs', () => {
      const input = 'https://youtube.com/watch?v=123, https://example.com';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.videos).toEqual(['https://youtube.com/watch?v=123']);
      expect(result.links).toHaveLength(1);
      expect(result.links[0].url).toBe('https://example.com');
    });

    it('should parse newline-separated URLs', () => {
      const input = 'https://youtube.com/watch?v=123\nhttps://example.com';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.videos).toEqual(['https://youtube.com/watch?v=123']);
      expect(result.links).toHaveLength(1);
    });

    it('should parse pipe-separated URLs', () => {
      const input = 'https://youtube.com/watch?v=123 | https://example.com';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.videos).toEqual(['https://youtube.com/watch?v=123']);
      expect(result.links).toHaveLength(1);
    });

    it('should categorize videos correctly', () => {
      const input = 'https://youtube.com/watch?v=123, https://vimeo.com/123456';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.videos).toHaveLength(2);
      expect(result.links).toHaveLength(0);
    });

    it('should categorize links correctly', () => {
      const input = 'https://example.com, https://another.com';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.videos).toHaveLength(0);
      expect(result.links).toHaveLength(2);
    });

    it('should filter out non-http URLs', () => {
      const input = 'https://example.com, not-a-url, ftp://test.com';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.links).toHaveLength(1);
      expect(result.links[0].url).toBe('https://example.com');
    });

    it('should generate appropriate labels', () => {
      const input = 'https://imdb.com/title/123, https://linkedin.com/in/user';
      const result = parseExternalLinksData(input, mockGetVideoId);
      
      expect(result.links[0].label).toBe('IMDb');
      expect(result.links[1].label).toBe('LinkedIn');
    });
  });

  describe('getLabelFromUrl', () => {
    it('should generate known labels', () => {
      expect(getLabelFromUrl('https://imdb.com/title/123')).toBe('IMDb');
      expect(getLabelFromUrl('https://youtube.com/watch?v=123')).toBe('YouTube');
      expect(getLabelFromUrl('https://linkedin.com/in/user')).toBe('LinkedIn');
      expect(getLabelFromUrl('https://instagram.com/user')).toBe('Instagram');
      expect(getLabelFromUrl('https://github.com/user')).toBe('GitHub');
    });

    it('should handle www subdomain', () => {
      expect(getLabelFromUrl('https://www.imdb.com/title/123')).toBe('IMDb');
      expect(getLabelFromUrl('https://www.youtube.com/watch?v=123')).toBe('YouTube');
    });

    it('should capitalize unknown domains', () => {
      expect(getLabelFromUrl('https://example.com')).toBe('Example');
      expect(getLabelFromUrl('https://mysite.org')).toBe('Mysite');
    });

    it('should return default label for invalid URLs', () => {
      expect(getLabelFromUrl('not-a-url')).toBe('Link');
      expect(getLabelFromUrl('')).toBe('Link');
    });
  });

  describe('retryWithBackoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const promise = retryWithBackoff(fn, 3, 1000);
      vi.runAllTimers();
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const promise = retryWithBackoff(fn, 3, 100);
      
      // Wait for retries
      await vi.runAllTimersAsync();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const promise = retryWithBackoff(fn, 3, 100);
      
      await vi.advanceTimersByTimeAsync(100); // First retry after 100ms
      await vi.advanceTimersByTimeAsync(200); // Second retry after 200ms
      
      const result = await promise;
      expect(result).toBe('success');
    });

    it('should throw last error after max retries', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);
      
      const promise = retryWithBackoff(fn, 3, 100);
      
      // Catch the promise to prevent unhandled rejection
      const resultPromise = promise.catch(err => err);
      
      await vi.runAllTimersAsync();
      
      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('isRateLimitError', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimitError({ statusCode: 429 })).toBe(true);
      expect(isRateLimitError({ status: 429 })).toBe(true);
      expect(isRateLimitError({ isRateLimit: true })).toBe(true);
    });

    it('should not flag other errors', () => {
      expect(isRateLimitError({ statusCode: 500 })).toBe(false);
      expect(isRateLimitError({ status: 404 })).toBe(false);
      expect(isRateLimitError(new Error('generic error'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should detect network errors', () => {
      expect(isNetworkError({ name: 'AbortError' })).toBe(true);
      expect(isNetworkError({ name: 'FetchError' })).toBe(true);
      expect(isNetworkError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isNetworkError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isNetworkError({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should not flag other errors', () => {
      expect(isNetworkError(new Error('generic error'))).toBe(false);
      expect(isNetworkError({ name: 'ValidationError' })).toBe(false);
      expect(isNetworkError({ code: 'OTHER_CODE' })).toBe(false);
    });
  });
});
