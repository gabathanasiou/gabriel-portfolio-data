/**
 * Shared Network Utilities (Node.js/ESM Compatible)
 * Reusable fetch helpers with timeout and error handling
 */

/**
 * Fetch with timeout to prevent hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Parse external links and categorize into links and videos
 * @param {string} rawText - Raw text containing URLs separated by commas, pipes, or newlines
 * @param {Function} getVideoId - Video ID extraction function
 * @returns {object} Object with links and videos arrays
 */
export function parseExternalLinksData(rawText, getVideoId) {
  const links = [];
  const videos = [];
  
  if (!rawText) return { links, videos };
  
  const items = rawText.split(/[,|\n]+/).map(s => s.trim()).filter(s => s.length > 0);
  
  for (const item of items) {
    if (!item.startsWith('http')) continue;
    
    const isVideo = getVideoId(item).type !== null;
    
    if (isVideo) {
      videos.push(item);
    } else {
      let label = "Link";
      try {
        const hostname = new URL(item).hostname;
        const core = hostname.replace('www.', '').split('.')[0];
        if (core === 'imdb') label = 'IMDb';
        else if (core === 'youtube') label = 'YouTube';
        else if (core === 'linkedin') label = 'LinkedIn';
        else if (core === 'instagram') label = 'Instagram';
        else if (core === 'vimeo') label = 'Vimeo';
        else if (core === 'facebook') label = 'Facebook';
        else label = core.charAt(0).toUpperCase() + core.slice(1);
      } catch (e) {
        // Invalid URL, skip label generation
      }
      
      links.push({ label, url: item });
    }
  }
  
  return { links, videos };
}

/**
 * Generate a smart label from a URL's hostname
 * @param {string} url - URL to generate label from
 * @returns {string} Friendly label for the URL
 */
export function getLabelFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const core = hostname.replace('www.', '').split('.')[0];
    
    const labelMap = {
      'imdb': 'IMDb',
      'youtube': 'YouTube',
      'linkedin': 'LinkedIn',
      'instagram': 'Instagram',
      'vimeo': 'Vimeo',
      'facebook': 'Facebook',
      'twitter': 'Twitter',
      'tiktok': 'TikTok',
      'behance': 'Behance',
      'dribbble': 'Dribbble',
      'github': 'GitHub'
    };
    
    return labelMap[core] || core.charAt(0).toUpperCase() + core.slice(1);
  } catch (e) {
    return 'Link';
  }
}

/**
 * Retry a function with exponential backoff, jitter and Retry-After support.
 *
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of attempts
 * @param {number} initialDelay - Base delay in milliseconds
 * @param {object} options
 * @param {(error: Error) => boolean} options.shouldRetry - Stop early for non-retryable errors
 * @param {number} options.jitter - Fraction of the delay to randomise (default 0.2)
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000, options = {}) {
  const { shouldRetry = () => true, jitter = 0.2 } = options;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries - 1 || !shouldRetry(error)) {
        break;
      }

      const retryAfterMs = Number(error.retryAfterMs) ||
        (Number(error.retryAfter) > 0 ? Number(error.retryAfter) * 1000 : 0);
      const base = retryAfterMs > 0 ? retryAfterMs : initialDelay * Math.pow(2, attempt);
      const factor = 1 + (Math.random() * 2 - 1) * jitter;
      const delay = Math.max(0, Math.round(base * factor));

      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Check if an error is a rate limit error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isRateLimitError(error) {
  return error.statusCode === 429 || error.status === 429 || error.isRateLimit === true;
}

/**
 * Check if an error is a network error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isNetworkError(error) {
  return (
    error.name === 'AbortError' ||
    error.name === 'FetchError' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND'
  );
}
