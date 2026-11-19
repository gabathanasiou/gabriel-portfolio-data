import { describe, it, expect } from 'vitest';
import { buildPublishedMapping } from '../../lib/sync-logic.mjs';

const mapping = {
  generatedAt: '2026-10-23T00:00:00.000Z',
  projects: [
    {
      recordId: 'recPUBLISHED',
      title: 'Published Film',
      images: [{ index: 0, publicId: 'portfolio-projects-recPUBLISHED-0', cloudinaryUrl: 'https://res.cloudinary.com/x/p.jpg', airtableId: 'att1' }]
    },
    {
      recordId: 'recHIDDEN',
      title: 'Confidential Client Project',
      images: [{ index: 0, publicId: 'portfolio-projects-recHIDDEN-0', cloudinaryUrl: 'https://res.cloudinary.com/x/h.jpg', airtableId: 'att2' }]
    }
  ],
  journal: [
    { recordId: 'recPOST', title: 'A Published Post', images: [] },
    { recordId: 'recDRAFT', title: 'Unannounced Post', images: [] }
  ],
  config: { images: [{ type: 'logo', portfolioId: 'directing', publicId: 'portfolio-config-directing-logo', cloudinaryUrl: 'https://res.cloudinary.com/x/l.png', airtableId: 'att3' }] },
  brands: [
    {
      recordId: 'recBRAND',
      name: 'Confidential Brand',
      images: { logo: { publicId: 'portfolio-brands-recBRAND-logo', cloudinaryUrl: 'https://res.cloudinary.com/x/b.png', airtableId: 'att4' } }
    }
  ]
};

describe('buildPublishedMapping', () => {
  it('keeps only record ids that are published in at least one portfolio', () => {
    const published = buildPublishedMapping(mapping, new Set(['recPUBLISHED']), new Set(['recPOST']));
    expect(published.projects.map(p => p.recordId)).toEqual(['recPUBLISHED']);
    expect(published.journal.map(p => p.recordId)).toEqual(['recPOST']);
  });

  it('never publishes a title', () => {
    const published = buildPublishedMapping(mapping, new Set(['recPUBLISHED']), new Set(['recPOST']));
    const serialized = JSON.stringify(published);
    expect(serialized).not.toContain('Published Film');
    expect(serialized).not.toContain('Confidential Client Project');
    expect(serialized).not.toContain('Unannounced Post');
    expect(serialized).not.toContain('Confidential Brand');
    for (const entry of [...published.projects, ...published.journal, ...published.brands]) {
      expect(entry).not.toHaveProperty('title');
      expect(entry).not.toHaveProperty('name');
    }
  });

  it('keeps the image cache entries intact', () => {
    const published = buildPublishedMapping(mapping, new Set(['recPUBLISHED']), new Set());
    expect(published.projects[0].images[0]).toEqual(mapping.projects[0].images[0]);
    expect(published.config.images[0].cloudinaryUrl).toBe('https://res.cloudinary.com/x/l.png');
    expect(published.brands[0].images.logo.cloudinaryUrl).toBe('https://res.cloudinary.com/x/b.png');
  });

  it('publishes nothing when nothing is visible', () => {
    const published = buildPublishedMapping(mapping, new Set(), new Set());
    expect(published.projects).toEqual([]);
    expect(published.journal).toEqual([]);
  });

  it('guarantees mapping ids are a subset of published ids', () => {
    const projectIds = new Set(['recPUBLISHED']);
    const journalIds = new Set(['recPOST']);
    const published = buildPublishedMapping(mapping, projectIds, journalIds);

    expect(published.projects.every(p => projectIds.has(p.recordId))).toBe(true);
    expect(published.journal.every(p => journalIds.has(p.recordId))).toBe(true);
  });
});
