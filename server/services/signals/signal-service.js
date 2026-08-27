const { buildSignalSourceCatalog } = require('../../config/signalSources');
const crypto = require('node:crypto');
const SignalStore = require('./signal-store');
const SignalCollector = require('./signal-collector');
const { buildTopics } = require('./topic-engine');
const LegacyNewsAdapter = require('./adapters/legacy-news-adapter');
const HackerNewsAdapter = require('./adapters/hacker-news-adapter');
const GitHubAdapter = require('./adapters/github-adapter');
const MastodonAdapter = require('./adapters/mastodon-adapter');
const HuggingFaceAdapter = require('./adapters/hugging-face-adapter');
const BilibiliAdapter = require('./adapters/bilibili-adapter');
const RssSignalAdapter = require('./adapters/rss-signal-adapter');
const YouTubeAdapter = require('./adapters/youtube-adapter');
const XAdapter = require('./adapters/x-adapter');
const NewsNowAdapter = require('./adapters/newsnow-adapter');
const JsonBridgeAdapter = require('./adapters/json-bridge-adapter');

function createDefaultAdapters(options = {}) {
  const common = options.http ? { http: options.http } : {};
  const environment = options.env || process.env;
  return {
    'legacy-news': new LegacyNewsAdapter({ newsProvider: options.newsProvider }),
    'hacker-news': new HackerNewsAdapter(common),
    github: new GitHubAdapter({ ...common, env: environment }),
    mastodon: new MastodonAdapter(common),
    'hugging-face': new HuggingFaceAdapter(common),
    bilibili: new BilibiliAdapter(common),
    'rss-signal': new RssSignalAdapter({ ...common, parser: options.rssParser }),
    youtube: new YouTubeAdapter({ ...common, env: environment }),
    x: new XAdapter({ ...common, env: environment }),
    newsnow: new NewsNowAdapter(common),
    'json-bridge': new JsonBridgeAdapter({ ...common, env: environment })
  };
}

class SignalService {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.catalog = options.catalog || buildSignalSourceCatalog(this.env);
    this.store = options.store || new SignalStore(options.storeOptions);
    this.adapters = options.adapters || createDefaultAdapters({
      env: this.env,
      http: options.http,
      rssParser: options.rssParser,
      newsProvider: options.newsProvider
    });
    this.collector = options.collector || new SignalCollector({
      catalog: this.catalog,
      store: this.store,
      adapters: this.adapters,
      concurrency: options.concurrency || this.env.AINEWS_SIGNAL_CONCURRENCY
    });
    this.newsService = options.newsService || null;
    this.initialized = false;
    this.refreshing = false;
  }

  initialize() {
    if (!this.initialized) {
      this.store.initialize(this.catalog);
      this.initialized = true;
    }
    return this;
  }

  async refreshSignals(options = {}) {
    if (this.refreshing) {
      return {
        status: 'skipped',
        reason: 'refresh_in_progress',
        sources: [],
        received: 0,
        saved: 0,
        skipped: 0,
        errors: []
      };
    }
    this.refreshing = true;
    this.initialize();
    try {
      let legacyRefresh = { status: 'not_requested' };
      if (options.refreshLegacy) {
        try {
          const newsService = this.newsService || require('../NewsService');
          const value = await newsService.updateAllNews();
          legacyRefresh = { status: 'success', value };
        } catch (error) {
          legacyRefresh = {
            status: 'failure',
            error: String(error?.message || error).slice(0, 1000)
          };
        }
      }

      const collection = await this.collector.collectAll({
        itemLimit: options.itemLimit,
        sourceLimit: options.sourceLimit
      });
      return { ...collection, legacyRefresh };
    } finally {
      this.refreshing = false;
    }
  }

  listSources() {
    this.initialize();
    return this.store.listSourceHealth();
  }

  listSignals(options = {}) {
    this.initialize();
    return this.store.listRecentSignals(options);
  }

  listTopics(options = {}) {
    this.initialize();
    return this.store.listTopics(options);
  }

  getTopic(id) {
    this.initialize();
    return this.store.getTopic(id);
  }

  listChanges(options = {}) {
    this.initialize();
    return this.store.listChanges(options);
  }

  rebuildTopics(options = {}) {
    this.initialize();
    const now = new Date(options.now || new Date());
    const windowHours = Math.max(1, Math.min(Number(options.windowHours) || 72, 720));
    const signals = this.store.listRecentSignals({
      windowHours,
      now,
      limit: options.limit || 10000
    });
    const result = buildTopics(signals, {
      now,
      windowHours,
      existingTopics: this.store.listTopicIdentityState(),
      previousSnapshots: this.store.listLatestTopicSnapshots()
    });
    const refreshId = options.refreshId || crypto.randomUUID();
    this.store.replaceTopics({
      topics: result.topics,
      aliases: result.aliases,
      refreshId,
      generatedAt: now
    });
    return {
      refreshId,
      generatedAt: now.toISOString(),
      signalCount: signals.length,
      topicCount: result.topics.length,
      aliasCount: result.aliases.length,
      ...result
    };
  }

  async refreshAll(options = {}) {
    const collection = await this.refreshSignals(options);
    if (collection.status === 'skipped') return { collection, rebuild: null };
    const rebuild = this.rebuildTopics({
      now: options.now,
      windowHours: options.windowHours
    });
    return { collection, rebuild };
  }

  close() {
    this.store.close?.();
    this.initialized = false;
  }
}

SignalService.createDefaultAdapters = createDefaultAdapters;
module.exports = SignalService;
