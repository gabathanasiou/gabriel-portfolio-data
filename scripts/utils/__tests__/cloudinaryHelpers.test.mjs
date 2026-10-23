import { describe, it, expect } from 'vitest';
import { checkImageExists, isCloudinaryNotFound } from '../cloudinary/cloudinaryHelpers.mjs';

function fakeCloudinary(handler) {
  return { api: { resource: handler } };
}

describe('isCloudinaryNotFound', () => {
  it('recognises the three 404 shapes the SDK produces', () => {
    expect(isCloudinaryNotFound({ error: { http_code: 404 } })).toBe(true);
    expect(isCloudinaryNotFound({ http_code: 404 })).toBe(true);
    expect(isCloudinaryNotFound({ statusCode: 404 })).toBe(true);
    expect(isCloudinaryNotFound({ error: { http_code: 401 } })).toBe(false);
    expect(isCloudinaryNotFound(new Error('boom'))).toBe(false);
    expect(isCloudinaryNotFound(undefined)).toBe(false);
  });
});

describe('checkImageExists', () => {
  it('returns the resource when it exists', async () => {
    const cloudinary = fakeCloudinary(async () => ({
      public_id: 'portfolio-projects-rec1-0',
      secure_url: 'https://res.cloudinary.com/x/p.jpg',
      format: 'jpg',
      bytes: 1234
    }));

    await expect(checkImageExists(cloudinary, 'portfolio-projects-rec1-0')).resolves.toEqual({
      exists: true,
      publicId: 'portfolio-projects-rec1-0',
      cloudinaryUrl: 'https://res.cloudinary.com/x/p.jpg',
      format: 'jpg',
      size: 1234
    });
  });

  it('returns null only for a genuine 404', async () => {
    const cloudinary = fakeCloudinary(async () => {
      throw { error: { http_code: 404 }, message: 'not found' };
    });

    await expect(checkImageExists(cloudinary, 'missing')).resolves.toBeNull();
  });

  it('throws on bad credentials instead of pretending the image is missing', async () => {
    const cloudinary = fakeCloudinary(async () => {
      throw { error: { http_code: 401 }, message: 'Unauthorized' };
    });

    await expect(checkImageExists(cloudinary, 'x')).rejects.toThrow(/HTTP 401/);
  });

  it('throws on rate limiting and server errors', async () => {
    for (const code of [429, 500, 503]) {
      const cloudinary = fakeCloudinary(async () => {
        throw { error: { http_code: code }, message: 'nope' };
      });
      await expect(checkImageExists(cloudinary, 'x')).rejects.toThrow(new RegExp(`HTTP ${code}`));
    }
  });
});
