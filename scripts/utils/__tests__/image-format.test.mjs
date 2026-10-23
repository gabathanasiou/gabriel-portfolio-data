import { describe, it, expect } from 'vitest';
import {
  normalizeImageFormat,
  needsWebSafeConversion,
  toWebSafeImageUrl,
  uploadToCloudinary
} from '../cloudinary/cloudinaryHelpers.mjs';
import { needsReplacement } from '../../lib/sync-logic.mjs';

const CDN = 'https://res.cloudinary.com/demo/image/upload';

describe('normalizeImageFormat', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['IMAGE/HEIC', 'heic'],
    ['image/svg+xml', 'svg'],
    ['.tif', 'tiff'],
    ['heif', 'heic'],
    ['', '']
  ])('%s → %s', (input, expected) => {
    expect(normalizeImageFormat(input)).toBe(expected);
  });
});

describe('needsWebSafeConversion', () => {
  it.each(['heic', 'heif', 'tiff', 'tif', 'image/heic'])('flags %s', (format) => {
    expect(needsWebSafeConversion(format)).toBe(true);
  });

  it.each(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', ''])(
    'accepts %s',
    (format) => {
      expect(needsWebSafeConversion(format)).toBe(false);
    }
  );

  it('leaves an unknown format alone', () => {
    expect(needsWebSafeConversion(undefined)).toBe(false);
  });
});

describe('toWebSafeImageUrl', () => {
  it('converts a raw HEIC URL to JPEG delivery', () => {
    expect(toWebSafeImageUrl(`${CDN}/v123/photo.heic`)).toBe(
      `${CDN}/f_jpg,w_1600,c_limit,q_85/v123/photo.heic`
    );
  });

  it('converts when the extension is missing but the format is known', () => {
    expect(toWebSafeImageUrl(`${CDN}/v123/photo`, 'heic')).toBe(
      `${CDN}/f_jpg,w_1600,c_limit,q_85/v123/photo`
    );
  });

  it('converts TIFF and is case-insensitive', () => {
    expect(toWebSafeImageUrl(`${CDN}/v1/scan.TIFF`)).toMatch(/f_jpg,w_1600/);
  });

  it('leaves web-safe originals alone', () => {
    const url = `${CDN}/v123/photo.jpg`;
    expect(toWebSafeImageUrl(url, 'jpg')).toBe(url);
  });

  it('does not double-transform an already transformed URL', () => {
    const url = `${CDN}/f_webp,w_1600,c_limit,q_90/v123/photo.heic`;
    expect(toWebSafeImageUrl(url)).toBe(url);
  });

  it('does not touch non-Cloudinary URLs', () => {
    const url = 'https://v5.airtableusercontent.com/photo.heic';
    expect(toWebSafeImageUrl(url, 'heic')).toBe(url);
  });

  it('returns an empty string for an empty URL', () => {
    expect(toWebSafeImageUrl('')).toBe('');
  });
});

describe('uploadToCloudinary format conversion', () => {
  const cloudinaryStub = (capture) => ({
    uploader: {
      upload: async (url, options) => {
        capture.options = options;
        return {
          public_id: options.public_id,
          secure_url: `${CDN}/${options.public_id}.${options.format || 'heic'}`,
          format: options.format || 'heic',
          bytes: 10
        };
      }
    }
  });

  it('passes the requested output format and returns the converted URL', async () => {
    const capture = {};
    const result = await uploadToCloudinary(
      cloudinaryStub(capture),
      'https://v5.airtableusercontent.com/photo.heic',
      'portfolio-projects-rec1-0',
      { airtableId: 'attNEW', format: 'jpg' }
    );

    expect(capture.options.format).toBe('jpg');
    expect(result.cloudinaryUrl).toMatch(/\.jpg$/);
    expect(result.format).toBe('jpg');
  });

  it('omits the format option for web-safe sources', async () => {
    const capture = {};
    await uploadToCloudinary(
      cloudinaryStub(capture),
      'https://v5.airtableusercontent.com/photo.jpg',
      'portfolio-projects-rec1-0',
      { airtableId: 'attNEW' }
    );

    expect(capture.options).not.toHaveProperty('format');
  });
});

describe('needsReplacement converts non-web assets', () => {
  const asset = (format) => ({
    exists: true,
    publicId: 'portfolio-projects-rec1-0',
    cloudinaryUrl: `${CDN}/v1/p.heic`,
    format,
    airtableId: 'attKEEP'
  });

  it('re-uploads a HEIC asset even when the attachment is unchanged', () => {
    expect(needsReplacement(asset('heic'), 'attKEEP')).toMatch(/non-web format \(heic\)/);
  });

  it('reuses a web-safe asset', () => {
    expect(needsReplacement(asset('jpg'), 'attKEEP')).toBeNull();
  });
});
