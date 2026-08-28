const crypto = require('node:crypto');

const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|ref_src)$/i;

function canonicalizeCreatorUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function createStableId(namespace, parts) {
  if (typeof namespace !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/i.test(namespace)) {
    throw new TypeError('stable id namespace is invalid');
  }
  if (!Array.isArray(parts) || parts.length === 0) throw new TypeError('stable id parts are required');
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    if (part === null || part === undefined || String(part) === '') throw new TypeError('stable id part is empty');
    const value = String(part);
    hash.update(String(Buffer.byteLength(value)));
    hash.update(':');
    hash.update(value);
    hash.update('|');
  }
  return `${namespace}_${hash.digest('hex').slice(0, 32)}`;
}

function normalizeOpaqueCursor(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new TypeError('cursor must be an opaque string');
  if (value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('cursor contains unsafe characters or exceeds the size limit');
  }
  return value;
}

function normalizeIso(value, field, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new TypeError(`${field} is required`);
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${field} must be ISO-8601`);
  return parsed.toISOString();
}

function normalizePublishedAt(value, { now, maxFutureMs = 10 * 60 * 1000 } = {}) {
  const normalized = normalizeIso(value, 'publishedAt', { required: true });
  const reference = new Date(now || Date.now());
  if (Number.isNaN(reference.getTime())) throw new TypeError('now must be ISO-8601');
  if (Date.parse(normalized) > reference.getTime() + maxFutureMs) {
    throw new RangeError('publishedAt is implausibly far in the future');
  }
  return normalized;
}

function boundedText(value, maximum = 20000) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u0000/g, '').slice(0, maximum);
}

module.exports = {
  canonicalizeCreatorUrl,
  createStableId,
  normalizeOpaqueCursor,
  normalizeIso,
  normalizePublishedAt,
  boundedText
};
