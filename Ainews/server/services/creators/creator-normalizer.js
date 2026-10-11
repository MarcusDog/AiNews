const {
  boundedText,
  canonicalizeCreatorUrl,
  createStableId,
  normalizeIso,
  normalizeOpaqueCursor,
  normalizePublishedAt
} = require('./connectors/connector-utils');

const CONTENT_TYPES = new Set(['video', 'image', 'article', 'short', 'thread', 'repository', 'post']);
const SOURCE_CONFIDENCE = new Set(['official', 'public', 'bridge']);
const METRIC_FIELDS = [
  'views', 'likes', 'comments', 'shares', 'bookmarks', 'platformRank', 'followersAtCapture'
];
const PUBLIC_METADATA_FIELDS = new Set([
  'mediaCount', 'isPinned', 'isSponsored', 'etag', 'license', 'replyCount', 'quoteCount'
]);

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function normalizeAccount(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) throw new TypeError('account is required');
  const platform = requiredText(account.platform, 'account.platform').toLowerCase();
  const externalAccountId = requiredText(account.externalAccountId, 'account.externalAccountId');
  const profileUrl = canonicalizeCreatorUrl(account.profileUrl);
  if (!profileUrl) throw new TypeError('account profile URL must be public HTTPS');
  return {
    id: requiredText(account.id, 'account.id'),
    creatorId: account.creatorId ? requiredText(account.creatorId, 'account.creatorId') : null,
    platform,
    externalAccountId,
    profileUrl
  };
}

function metricValue(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} metric must be a non-negative number or null`);
  return number;
}

function normalizeMetrics(metrics) {
  const source = metrics && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {};
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, metricValue(source[field], field)]));
}

function normalizeSharedFrom(sharedFrom) {
  if (!sharedFrom) return null;
  const url = canonicalizeCreatorUrl(sharedFrom.url);
  if (!url) throw new TypeError('sharedFrom URL must be public HTTPS');
  return {
    platform: requiredText(sharedFrom.platform, 'sharedFrom.platform').toLowerCase(),
    externalAccountId: requiredText(sharedFrom.externalAccountId, 'sharedFrom.externalAccountId'),
    externalPostId: requiredText(sharedFrom.externalPostId, 'sharedFrom.externalPostId'),
    url,
    displayName: boundedText(sharedFrom.displayName, 300).trim()
  };
}

function normalizeContentParts(parts) {
  if (parts === null || parts === undefined) return [];
  if (!Array.isArray(parts) || parts.length > 100) throw new TypeError('contentParts must be an array of at most 100 items');
  return parts.map((part, index) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      throw new TypeError(`contentParts[${index}] must be an object`);
    }
    const url = part.url ? canonicalizeCreatorUrl(part.url) : null;
    if (part.url && !url) throw new TypeError(`contentParts[${index}] URL must be public HTTPS`);
    return {
      type: requiredText(part.type, `contentParts[${index}].type`).toLowerCase(),
      text: boundedText(part.text, 5000),
      url
    };
  });
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const selected = {};
  for (const [field, value] of Object.entries(metadata)) {
    if (!PUBLIC_METADATA_FIELDS.has(field) || value === undefined) continue;
    if (typeof value === 'string') selected[field] = boundedText(value, 1000);
    else if (typeof value === 'number' && Number.isFinite(value)) selected[field] = value;
    else if (typeof value === 'boolean' || value === null) selected[field] = value;
  }
  return selected;
}

function normalizeCreatorPost(input, rawAccount, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('creator post must be an object');
  const account = normalizeAccount(rawAccount);
  const externalPostId = requiredText(input.externalPostId, 'externalPostId');
  const url = canonicalizeCreatorUrl(input.url);
  if (!url) throw new TypeError('post URL must be public HTTPS');
  const provenanceUrl = canonicalizeCreatorUrl(input.provenanceUrl || input.url);
  if (!provenanceUrl) throw new TypeError('provenance URL must be public HTTPS');
  const now = normalizeIso(options.now || Date.now(), 'now', { required: true });
  const publishedAt = normalizePublishedAt(input.publishedAt, { now, maxFutureMs: options.maxFutureMs });
  const editedAt = normalizeIso(input.editedAt, 'editedAt');
  const deletedAt = normalizeIso(input.deletedAt, 'deletedAt');
  if (editedAt && Date.parse(editedAt) < Date.parse(publishedAt)) throw new TypeError('editedAt cannot precede publishedAt');
  if (deletedAt && Date.parse(deletedAt) < Date.parse(publishedAt)) throw new TypeError('deletedAt cannot precede publishedAt');

  const title = boundedText(input.title, 1000).trim();
  const text = boundedText(input.text, 20000).trim();
  if (!deletedAt && !title && !text) throw new TypeError('title or text is required for a live post');
  const contentType = requiredText(input.contentType, 'contentType').toLowerCase();
  if (!CONTENT_TYPES.has(contentType)) throw new TypeError(`unsupported contentType: ${contentType}`);
  const sourceConfidence = requiredText(input.sourceConfidence, 'sourceConfidence').toLowerCase();
  if (!SOURCE_CONFIDENCE.has(sourceConfidence)) throw new TypeError(`unsupported sourceConfidence: ${sourceConfidence}`);
  const verticalIds = Array.isArray(input.verticalIds)
    ? [...new Set(input.verticalIds.map((value) => requiredText(value, 'verticalId')))]
    : [];

  return {
    id: createStableId('creator-post', [account.platform, externalPostId]),
    accountId: account.id,
    platform: account.platform,
    externalPostId,
    url,
    title,
    text,
    contentType,
    publishedAt,
    collectedAt: normalizeIso(input.collectedAt || options.collectedAt || now, 'collectedAt', { required: true }),
    editedAt,
    deletedAt,
    language: boundedText(input.language || 'und', 32).trim() || 'und',
    verticalIds,
    sourceConfidence,
    provenanceUrl,
    metrics: normalizeMetrics(input.metrics),
    sharedFrom: normalizeSharedFrom(input.sharedFrom),
    contentParts: normalizeContentParts(input.contentParts),
    metadata: normalizeMetadata(input.metadata)
  };
}

function normalizeRateLimit(rateLimit) {
  if (!rateLimit || typeof rateLimit !== 'object' || Array.isArray(rateLimit)) return null;
  return {
    remaining: metricValue(rateLimit.remaining, 'rateLimit.remaining'),
    resetAt: normalizeIso(rateLimit.resetAt, 'rateLimit.resetAt'),
    retryAfterMs: metricValue(rateLimit.retryAfterMs, 'rateLimit.retryAfterMs')
  };
}

function normalizeCreatorPage(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('connector page must be an object');
  const account = normalizeAccount(input.account);
  if (!Array.isArray(input.posts) || input.posts.length > 500) {
    throw new TypeError('connector page posts must be an array of at most 500 items');
  }
  const collectedAt = normalizeIso(input.collectedAt || options.now || Date.now(), 'collectedAt', { required: true });
  return {
    account,
    posts: input.posts.map((post) => normalizeCreatorPost(post, account, {
      ...options,
      now: options.now || collectedAt,
      collectedAt
    })),
    nextCursor: normalizeOpaqueCursor(input.nextCursor),
    exhausted: input.exhausted === true,
    rateLimit: normalizeRateLimit(input.rateLimit),
    collectedAt
  };
}

module.exports = {
  normalizeCreatorPage,
  normalizeCreatorPost,
  normalizeMetrics
};
