/**
 * Shared Video Utilities
 * Used across frontend and backend for consistent video handling
 * Supports YouTube, Vimeo, and Facebook with vanity URL resolution
 */

export interface VideoIdResult {
  type: 'youtube' | 'vimeo' | 'facebook' | null;
  id: string | null;
  hash?: string | null;
}

/**
 * Extract video ID and type from various URL formats
 * Supports YouTube (watch, embed, youtu.be, shorts, live), Vimeo (with hash support), and Facebook
 */
export const getVideoId = (url: string): VideoIdResult => {
  if (!url) return { type: null, id: null };
  const cleanUrl = url.trim();

  // YouTube Regex
  // Covers: youtube.com/watch?v=, youtube.com/embed/, youtu.be/, youtube.com/v/, youtube.com/shorts/, youtube.com/live/
  const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (ytMatch && ytMatch[1]) {
    return { type: 'youtube', id: ytMatch[1] };
  }

  // Facebook Video Regex
  // Covers: facebook.com/*/videos/*, fb.watch/*, facebook.com/watch?v=*, facebook.com/video.php?v=*
  // For Facebook, we always store the full URL since their embed requires it
  if (cleanUrl.includes('facebook.com/') || cleanUrl.includes('fb.watch/')) {
    // Return the full URL as ID since Facebook embeds need the full URL
    return { type: 'facebook', id: cleanUrl };
  }

  // Vimeo Regex
  // Covers: vimeo.com/123456, vimeo.com/123456/hash, player.vimeo.com/video/123456
  // Ignores prefixes: manage/videos, channels/xxx, groups/xxx/videos
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(?:(?:channels\/[a-zA-Z0-9]+\/)|(?:groups\/[a-zA-Z0-9]+\/videos\/)|(?:manage\/videos\/))?([0-9]+)(?:\/([a-zA-Z0-9]+))?/);
  
  if (vimeoMatch && vimeoMatch[1]) {
    let id = vimeoMatch[1];
    let hash = vimeoMatch[2] || null;

    // Check for query param hash if not found in path (?h=abcdef)
    if (!hash && cleanUrl.includes('?')) {
      try {
        const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        const urlObj = new URL(fullUrl);
        const h = urlObj.searchParams.get('h');
        if (h) hash = h;
      } catch (e) {
        // Fallback regex if URL parsing fails
        const queryHash = cleanUrl.match(/[?&]h=([a-zA-Z0-9]+)/);
        if (queryHash) hash = queryHash[1];
      }
    }

    return { type: 'vimeo', id, hash };
  }

  // Check if it's a Vimeo vanity URL (e.g., vimeo.com/athanasiou/rooster)
  // These need OEmbed API to resolve, so return the URL as ID for later processing
  if (cleanUrl.includes('vimeo.com/') && !cleanUrl.includes('player.vimeo.com')) {
    return { type: 'vimeo', id: cleanUrl, hash: null };
  }

  return { type: null, id: null };
};

/**
 * Resolve vanity URLs and normalize video URLs
 * Uses OEmbed API for Vimeo vanity URLs as fallback
 */
export const resolveVideoUrl = async (url: string): Promise<string> => {
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
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.video_id) {
          return `https://vimeo.com/${data.video_id}`;
        }
      }
    } catch (e) {
      console.warn(`Failed to resolve Vimeo OEmbed for: ${url}`);
    }
  }

  return url;
};

/**
 * Generate embed URL for iframe players
 */
export const getEmbedUrl = (url: string, autoplay: boolean = false, muted: boolean = false): string | null => {
  const { type, id, hash } = getVideoId(url);
  if (!type || !id) return null; 

  const params = new URLSearchParams();
  if (autoplay) {
    params.set('autoplay', '1');
    if (muted) {
      params.set('muted', '1');
    }
  }

  if (type === 'youtube') {
    params.set('rel', '0');
    params.set('modestbranding', '1');
    params.set('playsinline', '1');
    params.set('controls', '1');
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  if (type === 'vimeo') {
    // Check if ID is numeric (resolved) or a URL (vanity URL)
    const isNumericId = /^\d+$/.test(id);
    
    if (!isNumericId) {
      // For vanity URLs, return null - they need to be resolved via OEmbed first
      console.warn(`Vimeo vanity URL detected: ${id}. Use resolveVideoUrl first.`);
      return null;
    }
    
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
    // The ID here is the full URL for Facebook videos
    const videoUrl = id.startsWith('http') ? id : `https://${id}`;
    const fbParams = new URLSearchParams();
    fbParams.set('href', videoUrl);
    fbParams.set('show_text', 'false');
    fbParams.set('allowfullscreen', 'true');
    if (autoplay) {
      fbParams.set('autoplay', 'true');
    }
    if (muted) {
      fbParams.set('mute', 'true');
    }
    return `https://www.facebook.com/plugins/video.php?${fbParams.toString()}`;
  }

  return null;
};

/**
 * Fetch video thumbnail URL
 * For YouTube: uses maxresdefault
 * For Vimeo: tries OEmbed first, falls back to vumbnail service
 */
export const fetchVideoThumbnail = async (url: string): Promise<string> => {
  const { type, id } = getVideoId(url);
  if (!id) return '';

  if (type === 'youtube') {
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }
  
  if (type === 'vimeo') {
    // Try OEmbed first for highest quality and private video support
    // This also handles vanity URLs like vimeo.com/athanasiou/rooster
    try {
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const data = await response.json();
        return data.thumbnail_url || data.thumbnail_url_with_play_button || '';
      }
    } catch (e) {
      console.warn(`Vimeo OEmbed thumbnail failed for ${url}, falling back.`);
    }
    
    // Fallback to vumbnail only if ID is numeric
    const isNumericId = /^\d+$/.test(id);
    if (isNumericId) {
      return `https://vumbnail.com/${id}.jpg`;
    }
  }

  if (type === 'facebook') {
    // Facebook doesn't provide easy thumbnail access without Graph API
    // We'll try the oEmbed endpoint which works for public videos
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
};
