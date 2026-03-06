/**
 * Shared Text Utilities
 * Used across frontend and backend for consistent text processing
 */

/**
 * Normalize title text: Replace underscores/dashes with spaces, title case
 */
export const normalizeTitle = (title: string): string => {
  if (!title) return 'Untitled';
  let clean = title.replace(/[_-]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

/**
 * Parse credits text
 * Supports formats:
 * - Multi-line: "Role: Name\nRole: Name"
 * - Comma-separated: "Role: Name, Role: Name"
 * - Mixed: "Role: Name\nRole: Name, Role: Name"
 */
export const parseCreditsText = (text: string): Array<{ role: string; name: string }> => {
  if (!text) return [];

  // Split on newlines first, then commas, handling both formats
  // Use (?:\r?\n) for newlines and ,(?=\s*\w+:) for commas followed by a role
  const items = text
    .split(/\r?\n/)  // Split on newlines first
    .flatMap(line => {
      // For each line, split on commas but only if followed by "Role:"
      // This prevents splitting names like "John, Jr." or addresses
      const parts = line.split(/,\s*(?=[A-Z][^:]*:)/);
      return parts;
    })
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return items.map(item => {
    const colonIndex = item.indexOf(':');
    if (colonIndex > 0) {
      return {
        role: item.substring(0, colonIndex).trim(),
        name: item.substring(colonIndex + 1).trim()
      };
    }
    return { role: 'Credit', name: item };
  });
};

/**
 * Escape HTML special characters for safe injection into HTML
 */
export const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\r?\n/g, " "); // Remove newlines
};

/**
 * Calculate reading time based on content length
 */
export const calculateReadingTime = (content: string): string => {
  if (!content) return "1 min read";
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const readingSpeed = 225;
  const minutes = Math.ceil(wordCount / readingSpeed);
  return `${minutes} min read`;
};
