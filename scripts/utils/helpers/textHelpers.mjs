/**
 * Shared Text Utilities (Node.js/ESM Compatible)
 * Used in Netlify functions and build scripts
 */

/**
 * Normalize title text
 */
export function normalizeTitle(title) {
  if (!title) return 'Untitled';
  let clean = title.replace(/[_-]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Parse credits text
 * Supports formats:
 * - Multi-line: "Role: Name\nRole: Name"
 * - Comma-separated: "Role: Name, Role: Name"
 * - Mixed: "Role: Name\nRole: Name, Role: Name"
 */
export function parseCreditsText(text) {
  if (!text) return [];

  // Split on newlines first, then commas
  const items = text
    .split(/\r?\n/)
    .flatMap(line => {
      // Split on commas but only if followed by a potential role name pattern
      // Pattern: Start of string/space, Capitalized word(s), then ":" or " by "
      const parts = line.split(/,\s*(?=[A-Z][^:]*(?::|\s+by\s+))/i);
      return parts;
    })
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return items.map(item => {
    // 1. Try Colon (Role: Name)
    const colonIndex = item.indexOf(':');
    if (colonIndex > 0) {
      return {
        role: item.substring(0, colonIndex).trim(),
        name: item.substring(colonIndex + 1).trim()
      };
    }

    // 2. Try " by " (Role by Name) - Case Insensitive
    const byMatch = item.match(/(.*?)\s+by\s+(.*)/i);
    if (byMatch) {
      return {
        role: byMatch[1].trim(),
        name: byMatch[2].trim()
      };
    }

    // 3. Fallback (Treatment as a single credit name if no pattern found)
    return { role: 'Credit', name: item };
  });
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\r?\n/g, " ");
}

/**
 * Calculate reading time
 */
export function calculateReadingTime(content) {
  if (!content) return "1 min read";
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const readingSpeed = 225;
  const minutes = Math.ceil(wordCount / readingSpeed);
  return `${minutes} min read`;
}
