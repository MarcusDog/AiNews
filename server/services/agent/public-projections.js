const net = require('node:net');
const { object, text, count, list } = require('./tool-schemas');
const ContentService = require('../ContentService');
const { classifyEvidenceType } = require('../../utils/analytics');

const QUERY_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const CREDENTIAL_PARAM = /^(?:token|access_token|refresh_token|id_token|api_token|auth|authorization|auth_token|api_key|apikey|key|signature|sig|sign|session|sessionid|session_id|cookie|password|secret)$/;
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'spm', 'campaign', 'feature', 'si', 'ref', 'source', 'from', 'scene', 'subscene', 'isappinstalled']);
function identityParams(host, pathname) {
  const rules = new Map(['v', 'id', 'p', 'article_id'].map((key) => [key, QUERY_ID]));
  if (['youtube.com', 'www.youtube.com'].includes(host) && pathname === '/feeds/videos.xml') {
    rules.set('channel_id', /^UC[a-zA-Z0-9_-]{1,98}$/);
  }
  if (['weibo.com', 'www.weibo.com', 's.weibo.com'].includes(host)) {
    rules.set('q', /^[\p{L}\p{N} #@_.+,\-]{1,200}$/u);
  }
  if (host === 'mp.weixin.qq.com' && pathname === '/s') {
    rules.set('__biz', /^[a-zA-Z0-9+/]{1,100}={0,2}$/);
    rules.set('mid', /^\d{1,30}$/);
    rules.set('idx', /^\d{1,3}$/);
    rules.set('sn', /^[a-fA-F0-9]{32}$/);
  }
  return rules;
}

// Evidence links are display-only: HTTPS public DNS names, no credentials, fragments,
// arbitrary ports or query secrets. No tool accepts a URL or fetches one.
function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || net.isIP(host)
      || !host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|invalid)$/.test(host)) return null;
    const params = new URLSearchParams();
    const identities = identityParams(host, url.pathname);
    for (const [key, item] of url.searchParams) {
      const normalized = key.toLowerCase();
      if (CREDENTIAL_PARAM.test(normalized) || normalized.startsWith('utm_') || TRACKING_PARAMS.has(normalized)) continue;
      // Unknown/invalid identity parameters may select another document. Reject
      // the whole link instead of silently changing its citation destination.
      if (!identities.has(key) || !identities.get(key).test(item) || params.has(key)) return null;
      params.set(key, item);
    }
    params.sort();
    url.search = params.toString(); url.hash = '';
    return url.href;
  } catch { return null; }
}
const url = { type: ['string', 'null'], maxLength: 2048 };
const number = { type: 'number', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
const metric = { type: ['number', 'null'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const fields = (names, schema = text()) => Object.fromEntries(names.split(' ').map((name) => [name, schema]));
const metrics = object(fields('views likes comments replies shares reposts stars forks openIssues points rank downloads bookmarks platformRank followersAtCapture', metric));
const evidence = object({ ...fields('citationId id title source publishedAt category evidenceType region claimBoundary'), summary: text(600), url });
const news = object({ ...fields('id title source category publishedAt sourceGroup region'), description: text(1000), url });
const signal = object({ ...fields('id sourceId sourceName sourceTrustClass platform region kind title author language publishedAt'), summary: text(1000), url, canonicalUrl: url, metrics, tags: list(text(80), 20) });
const opportunity = object({ ...fields('profile formulaVersion angle'), creatorScore: number, angles: list(object(fields('audience title angle')), 5), riskNotes: list(text(), 10) });
const topic = object({ ...fields('id title anchor firstSeenAt latestSeenAt trendDirection evidenceStrength formulaVersion'), summary: text(1000), trendScore: number, creatorScore: number, evidenceCount: count(), opportunity, signals: list(signal, 20) });
const post = object({ ...fields('id accountId creatorId creatorName platform title contentType publishedAt sourceConfidence'), text: text(1000), url, provenanceUrl: url, metrics, verticalIds: list(text(80), 20) });
const creatorTopic = object({ ...fields('id verticalId title firstSeenAt latestSeenAt formulaVersion'), summary: text(1000), hotness: number, creatorCount: count(), platformCount: count(), evidence: list(object({ postId: text(120), url }), 20) });
const coverage = object({ ...fields('id platform tier status lastSuccessAt lastAttemptAt latestPostAt'), accountCount: count(), enabledAccountCount: count(), postCount: count() });
const source = object({ ...fields('id name category language sourceGroup status lastFetchAt lastSuccessAt'), failureCount: count(), articleCount: count() });
const change = object({ seq: count(), ...fields('topicId changeType changedAt') });
const brief = object({ status: { ...text(30), enum: ['ready', 'insufficient_evidence', 'not_found'] }, generatedAt: text(80), request: object(fields('topic audience goal format')), evidence: list(evidence, 8), diversity: object(fields('sources regions evidenceTypes', count())), citationPolicy: text(1000), notice: text(1000) });

// Project recursively from explicit schemas; never spread service/store rows or nested
// metrics/payload objects into the public result. Only scalar own data properties are read.
function read(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
function project(schema, value) {
  if (schema === url) return publicUrl(value);
  if (schema === metric) return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= schema.maximum ? value : null;
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, project(child, read(value, key))]));
  if (schema.type === 'array') return Array.isArray(value) ? value.slice(0, schema.maxItems).map((item) => project(schema.items, item)) : [];
  if (schema.type === 'string') return typeof value === 'string' ? [...value].slice(0, schema.maxLength).join('') : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  if (schema.type === 'integer' || schema.type === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= schema.minimum && value <= schema.maximum && (schema.type !== 'integer' || Number.isSafeInteger(value)) ? value : 0;
  return null;
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function toEvidence(article, index) {
  const evidenceType = classifyEvidenceType(article);
  return project(evidence, {
    citationId: `S${index + 1}`, id: article.id, title: article.title || '未命名资讯',
    summary: article.description || article.summary || '', source: article.source || '未知来源',
    url: article.url, publishedAt: article.publishedAt || '', category: article.category || '',
    evidenceType, region: article.region === 'cn' ? 'cn' : 'global', claimBoundary: ContentService.evidenceBoundary(evidenceType)
  });
}

module.exports = { publicUrl, project, toEvidence, uniqueByUrl, schemas: { news, signal, topic, post, creatorTopic, coverage, source, change, brief, evidence } };
