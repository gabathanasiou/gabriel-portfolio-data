/**
 * Shared Video Utilities (Node.js/ESM Compatible)
 * Used in Netlify functions and build scripts
 * Supports YouTube, Vimeo, and Facebook
 */

/**
 * Extract video ID and type from various URL formats
 */
export function getVideoId(url) {
  if (!url) return { type: null, id: null };
  const cleanUrl = url.trim();

  // YouTube Regex
  const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (ytMatch && ytMatch[1]) {
    return { type: 'youtube', id: ytMatch[1] };
  }

  // Facebook Video - always store full URL since their embed requires it
  if (cleanUrl.includes('facebook.com/') || cleanUrl.includes('fb.watch/')) {
    return { type: 'facebook', id: cleanUrl };
  }

  // Vimeo Regex
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(?:(?:channels\/[a-zA-Z0-9]+\/)|(?:groups\/[a-zA-Z0-9]+\/videos\/)|(?:manage\/videos\/))?([0-9]+)(?:\/([a-zA-Z0-9]+))?/);
  
  if (vimeoMatch && vimeoMatch[1]) {
    let id = vimeoMatch[1];
    let hash = vimeoMatch[2] || null;

    if (!hash && cleanUrl.includes('?')) {
      const queryHash = cleanUrl.match(/[?&]h=([a-zA-Z0-9]+)/);
      if (queryHash) hash = queryHash[1];
    }

    return { type: 'vimeo', id, hash };
  }

  // Check if it's a Vimeo vanity URL (e.g., vimeo.com/athanasiou/rooster)
  // These need OEmbed API to resolve, so return the URL as ID for later processing
  if (cleanUrl.includes('vimeo.com/') && !cleanUrl.includes('player.vimeo.com')) {
    return { type: 'vimeo', id: cleanUrl, hash: null };
  }

  return { type: null, id: null };
}

/**
 * Resolve vanity URLs (Node.js version using https module)
 */
export async function resolveVideoUrl(url) {
  if (!url) return '';
  const { type, id, hash } = getVideoId(url);
  
  // If ID is numeric, reconstruct the canonical URL
  if (id && /^\d+$/.test(id)) {
    if (type === 'youtube') return `https://www.youtube.com/watch?v=${id}`;
    if (type === 'vimeo') {
      return hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`;
    }
  }

  // For vanity URLs or if no ID, use OEmbed to resolve
  if (url.includes('vimeo.com')) {
    try {
      const https = await import('node:https');
      return new Promise((resolve) => {
        https.default.get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.video_id) resolve(`https://vimeo.com/${json.video_id}`);
              else resolve(url);
            } catch (e) {
              resolve(url);
            }
          });
        }).on('error', () => resolve(url));
      });
    } catch (e) {
      console.warn(`Failed to resolve Vimeo OEmbed for: ${url}`);
    }
  }
  
  return url;
}/**
 * Generate embed URL for iframe players
 */
export function getEmbedUrl(url, autoplay = false, muted = false) {
  const { type, id, hash } = getVideoId(url);
  if (!type || !id) return null;

  const params = new URLSearchParams();
  if (autoplay) {
    params.set('autoplay', '1');
    if (muted) params.set('muted', '1');
  }

  if (type === 'youtube') {
    params.set('rel', '0');
    params.set('modestbranding', '1');
    params.set('playsinline', '1');
    params.set('controls', '1');
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  if (type === 'vimeo') {
    if (hash) params.set('h', hash);
    params.set('title', '0');
    params.set('byline', '0');
    params.set('portrait', '0');
    params.set('dnt', '1');
    params.set('playsinline', '1');
    return `https://player.vimeo.com/video/${id}?${params.toString()}`;
  }

  if (type === 'facebook') {
    // Facebook uses a plugin iframe with the full video URL
    const videoUrl = id.startsWith('http') ? id : `https://${id}`;
    const fbParams = new URLSearchParams();
    fbParams.set('href', videoUrl);
    fbParams.set('show_text', 'false');
    fbParams.set('allowfullscreen', 'true');
    if (autoplay) fbParams.set('autoplay', 'true');
    if (muted) fbParams.set('mute', 'true');
    return `https://www.facebook.com/plugins/video.php?${fbParams.toString()}`;
  }

  return null;
}

/**
 * Fetch video thumbnail URL (async for Node.js)
 * Handles comma-separated URLs by using the first one
 */
export async function getVideoThumbnail(url) {
  // Handle comma-separated URLs - use the first one for thumbnail
  const firstUrl = url.includes(',') ? url.split(',')[0].trim() : url;
  
  const { type, id } = getVideoId(firstUrl);
  if (!id) return '';

  if (type === 'youtube') {
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }
  
  if (type === 'vimeo') {
    try {
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(firstUrl)}`);
      if (response.ok) {
        const data = await response.json();
        return data.thumbnail_url || data.thumbnail_url_with_play_button || `https://vumbnail.com/${id}.jpg`;
      }
    } catch (e) {
      console.warn(`Vimeo OEmbed thumbnail failed, using fallback`);
    }
    return `https://vumbnail.com/${id}.jpg`;
  }

  if (type === 'facebook') {
    // Facebook doesn't provide easy thumbnail access without Graph API
    // Try the oEmbed endpoint which works for public videos
    try {
      const videoUrl = id.startsWith('http') ? id : `https://${id}`;
      const response = await fetch(`https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(videoUrl)}`);
      if (response.ok) {
        const data = await response.json();
        return data.thumbnail_url || '';
      }
    } catch (e) {
      console.warn(`Facebook OEmbed thumbnail failed for ${url}`);
    }
  }
  
  return '';
}
