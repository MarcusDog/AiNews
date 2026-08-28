function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
  return [
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
    this.sources = new Map(buildCreatorSourceCatalog(this.env).map((source) => [source.id, source]));
  }

  list() {
    return [...this.sources.values()].map((source) => ({ ...source }));
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
      return { ...result, source: { ...source } };
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
  failureStatus
};
