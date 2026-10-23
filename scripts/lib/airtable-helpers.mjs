/**
 * Shared Airtable Helper Functions
 * 
 * Common utilities for fetching and processing data from Airtable.
 * Used by build scripts and Netlify functions to avoid code duplication.
 */

import { getVideoId } from '../utils/videoHelpers.mjs';
import { parseCreditsText as parseCreditsTextShared } from '../utils/helpers/textHelpers.mjs';
import { slugify, makeUniqueSlug } from '../utils/generators/slugify.mjs';
import {
  fetchWithTimeout,
  retryWithBackoff,
  isRateLimitError,
  isNetworkError
} from '../utils/helpers/networkHelpers.mjs';

const AIRTABLE_TIMEOUT_MS = 30000;
const AIRTABLE_MAX_ATTEMPTS = 4;

/** Retry rate limits, transient network failures and 5xx — never 401/403/404. */
export function isRetryableAirtableError(error) {
  return isRateLimitError(error) ||
    isNetworkError(error) ||
    (typeof error?.status === 'number' && error.status >= 500);
}

async function fetchAirtablePage(url, token) {
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` }
  }, AIRTABLE_TIMEOUT_MS);

  if (res.ok) return res;

  const error = new Error(`Airtable request failed: ${res.status} ${res.statusText}`);
  error.status = res.status;
  error.isRateLimit = res.status === 429;
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
  throw error;
}

/**
 * Fetch all records from a table, paginating and retrying transient failures.
 * @param {string} tableName - Name of the Airtable table
 * @param {string} sortField - Field to sort by (optional)
 * @param {string} token - Airtable API token
 * @param {string} baseId - Airtable base ID
 * @returns {Promise<Array>} Array of Airtable records
 */
export async function fetchAirtableTable(tableName, sortField, token, baseId) {
  const sortParam = sortField
    ? `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(sortField)}&sort%5B0%5D%5Bdirection%5D=desc`
    : '';
  let allRecords = [];
  let offset = null;

  do {
    const offsetParam = offset ? `&offset=${offset}` : '';
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${sortParam}${offsetParam}`;

    const res = await retryWithBackoff(
      () => fetchAirtablePage(url, token),
      AIRTABLE_MAX_ATTEMPTS,
      1000,
      { shouldRetry: isRetryableAirtableError }
    );

    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  return allRecords;
}







/**
 * Fetch lookup tables (Festivals and Client Book) and create ID-to-name maps
 * @param {string} token - Airtable API token
 * @param {string} baseId - Airtable base ID
 * @returns {Promise<{festivalsMap: Object, clientsMap: Object}>}
 */
export async function buildLookupMaps(token, baseId) {
  const [festivalsRecords, clientsRecords] = await Promise.all([
    fetchAirtableTable('tblGdWlTVC06ZT60H', null, token, baseId),  // Festivals
    fetchAirtableTable('tblv9PEHYyMy2EuqJ', null, token, baseId)   // Client Book
  ]);

  const festivalsMap = {};
  festivalsRecords.forEach(r => {
    festivalsMap[r.id] = r.fields['Display Name'] || r.fields['Name'] || r.fields['Award'] || 'Unknown Award';
  });

  const clientsMap = {};
  clientsRecords.forEach(r => {
    clientsMap[r.id] = r.fields['Company'] || r.fields['Company Name'] || r.fields['Client'] || 'Unknown';
  });

  return { festivalsMap, clientsMap };
}

/**
 * Parse external links text field and categorize into videos and regular links
 * @param {string} rawText - Raw text containing URLs (comma or newline separated)
 * @returns {{links: Array, videos: Array}} Categorized links
 */
export function parseExternalLinks(rawText) {
  const links = [];
  const videos = [];

  if (!rawText) return { links, videos };

  const items = rawText.split(/[,|\n]+/).map(s => s.trim()).filter(s => s.length > 0);

  for (const item of items) {
    const match = item.match(/\[(.*?)\]\s*(https?:\/\/\S+)/);
    let customLabel = "";
    let url = "";

    if (match) {
      customLabel = match[1].trim();
      url = match[2].trim();
    } else if (item.startsWith('http')) {
      url = item;
    } else {
      continue;
    }

    let domainLabel = "Link";
    try {
      const hostname = new URL(url).hostname;
      const core = hostname.replace('www.', '').split('.')[0];
      if (core === 'imdb') domainLabel = 'IMDb';
      else if (core === 'youtube') domainLabel = 'YouTube';
      else if (core === 'linkedin') domainLabel = 'LinkedIn';
      else if (core === 'instagram') domainLabel = 'Instagram';
      else if (core === 'vimeo') domainLabel = 'Vimeo';
      else if (core === 'facebook') domainLabel = 'Facebook';
      else domainLabel = core.charAt(0).toUpperCase() + core.slice(1);
    } catch (e) { }

    const finalLabel = customLabel ? `${customLabel} → ${domainLabel}` : domainLabel;
    links.push({ label: finalLabel, url: url });
  }

  return { links, videos };
}

/**
 * Generate URL-safe slug from text
 * Uses shared slugify utility with proper unicode handling
 * @param {string} base - Text to slugify
 * @returns {string} URL-safe slug
 */
export function makeSlug(base) {
  const slug = slugify(base);
  // Limit to 80 chars for backward compatibility
  return slug.slice(0, 80) || 'item';
}

/**
 * A slug that is unique within one portfolio (audit F-16).
 *
 * Duplicate titles used to produce duplicate `/work/<slug>` URLs and duplicate
 * sitemap entries. A title with no Latin characters slugifies to `untitled`,
 * which would also collide, so those get the record id as a suffix unless the
 * author literally called it "Untitled".
 *
 * @param {string} title
 * @param {Set<string>} usedSlugs - mutated with the returned slug
 * @param {string} recordId
 */
export function makeContentSlug(title, usedSlugs, recordId) {
  const base = makeSlug(title);
  const isTransliterationFailure = base === 'untitled' &&
    String(title || '').trim().toLowerCase() !== 'untitled';

  if (isTransliterationFailure) {
    const suffix = String(recordId || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
    return makeUniqueSlug(`untitled-${suffix}`, usedSlugs);
  }

  return makeUniqueSlug(base, usedSlugs, recordId);
}

/**
 * Normalize project type into standard categories
 * @param {string} rawType - Raw project type from Airtable
 * @returns {string} Normalized project type
 */
export function normalizeProjectType(rawType) {
  if (!rawType) return 'Uncategorized';
  const tl = rawType.toLowerCase();
  if (/(short|feature|narrative)/.test(tl)) return 'Narrative';
  if (/(commercial|tvc|brand)/.test(tl)) return 'Commercial';
  if (/music/.test(tl)) return 'Music Video';
  if (/documentary/.test(tl)) return 'Documentary';
  return 'Uncategorized';
}

/**
/**
 * Parse credits text into structured role-name pairs
 * Uses shared textHelpers utility for consistent parsing
 * @param {string} rawCreditsText - Raw credits text (format: "Role: Name")
 * @returns {Array<{role: string, name: string}>} Parsed credits
 */
export function parseCreditsText(rawCreditsText) {
  return parseCreditsTextShared(rawCreditsText);
}
/**
 * Process production company field (can be array of IDs or single value)
 * @param {*} productionCompanyField - Raw field from Airtable
 * @param {Object} clientsMap - Map of client IDs to names
 * @returns {string} Resolved production company name(s)
 */
export function resolveProductionCompany(productionCompanyField, clientsMap) {
  if (Array.isArray(productionCompanyField)) {
    return productionCompanyField.map(id => clientsMap[id] || id).join(', ');
  } else if (productionCompanyField) {
    return clientsMap[productionCompanyField] || productionCompanyField;
  }
  return '';
}

/**
 * Process awards field (can be array of festival IDs or newline-separated text)
 * @param {*} festivalsField - Raw field from Airtable
 * @param {Object} festivalsMap - Map of festival IDs to names
 * @returns {Array<string>} Resolved award names
 */
export function resolveAwards(festivalsField, festivalsMap) {
  if (!festivalsField) return [];

  if (Array.isArray(festivalsField)) {
    return festivalsField.map(id => festivalsMap[id] || id);
  } else if (typeof festivalsField === 'string') {
    return festivalsField.split('\n').filter(s => s.trim().length > 0);
  }

  return [];
}
