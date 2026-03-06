/**
 * Image optimization utilities
 * Handles responsive images, lazy loading, and format selection
 * Now includes Cloudinary CDN with local WebP and Airtable fallbacks
 */

import { THEME } from '../theme';

// Enable debug logging in development only
const DEBUG = import.meta.env.DEV;

// Use THEME as the single source of truth for presets
const CLOUDINARY_PRESETS = THEME.cloudinary.presets;

/**
 * Cloudinary configuration
 */
export const cloudinaryConfig = {
  get cloudName() {
    return typeof window !== 'undefined'
      ? window.CLOUDINARY_CLOUD_NAME || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
      : import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'date24ay6';
  },
  get enabled() {
    return typeof window !== 'undefined'
      ? window.USE_CLOUDINARY === 'true' || window.USE_CLOUDINARY === true
      : false;
  }
};

/**
 * Check if Cloudinary is enabled
 * @returns {boolean} Whether Cloudinary feature flag is enabled
 */
export const isCloudinaryEnabled = (): boolean => {
  return cloudinaryConfig.enabled;
};

export type CloudinaryPreset = 'micro' | 'fine' | 'ultra' | 'hero';

export interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  decoding?: 'async' | 'sync' | 'auto';
}

export interface CloudinaryOptions {
  quality?: number; // Only numeric quality values, no auto
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  crop?: 'limit' | 'fill' | 'fit' | 'scale';
  preset?: CloudinaryPreset; // Determines both quality AND width (800 or 1600)
}

/**
 * Check if user is on an ultra-slow connection
 * 
 * @returns boolean - true if connection is ultra-slow (slow-2g or 2g)
 */
export const isUltraSlowConnection = (): boolean => {
  if (typeof window === 'undefined') return false;

  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!connection) return false;

  const ultraSlowConnections = ['slow-2g', '2g'];
  return ultraSlowConnections.includes(connection.effectiveType);
};

/**
 * Check if user is on a slow connection
 * 
 * @returns boolean - true if connection is slow (saveData, 2G, 3G, or slow 4G)
 */
export const isSlowConnection = (): boolean => {
  if (typeof window === 'undefined') return false;

  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!connection) return false;

  const slowConnections = ['slow-2g', '2g', '3g'];
  const isSlow4G = connection.effectiveType === '4g' && connection.downlink && connection.downlink < 1.5;

  return connection.saveData || slowConnections.includes(connection.effectiveType) || isSlow4G;
};

/**
 * Detect optimal preset based on device capabilities and network conditions
 * 
 * Decision logic:
 * - Ultra-slow connection (slow-2g, 2g) → micro
 * - Slow connection (saveData, 3G, or slow 4G <1.5 Mbps) → fine
 * - Large viewport × DPR (≥1024px effective) → ultra
 * - Default → fine
 * 
 * @returns CloudinaryPreset ('micro', 'fine', 'ultra', or 'hero')
 */
export const detectOptimalPreset = (): CloudinaryPreset => {
  if (typeof window === 'undefined') return 'fine';

  // Check for ultra-slow connections first (2G/slow-2g)
  if (isUltraSlowConnection()) {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (DEBUG) console.log(`🐌 Network: Ultra-slow connection detected (${connection?.effectiveType}), using micro preset`);
    return 'micro';
  }

  // Check for slow connections (3G, slow 4G, saveData)
  if (isSlowConnection()) {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const isSlow4G = connection?.effectiveType === '4g' && connection?.downlink && connection.downlink < 1.5;
    const reason = connection?.saveData ? 'saveData' : isSlow4G ? `slow 4G (${connection.downlink}Mbps)` : connection?.effectiveType;
    if (DEBUG) console.log(`🌐 Network: Slow connection detected (${reason}), using fine preset`);
    return 'fine';
  }

  // Check viewport size and DPR
  const viewportWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const effectiveWidth = viewportWidth * dpr;

  if (effectiveWidth >= 1024) {
    if (DEBUG) console.log(`🖥️ Device: ${viewportWidth}px × ${dpr} DPR = ${effectiveWidth}px effective, using ultra preset`);
    return 'ultra';
  }

  if (DEBUG) console.log(`📱 Device: ${viewportWidth}px × ${dpr} DPR = ${effectiveWidth}px effective, using fine preset`);
  return 'fine';
};

/**
 * Update cached preset when network conditions change
 */
const updatePresetOnConnectionChange = () => {
  if (typeof window === 'undefined') return;

  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (connection && !connection._listenerAdded) {
    connection.addEventListener('change', () => {
      const newPreset = detectOptimalPreset();
      const STORAGE_KEY = 'cloudinary_preset';
      const oldPreset = sessionStorage.getItem(STORAGE_KEY);

      if (oldPreset !== newPreset) {
        sessionStorage.setItem(STORAGE_KEY, newPreset);
        if (DEBUG) console.log(`🔄 Connection changed from ${connection.effectiveType}, updated preset: ${oldPreset} → ${newPreset}`);
      }
    });
    connection._listenerAdded = true;
  }
};

/**
 * Get session-cached preset (detects once per session, updates on connection change)
 * 
 * @returns CloudinaryPreset ('ultra' or 'fine')
 */
export const getSessionPreset = (): CloudinaryPreset => {
  if (typeof window === 'undefined') {
    return 'fine';
  }

  const STORAGE_KEY = 'cloudinary_preset';

  // Set up connection change listener (only once)
  updatePresetOnConnectionChange();

  // Check session storage
  const cached = sessionStorage.getItem(STORAGE_KEY);

  if (cached === 'micro' || cached === 'fine' || cached === 'ultra' || cached === 'hero') {
    if (DEBUG) console.log(`✅ Using cached preset: ${cached}`);
    return cached as CloudinaryPreset;
  }

  // Detect and cache
  const preset = detectOptimalPreset();
  if (DEBUG) console.log(`🎯 Detected and caching preset: ${preset}`);
  sessionStorage.setItem(STORAGE_KEY, preset);
  return preset;
};

/**
 * Upgrade a preset to the next higher quality level
 * Preset hierarchy: micro → fine → ultra → hero
 * 
 * @param preset - Current preset
 * @returns CloudinaryPreset - One level higher, or same if already at 'hero'
 */
export const upgradePreset = (preset: CloudinaryPreset): CloudinaryPreset => {
  const hierarchy: CloudinaryPreset[] = ['micro', 'fine', 'ultra', 'hero'];
  const currentIndex = hierarchy.indexOf(preset);
  const nextIndex = Math.min(currentIndex + 1, hierarchy.length - 1);
  const upgraded = hierarchy[nextIndex];

  if (DEBUG && upgraded !== preset) {
    console.log(`⬆️ Preset upgraded: ${preset} → ${upgraded}`);
  }

  return upgraded;
};

/**
 * Build Cloudinary URL with preset-based quality optimization
 * 
 * @param recordId - Airtable record ID
 * @param type - 'project', 'journal', or 'config'
 * @param index - Image index for multiple images (default: 0)
 * @param options - Cloudinary transformation options
 * @returns Cloudinary CDN URL
 */
export const buildCloudinaryUrl = (
  recordId: string,
  type: 'project' | 'journal' | 'config' = 'project',
  index: number = 0,
  options: CloudinaryOptions = {}
): string => {
  // Read cloud name from environment
  const cloudName = cloudinaryConfig.cloudName;

  if (!cloudName) {
    if (DEBUG) console.warn('CLOUDINARY_CLOUD_NAME not configured');
    return '';
  }

  // Build public ID based on naming convention
  // Projects: portfolio-projects-{recordId}-{index}
  // Journal: portfolio-journal-{recordId} (no index)
  // Config: portfolio-config-{recordId} (profile, showreel, etc.)
  let publicId: string;
  if (type === 'journal') {
    publicId = `portfolio-journal-${recordId}`;
  } else if (type === 'config') {
    publicId = `portfolio-config-${recordId}`;
  } else {
    publicId = `portfolio-projects-${recordId}-${index}`;
  }

  // Map preset to quality value AND width
  // ⚠️ Values come from cloudinaryConfig.mjs - edit there, not here!
  let qualityValue: number = CLOUDINARY_PRESETS.fine.quality;
  let widthValue: number = CLOUDINARY_PRESETS.fine.width;

  if (options.preset) {
    if (options.preset === 'hero') {
      qualityValue = CLOUDINARY_PRESETS.hero.quality;
      widthValue = CLOUDINARY_PRESETS.hero.width;
    } else if (options.preset === 'ultra') {
      qualityValue = CLOUDINARY_PRESETS.ultra.quality;
      widthValue = CLOUDINARY_PRESETS.ultra.width;
    } else if (options.preset === 'micro') {
      qualityValue = CLOUDINARY_PRESETS.micro.quality;
      widthValue = CLOUDINARY_PRESETS.micro.width;
    } else {
      qualityValue = CLOUDINARY_PRESETS.fine.quality;
      widthValue = CLOUDINARY_PRESETS.fine.width;
    }
  } else if (options.quality && typeof options.quality === 'number') {
    qualityValue = options.quality;
  }

  // Use preset width (no manual overrides allowed for consistency)
  const {
    format = 'webp',     // Force WebP format
    crop = 'limit'       // Prevent upscaling
  } = options;
  const width = widthValue;

  // Build transformation string: f_webp,w_1600,c_limit,q_90
  const transformations = [
    `f_${format}`,
    `w_${width}`,
    `c_${crop}`,
    `q_${qualityValue}`
  ].join(',');

  // Construct Cloudinary URL
  const finalUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`;

  if (DEBUG) {
    console.log('Cloudinary URL:', { publicId, preset: options.preset, width, quality: qualityValue });
  }

  return finalUrl;
};

/**
 * Get optimized image URL with three-tier fallback strategy
 * 
 * Fallback chain:
 * 1. Cloudinary CDN (if USE_CLOUDINARY=true)
 * 2. Local WebP files (existing optimization)
 * 3. Original Airtable URL
 * 
 * ⚠️ CRITICAL: Always pass totalImages parameter for local WebP consistency
 * 
 * The optimization script generates images with index suffixes when totalImages > 1:
 * - totalImages = 1: project-{id}.webp (no suffix)
 * - totalImages > 1: project-{id}-0.webp, project-{id}-1.webp, etc.
 * 
 * @param recordId - Airtable record ID
 * @param fallbackUrl - Original Airtable image URL
 * @param type - 'project', 'journal', or 'config'
 * @param index - Image index for multiple images (default: 0)
 * @param totalImages - Total number of images. MUST match optimization script output.
 * @param preset - Quality preset for Cloudinary delivery ('ultra' = q_90/w_1600, 'fine' = q_75/w_800)
 * @returns Object with cloudinaryUrl, localUrl, and fallbackUrl
 */
export const getOptimizedImageUrl = (
  recordId: string,
  fallbackUrl: string,
  type: 'project' | 'journal' | 'config' = 'project',
  index: number = 0,
  totalImages: number = 1,
  preset?: CloudinaryPreset
): { cloudinaryUrl: string; localUrl: string; fallbackUrl: string; useCloudinary: boolean } => {
  // If no fallback URL provided, return empty strings
  if (!fallbackUrl) {
    if (DEBUG) console.warn(`No fallback URL for record ${recordId}`);
    return { cloudinaryUrl: '', localUrl: '', fallbackUrl: '', useCloudinary: false };
  }

  // If no record ID, return fallback URL only
  if (!recordId) {
    if (DEBUG) console.warn('No record ID, using fallback URL only');
    return { cloudinaryUrl: '', localUrl: '', fallbackUrl, useCloudinary: false };
  }

  // Check feature flag
  const useCloudinary = isCloudinaryEnabled();

  // Build Cloudinary URL with preset (determines both quality and width)
  const cloudinaryOptions: CloudinaryOptions = {};

  if (preset !== undefined) {
    cloudinaryOptions.preset = preset;
  }

  const cloudinaryUrl = buildCloudinaryUrl(recordId, type, index, cloudinaryOptions);

  // Build local WebP path - matches optimization script naming
  const imageId = `${type}-${recordId}${totalImages > 1 ? `-${index}` : ''}`;
  const localUrl = `/images/portfolio/${imageId}.webp`;

  return {
    cloudinaryUrl,
    localUrl,
    fallbackUrl,
    useCloudinary
  };
};

/**
 * Legacy function for CDN-based optimization
 */
export const getImageSizes = (imageType: 'hero' | 'grid' | 'thumbnail' | 'profile'): string => {
  switch (imageType) {
    case 'hero':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 100vw';
    case 'grid':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
    case 'thumbnail':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw';
    case 'profile':
      return '(max-width: 640px) 100vw, (max-width: 1024px) 400px, 400px';
    default:
      return '100vw';
  }
};

/**
 * Preload critical images for better Core Web Vitals
 */
export const preloadImage = (src: string): void => {
  if (!src || typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.fetchPriority = 'high';
  document.head.appendChild(link);
};

/**
 * Prefetch images for smoother navigation
 */
export const prefetchImage = (src: string): void => {
  if (!src || typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'image';
  link.href = src;
  document.head.appendChild(link);
};

/**
 * Apply Cloudinary transformation preset to any image URL
 * 
 * This function takes any image URL and:
 * - If it's a Cloudinary URL: applies the specified preset transformations
 * - If it's a non-Cloudinary URL: returns the original URL unchanged
 * 
 * @param imageUrl - The source image URL (Cloudinary or other)
 * @param preset - Quality preset ('micro', 'fine', 'ultra', 'hero')
 * @returns Transformed Cloudinary URL or original URL
 * 
 * @example
 * // Cloudinary URL gets transformed
 * applyCloudinaryPreset(
 *   'https://res.cloudinary.com/date24ay6/image/upload/v123/my-image.jpg',
 *   'ultra'
 * );
 * // Returns: 'https://res.cloudinary.com/date24ay6/image/upload/f_webp,w_1600,c_limit,q_90/v123/my-image.jpg'
 * 
 * @example
 * // Non-Cloudinary URL is returned unchanged
 * applyCloudinaryPreset('https://example.com/image.jpg', 'ultra');
 * // Returns: 'https://example.com/image.jpg'
 */
export const applyCloudinaryPreset = (
  imageUrl: string,
  preset: CloudinaryPreset = 'fine'
): string => {
  if (!imageUrl) return '';

  // Check if this is a Cloudinary URL
  const cloudinaryMatch = imageUrl.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)((?:[^/]+\/)*)?(.+)$/
  );

  if (!cloudinaryMatch) {
    // Not a Cloudinary URL, return as-is
    if (DEBUG) console.log('🔗 Non-Cloudinary URL, using as-is:', imageUrl.substring(0, 50) + '...');
    return imageUrl;
  }

  const [, baseUrl, existingTransforms, publicIdWithVersion] = cloudinaryMatch;

  // Get preset settings
  let qualityValue: number;
  let widthValue: number;

  switch (preset) {
    case 'hero':
      qualityValue = CLOUDINARY_PRESETS.hero.quality;
      widthValue = CLOUDINARY_PRESETS.hero.width;
      break;
    case 'ultra':
      qualityValue = CLOUDINARY_PRESETS.ultra.quality;
      widthValue = CLOUDINARY_PRESETS.ultra.width;
      break;
    case 'micro':
      qualityValue = CLOUDINARY_PRESETS.micro.quality;
      widthValue = CLOUDINARY_PRESETS.micro.width;
      break;
    case 'fine':
    default:
      qualityValue = CLOUDINARY_PRESETS.fine.quality;
      widthValue = CLOUDINARY_PRESETS.fine.width;
      break;
  }

  // Build transformation string
  const transformations = `f_webp,w_${widthValue},c_limit,q_${qualityValue}`;

  // Construct the new URL with transformations applied
  const transformedUrl = `${baseUrl}${transformations}/${publicIdWithVersion}`;

  if (DEBUG) {
    console.log('🎨 Applied Cloudinary preset:', { preset, width: widthValue, quality: qualityValue });
    console.log('   Original:', imageUrl.substring(0, 60) + '...');
    console.log('   Transformed:', transformedUrl.substring(0, 80) + '...');
  }

  return transformedUrl;
};
