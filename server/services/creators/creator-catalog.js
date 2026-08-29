const fs = require('node:fs');
const path = require('node:path');

const CATALOG_VERSION = 'creator-seeds-v1';
const CREATOR_KINDS = new Set(['person', 'brand', 'media']);
const REVIEW_STATUSES = new Set(['verified', 'candidate', 'rejected']);
const SOURCE_TIERS = new Set(['L1', 'L2', 'L3', 'L4']);
const REGIONS = new Set(['cn', 'global']);
const PLATFORMS = new Set([
  'youtube', 'rss', 'bluesky', 'mastodon', 'github',
  'reddit', 'x', 'instagram', 'douyin', 'xiaohongshu', 'weibo', 'bilibili'
]);

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function optionalIso(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = requireText(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw new TypeError(`${field} must be ISO-8601`);
  return new Date(normalized).toISOString();
}

function canonicalHttpsUrl(value, field) {
  const text = requireText(value, field);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new TypeError(`${field} must be a canonical HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new TypeError(`${field} must be a canonical HTTPS URL`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function validateAccount(account, creator, seenAccounts) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    throw new TypeError(`${creator.id}.accounts must contain objects`);
  }
  const platform = requireText(account.platform, `${creator.id}.account.platform`).toLowerCase();
  if (!PLATFORMS.has(platform)) throw new TypeError(`unsupported platform: ${platform}`);
  const externalAccountId = requireText(
    account.externalAccountId,
    `${creator.id}.${platform}.externalAccountId`
  );
  if (externalAccountId.startsWith('@') || externalAccountId === account.handle) {
    throw new TypeError(`${creator.id}.${platform}.externalAccountId must be a stable platform ID, not a nickname`);
  }
  const identity = `${platform}\u0000${externalAccountId}`;
  if (seenAccounts.has(identity)) throw new TypeError(`duplicate platform account: ${platform}/${externalAccountId}`);
  seenAccounts.add(identity);

  const enabled = account.enabled === true;
  if (account.visibility !== 'public') throw new TypeError(`${creator.id}.${platform} must be public`);
  if (enabled && creator.reviewStatus !== 'verified') {
    throw new TypeError(`${creator.reviewStatus} creator cannot have an enabled account; verified review required`);
  }
  const lastVerifiedAt = optionalIso(account.lastVerifiedAt, `${creator.id}.${platform}.lastVerifiedAt`);
  if (enabled && !lastVerifiedAt) throw new TypeError(`${creator.id}.${platform}.lastVerifiedAt is required`);

  const sourceTier = requireText(account.sourceTier, `${creator.id}.${platform}.sourceTier`).toUpperCase();
  if (!SOURCE_TIERS.has(sourceTier)) throw new TypeError(`unsupported source tier: ${sourceTier}`);
  const region = requireText(account.region, `${creator.id}.${platform}.region`).toLowerCase();
  if (!REGIONS.has(region)) throw new TypeError(`unsupported region: ${region}`);

  return {
    ...account,
    id: requireText(account.id, `${creator.id}.${platform}.id`),
    platform,
    externalAccountId,
    handle: account.handle ? String(account.handle).trim() : null,
    profileUrl: canonicalHttpsUrl(account.profileUrl, `${creator.id}.${platform}.profileUrl`),
    region,
    sourceTier,
    enabled,
    visibility: 'public',
    lastVerifiedAt,
    authState: account.authState || (sourceTier === 'L1' ? 'not_required' : 'unconfigured'),
    backfillState: account.backfillState || 'pending',
    feedUrl: account.feedUrl ? canonicalHttpsUrl(account.feedUrl, `${creator.id}.${platform}.feedUrl`) : null,
    verificationEvidence: account.verificationEvidence
      ? canonicalHttpsUrl(account.verificationEvidence, `${creator.id}.${platform}.verificationEvidence`)
      : null
  };
}

function validateCreatorCatalog(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('creator catalog must be an object');
  if (input.version !== CATALOG_VERSION) throw new TypeError(`creator catalog version must be ${CATALOG_VERSION}`);
  if (!Array.isArray(input.creators)) throw new TypeError('creator catalog creators must be an array');

  const verticals = Array.isArray(options.verticals) ? options.verticals : [];
  const knownVerticals = new Set(verticals.map((vertical) => vertical.id));
  const seenCreators = new Set();
  const seenAccounts = new Set();
  const creators = input.creators.map((candidate) => {
    const id = requireText(candidate?.id, 'creator.id');
    if (seenCreators.has(id)) throw new TypeError(`duplicate creator id: ${id}`);
    seenCreators.add(id);
    const reviewStatus = requireText(candidate.reviewStatus, `${id}.reviewStatus`).toLowerCase();
    if (!REVIEW_STATUSES.has(reviewStatus)) throw new TypeError(`unsupported review status: ${reviewStatus}`);
    const reviewedAt = optionalIso(candidate.reviewedAt, `${id}.reviewedAt`);
    if (reviewStatus === 'verified' && !reviewedAt) throw new TypeError(`${id}.reviewedAt is required for verified creator`);
    if (!Array.isArray(candidate.verticalIds) || candidate.verticalIds.length === 0) {
      throw new TypeError(`${id}.verticalIds must contain at least one vertical`);
    }
    const verticalIds = [...new Set(candidate.verticalIds.map((value) => requireText(value, `${id}.verticalId`)))];
    for (const verticalId of verticalIds) {
      if (!knownVerticals.has(verticalId)) throw new TypeError(`unknown vertical: ${verticalId}`);
    }
    const kind = requireText(candidate.kind, `${id}.kind`).toLowerCase();
    if (!CREATOR_KINDS.has(kind)) throw new TypeError(`unsupported creator kind: ${kind}`);
    if (!Array.isArray(candidate.accounts) || candidate.accounts.length === 0) {
      throw new TypeError(`${id}.accounts must contain at least one stable account`);
    }
    const creator = {
      ...candidate,
      id,
      displayName: requireText(candidate.displayName, `${id}.displayName`),
      kind,
      reviewStatus,
      reviewedAt,
      verticalIds
    };
    creator.accounts = candidate.accounts.map((account) => validateAccount(account, creator, seenAccounts));
    return creator;
  });

  return {
    version: CATALOG_VERSION,
    generatedAt: optionalIso(input.generatedAt, 'generatedAt'),
    creators
  };
}

function loadCreatorCatalog(options = {}) {
  const env = options.env || process.env;
  const sourcePath = requireText(env.AYA_CREATOR_SEEDS_PATH, 'AYA_CREATOR_SEEDS_PATH');
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) throw new Error(`Creator seed file not found: ${resolved}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read creator seed file ${resolved}: ${error.message}`);
  }
  return {
    ...validateCreatorCatalog(parsed, { verticals: options.verticals }),
    sourcePath: resolved
  };
}

function toStoreRecords(catalog) {
  return {
    creators: catalog.creators.map((creator) => ({
      id: creator.id,
      displayName: creator.displayName,
      kind: creator.kind,
      reviewStatus: creator.reviewStatus,
      reviewedAt: creator.reviewedAt,
      verticalIds: creator.verticalIds
    })),
    accounts: catalog.creators.flatMap((creator) => creator.accounts.map((account) => ({
      ...account,
      creatorId: creator.id
    })))
  };
}

module.exports = {
  CATALOG_VERSION,
  PLATFORMS,
  validateCreatorCatalog,
  loadCreatorCatalog,
  toStoreRecords
};
