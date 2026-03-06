/**
 * Shared File System Utilities (Node.js/ESM Compatible)
 * Reusable file system operations with error handling
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Load JSON data from a file with error handling
 * @param {string} filePath - Absolute or relative path to JSON file
 * @param {any} defaultValue - Default value to return if file doesn't exist or is invalid
 * @returns {Promise<any>} Parsed JSON data or default value
 */
export async function loadJsonFile(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) {
      return defaultValue;
    }
    
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️ Could not load JSON file from ${filePath}:`, error.message);
    return defaultValue;
  }
}

/**
 * Save JSON data to a file with automatic directory creation
 * @param {string} filePath - Absolute or relative path to JSON file
 * @param {any} data - Data to save as JSON
 * @param {boolean} pretty - Whether to pretty-print the JSON (default: true)
 * @returns {Promise<boolean>} Success status
 */
export async function saveJsonFile(filePath, data, pretty = true) {
  try {
    // Create directory if it doesn't exist
    await mkdir(path.dirname(filePath), { recursive: true });
    
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await writeFile(filePath, content, 'utf-8');
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to save JSON file to ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Load cached portfolio data with fallback locations
 * @returns {Promise<any>} Cached data or null
 */
export async function loadCachedData() {
  try {
    // Try public directory first (local development)
    const publicDir = path.join(process.cwd(), 'public');
    if (existsSync(publicDir)) {
      const portfolioDataPath = path.join(publicDir, 'portfolio-data.json');
      const data = await loadJsonFile(portfolioDataPath);
      if (data) {
        console.log('✅ Loaded existing cached data from public/');
        return data;
      }
    }
    
    // Try /tmp directory (Netlify functions)
    const tmpDir = '/tmp';
    const portfolioDataPath = path.join(tmpDir, 'portfolio-data.json');
    const data = await loadJsonFile(portfolioDataPath);
    if (data) {
      console.log('✅ Loaded existing cached data from /tmp/');
      return data;
    }
  } catch (error) {
    console.warn('⚠️ Could not load cached data:', error.message);
  }
  
  return null;
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>} Success status
 */
export async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error(`❌ Failed to create directory ${dirPath}:`, error.message);
    return false;
  }
}

/**
 * Check if a file exists
 * @param {string} filePath - File path to check
 * @returns {boolean} Whether file exists
 */
export function fileExists(filePath) {
  return existsSync(filePath);
}

/**
 * Get the appropriate base directory for data storage
 * Prefers public/ in development, /tmp/ in serverless environments
 * @returns {string} Base directory path
 */
export function getDataBaseDir() {
  const publicDir = path.join(process.cwd(), 'public');
  return existsSync(publicDir) ? publicDir : '/tmp';
}

/**
 * Atomic file write - write to temp file then rename
 * Prevents corruption if process is interrupted
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @returns {Promise<boolean>} Success status
 */
export async function atomicWriteFile(filePath, content) {
  const tempPath = `${filePath}.tmp`;
  
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(tempPath, content, 'utf-8');
    
    // Rename is atomic on POSIX systems
    await import('fs/promises').then(fs => fs.rename(tempPath, filePath));
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to write file atomically to ${filePath}:`, error.message);
    
    // Clean up temp file
    try {
      if (existsSync(tempPath)) {
        await import('fs/promises').then(fs => fs.unlink(tempPath));
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    return false;
  }
}
