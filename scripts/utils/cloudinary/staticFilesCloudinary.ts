/**
 * Utility functions for fetching static files from Cloudinary
 * 
 * These files are uploaded to Cloudinary as "raw" resources for hosting.
 * The portfolio site can dynamically fetch these files from Cloudinary
 * instead of serving them locally.
 */

import type { Project, BlogPost, HomeConfig } from '../types';

// Cloudinary cloud name - can be overridden via environment variable
const CLOUDINARY_CLOUD_NAME = typeof process !== 'undefined' 
  ? process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'date24ay6'
  : 'date24ay6';

// Base folder for static files in Cloudinary
const STATIC_FILES_FOLDER = 'portfolio-static';

/**
 * Static file identifiers and their Cloudinary public IDs
 */
export const STATIC_FILE_IDS = {
  SITEMAP: 'sitemap.xml',
  PORTFOLIO_DATA: 'portfolio-data.json',
  SHARE_META: 'share-meta.json',
  ROBOTS: 'robots.txt'
} as const;

export type StaticFileId = typeof STATIC_FILE_IDS[keyof typeof STATIC_FILE_IDS];

/**
 * Portfolio data structure returned from Cloudinary
 */
export interface PortfolioData {
  projects: Project[];
  posts: BlogPost[];
  config: HomeConfig;
  lastUpdated: string;
  version: string;
  source: string;
}

/**
 * Share meta data structure for social media previews
 */
export interface ShareMetaProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  type: string;
  year: string;
}

export interface ShareMetaPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  type: string;
  date: string;
}

export interface ShareMetaData {
  generatedAt: string;
  projects: ShareMetaProject[];
  posts: ShareMetaPost[];
  config: {
    defaultOgImage: string;
  };
}

/**
 * Get the Cloudinary URL for a static file
 * 
 * @param fileId - The static file identifier (e.g., 'sitemap.xml')
 * @param options - Optional parameters
 * @returns The full Cloudinary URL for the file
 * 
 * @example
 * const sitemapUrl = getStaticFileUrl('sitemap.xml');
 * // Returns: https://res.cloudinary.com/date24ay6/raw/upload/portfolio-static/sitemap.xml
 */
export function getStaticFileUrl(
  fileId: StaticFileId,
  options: {
    cloudName?: string;
    folder?: string;
  } = {}
): string {
  const cloudName = options.cloudName || CLOUDINARY_CLOUD_NAME;
  const folder = options.folder || STATIC_FILES_FOLDER;
  
  return `https://res.cloudinary.com/${cloudName}/raw/upload/${folder}/${fileId}`;
}

/**
 * Get all static file URLs as an object
 * 
 * @returns Object with URLs for all static files
 * 
 * @example
 * const urls = getAllStaticFileUrls();
 * console.log(urls.sitemap); // https://res.cloudinary.com/date24ay6/raw/upload/portfolio-static/sitemap.xml
 */
export function getAllStaticFileUrls(
  options: {
    cloudName?: string;
    folder?: string;
  } = {}
): Record<string, string> {
  return {
    sitemap: getStaticFileUrl(STATIC_FILE_IDS.SITEMAP, options),
    portfolioData: getStaticFileUrl(STATIC_FILE_IDS.PORTFOLIO_DATA, options),
    shareMeta: getStaticFileUrl(STATIC_FILE_IDS.SHARE_META, options),
    robots: getStaticFileUrl(STATIC_FILE_IDS.ROBOTS, options)
  };
}

/**
 * Fetch a static file from Cloudinary
 * 
 * @param fileId - The static file identifier
 * @param options - Fetch options
 * @returns The file content as text or parsed JSON
 * 
 * @example
 * const data = await fetchStaticFile('portfolio-data.json', { parseJson: true });
 */
export async function fetchStaticFile<T = string>(
  fileId: StaticFileId,
  options: {
    cloudName?: string;
    folder?: string;
    parseJson?: boolean;
    cache?: RequestCache;
    bustCache?: boolean;
  } = {}
): Promise<T> {
  let url = getStaticFileUrl(fileId, options);
  
  // Add cache-busting timestamp if requested (default: true for fresh data)
  if (options.bustCache !== false) {
    const timestamp = Date.now();
    url = `${url}?_t=${timestamp}`;
  }
  
  const response = await fetch(url, {
    cache: options.cache || 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileId}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  if (options.parseJson) {
    return JSON.parse(content) as T;
  }

  return content as T;
}

/**
 * Fetch portfolio data from Cloudinary
 * 
 * @returns The parsed portfolio data JSON
 * 
 * @example
 * const portfolioData = await fetchPortfolioData();
 * console.log(portfolioData.projects);
 */
export async function fetchPortfolioData(options: {
  cloudName?: string;
  cache?: RequestCache;
} = {}): Promise<PortfolioData> {
  return fetchStaticFile<PortfolioData>(STATIC_FILE_IDS.PORTFOLIO_DATA, {
    ...options,
    parseJson: true
  });
}

/**
 * Fetch share meta from Cloudinary
 * 
 * @returns The parsed share meta JSON
 */
export async function fetchShareMeta(options: {
  cloudName?: string;
  cache?: RequestCache;
} = {}): Promise<ShareMetaData> {
  return fetchStaticFile<ShareMetaData>(STATIC_FILE_IDS.SHARE_META, {
    ...options,
    parseJson: true
  });
}

/**
 * Check if static files are available from Cloudinary
 * 
 * @returns True if Cloudinary static files are accessible
 */
export async function checkCloudinaryAvailability(options: {
  cloudName?: string;
} = {}): Promise<boolean> {
  try {
    const url = getStaticFileUrl(STATIC_FILE_IDS.PORTFOLIO_DATA, options);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the versioned URL for a static file (with cache-busting)
 * 
 * @param fileId - The static file identifier
 * @param version - Version string or timestamp
 * @returns URL with version query parameter
 * 
 * @example
 * const url = getVersionedStaticFileUrl('portfolio-data.json', '1.2.3');
 * // Returns: https://res.cloudinary.com/.../portfolio-data.json?v=1.2.3
 */
export function getVersionedStaticFileUrl(
  fileId: StaticFileId,
  version: string,
  options: {
    cloudName?: string;
    folder?: string;
  } = {}
): string {
  const baseUrl = getStaticFileUrl(fileId, options);
  return `${baseUrl}?v=${encodeURIComponent(version)}`;
}

export default {
  getStaticFileUrl,
  getAllStaticFileUrls,
  fetchStaticFile,
  fetchPortfolioData,
  fetchShareMeta,
  checkCloudinaryAvailability,
  getVersionedStaticFileUrl,
  STATIC_FILE_IDS
};
