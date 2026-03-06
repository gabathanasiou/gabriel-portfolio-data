import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVideoId, getEmbedUrl } from '../videoHelpers.mjs';

describe('videoHelpers', () => {
  describe('getVideoId', () => {
    describe('YouTube', () => {
      it('should extract ID from standard watch URL', () => {
        const result = getVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should extract ID from shortened youtu.be URL', () => {
        const result = getVideoId('https://youtu.be/dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should extract ID from embed URL', () => {
        const result = getVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should extract ID from shorts URL', () => {
        const result = getVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should extract ID from live URL', () => {
        const result = getVideoId('https://www.youtube.com/live/dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should handle URL with additional parameters', () => {
        const result = getVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });

      it('should handle URL without https', () => {
        const result = getVideoId('youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
      });
    });

    describe('Vimeo', () => {
      it('should extract ID from standard vimeo.com URL', () => {
        const result = getVideoId('https://vimeo.com/123456789');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: null });
      });

      it('should extract ID and hash from private video URL', () => {
        const result = getVideoId('https://vimeo.com/123456789/abcdef1234');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: 'abcdef1234' });
      });

      it('should extract ID from player.vimeo.com URL', () => {
        const result = getVideoId('https://player.vimeo.com/video/123456789');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: null });
      });

      it('should extract ID and hash from player URL with query param', () => {
        const result = getVideoId('https://player.vimeo.com/video/123456789?h=abcdef1234');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: 'abcdef1234' });
      });

      it('should extract ID from channels URL', () => {
        const result = getVideoId('https://vimeo.com/channels/staffpicks/123456789');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: null });
      });

      it('should extract ID from groups URL', () => {
        const result = getVideoId('https://vimeo.com/groups/shortfilms/videos/123456789');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: null });
      });

      it('should handle vanity URLs by returning the full URL as ID', () => {
        const url = 'https://vimeo.com/athanasiou/rooster';
        const result = getVideoId(url);
        expect(result).toEqual({ type: 'vimeo', id: url, hash: null });
      });

      it('should handle URL without https', () => {
        const result = getVideoId('vimeo.com/123456789');
        expect(result).toEqual({ type: 'vimeo', id: '123456789', hash: null });
      });
    });

    describe('Invalid URLs', () => {
      it('should return null for empty string', () => {
        const result = getVideoId('');
        expect(result).toEqual({ type: null, id: null });
      });

      it('should return null for null input', () => {
        const result = getVideoId(null);
        expect(result).toEqual({ type: null, id: null });
      });

      it('should return null for undefined input', () => {
        const result = getVideoId(undefined);
        expect(result).toEqual({ type: null, id: null });
      });

      it('should return null for non-video URL', () => {
        const result = getVideoId('https://www.example.com');
        expect(result).toEqual({ type: null, id: null });
      });

      it('should return null for invalid YouTube URL', () => {
        const result = getVideoId('https://www.youtube.com/invalid');
        expect(result).toEqual({ type: null, id: null });
      });
    });
  });

  describe('getEmbedUrl', () => {
    describe('YouTube', () => {
      it('should generate basic embed URL', () => {
        const url = getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(url).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
        expect(url).toContain('rel=0');
        expect(url).toContain('modestbranding=1');
        expect(url).toContain('playsinline=1');
        expect(url).toContain('controls=1');
      });

      it('should add autoplay parameter when enabled', () => {
        const url = getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true);
        expect(url).toContain('autoplay=1');
      });

      it('should add muted parameter when autoplay and muted enabled', () => {
        const url = getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true, true);
        expect(url).toContain('autoplay=1');
        expect(url).toContain('muted=1');
      });

      it('should not add muted without autoplay', () => {
        const url = getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, true);
        expect(url).not.toContain('autoplay=1');
        expect(url).not.toContain('muted=1');
      });
    });

    describe('Vimeo', () => {
      it('should generate basic embed URL', () => {
        const url = getEmbedUrl('https://vimeo.com/123456789');
        expect(url).toContain('https://player.vimeo.com/video/123456789');
        expect(url).toContain('byline=0');
        expect(url).toContain('portrait=0');
        expect(url).toContain('dnt=1');
      });

      it('should include hash parameter for private videos', () => {
        const url = getEmbedUrl('https://vimeo.com/123456789/abcdef1234');
        expect(url).toContain('https://player.vimeo.com/video/123456789');
        expect(url).toContain('h=abcdef1234');
      });

      it('should add autoplay parameter when enabled', () => {
        const url = getEmbedUrl('https://vimeo.com/123456789', true);
        expect(url).toContain('autoplay=1');
      });

      it('should add muted parameter when autoplay and muted enabled', () => {
        const url = getEmbedUrl('https://vimeo.com/123456789', true, true);
        expect(url).toContain('autoplay=1');
        expect(url).toContain('muted=1');
      });
    });

    describe('Invalid URLs', () => {
      it('should return null for empty string', () => {
        expect(getEmbedUrl('')).toBeNull();
      });

      it('should return null for null input', () => {
        expect(getEmbedUrl(null)).toBeNull();
      });

      it('should return null for invalid URL', () => {
        expect(getEmbedUrl('https://www.example.com')).toBeNull();
      });

      it('should return null when video ID cannot be extracted', () => {
        expect(getEmbedUrl('https://www.youtube.com/invalid')).toBeNull();
      });
    });
  });
});
