const crypto = require('node:crypto');
const { resolveProxyUrl } = require('../../network/source-transport');

const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|ref_src)$/i;

function createConnectorFetch(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const env = options.env || (options.fetchImpl ? {} : process.env);
  const proxyUrl = resolveProxyUrl(env);
  if (!proxyUrl) return fetchImpl;
  const ProxyAgentClass = options.ProxyAgentClass || require('undici').ProxyAgent;
  const dispatcher = new ProxyAgentClass(proxyUrl);
  return (url, requestOptions = {}) => fetchImpl(url, {
    ...requestOptions,
    dispatcher: requestOptions.dispatcher || dispatcher
  });
}

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

function normalizeRateLimitReset(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000).toISOString();
  if (/^\d{13}$/.test(text)) return new Date(Number(text)).toISOString();
  return normalizeIso(text, 'rateLimit.resetAt');
}

function boundedText(value, maximum = 20000) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u0000/g, '').slice(0, maximum);
}

function parseRetryAfter(value, now = new Date()) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(String(value));
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - now.getTime());
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 10000) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal.reason || new Error('request aborted'));
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs);
  timer.unref?.();
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

function responseError(response, now = new Date()) {
  const error = new Error(`upstream request failed with HTTP ${response.status}`);
  const quotaExhausted = response.status === 403
    && response.headers?.get?.('x-ratelimit-remaining') === '0';
  error.status = quotaExhausted ? 429 : response.status;
  error.code = quotaExhausted ? 'rate_limited' : null;
  const reset = response.headers?.get?.('x-ratelimit-reset');
  error.retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'), now);
  if (quotaExhausted && error.retryAfterMs === null && /^\d{10}$/.test(String(reset || ''))) {
    error.retryAfterMs = Math.max(0, Number(reset) * 1000 - now.getTime());
  }
  return error;
}

async function readJsonResponse(response, now = new Date()) {
  if (!response.ok) throw responseError(response, now);
  return response.json();
}

async function readTextResponse(response, now = new Date()) {
  if (!response.ok) throw responseError(response, now);
  return response.text();
}

function encodeConnectorCursor(prefix, value) {
  return `${prefix}:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
}

function decodeConnectorCursor(prefix, cursor) {
  if (!cursor) return {};
  if (typeof cursor !== 'string' || !cursor.startsWith(`${prefix}:`)) {
    throw new TypeError(`invalid ${prefix} cursor`);
  }
  try {
    const value = JSON.parse(Buffer.from(cursor.slice(prefix.length + 1), 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch {
    throw new TypeError(`invalid ${prefix} cursor`);
  }
}

module.exports = {
  createConnectorFetch,
  canonicalizeCreatorUrl,
  createStableId,
  normalizeOpaqueCursor,
  normalizeIso,
  normalizePublishedAt,
  normalizeRateLimitReset,
  boundedText,
  parseRetryAfter,
  fetchWithTimeout,
  responseError,
  readJsonResponse,
  readTextResponse,
  encodeConnectorCursor,
  decodeConnectorCursor
};
