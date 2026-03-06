/**
 * SINGLE SOURCE OF TRUTH for Cloudinary preset settings
 * 
 * ⚠️ IMPORTANT: Edit these values in theme.ts under THEME.cloudinary
 * This file is kept for compatibility but values should be controlled from theme.ts
 * 
 * To change presets, edit:
 * - theme.ts → THEME.cloudinary.presets
 * - theme.ts → THEME.hero.imagePreset (for homepage hero)
 * - theme.ts → THEME.hero.mobileBreakpoint (for mobile downgrade)
 */

// Re-export from theme for backward compatibility
// Note: This is a simplified version - theme.ts has the full configuration
export const CLOUDINARY_PRESETS = {
  micro: {
    quality: 70,
    width: 600
  },
  fine: {
    quality: 80,
    width: 1000
  },
  ultra: {
    quality: 90,
    width: 1600
  },
  hero: {
    quality: 100,
    width: 2400
  }
};

export const CLOUDINARY_CONFIG = {
  format: 'webp',
  crop: 'limit',
  dprs: [1.0, 2.0]
};
