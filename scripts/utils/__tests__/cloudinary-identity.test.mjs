import { describe, it, expect } from 'vitest';
import { needsReplacement } from '../../lib/sync-logic.mjs';
import { checkImageExists, uploadToCloudinary } from '../cloudinary/cloudinaryHelpers.mjs';

describe('needsReplacement', () => {
  const asset = (airtableId) => ({
    exists: true,
    publicId: 'portfolio-projects-rec1-0',
    cloudinaryUrl: 'https://res.cloudinary.com/demo/image/upload/p.jpg',
    airtableId
  });

  it('reuses an asset whose attachment matches', () => {
    expect(needsReplacement(asset('attKEEP'), 'attKEEP')).toBeNull();
  });

  it('re-uploads when the gallery slot holds a different attachment', () => {
    expect(needsReplacement(asset('attOLD'), 'attNEW')).toMatch(/attOLD → attNEW/);
  });

  it('re-uploads a pre-migration asset that has no attachment metadata', () => {
    expect(needsReplacement(asset(null), 'attNEW')).toMatch(/no attachment metadata/);
  });

  it('reports nothing for a missing asset (the caller uploads)', () => {
    expect(needsReplacement(null, 'attNEW')).toBeNull();
  });
});

describe('attachment identity round-trip', () => {
  it('checkImageExists exposes the stored attachment id', async () => {
    const cloudinary = {
      api: {
        resource: async () => ({
          public_id: 'portfolio-projects-rec1-0',
          secure_url: 'https://res.cloudinary.com/demo/image/upload/p.jpg',
          format: 'jpg',
          bytes: 10,
          context: { custom: { airtableId: 'attKEEP' } }
        })
      }
    };

    await expect(checkImageExists(cloudinary, 'portfolio-projects-rec1-0')).resolves.toMatchObject({
      airtableId: 'attKEEP'
    });
  });

  it('uploadToCloudinary stamps the attachment id and invalidates the CDN copy', async () => {
    const upload = async (_url, options) => {
      expect(options.context).toBe('airtableId=attNEW');
      expect(options.invalidate).toBe(true);
      expect(options.overwrite).toBe(true);
      return {
        public_id: options.public_id,
        secure_url: 'https://res.cloudinary.com/demo/image/upload/p.jpg',
        format: 'jpg',
        bytes: 10
      };
    };

    const result = await uploadToCloudinary(
      { uploader: { upload } },
      'https://v5.airtableusercontent.com/att/new',
      'portfolio-projects-rec1-0',
      { title: 'Film', airtableId: 'attNEW' }
    );

    expect(result.success).toBe(true);
  });
});
