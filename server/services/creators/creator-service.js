const path = require('node:path');
const CreatorCollector = require('./creator-collector');
const BackfillService = require('./backfill-service');
const { CREATOR_VERTICALS } = require('../../config/creatorVerticals');
const { loadCreatorCatalog, toStoreRecords } = require('./creator-catalog');

const PLATFORM_INTERVAL_MINUTES = Object.freeze({
  bluesky: 5,
  youtube: 10,
  mastodon: 10,
  github: 15,
  reddit: 15,
  x: 15,
  instagram: 20,
  douyin: 20,
  rss: 30
});

function createDefaultConnectorResolver(env = process.env) {
  const YoutubeFeedConnector = require('./connectors/youtube-feed-connector');
  const BlueskyConnector = require('./connectors/bluesky-connector');
  const MastodonAccountConnector = require('./connectors/mastodon-account-connector');
  const GithubCreatorConnector = require('./connectors/github-creator-connector');
  const RssCreatorConnector = require('./connectors/rss-creator-connector');
  const RedditConnector = require('./connectors/reddit-connector');
  const XConnector = require('./connectors/x-connector');
  const InstagramConnector = require('./connectors/instagram-connector');
  const DouyinAuthorizedConnector = require('./connectors/douyin-authorized-connector');
  const connectors = new Map([
    ['youtube', { sourceId: 'youtube-atom', connector: new YoutubeFeedConnector({ apiKey: env.YOUTUBE_API_KEY || null }) }],
    ['bluesky', { sourceId: 'bluesky-author-feed', connector: new BlueskyConnector() }],
    ['mastodon', { sourceId: 'mastodon-account', connector: new MastodonAccountConnector() }],
    ['github', { sourceId: 'github-creator', connector: new GithubCreatorConnector({ token: env.GITHUB_TOKEN || null }) }],
    ['rss', { sourceId: 'rss-creator', connector: new RssCreatorConnector() }],
    ['reddit', { sourceId: 'reddit-user-submitted', connector: new RedditConnector({ env }) }],
    ['x', { sourceId: 'x-user-timeline', connector: new XConnector({ env }) }],
    ['instagram', { sourceId: 'instagram-business-discovery', connector: new InstagramConnector({ env }) }],
    ['douyin', { sourceId: 'douyin-authorized-account', connector: new DouyinAuthorizedConnector({ env }) }]
  ]);
  return (account) => connectors.get(account.platform) || null;
}

class CreatorService {
  constructor(options = {}) {
    if (!options.store) throw new TypeError('store is required');
    this.env = options.env || process.env;
    this.store = options.store;
    this.now = options.now || (() => new Date().toISOString());
    this.sourceRegistry = options.sourceRegistry || null;
    this.collector = options.collector || new CreatorCollector({
      store: this.store,
      sourceRegistry: this.sourceRegistry,
      connectorResolver: options.connectorResolver || createDefaultConnectorResolver(this.env),
      maxConcurrency: Number(this.env.AYA_CREATOR_CONCURRENCY || 4),
      now: this.now
    });
    this.backfillService = options.backfillService || new BackfillService({
      store: this.store, collector: this.collector, now: this.now
    });
    this.initialized = false;
  }

  initialize() {
    this.store.syncVerticals(CREATOR_VERTICALS.map((vertical) => ({
      ...vertical,
      createdAt: this.now()
    })));
    if (this.env.AYA_CREATOR_SEEDS_PATH) {
      const catalog = loadCreatorCatalog({ env: this.env, verticals: CREATOR_VERTICALS });
      const records = toStoreRecords(catalog);
      this.store.upsertCreators(records.creators);
      this.store.upsertAccounts(records.accounts);
    }
    this.store.scheduleUnscheduledAccounts?.(this.now());
    this.initialized = true;
    return this;
  }

  requestBudget() {
    const parsed = Number(this.env.AYA_CREATOR_REQUEST_BUDGET || 100);
    return { remaining: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 100 };
  }

  scheduleAfterIncremental(account, result) {
    if (!this.store.scheduleAccount || !['success', 'rate_limited', 'failed'].includes(result.status)) return;
    const interval = PLATFORM_INTERVAL_MINUTES[account.platform] || 15;
    const multiplier = result.status === 'rate_limited' ? 4 : result.status === 'failed' ? 2 : 1;
    this.store.scheduleAccount(account.id, new Date(Date.parse(this.now()) + interval * multiplier * 60 * 1000).toISOString());
  }

  async tick() {
    if (this.env.AYA_DISABLE_CREATOR_SCHEDULER === '1') return { status: 'disabled' };
    if (!this.initialized && this.store.syncVerticals) this.initialize();
    const budget = this.requestBudget();
    const due = this.store.listDueAccounts({ before: this.now(), limit: budget.remaining });
    const incremental = await this.collector.collectMany(due, { mode: 'incremental', budget });
    due.forEach((account, index) => this.scheduleAfterIncremental(account, incremental[index] || {}));
    const backfill = await this.backfillService.runPending({ budget, limit: 100 });
    return { status: 'success', incremental, backfill, remainingBudget: budget.remaining };
  }

  listEnabledAccounts(limit = 500) {
    if (!this.store.db) return [];
    return this.store.db.prepare(
      'SELECT * FROM creator_accounts WHERE enabled = 1 ORDER BY id LIMIT ?'
    ).all(Math.min(Math.max(Number(limit), 1), 500)).map((row) => {
      const account = this.store.mapAccount(row);
      account.profileUrl = row.profile_url;
      account.verticalIds = this.store.db.prepare(
        'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
      ).all(row.creator_id).map((item) => item.vertical_id);
      return account;
    });
  }

  async reconcile() {
    if (this.env.AYA_DISABLE_CREATOR_SCHEDULER === '1') return { status: 'disabled' };
    const accounts = this.listEnabledAccounts();
    const results = await this.collector.collectMany(accounts, {
      mode: 'reconcile', recentLimit: 100, budget: this.requestBudget()
    });
    accounts.forEach((account, index) => {
      if (results[index]?.status !== 'success') return;
      const prior = this.backfillService.getState(account);
      this.store.updateBackfill(account.id, {
        state: prior.state,
        nextCursor: prior.next_cursor,
        oldestFetchedAt: prior.oldest_fetched_at,
        newestFetchedAt: prior.newest_fetched_at,
        lastReconciledAt: this.now(),
        historyLimitReason: prior.history_limit_reason,
        pagesFetched: prior.pages_fetched,
        itemsFetched: prior.items_fetched,
        updatedAt: this.now()
      });
    });
    return { status: 'success', results };
  }

  async refreshMetrics() {
    if (this.env.AYA_DISABLE_CREATOR_SCHEDULER === '1') return { status: 'disabled' };
    const results = await this.collector.collectMany(this.listEnabledAccounts(), {
      mode: 'metric-refresh', recentLimit: 100, budget: this.requestBudget()
    });
    return { status: 'success', results };
  }
}

module.exports = CreatorService;
module.exports.PLATFORM_INTERVAL_MINUTES = PLATFORM_INTERVAL_MINUTES;
module.exports.createDefaultConnectorResolver = createDefaultConnectorResolver;
