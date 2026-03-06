export const slugify = (input: string | undefined): string => {
  if (!input) return 'untitled';
  // Normalize, remove diacritics, convert to lower case
  const normalized = input
    .toString()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  // Replace non-alphanumeric with hyphens
  let slug = normalized.replace(/[^a-z0-9]+/g, '-');

  // Trim hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Collapse multiple hyphens
  slug = slug.replace(/-{2,}/g, '-');

  return slug || 'untitled';
};

export const makeUniqueSlug = (base: string, used: Set<string>, fallbackId?: string): string => {
  let candidate = slugify(base);
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  // Try adding fallbackId short suffix if provided
  if (fallbackId) {
    const suffix = fallbackId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
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
};
