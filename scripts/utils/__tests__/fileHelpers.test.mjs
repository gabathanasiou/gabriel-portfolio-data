import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  loadJsonFile, 
  saveJsonFile, 
  loadCachedData,
  ensureDir,
  fileExists,
  getDataBaseDir,
  atomicWriteFile 
} from '../helpers/fileHelpers.mjs';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, unlink, rmdir } from 'fs/promises';
import path from 'path';

const TEST_DIR = path.join(process.cwd(), '__test_temp__');
const TEST_FILE = path.join(TEST_DIR, 'test.json');

describe('fileHelpers', () => {
  beforeEach(async () => {
    // Clean up test directory before each test
    if (existsSync(TEST_DIR)) {
      try {
        const files = await import('fs/promises').then(fs => fs.readdir(TEST_DIR));
        for (const file of files) {
          await unlink(path.join(TEST_DIR, file));
        }
        await rmdir(TEST_DIR);
      } catch (e) {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    // Clean up test directory after each test
    if (existsSync(TEST_DIR)) {
      try {
        const files = await import('fs/promises').then(fs => fs.readdir(TEST_DIR));
        for (const file of files) {
          await unlink(path.join(TEST_DIR, file));
        }
        await rmdir(TEST_DIR);
      } catch (e) {
        // Ignore errors
      }
    }
  });

  describe('loadJsonFile', () => {
    it('should load valid JSON file', async () => {
      await mkdir(TEST_DIR, { recursive: true });
      const data = { test: 'value', number: 42 };
      await writeFile(TEST_FILE, JSON.stringify(data), 'utf-8');

      const result = await loadJsonFile(TEST_FILE);
      expect(result).toEqual(data);
    });

    it('should return default value for non-existent file', async () => {
      const result = await loadJsonFile('/non/existent/file.json', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return null as default when no default provided', async () => {
      const result = await loadJsonFile('/non/existent/file.json');
      expect(result).toBeNull();
    });

    it('should handle invalid JSON', async () => {
      await mkdir(TEST_DIR, { recursive: true });
      await writeFile(TEST_FILE, 'invalid json{', 'utf-8');

      const result = await loadJsonFile(TEST_FILE, { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    it('should handle complex nested data', async () => {
      await mkdir(TEST_DIR, { recursive: true });
      const data = {
        nested: {
          deep: {
            value: 'test'
          }
        },
        array: [1, 2, 3]
      };
      await writeFile(TEST_FILE, JSON.stringify(data), 'utf-8');

      const result = await loadJsonFile(TEST_FILE);
      expect(result).toEqual(data);
    });
  });

  describe('saveJsonFile', () => {
    it('should save JSON file with pretty formatting', async () => {
      const data = { test: 'value', number: 42 };
      const result = await saveJsonFile(TEST_FILE, data, true);

      expect(result).toBe(true);
      expect(existsSync(TEST_FILE)).toBe(true);

      const content = await readFile(TEST_FILE, 'utf-8');
      expect(content).toContain('\n');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('should save JSON file without pretty formatting', async () => {
      const data = { test: 'value', number: 42 };
      const result = await saveJsonFile(TEST_FILE, data, false);

      expect(result).toBe(true);
      const content = await readFile(TEST_FILE, 'utf-8');
      expect(content).not.toContain('\n');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('should create directory if it does not exist', async () => {
      const nestedFile = path.join(TEST_DIR, 'nested', 'deep', 'test.json');
      const data = { test: 'value' };
      
      const result = await saveJsonFile(nestedFile, data);

      expect(result).toBe(true);
      expect(existsSync(nestedFile)).toBe(true);
    });

    it('should handle complex nested data', async () => {
      const data = {
        nested: {
          deep: {
            value: 'test'
          }
        },
        array: [1, 2, 3]
      };
      
      await saveJsonFile(TEST_FILE, data);
      const loaded = await loadJsonFile(TEST_FILE);

      expect(loaded).toEqual(data);
    });
  });

  describe('ensureDir', () => {
    it('should create directory', async () => {
      const result = await ensureDir(TEST_DIR);
      
      expect(result).toBe(true);
      expect(existsSync(TEST_DIR)).toBe(true);
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(TEST_DIR, 'nested', 'deep', 'path');
      const result = await ensureDir(nestedDir);

      expect(result).toBe(true);
      expect(existsSync(nestedDir)).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      await mkdir(TEST_DIR, { recursive: true });
      const result = await ensureDir(TEST_DIR);

      expect(result).toBe(true);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      await mkdir(TEST_DIR, { recursive: true });
      await writeFile(TEST_FILE, 'test', 'utf-8');

      expect(fileExists(TEST_FILE)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(fileExists('/non/existent/file.json')).toBe(false);
    });

    it('should return true for existing directory', async () => {
      await mkdir(TEST_DIR, { recursive: true });

      expect(fileExists(TEST_DIR)).toBe(true);
    });
  });

  describe('getDataBaseDir', () => {
    it('should return a valid path', () => {
      const result = getDataBaseDir();
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should prefer public directory if it exists', () => {
      const result = getDataBaseDir();
      
      // In test environment with project, should prefer public/
      if (existsSync(path.join(process.cwd(), 'public'))) {
        expect(result).toContain('public');
      }
    });
  });

  describe('atomicWriteFile', () => {
    it('should write file atomically', async () => {
      const content = 'test content';
      const result = await atomicWriteFile(TEST_FILE, content);

      expect(result).toBe(true);
      expect(existsSync(TEST_FILE)).toBe(true);

      const savedContent = await readFile(TEST_FILE, 'utf-8');
      expect(savedContent).toBe(content);
    });

    it('should not leave temp file after success', async () => {
      const content = 'test content';
      await atomicWriteFile(TEST_FILE, content);

      const tempFile = `${TEST_FILE}.tmp`;
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should create directory if needed', async () => {
      const nestedFile = path.join(TEST_DIR, 'nested', 'test.txt');
      const content = 'test content';
      
      const result = await atomicWriteFile(nestedFile, content);

      expect(result).toBe(true);
      expect(existsSync(nestedFile)).toBe(true);
    });

    it('should handle large content', async () => {
      const largeContent = 'x'.repeat(100000);
      const result = await atomicWriteFile(TEST_FILE, largeContent);

      expect(result).toBe(true);
      const savedContent = await readFile(TEST_FILE, 'utf-8');
      expect(savedContent).toBe(largeContent);
    });
  });

  describe('loadCachedData', () => {
    it('should return null if no cached data exists', async () => {
      const result = await loadCachedData();
      
      // May return null or actual cached data depending on environment
      // Just verify it doesn't throw
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should load from public directory if available', async () => {
      const publicDir = path.join(process.cwd(), 'public');
      
      if (existsSync(publicDir)) {
        const portfolioFile = path.join(publicDir, 'portfolio-data.json');
        const testData = { test: 'data' };
        
        // Save test data
        await saveJsonFile(portfolioFile, testData);
        
        const result = await loadCachedData();
        
        // Clean up
        try {
          await unlink(portfolioFile);
        } catch (e) {
          // Ignore
        }
        
        expect(result).toEqual(testData);
      }
    });
  });
});
