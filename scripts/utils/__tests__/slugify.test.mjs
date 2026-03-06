import { describe, it, expect } from 'vitest';
import { slugify, makeUniqueSlug } from '../generators/slugify.mjs';

describe('slugify', () => {
  describe('slugify', () => {
    it('should handle empty or null input', () => {
      expect(slugify('')).toBe('untitled');
      expect(slugify(null)).toBe('untitled');
      expect(slugify(undefined)).toBe('untitled');
    });

    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('UPPERCASE')).toBe('uppercase');
    });

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world test')).toBe('hello-world-test');
    });

    it('should replace non-alphanumeric characters with hyphens', () => {
      expect(slugify('hello@world!test')).toBe('hello-world-test');
      expect(slugify('price: $10.99')).toBe('price-10-99');
    });

    it('should remove diacritics and special characters', () => {
      expect(slugify('café')).toBe('cafe');
      expect(slugify('naïve')).toBe('naive');
      expect(slugify('résumé')).toBe('resume');
      expect(slugify('Zürich')).toBe('zurich');
    });

    it('should collapse multiple hyphens', () => {
      expect(slugify('hello---world')).toBe('hello-world');
      expect(slugify('test--multiple--hyphens')).toBe('test-multiple-hyphens');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(slugify('---hello world---')).toBe('hello-world');
      expect(slugify('-start and end-')).toBe('start-and-end');
    });

    it('should handle mixed formatting', () => {
      expect(slugify('  Hello_World---TEST@2024!  ')).toBe('hello-world-test-2024');
    });

    it('should preserve numbers', () => {
      expect(slugify('project 2024 version 2')).toBe('project-2024-version-2');
      expect(slugify('test123')).toBe('test123');
    });

    it('should handle URLs', () => {
      expect(slugify('https://example.com/page')).toBe('https-example-com-page');
    });

    it('should handle only special characters', () => {
      expect(slugify('!@#$%^&*()')).toBe('untitled');
      expect(slugify('---')).toBe('untitled');
    });

    it('should handle unicode characters', () => {
      expect(slugify('hello 世界')).toBe('hello');
      expect(slugify('test 🚀 rocket')).toBe('test-rocket');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(200);
      const result = slugify(longString);
      expect(result).toBe(longString);
    });
  });

  describe('makeUniqueSlug', () => {
    it('should return base slug if not in used set', () => {
      const used = new Set();
      const result = makeUniqueSlug('test-project', used);
      expect(result).toBe('test-project');
      expect(used.has('test-project')).toBe(true);
    });

    it('should add numeric suffix if base slug is taken', () => {
      const used = new Set(['test-project']);
      const result = makeUniqueSlug('test-project', used);
      expect(result).toBe('test-project-2');
      expect(used.has('test-project-2')).toBe(true);
    });

    it('should increment numeric suffix until unique', () => {
      const used = new Set(['test-project', 'test-project-2', 'test-project-3']);
      const result = makeUniqueSlug('test-project', used);
      expect(result).toBe('test-project-4');
      expect(used.has('test-project-4')).toBe(true);
    });

    it('should use fallbackId if base slug is taken', () => {
      const used = new Set(['test-project']);
      const result = makeUniqueSlug('test-project', used, 'rec123xyz');
      expect(result).toBe('test-project-rec123');
      expect(used.has('test-project-rec123')).toBe(true);
    });

    it('should fallback to numeric if fallbackId slug is also taken', () => {
      const used = new Set(['test-project', 'test-project-rec123']);
      const result = makeUniqueSlug('test-project', used, 'rec123xyz');
      expect(result).toBe('test-project-2');
      expect(used.has('test-project-2')).toBe(true);
    });

    it('should slugify the base input', () => {
      const used = new Set();
      const result = makeUniqueSlug('Test Project!!!', used);
      expect(result).toBe('test-project');
    });

    it('should clean fallbackId to alphanumeric only', () => {
      const used = new Set(['test-project']);
      const result = makeUniqueSlug('test-project', used, 'rec!@#123xyz$%^');
      expect(result).toBe('test-project-rec123');
    });

    it('should limit fallbackId to 6 characters', () => {
      const used = new Set(['test-project']);
      const result = makeUniqueSlug('test-project', used, 'verylongid123456789');
      expect(result).toBe('test-project-verylo');
    });

    it('should handle empty base with fallbackId', () => {
      const used = new Set();
      const result = makeUniqueSlug('', used, 'rec123');
      expect(result).toBe('untitled');
    });

    it('should work with multiple sequential calls', () => {
      const used = new Set();
      const result1 = makeUniqueSlug('project', used);
      const result2 = makeUniqueSlug('project', used);
      const result3 = makeUniqueSlug('project', used);
      
      expect(result1).toBe('project');
      expect(result2).toBe('project-2');
      expect(result3).toBe('project-3');
      expect(used.size).toBe(3);
    });

    it('should maintain used set across calls', () => {
      const used = new Set();
      makeUniqueSlug('project-a', used);
      makeUniqueSlug('project-b', used);
      makeUniqueSlug('project-c', used);
      
      expect(used.size).toBe(3);
      expect(used.has('project-a')).toBe(true);
      expect(used.has('project-b')).toBe(true);
      expect(used.has('project-c')).toBe(true);
    });

    it('should handle non-string fallbackId', () => {
      const used = new Set(['test-project']);
      const result = makeUniqueSlug('test-project', used, 12345);
      expect(result).toBe('test-project-12345');
    });

    it('should handle special characters in base', () => {
      const used = new Set();
      const result = makeUniqueSlug('Test@Project#2024!', used);
      expect(result).toBe('test-project-2024');
    });
  });
});
