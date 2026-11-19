import { describe, it, expect } from 'vitest';
import { processBrands } from '../../lib/sync-logic.mjs';

const cloudinaryMapping = {
  brands: [
    {
      recordId: 'recColour',
      name: 'MINI',
      images: {
        logo: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/logo.svg', format: 'svg' },
        colour: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/colour.png', format: 'png' },
        colourMono: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/overlay.png', format: 'png' }
      }
    },
    {
      recordId: 'recAdaptive',
      name: 'Pepsi',
      images: {
        logo: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/pepsi-mono.png', format: 'png' },
        colourMono: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/pepsi-overlay.png', format: 'png' }
      }
    }
  ]
};

const records = [
  {
    id: 'recColour',
    fields: {
      Name: 'MINI',
      'Logo Treatment': 'Colour',
      'Use Adaptive Variant': false,
      Scale: 1.2,
      'Wordmark Style': 'Wide',
      Website: 'https://www.mini.co.uk'
    }
  },
  {
    id: 'recAdaptive',
    fields: {
      Name: 'Pepsi',
      'Log Treatment': 'ignored',
      'Use Adaptive Variant': true
    }
  }
];

describe('processBrands', () => {
  it('maps the three assets and the treatment', () => {
    const brands = processBrands(records, cloudinaryMapping, false);
    const mini = brands.find(brand => brand.id === 'recColour');
    const pepsi = brands.find(brand => brand.id === 'recAdaptive');

    expect(mini).toMatchObject({
      treatment: 'colour',
      scale: 1.2,
      wordmark: 'wide',
      logoColour: 'https://res.cloudinary.com/x/image/upload/v1/colour.png',
      logoColourMono: 'https://res.cloudinary.com/x/image/upload/v1/overlay.png'
    });
    expect(pepsi.treatment).toBe('adaptive');
    expect(pepsi.logoColourMono).toBe('https://res.cloudinary.com/x/image/upload/v1/pepsi-overlay.png');
    expect(pepsi.wordmark).toBe('auto');
    expect(pepsi.scale).toBe(1);
  });

  it('sorts brands by name', () => {
    const brands = processBrands(records, cloudinaryMapping, false);
    expect(brands.map(brand => brand.name)).toEqual(['MINI', 'Pepsi']);
  });

  it('keeps a brand with no attachment so the wordmark can render', () => {
    const brands = processBrands(
      [{ id: 'recWordmark', fields: { Name: 'New Brand' } }],
      { brands: [] },
      false
    );
    expect(brands).toHaveLength(1);
    expect(brands[0].logo).toBe('');
    expect(brands[0].treatment).toBe('mono');
  });
});
