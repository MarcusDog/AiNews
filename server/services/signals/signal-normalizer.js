const crypto = require('node:crypto');

const METRIC_FIELDS = [
  'views', 'likes', 'comments', 'replies', 'shares', 'reposts',
  'stars', 'forks', 'openIssues', 'points', 'rank', 'downloads'
];

const TRACKING_PARAMS = new Set([
  'ref', 'source', 'from', 'spm', 'campaign', 'mc_cid', 'mc_eid', 'feature', 'si'
]);

function canonicalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith('utm_') || TRACKING_PARAMS.has(normalized)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    const serialized = url.toString();
    return serialized.endsWith('/') && url.pathname === '/'
      ? serialized.slice(0, -1)
      : serialized;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeTimestamp(value, fallback = null) {
  const date = value ? new Date(value) : fallback ? new Date(fallback) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeMetrics(metrics = {}) {
  return Object.fromEntries(METRIC_FIELDS.map((field) => {
    const raw = metrics[field];
    if (raw === undefined || raw === null || raw === '') return [field, null];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new TypeError(`metric ${field} 必须是非负数字`);
    }
    return [field, parsed];
  }));
}

function signalFingerprint(input = {}) {
  const sourceId = normalizeText(input.sourceId).toLowerCase();
  const externalId = normalizeText(input.externalId).toLowerCase();
  const url = canonicalizeUrl(input.url) || '';
  const title = normalizeText(input.title).toLowerCase();
  const publishedAt = normalizeTimestamp(input.publishedAt) || '';
  const identity = externalId || url || `${title}|${publishedAt}`;
  return crypto.createHash('sha256').update(`${sourceId}|${identity}`).digest('hex');
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function normalizeSignal(input = {}, source = {}, options = {}) {
  const title = normalizeText(input.title);
  if (!title) throw new TypeError('Signal title 不能为空');

  const url = canonicalizeUrl(input.url);
  if (!url) throw new TypeError('Signal URL 必须是安全的 HTTP(S) 地址');

  const publishedAt = normalizeTimestamp(input.publishedAt, options.now || new Date());
  if (!publishedAt) throw new TypeError('Signal publishedAt 无效');
  if (!source.id || !source.platform || !source.region || !source.trustClass) {
    throw new TypeError('Signal source contract 不完整');
  }

  const externalId = normalizeText(input.externalId) || null;
  const fingerprint = signalFingerprint({
    sourceId: source.id,
    externalId,
    url,
    publishedAt,
    title
  });
  const collectedAt = normalizeTimestamp(options.now || new Date());

  const bridgePlatform = source.trustClass === 'bridge' ? normalizeText(input.platform).toLowerCase() : '';
  const bridgeRegion = source.trustClass === 'bridge' && ['cn', 'global'].includes(input.region)
    ? input.region
    : '';
  const legacyRegion = (source.id === 'legacy-news' || source.adapter === 'legacy-news') && ['cn', 'global'].includes(input.region)
    ? input.region
    : '';

  return {
    id: fingerprint,
    fingerprint,
    externalId,
    sourceId: source.id,
    sourceName: source.name || source.id,
    sourceTrustClass: source.trustClass,
    platform: bridgePlatform || source.platform,
    region: bridgeRegion || legacyRegion || source.region,
    kind: normalizeText(input.kind) || 'post',
    title,
    summary: normalizeText(input.summary || input.description) || null,
    url,
    canonicalUrl: url,
    author: normalizeText(input.author) || null,
    language: normalizeText(input.language) || null,
    publishedAt,
    collectedAt,
    firstSeenAt: collectedAt,
    lastSeenAt: collectedAt,
    metrics: normalizeMetrics(input.metrics),
    tags: Array.isArray(input.tags)
      ? [...new Set(input.tags.map(normalizeText).filter(Boolean))]
      : [],
    repoFullName: normalizeText(input.repoFullName) || null,
    rawJson: safeJson(input.raw)
  };
}

module.exports = {
  METRIC_FIELDS,
  canonicalizeUrl,
  normalizeMetrics,
  normalizeSignal,
  normalizeTimestamp,
  signalFingerprint
};
