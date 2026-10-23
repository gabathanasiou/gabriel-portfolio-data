/**
 * Publish gate: the last line of defence before artifacts go to the public
 * `data` branch. A misconfigured Airtable base can return a valid 200 with
 * zero records, a renamed display field or a blank Settings row; publishing
 * that overwrites the last good snapshot (audit F-06).
 *
 * These rules are deliberately conservative: they only reject states that are
 * certainly broken, plus an abrupt drop against the previously published JSON.
 */

import { sanitizeDomain } from './sanitize.mjs';

/** A portfolio smaller than this never triggers the drop rule (bootstrap). */
const MIN_COUNT_FOR_DROP_CHECK = 5;
/** Refuse a publish that loses more than half of the previous records. */
export const MAX_DROP_RATIO = 0.5;

const IMAGE_KEYS = new Set([
  'heroImage', 'gallery', 'imageUrl', 'image', 'images',
  'logo', 'favicon', 'defaultOgImage', 'profileImage', 'placeholderImage',
  'posterImage', 'thumbnail'
]);

const AIRTABLE_HOSTS = ['airtable.com', 'airtableusercontent.com'];

function collectStrings(value, at, out) {
  if (typeof value === 'string') {
    out.push({ path: at, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${at}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, `${at}.${key}`, out);
    }
  }
}

/** Every image-typed value in a payload (URLs that must be Cloudinary's). */
export function findImageValues(node, at = '') {
  const out = [];

  if (Array.isArray(node)) {
    node.forEach((item, index) => out.push(...findImageValues(item, `${at}[${index}]`)));
    return out;
  }
  if (!node || typeof node !== 'object') return out;

  for (const [key, value] of Object.entries(node)) {
    const path = at ? `${at}.${key}` : key;
    if (IMAGE_KEYS.has(key)) {
      collectStrings(value, path, out);
    } else if (value && typeof value === 'object') {
      out.push(...findImageValues(value, path));
    }
  }
  return out;
}

/** Expiring Airtable URLs must never reach the published JSON. */
export function findAirtableUrls(payload) {
  return findImageValues(payload).filter(({ value }) =>
    AIRTABLE_HOSTS.some((host) => value.includes(host))
  );
}

function checkDrop(kind, current, previous, errors) {
  if (!previous || !Array.isArray(previous)) return;

  const before = previous.length;
  const after = current.length;
  if (before < MIN_COUNT_FOR_DROP_CHECK) return;

  if (after < before * MAX_DROP_RATIO) {
    errors.push(
      `${kind} dropped from ${before} to ${after} (more than ${Math.round((1 - MAX_DROP_RATIO) * 100)}%) — refusing to overwrite the last good publish`
    );
  }
}

/**
 * Validate one portfolio payload.
 *
 * @param {string} mode - 'directing' | 'postproduction'
 * @param {object} payload - the generated portfolio-data.json
 * @param {object|null} previous - the previously published payload, if any
 * @returns {string[]} errors; empty means safe to publish
 */
export function validatePayload(mode, payload, previous = null) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return [`${mode}: missing portfolio payload`];
  }

  const config = payload.config || {};
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const posts = Array.isArray(payload.posts) ? payload.posts : [];

  if (projects.length === 0) {
    errors.push(`${mode}: 0 projects — refusing to publish an empty portfolio`);
  }

  if (sanitizeDomain(config.domain) === '') {
    errors.push(`${mode}: invalid or missing domain (${JSON.stringify(config.domain ?? '')})`);
  }

  if (String(config.portfolioId || '').toLowerCase() !== mode.toLowerCase()) {
    errors.push(`${mode}: Settings row missing or mismatched (portfolioId "${config.portfolioId ?? ''}") — both Settings rows must exist`);
  }

  if (config.hasJournal !== false && posts.length === 0) {
    errors.push(`${mode}: journal is enabled but there are 0 posts`);
  }

  for (const { path, value } of findAirtableUrls(payload)) {
    errors.push(`${mode}: expiring Airtable image URL at ${path} (${value.slice(0, 60)}…)`);
  }

  if (previous) {
    checkDrop(`${mode}: projects`, projects, previous.projects, errors);
    if (config.hasJournal !== false && previous.config?.hasJournal !== false) {
      checkDrop(`${mode}: journal posts`, posts, previous.posts, errors);
    }
  }

  return errors;
}

/**
 * Validate every generated portfolio. Both portfolios are required: publishing
 * one mode while the other is misconfigured means one site goes blank/unsafe.
 *
 * @param {Record<string, object>} payloads - mode → payload
 * @param {Record<string, object>} previousByMode - mode → last published payload
 * @returns {string[]} errors; empty means safe to publish
 */
export function validatePublish(payloads, previousByMode = {}) {
  const errors = [];

  for (const mode of ['directing', 'postproduction']) {
    if (!payloads[mode]) {
      errors.push(`${mode}: no generated payload`);
      continue;
    }
    errors.push(...validatePayload(mode, payloads[mode], previousByMode[mode] || null));
  }

  const domains = Object.values(payloads)
    .map((payload) => sanitizeDomain(payload?.config?.domain || ''))
    .filter(Boolean);
  if (domains.length > 1 && new Set(domains).size !== domains.length) {
    errors.push(`both portfolios resolve to the same domain (${domains.join(', ')})`);
  }

  return errors;
}
