/**
 * Shared Cloudinary utilities for image upload and transformation
 * Used across netlify functions and scripts to avoid duplication
 */

import { CLOUDINARY_PRESETS, CLOUDINARY_CONFIG } from './cloudinaryConfig.mjs';

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
 * @returns {Promise<Object>} Upload result with success status and metadata
 */
export const uploadToCloudinary = async (cloudinary, imageUrl, publicId, options = {}) => {
  const {
    title = '',
    overwrite = true
  } = options;
  
  // Upload original image without any transformations
  // Transformations happen at delivery time only
  const uploadOptions = {
    public_id: publicId,
    folder: '', // Already in public_id
    resource_type: 'image',
    overwrite
    // NO format, quality, or eager transformations
  };
  
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
      error: error.message
    };
  }
};

/**
 * Check if an image already exists in Cloudinary by public_id
 * 
 * @param {Object} cloudinary - Configured Cloudinary instance
 * @param {string} publicId - Public ID to check
 * @returns {Promise<Object|null>} Resource info if exists, null if not
 */
export const checkImageExists = async (cloudinary, publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    return {
      exists: true,
      publicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    // 404 means image doesn't exist - that's expected
    if (error.error?.http_code === 404 || error.http_code === 404) {
      return null;
    }
    // Log other errors but don't throw - treat as "doesn't exist"
    console.warn(`[cloudinary] Warning checking ${publicId}:`, error.message);
    return null;
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
