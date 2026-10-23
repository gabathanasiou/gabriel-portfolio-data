/**
 * Output-boundary sanitizers.
 *
 * Airtable is the CMS, but its values are still untrusted input: the journal
 * `Content` field is rendered as HTML by the frontend, and the `Domain`
 * setting is interpolated into sitemap.xml / robots.txt. The `data` branch is
 * also a second writer (it is public and can be hotfixed by hand), so every
 * value is cleaned here rather than trusted downstream.
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Journal content is Markdown that may contain inline HTML. The frontend's
 * renderer passes it through, so only formatting tags are allowed and URL
 * attributes must use a safe scheme.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'code', 'pre', 'span', 'div'
];

const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

const SAFE_URL_SCHEMES = /^(https?:|mailto:|tel:)/i;
const DANGEROUS_URL_SCHEMES = /^(javascript|vbscript|data|file|blob|about|chrome|jar):/i;

/** Decode the entity tricks browsers accept inside an href. */
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&newline;/gi, '');
}

/**
 * True for URLs a browser would execute or treat as a local file. Whitespace
 * and control characters are stripped first, because `java\tscript:` is a
 * working javascript: URL.
 */
export function isUnsafeUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null) return false;
  const normalized = decodeEntities(String(rawUrl))
    .replace(/[\u0000-\u0020\u007f]/g, '')
    .toLowerCase();

  if (!normalized) return false;
  if (normalized.startsWith('#')) return false;
  if (normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) return false;
  if (normalized.startsWith('?')) return false;

  return DANGEROUS_URL_SCHEMES.test(normalized);
}

/**
 * Strip unsafe Markdown link destinations, leaving the label as plain text.
 * The pipeline stores Markdown, so tags are not the only injection surface:
 * the frontend turns `[label](target)` into an `href` verbatim.
 */
function sanitizeMarkdownLinks(markdown) {
  // ![alt](src) and [label](dest "title") — destination runs to the balanced
  // closing paren, which is all a scheme check needs.
  return markdown.replace(/(!?)\[([^\]\n]*)\]\(\s*((?:[^()\n]|\([^()\n]*\))*)\)/g, (match, image, label, destination) => {
    const url = destination.trim().replace(/^<|>$/g, '');
    if (isUnsafeUrl(url)) return label;
    return match;
  });
}

/**
 * Sanitize a journal post's `Content` value (Markdown + optional inline HTML).
 */
export function sanitizeJournalContent(content) {
  if (content === undefined || content === null) return '';

  const withSafeHtml = sanitizeHtml(String(content), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      span: [],
      div: []
    },
    allowedSchemes: ALLOWED_SCHEMES,
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // Keep text that sits between disallowed tags; only the tags go.
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math']
  });

  return sanitizeMarkdownLinks(withSafeHtml)
    // sanitize-html encodes every `>` in text as `&gt;`; Markdown blockquotes
    // need the line-start marker to survive.
    .replace(/^&gt; /gm, '> ');
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * Validate the Airtable `Domain` setting as a bare hostname. Returns '' for
 * anything else (newlines, ports, protocols, paths, markup).
 */
export function sanitizeDomain(value) {
  if (typeof value !== 'string') return '';
  const domain = value.trim().toLowerCase();
  return HOSTNAME.test(domain) ? domain : '';
}

/**
 * Escape a value for XML text/attribute context (sitemap `<loc>`, `<lastmod>`).
 */
export function escapeXml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}
