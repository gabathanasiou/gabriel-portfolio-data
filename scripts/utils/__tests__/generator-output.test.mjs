import { describe, it, expect } from 'vitest';
import { generateSitemap, generateMinimalSitemap } from '../../generate-sitemap.mjs';
import { generateRobots } from '../../generate-robots.mjs';

const hostile = {
  config: {
    domain: 'evil.com\n</loc><script>alert(1)</script>',
    hasJournal: true
  },
  projects: [
    { slug: '</loc><script>alert(1)</script>', year: '2024', type: 'Narrative' },
    { slug: 'safe-film', year: '2023' }
  ],
  posts: [{ slug: 'post</loc>', date: '2024-05-01' }]
};

describe('generateSitemap', () => {
  it('never emits injected markup from the domain or slugs', () => {
    const xml = generateSitemap(hostile);
    expect(xml).not.toContain('<script');
    expect(xml).not.toContain('</loc><script');
    expect(xml).toContain('&lt;/loc&gt;');
    // A rejected domain falls back to the placeholder host.
    expect(xml).toContain('https://example.com/');
  });

  it('publishes a valid sitemap for normal data', () => {
    const xml = generateSitemap({
      config: { domain: 'directedbygabriel.com', hasJournal: true },
      projects: [{ slug: 'the-newspaper', year: '2024', type: 'Narrative' }],
      posts: [{ slug: 'premiere', date: '2024-05-01' }]
    });
    expect(xml).toContain('<loc>https://directedbygabriel.com/work/the-newspaper</loc>');
    expect(xml).toContain('<loc>https://directedbygabriel.com/journal/premiere</loc>');
    expect(xml).toContain('<lastmod>2024-01-01</lastmod>');
    expect(xml).toContain('<lastmod>2024-05-01</lastmod>');
  });

  it('falls back to today when a date is invalid', () => {
    const today = new Date().toISOString().split('T')[0];
    const xml = generateSitemap({
      config: { domain: 'example.com', hasJournal: true },
      projects: [],
      posts: [{ slug: 'post', date: '2024-99-99' }]
    });
    expect(xml).toContain(`<lastmod>${today}</lastmod>`);
  });

  it('sanitizes the minimal sitemap domain too', () => {
    const xml = generateMinimalSitemap('a.com\n</loc><script>', false);
    expect(xml).not.toContain('a.com');
    expect(xml).not.toContain('<script');
    expect(xml).toContain('https://example.com/');
  });
});

describe('generateRobots', () => {
  it('rejects a domain carrying CR/LF or directives', () => {
    const robots = generateRobots('evil.com\r\nDisallow: /secret');
    expect(robots).not.toContain('/secret');
    expect(robots).not.toContain('\r');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('keeps a valid domain', () => {
    const robots = generateRobots('directedbygabriel.com');
    expect(robots).toContain('Sitemap: https://directedbygabriel.com/sitemap.xml');
    expect(robots).toContain('Disallow: /.env');
  });
});
