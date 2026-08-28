function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const SIDECAR_ADAPTERS = Object.freeze([
  'rsshub',
  'newsnow',
  'mediacrawler',
  'xiaohongshu-mcp',
  'douyin-parser'
]);

function parseBridgeSources(env = process.env) {
  const raw = env.AYA_CREATOR_BRIDGES_JSON || '[]';
  let items;
  try {
    items = JSON.parse(raw);
  } catch {
    throw new TypeError('AYA_CREATOR_BRIDGES_JSON must be valid JSON');
  }
  if (!Array.isArray(items)) throw new TypeError('AYA_CREATOR_BRIDGES_JSON must be an array');
  const ids = new Set();
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`creator bridge ${index} must be an object`);
    }
    const id = String(item.id || '').trim();
    const adapter = String(item.adapter || '').trim().toLowerCase();
    const secretEnv = String(item.secretEnv || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new TypeError(`invalid creator bridge id: ${id}`);
    if (ids.has(id)) throw new TypeError(`duplicate creator bridge id: ${id}`);
    if (!SIDECAR_ADAPTERS.includes(adapter)) throw new TypeError(`unsupported creator bridge adapter: ${adapter}`);
    if (!/^AYA_CREATOR_BRIDGE_[A-Z0-9_]+_SECRET$/.test(secretEnv)) {
      throw new TypeError(`invalid creator bridge secretEnv for ${id}`);
    }
    if (!Array.isArray(item.bindings) || item.bindings.length === 0) {
      throw new TypeError(`creator bridge ${id} requires bindings`);
    }
    const bindingKeys = new Set();
    const bindings = item.bindings.map((binding) => {
      const platform = String(binding?.platform || '').trim().toLowerCase();
      const externalAccountId = String(binding?.externalAccountId || '').trim();
      if (!platform || !externalAccountId) throw new TypeError(`invalid creator bridge binding for ${id}`);
      const key = `${platform}\u0000${externalAccountId}`;
      if (bindingKeys.has(key)) throw new TypeError(`duplicate creator bridge binding for ${id}`);
      bindingKeys.add(key);
      return { platform, externalAccountId };
    });
    ids.add(id);
    return { id, adapter, secretEnv, bindings };
  });
}

function buildCreatorSourceCatalog(env = process.env) {
  const source = (value) => ({
    configured: true,
    schedulable: true,
    status: 'configured',
    lastSuccessAt: null,
    lastAttemptAt: null,
    ...value
  });
  const officialSources = [
    source({ id: 'youtube-atom', platform: 'youtube', tier: 'L1', credentialLabel: null }),
    source({ id: 'bluesky-author-feed', platform: 'bluesky', tier: 'L1', credentialLabel: null }),
    source({ id: 'mastodon-account', platform: 'mastodon', tier: 'L1', credentialLabel: null }),
    source({ id: 'github-creator', platform: 'github', tier: 'L1', credentialLabel: null }),
    source({ id: 'rss-creator', platform: 'rss', tier: 'L1', credentialLabel: null }),
    source({
      id: 'reddit-user-submitted', platform: 'reddit', tier: 'L2', credentialLabel: 'REDDIT_CLIENT_ID',
      configured: present(env.REDDIT_CLIENT_ID) && present(env.REDDIT_CLIENT_SECRET),
      status: present(env.REDDIT_CLIENT_ID) && present(env.REDDIT_CLIENT_SECRET) ? 'configured' : 'unconfigured'
    }),
    source({
      id: 'x-user-timeline', platform: 'x', tier: 'L2', credentialLabel: 'X_BEARER_TOKEN',
      configured: present(env.X_BEARER_TOKEN), status: present(env.X_BEARER_TOKEN) ? 'configured' : 'unconfigured'
    }),
    source({
      id: 'instagram-business-discovery', platform: 'instagram', tier: 'L2', credentialLabel: 'INSTAGRAM_ACCESS_TOKEN',
      configured: present(env.INSTAGRAM_ACCESS_TOKEN) && present(env.INSTAGRAM_BUSINESS_ACCOUNT_ID),
      status: present(env.INSTAGRAM_ACCESS_TOKEN) && present(env.INSTAGRAM_BUSINESS_ACCOUNT_ID) ? 'configured' : 'unconfigured'
    }),
    source({
      id: 'douyin-authorized-account', platform: 'douyin', tier: 'L2', credentialLabel: 'DOUYIN_ACCESS_TOKEN',
      configured: present(env.DOUYIN_ACCESS_TOKEN) && present(env.DOUYIN_OPEN_ID),
      status: present(env.DOUYIN_ACCESS_TOKEN) && present(env.DOUYIN_OPEN_ID) ? 'configured' : 'unconfigured'
    }),
    source({
      id: 'tiktok-research-api', platform: 'tiktok', tier: 'L2', credentialLabel: 'TIKTOK_RESEARCH_TOKEN',
      configured: false, schedulable: false, status: 'eligibility_required',
      setupHint: 'TikTok Research API requires separately proven research eligibility and is not a general creator connector.'
    })
  ].map((item) => ({ ...item, schedulable: item.configured && item.schedulable }));
  const bridgeSources = parseBridgeSources(env).map((bridge) => {
    const configured = present(env[bridge.secretEnv]);
    return {
      id: bridge.id,
      platform: bridge.bindings.length === 1 ? bridge.bindings[0].platform : 'multi',
      tier: bridge.adapter === 'rsshub' || bridge.adapter === 'newsnow' ? 'L3' : 'L4',
      credentialLabel: null,
      configured,
      schedulable: false,
      status: configured ? 'awaiting_signed_canary' : 'unconfigured',
      lastSuccessAt: null,
      lastAttemptAt: null,
      adapter: bridge.adapter,
      allowedPlatforms: [...new Set(bridge.bindings.map((binding) => binding.platform))].sort(),
      bindingCount: bridge.bindings.length,
      ingestionMode: 'signed-sidecar'
    };
  });
  const officialIds = new Set(officialSources.map((source) => source.id));
  for (const source of bridgeSources) {
    if (officialIds.has(source.id)) throw new TypeError(`creator bridge id conflicts with built-in source: ${source.id}`);
  }
  return [...officialSources, ...bridgeSources];
}

function failureStatus(error) {
  if (error?.code === 'permission_missing') return 'permission_missing';
  if (error?.status === 401) return 'auth_expired';
  if (error?.status === 429) return 'rate_limited';
  if (error?.status === 403) return 'permission_missing';
  return 'degraded';
}

class CreatorSourceRegistry {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.now = options.now || (() => new Date().toISOString());
    this.bridgeSources = new Map(parseBridgeSources(this.env).map((source) => [source.id, source]));
    this.sources = new Map(buildCreatorSourceCatalog(this.env).map((source) => [source.id, source]));
  }

  list() {
    return [...this.sources.values()].map((source) => ({ ...source }));
  }

  getBridgeAuthorization(sourceId) {
    const source = this.bridgeSources.get(sourceId);
    if (!source) return null;
    const secret = this.env[source.secretEnv];
    if (!present(secret)) return { ...source, secret: null, configured: false };
    return { ...source, secret, configured: true };
  }

  isBridgeBindingAllowed(sourceId, platform, externalAccountId) {
    const source = this.bridgeSources.get(sourceId);
    if (!source) return false;
    const normalizedPlatform = String(platform || '').trim().toLowerCase();
    const normalizedAccountId = String(externalAccountId || '').trim();
    return source.bindings.some((binding) => (
      binding.platform === normalizedPlatform && binding.externalAccountId === normalizedAccountId
    ));
  }

  markBridgeSuccess(sourceId) {
    const prior = this.sources.get(sourceId);
    if (!prior || !this.bridgeSources.has(sourceId)) throw new Error(`Unknown creator bridge: ${sourceId}`);
    const succeededAt = this.now();
    const source = {
      ...prior,
      status: 'online',
      lastAttemptAt: succeededAt,
      lastSuccessAt: succeededAt,
      lastFailureCode: null
    };
    this.sources.set(sourceId, source);
    return { ...source };
  }

  async execute(sourceId, connector, account, options = {}) {
    const prior = this.sources.get(sourceId);
    if (!prior) throw new Error(`Unknown creator source: ${sourceId}`);
    const attemptedAt = this.now();
    if (!prior.configured) {
      const source = { ...prior, status: prior.status || 'unconfigured', lastAttemptAt: attemptedAt };
      this.sources.set(sourceId, source);
      return { status: source.status, posts: [], source: { ...source } };
    }
    try {
      const result = await connector.collect(account, options);
      if (result?.status === 'unconfigured') {
        const source = { ...prior, status: 'unconfigured', configured: false, schedulable: false, lastAttemptAt: attemptedAt };
        this.sources.set(sourceId, source);
        return { ...result, source: { ...source } };
      }
      const source = {
        ...prior,
        status: 'online',
        lastAttemptAt: attemptedAt,
        lastSuccessAt: attemptedAt,
        lastFailureCode: null,
        retryAfterMs: null
      };
      this.sources.set(sourceId, source);
      return { ...result, status: result?.status || 'online', source: { ...source } };
    } catch (error) {
      const status = failureStatus(error);
      const source = {
        ...prior,
        status,
        lastAttemptAt: attemptedAt,
        lastFailureCode: status,
        retryAfterMs: error?.retryAfterMs ?? null
      };
      this.sources.set(sourceId, source);
      return { status, posts: [], source: { ...source } };
    }
  }
}

module.exports = {
  CreatorSourceRegistry,
  buildCreatorSourceCatalog,
  failureStatus,
  parseBridgeSources,
  SIDECAR_ADAPTERS
};
