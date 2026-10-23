/**
 * Shared Cloudinary utilities for image upload and transformation
 * Used across netlify functions and scripts to avoid duplication
 */

import { CLOUDINARY_PRESETS, CLOUDINARY_CONFIG } from './cloudinaryConfig.mjs';

/**
 * Formats a browser can decode in an <img> without a plugin.
 *
 * HEIC/HEIF (the default on Apple photos) and TIFF are fine as *inputs* —
 * Cloudinary decodes them — but Safari is the only mainstream browser that
 * renders them natively. Chrome, Firefox and Edge show a broken image.
 */
export const WEB_SAFE_IMAGE_FORMATS = new Set(['jpg', 'png', 'webp', 'avif', 'gif', 'svg']);

const FORMAT_ALIASES = { jpeg: 'jpg', tif: 'tiff', heif: 'heic' };

/**
 * Normalize a format or MIME type to a bare Cloudinary-style format name.
 * @param {string} format - e.g. 'image/HEIC', '.tif', 'jpeg'
 * @returns {string} e.g. 'heic', 'tiff', 'jpg'
 */
export const normalizeImageFormat = (format) =>
  String(format || '')
    .toLowerCase()
    .trim()
    .replace(/^image\//, '')
    .replace(/\+xml$/, '')
    .replace(/^\./, '')
    .replace(/^(jpeg|tif|heif)$/, (alias) => FORMAT_ALIASES[alias]);

/**
 * True when the format must be converted before a browser can display it.
 * Empty/unknown input is left alone: only a known bad format is a problem.
 */
export const needsWebSafeConversion = (format) => {
  const normalized = normalizeImageFormat(format);
  return normalized !== '' && !WEB_SAFE_IMAGE_FORMATS.has(normalized);
};

const CLOUDINARY_UPLOAD_URL = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/i;
const NON_WEB_EXTENSION = /\.(?:heic|heif|tiff?)$/i;
const TRANSFORM_PARAM = /^(?:f|w|h|q|c|g|dpr|ar|e|b|r|t|o|x|y|z|l|u|ac|af|if|fl|dn|dl|pg|sp|vc|vs|cs|cd|co|bo|du|so|eo|br|fps|ki)_/i;

/**
 * Make a stored image URL web-safe without re-uploading.
 *
 * A raw Cloudinary URL for a HEIC asset (`/image/upload/v123/name.heic`) is
 * served as `image/heic`. Inserting an `f_jpg` transformation makes Cloudinary
 * decode it and deliver JPEG instead. URLs that already carry a transformation,
 * or are not Cloudinary upload URLs, are returned unchanged.
 *
 * @param {string} url - Stored image URL
 * @param {string} [format] - Known asset format (needed when the URL has no extension)
 * @returns {string} A browser-safe URL
 */
export const toWebSafeImageUrl = (url, format = '') => {
  if (!url) return '';

  const match = String(url).match(CLOUDINARY_UPLOAD_URL);
  if (!match) return url;

  const [, base, rest] = match;
  if (!rest) return url;

  const firstSegment = rest.split('/')[0];
  if (firstSegment.includes(',') || TRANSFORM_PARAM.test(firstSegment)) return url;

  const path = rest.split('?')[0];
  if (!NON_WEB_EXTENSION.test(path) && !needsWebSafeConversion(format)) return url;

  return `${base}f_jpg,w_1600,c_limit,q_85/${rest}`;
};

/**
 * Delivery transformation presets (NOT used for upload)
 * These define the quality and size variants available at delivery time.
 * Images are uploaded at original quality and transformed on-demand via URL parameters.
 * 
 * ⚠️ DO NOT EDIT - Import from cloudinaryConfig.mjs instead
 */
export const TRANSFORMATION_PRESETS = {
  widths: [CLOUDINARY_PRESETS.fine.width, CLOUDINARY_PRESETS.ultra.width],
  qualities: [CLOUDINARY_PRESETS.fine.quality, CLOUDINARY_PRESETS.ultra.quality],
  dprs: CLOUDINARY_CONFIG.dprs,
  format: CLOUDINARY_CONFIG.format
};

/**
 * Generate all eager transformation combinations
 * @deprecated No longer used - transformations now happen on-demand at delivery time
 * @returns {Array} Array of transformation objects (8 variants)
 */
export const generateEagerTransformations = () => {
  const transformations = [];
  
  for (const width of TRANSFORMATION_PRESETS.widths) {
    for (const quality of TRANSFORMATION_PRESETS.qualities) {
      for (const dpr of TRANSFORMATION_PRESETS.dprs) {
        transformations.push({
          width,
          quality,
          dpr,
          crop: 'limit',
          format: TRANSFORMATION_PRESETS.format
        });
      }
    }
  }
  
  return transformations;
};

/**
 * Upload image to Cloudinary at original quality without any transformations
 * 
 * Note: Images are stored at original resolution and format.
 * Transformations (quality, format, size) are applied only at delivery time via URL parameters.
 * 
 * @param {Object} cloudinary - Configured Cloudinary instance
 * @param {string} imageUrl - Source image URL to upload
 * @param {string} publicId - Public ID for the uploaded image
 * @param {Object} options - Upload options
 * @param {string} options.title - Image title (for metadata)
 * @param {boolean} options.overwrite - Whether to overwrite existing (default: true)
 * @param {string} [options.format] - Output format. Set to 'jpg' for non-web sources
 *   (HEIC/HEIF/TIFF) so the stored asset is browser-decodable.
 * @returns {Promise<Object>} Upload result with success status and metadata
 */
export const uploadToCloudinary = async (cloudinary, imageUrl, publicId, options = {}) => {
  const {
    title = '',
    airtableId = '',
    overwrite = true,
    format = ''
  } = options;

  // Upload at original quality; delivery-time transformations still apply.
  // A non-empty `format` converts a source browsers cannot decode (HEIC/TIFF)
  // into a web-safe asset at rest.
  const uploadOptions = {
    public_id: publicId,
    folder: '', // Already in public_id
    resource_type: 'image',
    overwrite,
    // A replaced image keeps its public ID (the frontend builds URLs from
    // record id + index), so the CDN copy must be invalidated on overwrite.
    invalidate: overwrite
  };

  if (format) {
    uploadOptions.format = format;
  }

  // Attachment identity is stored on the asset so a later run can tell a
  // genuinely unchanged image from a replaced one that reused the same slot.
  if (airtableId) {
    uploadOptions.context = `airtableId=${airtableId}`;
  }
  
  try {
    const result = await cloudinary.uploader.upload(imageUrl, uploadOptions);
    
    return {
      success: true,
      publicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    console.error(`Failed to upload ${publicId}:`, error.message);
    return {
      success: false,
      error: error.message,
      status: error?.error?.http_code ?? error?.http_code
    };
  }
};

/** 404 is the only Cloudinary error that means "image is missing". */
export const isCloudinaryNotFound = (error) =>
  error?.error?.http_code === 404 || error?.http_code === 404 || error?.statusCode === 404;

/**
 * Check if an image already exists in Cloudinary by public_id
 *
 * A missing image (404) returns null. Every other failure — bad credentials
 * (401/403), rate limiting (429), a 5xx — is thrown: silently treating it as
 * "missing" would re-upload and then fall back to expiring Airtable URLs.
 *
 * @param {Object} cloudinary - Configured Cloudinary instance
 * @param {string} publicId - Public ID to check
 * @returns {Promise<Object|null>} Resource info if exists, null if missing
 */
export const checkImageExists = async (cloudinary, publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'image', context: true });
    return {
      exists: true,
      publicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      format: result.format,
      size: result.bytes,
      // Set on upload (see uploadToCloudinary); null for pre-existing assets.
      airtableId: result.context?.custom?.airtableId || null
    };
  } catch (error) {
    if (isCloudinaryNotFound(error)) {
      return null;
    }
    const code = error?.error?.http_code ?? error?.http_code ?? 'unknown';
    const wrapped = new Error(`Cloudinary lookup failed for ${publicId} (HTTP ${code}): ${error.message}`);
    wrapped.status = typeof code === 'number' ? code : undefined;
    throw wrapped;
  }
};

/**
 * Configure Cloudinary instance with environment credentials
 * 
 * @param {Object} cloudinary - Cloudinary SDK instance
 * @param {Object} credentials - Cloudinary credentials
 * @param {string} credentials.cloudName - Cloud name
 * @param {string} credentials.apiKey - API key
 * @param {string} credentials.apiSecret - API secret
 * @returns {boolean} Whether configuration was successful
 */
export const configureCloudinary = (cloudinary, credentials) => {
  const { cloudName, apiKey, apiSecret } = credentials;
  
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('⚠️ Missing Cloudinary credentials');
    return false;
  }
  
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  
  console.log(`✅ Cloudinary configured: ${cloudName}`);
  return true;
};
