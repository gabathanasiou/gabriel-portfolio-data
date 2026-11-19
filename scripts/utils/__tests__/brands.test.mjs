import { describe, it, expect } from 'vitest';
import { processBrands } from '../../lib/sync-logic.mjs';

const cloudinaryMapping = {
  brands: [
    {
      recordId: 'recColour',
      name: 'MINI',
      images: {
        logo: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/logo.svg', format: 'svg' },
        colour: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/colour.png', format: 'png' }
      }
    },
    {
      recordId: 'recAdaptive',
      name: 'Pepsi',
      images: {
        logo: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/pepsi-mono.png', format: 'png' },
        colourOverlay: { cloudinaryUrl: 'https://res.cloudinary.com/x/image/upload/v1/pepsi-overlay.png', format: 'png' }
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
      Scale: 1.2,
      'Wordmark Style': 'Wide',
      Website: 'https://www.mini.co.uk'
    }
  },
  {
    id: 'recAdaptive',
    fields: {
      Name: 'Pepsi',
      'Logo Treatment': 'Adaptive'
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
      logoColour: 'https://res.cloudinary.com/x/image/upload/v1/colour.png'
    });
    expect(pepsi.treatment).toBe('adaptive');
    expect(pepsi.logoColourOverlay).toBe('https://res.cloudinary.com/x/image/upload/v1/pepsi-overlay.png');
    expect(pepsi.wordmark).toBe('auto');
    expect(pepsi.scale).toBe(1);
  });

  it('sorts brands by name', () => {
    const brands = processBrands(records, cloudinaryMapping, false);
    expect(brands.map(brand => brand.name)).toEqual(['MINI', 'Pepsi']);
  });

  it('falls back to mono for an unknown treatment', () => {
    const brands = processBrands(
      [{ id: 'recUnknown', fields: { Name: 'New Brand', 'Logo Treatment': 'Sparkly' } }],
      { brands: [] },
      false
    );
    expect(brands[0].treatment).toBe('mono');
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
