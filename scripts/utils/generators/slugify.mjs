/**
 * Shared Slug Utilities (Node.js/ESM Compatible)
 * Used in Netlify functions and build scripts
 */

export function slugify(input) {
  if (!input) return 'untitled';
  // Normalize, remove diacritics, convert to lower case
  const normalized = input
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Replace non-alphanumeric with hyphens
  let slug = normalized.replace(/[^a-z0-9]+/g, '-');

  // Trim hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Collapse multiple hyphens
  slug = slug.replace(/-{2,}/g, '-');

  return slug || 'untitled';
}

export function makeUniqueSlug(base, used, fallbackId) {
  let candidate = slugify(base);
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  // Try adding fallbackId short suffix if provided
  if (fallbackId) {
    const suffix = (fallbackId + '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
    const alt = `${candidate}-${suffix}`;
    if (!used.has(alt)) {
      used.add(alt);
      return alt;
    }
  }

  // Find a numeric suffix
  let i = 2;
  while (true) {
    const alt = `${candidate}-${i}`;
    if (!used.has(alt)) {
      used.add(alt);
      return alt;
    }
    i += 1;
  }
}
